"""Authentication route handlers for Google sign-in, session management, and deep-link token exchange."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta
import httpx
from fastapi import APIRouter, Header, Cookie, Response, HTTPException, BackgroundTasks
from pydantic import BaseModel

from backend.config import (
    IST,
    USE_POSTGRES,
    GOOGLE_CLIENT_ID,
    SESSION_DAYS,
    as_utc,
    as_iso,
    current_timestamp,
)
from backend.db.connection import db, execute
from backend.auth.session import (
    token_hash,
    normalize_username,
    user_to_dict,
    issue_session,
    current_user_id,
    current_user,
)
from backend.auth.google import (
    GoogleVerifyPayload,
    google_id_token,
    _google_auth_request,
)
from backend.services.profile import ProfileUpdate
from backend.services.email import send_welcome_email

router = APIRouter(tags=["auth"])


class CodeExchangePayload(BaseModel):
    code: str


@router.post("/api/auth/google/verify")
@router.post("/api/auth/google/onetap")
@router.post("/api/auth/google")
async def auth_google_verify(payload: GoogleVerifyPayload, response: Response, background_tasks: BackgroundTasks):
    """Google Identity Services (One Tap & Branded Button) credential verification."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google auth is not configured")

    credential = (payload.credential or "").strip()
    access_token = (payload.access_token or "").strip()
    idinfo = None
    if credential:
        if google_id_token and _google_auth_request:
            try:
                idinfo = google_id_token.verify_oauth2_token(
                    credential, _google_auth_request, GOOGLE_CLIENT_ID,
                )
            except Exception:
                idinfo = None

        if not idinfo:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.get(
                        "https://oauth2.googleapis.com/tokeninfo",
                        params={"id_token": credential},
                    )
                    if resp.is_success:
                        data = resp.json()
                        token_aud = str(data.get("aud", "")).strip()
                        token_azp = str(data.get("azp", "")).strip()
                        client_prefix = GOOGLE_CLIENT_ID.split("-")[0] if "-" in GOOGLE_CLIENT_ID else GOOGLE_CLIENT_ID
                        if (
                            token_aud == GOOGLE_CLIENT_ID
                            or token_azp == GOOGLE_CLIENT_ID
                            or (client_prefix and (token_aud.startswith(client_prefix) or token_azp.startswith(client_prefix)))
                        ):
                            idinfo = data
            except Exception:
                idinfo = None

    if not idinfo and access_token:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                token_response = await client.get(
                    "https://oauth2.googleapis.com/tokeninfo",
                    params={"access_token": access_token},
                )
                profile_response = await client.get(
                    "openidconnect.googleapis.com/v1/userinfo" if False else "https://openidconnect.googleapis.com/v1/userinfo",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
            token_info = token_response.json() if token_response.is_success else {}
            prof_info = profile_response.json() if profile_response.is_success else {}
            token_aud = str(token_info.get("aud", "")).strip()
            token_azp = str(token_info.get("azp", "")).strip()
            client_prefix = GOOGLE_CLIENT_ID.split("-")[0] if "-" in GOOGLE_CLIENT_ID else GOOGLE_CLIENT_ID
            if (
                token_aud == GOOGLE_CLIENT_ID
                or token_azp == GOOGLE_CLIENT_ID
                or (client_prefix and (token_aud.startswith(client_prefix) or token_azp.startswith(client_prefix)))
            ):
                idinfo = prof_info
        except (httpx.HTTPError, ValueError):
            idinfo = None

    if not idinfo:
        if credential or access_token:
            raise HTTPException(status_code=400, detail="Invalid or expired Google credential")
        raise HTTPException(status_code=400, detail="Missing Google credential")

    email = str(idinfo.get("email", "")).strip().lower()
    display_name = str(idinfo.get("name", "")).strip() or email.split("@")[0]
    google_sub = str(idinfo.get("sub", "")).strip()
    picture = str(idinfo.get("picture", "")).strip()

    email_verified = idinfo.get("email_verified") in (True, "true")
    if not email or not google_sub or not email_verified:
        raise HTTPException(status_code=400, detail="Google account data is incomplete")

    with db() as conn:
        user = execute(conn, "SELECT * FROM users WHERE google_sub = %s OR email = %s", (google_sub, email)).fetchone()
        is_new = False
        if user:
            execute(
                conn,
                """
                UPDATE users
                SET google_sub = COALESCE(google_sub, %s),
                    auth_provider = 'google',
                    display_name = COALESCE(NULLIF(display_name, ''), %s),
                    name = COALESCE(NULLIF(name, ''), %s),
                    profile_photo = COALESCE(NULLIF(profile_photo, ''), NULLIF(%s, '')),
                    last_login_at = %s
                WHERE id = %s
                """,
                (google_sub, display_name, display_name, picture, current_timestamp(), user["id"]),
            )
            user_id = int(user["id"])
        else:
            row = execute(
                conn,
                """
                INSERT INTO users (name, email, display_name, username, auth_provider, google_sub, profile_photo, created_at, last_login_at)
                VALUES (%s, %s, %s, %s, 'google', %s, %s, %s, %s)
                RETURNING id
                """,
                (display_name, email, display_name, None, google_sub, picture or None, current_timestamp(), current_timestamp()),
            ).fetchone()
            user_id = int(row["id"])
            is_new = True
            background_tasks.add_task(send_welcome_email, email, display_name or "User")

        user_row = execute(conn, "SELECT * FROM users WHERE id = %s", (user_id,)).fetchone()
        token = issue_session(conn, user_id)
        response.set_cookie(
            key="opg_session",
            value=token,
            httponly=True,
            secure=True,
            samesite="lax",
            max_age=SESSION_DAYS * 86400,
            path="/"
        )
        return {
            "token": token,
            "user": user_to_dict(user_row),
            "is_new": is_new,
        }


@router.get("/api/auth/me")
def auth_me(authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """Retrieve current authenticated user metadata."""
    with db() as conn:
        user = current_user(conn, authorization, opg_session)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        return {"user": user_to_dict(user)}


@router.post("/api/auth/profile")
def auth_complete_profile(payload: ProfileUpdate, authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """Update profile handle, display name, photo, and bio."""
    username = normalize_username(payload.username)
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username is too short")
    display_name = payload.display_name.strip()
    profile_photo = payload.profile_photo
    bio = (payload.bio or "").strip()
    if profile_photo and len(profile_photo) > 2_000_000:
        raise HTTPException(status_code=400, detail="Profile photo is too large (max 1.5MB)")

    with db() as conn:
        user_id = current_user_id(conn, authorization, opg_session)
        existing = execute(conn, "SELECT id FROM users WHERE username = %s AND id <> %s", (username, user_id)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Username already exists")

        if profile_photo is not None:
            execute(conn, "UPDATE users SET username = %s, display_name = %s, name = %s, profile_photo = %s, bio = %s WHERE id = %s", (username, display_name, display_name, profile_photo, bio, user_id))
        else:
            execute(conn, "UPDATE users SET username = %s, display_name = %s, name = %s, bio = %s WHERE id = %s", (username, display_name, display_name, bio, user_id))

        return {"user": user_to_dict(execute(conn, "SELECT * FROM users WHERE id = %s", (user_id,)).fetchone())}


@router.post("/api/auth/logout")
def auth_logout(response: Response, authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """Revoke active session token on sign out and clear HttpOnly cookie."""
    with db() as conn:
        token = None
        if authorization and authorization.startswith("Bearer "):
            token = authorization.removeprefix("Bearer ").strip()
        elif opg_session:
            token = opg_session.strip()
        if token:
            execute(conn, "DELETE FROM sessions WHERE token_hash = %s", (token_hash(token),))
    response.delete_cookie(key="opg_session", path="/")
    return {"ok": True}


def cleanup_expired_auth_codes(conn) -> int:
    """Safe cleanup of expired single-use authorization codes."""
    now_iso = as_iso(datetime.now(IST))
    cur = execute(conn, "DELETE FROM auth_codes WHERE expires_at < %s", (now_iso,))
    return cur.rowcount if hasattr(cur, "rowcount") and cur.rowcount is not None else 0


@router.post("/api/auth/create-exchange-code")
def create_exchange_code(authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """Generate a short-lived (60s) single-use authorization code for secure deep-link handover."""
    with db() as conn:
        cleanup_expired_auth_codes(conn)
        user_id = current_user_id(conn, authorization, opg_session)
        token = issue_session(conn, user_id)
        code = secrets.token_urlsafe(24)
        expires_at = datetime.now(IST) + timedelta(seconds=60)
        expires_str = expires_at.isoformat() if not USE_POSTGRES else expires_at
        execute(
            conn,
            "INSERT INTO auth_codes (code, token, expires_at) VALUES (%s, %s, %s)",
            (code, token, expires_str)
        )
        return {"code": code}


@router.post("/api/auth/exchange-code")
def exchange_code(payload: CodeExchangePayload, response: Response):
    """Exchange a single-use authorization code for session credentials."""
    code = (payload.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")
    with db() as conn:
        row = execute(conn, "SELECT token, expires_at FROM auth_codes WHERE code = %s", (code,)).fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Invalid or expired authorization code")
        # Consume immediately (single-use)
        execute(conn, "DELETE FROM auth_codes WHERE code = %s", (code,))
        expires_at = as_utc(row["expires_at"])
        if expires_at <= datetime.now(IST):
            cleanup_expired_auth_codes(conn)
            raise HTTPException(status_code=400, detail="Authorization code expired")
        token = row["token"]
        user_row = execute(conn, """
            SELECT users.* FROM users
            JOIN sessions ON sessions.user_id = users.id
            WHERE sessions.token_hash = %s
        """, (token_hash(token),)).fetchone()
        if not user_row:
            raise HTTPException(status_code=400, detail="User session not found")
        response.set_cookie(
            key="opg_session",
            value=token,
            httponly=True,
            secure=True,
            samesite="lax",
            max_age=SESSION_DAYS * 86400,
            path="/"
        )
        return {
            "token": token,
            "user": user_to_dict(user_row)
        }
