"""OnePercentGoal API — PostgreSQL only."""
from __future__ import annotations

import base64
import hashlib
import hmac
import math
import os
import secrets
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal
from urllib.parse import urlencode

import httpx
import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from psycopg.rows import dict_row
from pydantic import BaseModel, Field

IST = timezone(timedelta(hours=5, minutes=30))

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(ROOT / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required (PostgreSQL connection string)")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").strip().rstrip("/")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback").strip()
DEMO_USER_ID = 1
PASSWORD_ITERATIONS = 120_000
SESSION_DAYS = 30

app = FastAPI(title="OnePercentGoal API", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        FRONTEND_URL,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@contextmanager
def db():
    conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def execute(conn, query: str, params=()):
    return conn.execute(query, params)


def row_dict(row):
    return dict(row) if row else None


def as_utc(value: datetime | str | None) -> datetime:
    if value is None:
        return datetime.now(IST)
    if isinstance(value, datetime):
        return value.astimezone(IST)
    parsed = datetime.fromisoformat(value)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=IST)


def as_iso(value: datetime | str | None) -> str:
    return as_utc(value).isoformat()


def decode_b64(value: str) -> bytes:
    padded = value + "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(padded.encode("ascii"))


def password_hash(password: str, salt: str | None = None) -> tuple[str, str]:
    salt_bytes = decode_b64(salt) if salt else secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_bytes, PASSWORD_ITERATIONS)
    return (
        base64.urlsafe_b64encode(salt_bytes).decode("ascii"),
        base64.urlsafe_b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, salt: str, stored_hash: str) -> bool:
    _, hash_value = password_hash(password, salt)
    return hmac.compare_digest(hash_value, stored_hash)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def normalize_username(value: str) -> str:
    return "".join(char.lower() for char in value.strip() if char.isalnum() or char == "_")


def current_timestamp() -> str:
    return datetime.now(IST).isoformat()


def ensure_column(conn, table: str, column: str, ddl: str) -> None:
    exists = execute(
        conn,
        """
        SELECT 1 FROM information_schema.columns
        WHERE table_name = %s AND column_name = %s
        """,
        (table, column),
    ).fetchone()
    if not exists:
        execute(conn, ddl)


def user_to_dict(row):
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
        "auth_provider": data.get("auth_provider") or "local",
        "created_at": as_iso(data["created_at"]),
        "last_login_at": as_iso(data.get("last_login_at")) if data.get("last_login_at") else None,
        "needs_profile": not bool(username),
        "profile_photo": data.get("profile_photo") or "",
    }


def issue_session(conn, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(IST) + timedelta(days=SESSION_DAYS)
    execute(conn, "DELETE FROM sessions WHERE user_id = %s AND expires_at < %s", (user_id, as_iso(datetime.now(IST))))
    execute(
        conn,
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (%s, %s, %s, %s)",
        (token_hash(token), user_id, current_timestamp(), expires_at.isoformat()),
    )
    return token


def current_user_id(conn, authorization: str | None) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    token = authorization.removeprefix("Bearer ").strip()
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


def current_user(conn, authorization: str | None):
    user_id = current_user_id(conn, authorization)
    return execute(conn, "SELECT * FROM users WHERE id = %s", (user_id,)).fetchone()


def year_progress(when: datetime | None = None) -> dict:
    now = when.astimezone(IST) if when and when.tzinfo else (when or datetime.now(IST))
    start = datetime(now.year, 1, 1, tzinfo=IST)
    end = datetime(now.year + 1, 1, 1, tzinfo=IST)
    total_seconds = (end - start).total_seconds()
    elapsed = max(0, (now - start).total_seconds())
    percentage = min(100, elapsed / total_seconds * 100)
    sprint = min(100, math.floor(percentage) + 1)
    sprint_start = start.timestamp() + (sprint - 1) * total_seconds / 100
    sprint_end = start.timestamp() + sprint * total_seconds / 100
    return {
        "year": now.year,
        "percentage": round(percentage, 2),
        "day_of_year": (now - start).days + 1,
        "days_in_year": round(total_seconds / 86400),
        "sprint_number": sprint,
        "sprint_start": datetime.fromtimestamp(sprint_start, tz=IST).isoformat(),
        "sprint_end": datetime.fromtimestamp(sprint_end, tz=IST).isoformat(),
    }


def sprint_window(year: int, sprint_number: int) -> tuple[str, str]:
    start = datetime(year, 1, 1, tzinfo=IST)
    end = datetime(year + 1, 1, 1, tzinfo=IST)
    total_seconds = (end - start).total_seconds()
    sprint_start = start.timestamp() + (sprint_number - 1) * total_seconds / 100
    sprint_end = start.timestamp() + sprint_number * total_seconds / 100
    return (
        datetime.fromtimestamp(sprint_start, tz=IST).isoformat(),
        datetime.fromtimestamp(sprint_end, tz=IST).isoformat(),
    )


class GoalCreate(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    description: str = Field(default="", max_length=500)
    priority: Literal["easy", "medium", "hard"] = "medium"
    progress_percent: int = Field(default=0, ge=0, le=100)


class GoalUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=140)
    description: str | None = Field(default=None, max_length=500)
    priority: Literal["easy", "medium", "hard"] | None = None
    progress_percent: int | None = Field(default=None, ge=0, le=100)
    completed: bool | None = None
    completion_note: str | None = Field(default=None, max_length=1000)


class AuthRegister(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = Field(default=None, max_length=80)


class AuthLogin(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class AuthGoogle(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    display_name: str | None = Field(default=None, max_length=80)
    google_sub: str | None = Field(default=None, max_length=255)


class ProfileUpdate(BaseModel):
    username: str = Field(min_length=3, max_length=24)
    display_name: str = Field(min_length=1, max_length=80)
    profile_photo: str | None = None


def goal_dict(row):
    data = row_dict(row)
    data["completed"] = bool(data["completed"])
    if data.get("progress_percent") is None:
        target = data.get("target") or 100
        data["progress_percent"] = round((data.get("progress") or 0) / target * 100) if target else 0
    return data


def resolve_source_goal_id(conn, row) -> int:
    data = row_dict(row)
    source_goal_id = data.get("source_goal_id")
    if source_goal_id:
        return int(source_goal_id)
    rolled_from_goal_id = data.get("rolled_from_goal_id")
    if rolled_from_goal_id:
        parent = execute(conn, "SELECT * FROM goals WHERE id = %s", (rolled_from_goal_id,)).fetchone()
        if parent:
            return resolve_source_goal_id(conn, parent)
    return int(data["id"])


def sprint_summary(conn, year: int, sprint_number: int, user_id: int = DEMO_USER_ID) -> dict:
    rows = execute(
        conn,
        """
        SELECT * FROM goals
        WHERE user_id = %s AND sprint_year = %s AND sprint_number = %s
        ORDER BY id
        """,
        (user_id, year, sprint_number),
    ).fetchall()
    goals = [goal_dict(row) for row in rows]
    total = len(goals)
    completed = sum(1 for goal in goals if goal["completed"])
    average_progress = round(sum(goal["progress_percent"] for goal in goals) / total) if total else 0
    sprint_start, sprint_end = sprint_window(year, sprint_number)
    return {
        "year": year,
        "sprint_number": sprint_number,
        "sprint_start": sprint_start,
        "sprint_end": sprint_end,
        "goal_count": total,
        "completed_count": completed,
        "average_progress": average_progress,
        "goals": goals,
    }


def user_created_at(conn, user_id: int = DEMO_USER_ID) -> datetime:
    row = execute(conn, "SELECT created_at FROM users WHERE id = %s", (user_id,)).fetchone()
    created_at = row["created_at"] if row else current_timestamp()
    return as_utc(created_at)


def previous_sprint(year: int, sprint_number: int) -> tuple[int, int] | None:
    if sprint_number > 1:
        return year, sprint_number - 1
    if year > 1:
        return year - 1, 100
    return None


def ensure_sprint_rollover(conn, year: int, sprint_number: int, user_id: int = DEMO_USER_ID) -> None:
    joined = user_created_at(conn, user_id)
    joined_progress = year_progress(joined)
    joined_year = joined_progress["year"]
    joined_sprint = joined_progress["sprint_number"]

    if year < joined_year or (year == joined_year and sprint_number <= joined_sprint):
        return

    prior = previous_sprint(year, sprint_number)
    if not prior:
        return
    prior_year, prior_number = prior
    ensure_sprint_rollover(conn, prior_year, prior_number, user_id)
    previous_rows = execute(
        conn,
        """
        SELECT * FROM goals
        WHERE user_id = %s AND sprint_year = %s AND sprint_number = %s
        """,
        (user_id, prior_year, prior_number),
    ).fetchall()
    if not previous_rows:
        return
    for row in previous_rows:
        if row["completed"]:
            continue
        exists = execute(
            conn,
            """
            SELECT 1 FROM goals
            WHERE user_id = %s AND sprint_year = %s AND sprint_number = %s AND rolled_from_goal_id = %s
            """,
            (user_id, year, sprint_number, row["id"]),
        ).fetchone()
        if exists:
            continue
        source_goal_id = resolve_source_goal_id(conn, row)
        new_goal = execute(
            conn,
            """
            INSERT INTO goals
                (user_id, title, description, priority, target, progress, completed, sprint_year, sprint_number,
                 created_at, progress_percent, completion_note, rolled_from_goal_id, source_goal_id)
            VALUES (%s, %s, %s, %s, %s, %s, 0, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                user_id,
                row["title"],
                row["description"],
                row["priority"],
                100,
                row["progress_percent"],
                year,
                sprint_number,
                current_timestamp(),
                row["progress_percent"],
                "",
                row["id"],
                source_goal_id,
            ),
        ).fetchone()
        inserted_id = int(new_goal["id"])
        execute(conn, "UPDATE goals SET source_goal_id = %s WHERE id = %s", (source_goal_id, inserted_id))


def profile_stats(conn, year: int | None = None, user_id: int = DEMO_USER_ID) -> dict:
    progress = year_progress()
    selected_year = year or progress["year"]
    joined = user_created_at(conn, user_id)
    joined_progress = year_progress(joined)
    if selected_year < joined_progress["year"] or selected_year > progress["year"]:
        raise HTTPException(status_code=404, detail="Year not found")

    if selected_year == joined_progress["year"]:
        start_sprint = joined_progress["sprint_number"]
    else:
        start_sprint = 1
    end_sprint = progress["sprint_number"] if selected_year == progress["year"] else 100

    heatmap = []
    for sprint_number in range(1, 101):
        if selected_year == joined_progress["year"] and sprint_number < start_sprint:
            heatmap.append({"sprint_number": sprint_number, "value": None, "completed_count": 0, "goal_count": 0})
            continue
        if selected_year == progress["year"] and sprint_number > end_sprint:
            heatmap.append({"sprint_number": sprint_number, "value": None, "completed_count": 0, "goal_count": 0})
            continue
        summary = sprint_summary(conn, selected_year, sprint_number, user_id)
        rate = round(summary["completed_count"] / summary["goal_count"] * 100) if summary["goal_count"] else 0
        heatmap.append({
            "sprint_number": sprint_number,
            "value": rate,
            "completed_count": summary["completed_count"],
            "goal_count": summary["goal_count"],
        })

    rows = execute(conn, "SELECT * FROM goals WHERE user_id = %s", (user_id,)).fetchall()
    source_ids: list[int] = []
    completed_sources: set[int] = set()
    for row in rows:
        source_id = resolve_source_goal_id(conn, row)
        if source_id not in source_ids:
            source_ids.append(source_id)
        if row["completed"]:
            completed_sources.add(source_id)

    total_goals = len(source_ids)
    goals_completed = len(completed_sources)
    completion_rate = round(goals_completed / total_goals * 100) if total_goals else 0

    summaries = []
    for sprint_year in range(joined_progress["year"], progress["year"] + 1):
        sprint_start = joined_progress["sprint_number"] if sprint_year == joined_progress["year"] else 1
        sprint_end = progress["sprint_number"] if sprint_year == progress["year"] else 100
        for sprint_number in range(sprint_start, sprint_end + 1):
            summary = sprint_summary(conn, sprint_year, sprint_number, user_id)
            summaries.append({
                "year": sprint_year,
                "sprint_number": sprint_number,
                "success": summary["completed_count"] > 0,
            })

    current_streak = 0
    for item in reversed(summaries):
        if item["year"] > progress["year"] or (item["year"] == progress["year"] and item["sprint_number"] > progress["sprint_number"]):
            continue
        if item["success"]:
            current_streak += 1
        else:
            break

    longest_streak = 0
    running = 0
    for item in summaries:
        if item["success"]:
            running += 1
            longest_streak = max(longest_streak, running)
        else:
            running = 0

    return {
        "user": {
            **(user_to_dict(execute(conn, "SELECT * FROM users WHERE id = %s", (user_id,)).fetchone()) or {}),
            "active_since": {
                "year": joined_progress["year"],
                "sprint_number": joined_progress["sprint_number"],
            },
        },
        "year": progress,
        "selected_year": selected_year,
        "stats": {
            "goals_completed": goals_completed,
            "total_goals": total_goals,
            "completion_rate": completion_rate,
            "current_streak": current_streak,
            "longest_streak": longest_streak,
        },
        "heatmap": heatmap,
    }


def auth_payload(conn, user_id: int) -> dict:
    return {"token": issue_session(conn, user_id), "user": user_to_dict(execute(conn, "SELECT * FROM users WHERE id = %s", (user_id,)).fetchone())}


def setup_database():
    with db() as conn:
        execute(
            conn,
            """
            CREATE TABLE IF NOT EXISTS users (
                id BIGSERIAL PRIMARY KEY,
                name TEXT,
                email TEXT NOT NULL UNIQUE,
                username TEXT,
                display_name TEXT,
                auth_provider TEXT NOT NULL DEFAULT 'local',
                password_hash TEXT,
                password_salt TEXT,
                google_sub TEXT UNIQUE,
                created_at TIMESTAMPTZ NOT NULL,
                last_login_at TIMESTAMPTZ,
                profile_photo TEXT
            )
            """,
        )
        execute(
            conn,
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL
            )
            """,
        )
        execute(
            conn,
            """
            CREATE TABLE IF NOT EXISTS oauth_states (
                state TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL
            )
            """,
        )
        execute(
            conn,
            """
            CREATE TABLE IF NOT EXISTS goals (
                id BIGSERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                priority TEXT NOT NULL,
                target INTEGER NOT NULL DEFAULT 1,
                progress INTEGER NOT NULL DEFAULT 0,
                completed INTEGER NOT NULL DEFAULT 0,
                sprint_year INTEGER NOT NULL,
                sprint_number INTEGER NOT NULL,
                created_at TIMESTAMPTZ NOT NULL,
                progress_percent INTEGER NOT NULL DEFAULT 0,
                completion_note TEXT NOT NULL DEFAULT '',
                rolled_from_goal_id BIGINT,
                source_goal_id BIGINT
            )
            """,
        )

        alter_columns = [
            ("users", "username", "ALTER TABLE users ADD COLUMN username TEXT"),
            ("users", "display_name", "ALTER TABLE users ADD COLUMN display_name TEXT"),
            ("users", "auth_provider", "ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'local'"),
            ("users", "password_hash", "ALTER TABLE users ADD COLUMN password_hash TEXT"),
            ("users", "password_salt", "ALTER TABLE users ADD COLUMN password_salt TEXT"),
            ("users", "google_sub", "ALTER TABLE users ADD COLUMN google_sub TEXT"),
            ("users", "last_login_at", "ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ"),
            ("users", "profile_photo", "ALTER TABLE users ADD COLUMN profile_photo TEXT"),
            ("goals", "progress_percent", "ALTER TABLE goals ADD COLUMN progress_percent INTEGER NOT NULL DEFAULT 0"),
            ("goals", "completion_note", "ALTER TABLE goals ADD COLUMN completion_note TEXT NOT NULL DEFAULT ''"),
            ("goals", "rolled_from_goal_id", "ALTER TABLE goals ADD COLUMN rolled_from_goal_id BIGINT"),
            ("goals", "source_goal_id", "ALTER TABLE goals ADD COLUMN source_goal_id BIGINT"),
        ]
        for table, column, ddl in alter_columns:
            ensure_column(conn, table, column, ddl)

        execute(conn, "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)")
        execute(conn, "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub)")


@app.on_event("startup")
def startup():
    setup_database()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/auth/google/start")
def auth_google_start():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google auth is not configured")
    state = secrets.token_urlsafe(24)
    with db() as conn:
        execute(
            conn,
            "INSERT INTO oauth_states (state, provider, created_at) VALUES (%s, 'google', %s) ON CONFLICT (state) DO UPDATE SET created_at = EXCLUDED.created_at",
            (state, current_timestamp()),
        )
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}")


@app.get("/api/auth/google/callback")
async def auth_google_callback(code: str | None = None, state: str | None = None):
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google auth is not configured")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    with db() as conn:
        state_row = execute(conn, "SELECT * FROM oauth_states WHERE state = %s AND provider = 'google'", (state,)).fetchone()
        if not state_row:
            raise HTTPException(status_code=400, detail="Invalid Google state")
        execute(conn, "DELETE FROM oauth_states WHERE state = %s", (state,))

    async with httpx.AsyncClient(timeout=20) as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if token_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Google token exchange failed")
        token_data = token_response.json()
        userinfo_response = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        if userinfo_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Google profile lookup failed")
        google_user = userinfo_response.json()

    email = str(google_user.get("email", "")).strip().lower()
    display_name = str(google_user.get("name", "")).strip() or email.split("@")[0]
    google_sub = str(google_user.get("sub", "")).strip()
    if not email or not google_sub:
        raise HTTPException(status_code=400, detail="Google account data is incomplete")

    with db() as conn:
        user = execute(conn, "SELECT * FROM users WHERE google_sub = %s OR email = %s", (google_sub, email)).fetchone()
        if user:
            execute(
                conn,
                """
                UPDATE users
                SET google_sub = COALESCE(google_sub, %s),
                    auth_provider = 'google',
                    display_name = COALESCE(NULLIF(display_name, ''), %s),
                    name = COALESCE(NULLIF(name, ''), %s),
                    last_login_at = %s
                WHERE id = %s
                """,
                (google_sub, display_name, display_name, current_timestamp(), user["id"]),
            )
            user_id = int(user["id"])
        else:
            row = execute(
                conn,
                """
                INSERT INTO users (name, email, display_name, username, auth_provider, google_sub, created_at, last_login_at)
                VALUES (%s, %s, %s, %s, 'google', %s, %s, %s)
                RETURNING id
                """,
                (display_name, email, display_name, None, google_sub, current_timestamp(), current_timestamp()),
            ).fetchone()
            user_id = int(row["id"])
        token = issue_session(conn, user_id)
    return RedirectResponse(f"{FRONTEND_URL}/?auth_token={token}")


@app.post("/api/auth/register")
def auth_register(payload: AuthRegister):
    email = payload.email.strip().lower()
    display_name = (payload.display_name or "").strip() or None
    with db() as conn:
        existing = execute(conn, "SELECT id FROM users WHERE email = %s", (email,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Email already exists")
        salt, digest = password_hash(payload.password)
        row = execute(
            conn,
            """
            INSERT INTO users (name, email, display_name, username, auth_provider, password_hash, password_salt, created_at, last_login_at)
            VALUES (%s, %s, %s, %s, 'local', %s, %s, %s, %s)
            RETURNING id
            """,
            (display_name, email, display_name, None, digest, salt, current_timestamp(), current_timestamp()),
        ).fetchone()
        return auth_payload(conn, int(row["id"]))


@app.post("/api/auth/login")
def auth_login(payload: AuthLogin):
    email = payload.email.strip().lower()
    with db() as conn:
        user = execute(conn, "SELECT * FROM users WHERE email = %s", (email,)).fetchone()
        if not user or not user.get("password_hash") or not user.get("password_salt"):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        if not verify_password(payload.password, user["password_salt"], user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        execute(conn, "UPDATE users SET last_login_at = %s WHERE id = %s", (current_timestamp(), user["id"]))
        return auth_payload(conn, int(user["id"]))


@app.get("/api/auth/me")
def auth_me(authorization: str | None = Header(default=None)):
    with db() as conn:
        user = current_user(conn, authorization)
        return {"user": user_to_dict(user)}


@app.post("/api/auth/profile")
def auth_complete_profile(payload: ProfileUpdate, authorization: str | None = Header(default=None)):
    username = normalize_username(payload.username)
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username is too short")
    display_name = payload.display_name.strip()
    profile_photo = payload.profile_photo
    if profile_photo and len(profile_photo) > 2_000_000:
        raise HTTPException(status_code=400, detail="Profile photo is too large (max 1.5MB)")

    with db() as conn:
        user_id = current_user_id(conn, authorization)
        existing = execute(conn, "SELECT id FROM users WHERE username = %s AND id <> %s", (username, user_id)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Username already exists")

        if profile_photo is not None:
            execute(conn, "UPDATE users SET username = %s, display_name = %s, name = %s, profile_photo = %s WHERE id = %s", (username, display_name, display_name, profile_photo, user_id))
        else:
            execute(conn, "UPDATE users SET username = %s, display_name = %s, name = %s WHERE id = %s", (username, display_name, display_name, user_id))

        return {"user": user_to_dict(execute(conn, "SELECT * FROM users WHERE id = %s", (user_id,)).fetchone())}


@app.post("/api/auth/logout")
def auth_logout(authorization: str | None = Header(default=None)):
    with db() as conn:
        if authorization and authorization.startswith("Bearer "):
            execute(conn, "DELETE FROM sessions WHERE token_hash = %s", (token_hash(authorization.removeprefix("Bearer ").strip()),))
    return {"ok": True}


@app.get("/api/dashboard")
def dashboard(authorization: str | None = Header(default=None)):
    progress = year_progress()
    with db() as conn:
        user_id = current_user_id(conn, authorization)
        ensure_sprint_rollover(conn, progress["year"], progress["sprint_number"], user_id)
        goals = execute(
            conn,
            """
            SELECT * FROM goals
            WHERE user_id = %s AND sprint_year = %s AND sprint_number = %s
            ORDER BY id
            """,
            (user_id, progress["year"], progress["sprint_number"]),
        ).fetchall()
        user = user_to_dict(execute(conn, "SELECT * FROM users WHERE id = %s", (user_id,)).fetchone())
    return {"user": user, "year": progress, "goals": [goal_dict(goal) for goal in goals]}


@app.get("/api/goals")
def list_goals(sprint_number: int | None = None, authorization: str | None = Header(default=None)):
    progress = year_progress()
    number = sprint_number or progress["sprint_number"]
    with db() as conn:
        user_id = current_user_id(conn, authorization)
        if number == progress["sprint_number"]:
            ensure_sprint_rollover(conn, progress["year"], number, user_id)
        rows = execute(
            conn,
            """
            SELECT * FROM goals
            WHERE user_id = %s AND sprint_year = %s AND sprint_number = %s
            ORDER BY id
            """,
            (user_id, progress["year"], number),
        ).fetchall()
    return [goal_dict(row) for row in rows]


@app.post("/api/goals", status_code=status.HTTP_201_CREATED)
def create_goal(payload: GoalCreate, authorization: str | None = Header(default=None)):
    sprint = year_progress()
    completed = int(payload.progress_percent >= 100)
    with db() as conn:
        user_id = current_user_id(conn, authorization)
        row = execute(
            conn,
            """
            INSERT INTO goals
                (user_id, title, description, priority, target, progress, completed, sprint_year, sprint_number, created_at, progress_percent, source_goal_id)
            VALUES (%s, %s, %s, %s, 100, %s, %s, %s, %s, %s, %s, NULL)
            RETURNING id
            """,
            (user_id, payload.title.strip(), payload.description.strip(), payload.priority, payload.progress_percent, completed, sprint["year"], sprint["sprint_number"], current_timestamp(), payload.progress_percent),
        ).fetchone()
        goal_id = int(row["id"])
        execute(conn, "UPDATE goals SET source_goal_id = %s WHERE id = %s", (goal_id, goal_id))
        goal = execute(conn, "SELECT * FROM goals WHERE id = %s", (goal_id,)).fetchone()
    return goal_dict(goal)


@app.patch("/api/goals/{goal_id}")
def update_goal(goal_id: int, payload: GoalUpdate, authorization: str | None = Header(default=None)):
    with db() as conn:
        user_id = current_user_id(conn, authorization)
        existing = execute(conn, "SELECT * FROM goals WHERE id = %s AND user_id = %s", (goal_id, user_id)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Goal not found")
        data = row_dict(existing)
        previous_progress = int(data.get("progress_percent", 0))
        for field, value in payload.model_dump(exclude_none=True).items():
            data[field] = int(value) if field == "completed" else value
        if "progress_percent" in data:
            if data["progress_percent"] < previous_progress:
                raise HTTPException(status_code=400, detail="Progress cannot be decreased")
            data["progress"] = data["progress_percent"]
            data["target"] = 100
        if payload.completed is None:
            data["completed"] = int(data["progress_percent"] >= 100)
        if data["completed"]:
            completion_note = str(data.get("completion_note", "")).strip()
            if payload.completed is True and not completion_note:
                raise HTTPException(status_code=400, detail="Completion note is required")
            data["progress_percent"] = 100
            data["progress"] = 100
            data["completion_note"] = completion_note
        execute(
            conn,
            """
            UPDATE goals
            SET title = %s, description = %s, priority = %s, target = %s, progress = %s, progress_percent = %s, completed = %s, completion_note = %s
            WHERE id = %s
            """,
            (data["title"], data["description"], data["priority"], data["target"], data["progress"], data["progress_percent"], int(data["completed"]), data.get("completion_note", ""), goal_id),
        )
        goal = execute(conn, "SELECT * FROM goals WHERE id = %s", (goal_id,)).fetchone()
    return goal_dict(goal)


@app.delete("/api/goals/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(goal_id: int, authorization: str | None = Header(default=None)):
    with db() as conn:
        user_id = current_user_id(conn, authorization)
        cursor = execute(conn, "DELETE FROM goals WHERE id = %s AND user_id = %s", (goal_id, user_id))
        if not cursor.rowcount:
            raise HTTPException(status_code=404, detail="Goal not found")


@app.get("/api/stats")
def stats(authorization: str | None = Header(default=None)):
    with db() as conn:
        user_id = current_user_id(conn, authorization)
        return profile_stats(conn, user_id=user_id)["stats"]


@app.get("/api/profile")
def profile(year: int | None = None, authorization: str | None = Header(default=None)):
    with db() as conn:
        user_id = current_user_id(conn, authorization)
        progress = year_progress()
        if year is None:
            ensure_sprint_rollover(conn, progress["year"], progress["sprint_number"], user_id)
        return profile_stats(conn, year, user_id)


@app.get("/api/timeline")
def timeline(year: int | None = None, authorization: str | None = Header(default=None)):
    progress = year_progress()
    with db() as conn:
        user_id = current_user_id(conn, authorization)
        ensure_sprint_rollover(conn, progress["year"], progress["sprint_number"], user_id)
        joined = user_created_at(conn, user_id)
        selected_year = year or progress["year"]
        if selected_year < joined.year or selected_year > progress["year"]:
            raise HTTPException(status_code=404, detail="Year not found")
        start_sprint = year_progress(joined)["sprint_number"] if selected_year == joined.year else 1
        end_sprint = progress["sprint_number"] if selected_year == progress["year"] else 100
        items = [sprint_summary(conn, selected_year, sprint_number, user_id) for sprint_number in range(start_sprint, end_sprint + 1)]
    return {
        "year": selected_year,
        "years": list(range(joined.year, progress["year"] + 1)),
        "start_sprint": start_sprint,
        "end_sprint": end_sprint,
        "sprints": items,
    }


@app.get("/api/timeline/{sprint_number}")
def timeline_sprint(sprint_number: int, year: int | None = None, authorization: str | None = Header(default=None)):
    progress = year_progress()
    if sprint_number < 1 or sprint_number > 100:
        raise HTTPException(status_code=404, detail="Sprint not found")
    with db() as conn:
        user_id = current_user_id(conn, authorization)
        selected_year = year or progress["year"]
        joined = user_created_at(conn, user_id)
        if selected_year < joined.year or selected_year > progress["year"]:
            raise HTTPException(status_code=404, detail="Year not found")
        if selected_year == progress["year"] and sprint_number <= progress["sprint_number"]:
            ensure_sprint_rollover(conn, progress["year"], progress["sprint_number"], user_id)
        if selected_year == joined.year:
            joined_progress = year_progress(joined)
            if sprint_number < joined_progress["sprint_number"]:
                raise HTTPException(status_code=404, detail="Sprint not found")
        if selected_year == progress["year"] and sprint_number > progress["sprint_number"]:
            raise HTTPException(status_code=404, detail="Sprint not found")
        return sprint_summary(conn, selected_year, sprint_number, user_id)
