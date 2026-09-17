"""Authentication session and user resolution utilities."""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta
from fastapi import HTTPException

from backend.config import IST, SESSION_DAYS, as_iso, as_utc, current_timestamp
from backend.db.connection import execute, row_dict


def token_hash(token: str) -> str:
    """Compute SHA-256 hash of session bearer tokens for database lookup."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def normalize_username(value: str) -> str:
    """Normalize user handle strings (lowercase alphanumeric + underscores)."""
    return "".join(char.lower() for char in value.strip() if char.isalnum() or char == "_")


def user_to_dict(row) -> dict | None:
    """Serialize database user row into public user dictionary."""
    if not row:
        return None
    data = row_dict(row)
    display_name = data.get("display_name") or data.get("name") or data["email"].split("@")[0]
    username = data.get("username") or ""
    return {
        "id": data["id"],
        "name": display_name,
        "email": data["email"],
        "username": username,
        "display_name": display_name,
        "auth_provider": data.get("auth_provider") or "google",
        "created_at": as_iso(data["created_at"]),
        "last_login_at": as_iso(data.get("last_login_at")) if data.get("last_login_at") else None,
        "needs_profile": not bool(username),
        "profile_photo": data.get("profile_photo") or "",
        "bio": data.get("bio") or "",
    }


def issue_session(conn, user_id: int) -> str:
    """Generate and store secure 30-day session token for authenticated user."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(IST) + timedelta(days=SESSION_DAYS)
    execute(conn, "DELETE FROM sessions WHERE user_id = %s AND expires_at < %s", (user_id, as_iso(datetime.now(IST))))
    execute(
        conn,
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (%s, %s, %s, %s)",
        (token_hash(token), user_id, current_timestamp(), expires_at.isoformat()),
    )
    return token


def current_user_id(conn, authorization: str | None = None, opg_session: str | None = None) -> int:
    """Validate Bearer session token header or HttpOnly opg_session cookie and return authenticated user ID."""
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ").strip()
    elif opg_session:
        token = opg_session.strip()

    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    row = execute(
        conn,
        """
        SELECT users.id, sessions.expires_at
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = %s
        """,
        (token_hash(token),),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Authentication required")
    expires_at = as_utc(row["expires_at"])
    if expires_at <= datetime.now(IST):
        execute(conn, "DELETE FROM sessions WHERE token_hash = %s", (token_hash(token),))
        raise HTTPException(status_code=401, detail="Session expired")
    return int(row["id"])


def current_user(conn, authorization: str | None = None, opg_session: str | None = None):
    """Retrieve full database user record from Bearer session token or HttpOnly cookie."""
    user_id = current_user_id(conn, authorization, opg_session)
    return execute(conn, "SELECT * FROM users WHERE id = %s", (user_id,)).fetchone()


def user_created_at(conn, user_id: int) -> datetime:
    """Retrieve user creation timestamp."""
    row = execute(conn, "SELECT created_at FROM users WHERE id = %s", (user_id,)).fetchone()
    created_at = row["created_at"] if row else current_timestamp()
    return as_utc(created_at)
