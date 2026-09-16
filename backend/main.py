"""OnePercentGoal API — Production PostgreSQL / Local SQLite Backend with Google OAuth.

Architecture:
- Compounding Sprint Engine (100 Sprints/Year = 3.6 Days per 1% Sprint)
- Google OAuth 2.0 Authentication & Session Token Management
- Automated Incomplete Goal Rollover Engine
- Daily Rote Habits & Progress Lineage Tracker
- Public Profile Gateway & Brevo Email Notification Scheduler
"""
from __future__ import annotations

import base64
import hashlib
import os
import secrets
import sqlite3
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_requests
    _google_auth_request = google_requests.Request()
except Exception:
    google_id_token = None
    _google_auth_request = None

# Timezone Definition (India Standard Time UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(ROOT / ".env")

# Database & OAuth Environment Configuration
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
USE_POSTGRES = DATABASE_URL.startswith(("postgresql://", "postgres://"))
SQLITE_DATABASE = ROOT / "onepercentgoal.db"

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").strip().rstrip("/")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "").strip()
BREVO_SENDER_EMAIL = os.getenv("BREVO_SENDER_EMAIL", "").strip()
EMAIL_LOGO_URL = os.getenv("EMAIL_LOGO_URL", "").strip()
DEMO_USER_ID = 1
SESSION_DAYS = 30

app = FastAPI(title="OnePercentGoal API", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost",
        "https://localhost",
        "capacitor://localhost",
        FRONTEND_URL,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def sql(query: str) -> str:
    """Convert PostgreSQL %s placeholders to ? placeholders when running under SQLite."""
    return query if USE_POSTGRES else query.replace("%s", "?")


@contextmanager
def db():
    """Context manager supplying database connection (PostgreSQL in production, SQLite locally)."""
    if USE_POSTGRES:
        import psycopg
        from psycopg.rows import dict_row
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    else:
        conn = sqlite3.connect(SQLITE_DATABASE)
        conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def execute(conn, query: str, params=()):
    """Helper to execute SQL queries with normalized placeholders."""
    return conn.execute(sql(query), params)


def row_dict(row):
    """Convert database row object to dict."""
    return dict(row) if row else None


def as_utc(value: datetime | str | None) -> datetime:
    """Parse date values into timezone-aware IST datetimes."""
    if value is None:
        return datetime.now(IST)
    if isinstance(value, datetime):
        return value.astimezone(IST)
    parsed = datetime.fromisoformat(value)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=IST)


def as_iso(value: datetime | str | None) -> str:
    """Format date values into ISO 8601 strings."""
    return as_utc(value).isoformat()


def token_hash(token: str) -> str:
    """Compute SHA-256 hash of session bearer tokens for database lookup."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def normalize_username(value: str) -> str:
    """Normalize user handle strings (lowercase alphanumeric + underscores)."""
    return "".join(char.lower() for char in value.strip() if char.isalnum() or char == "_")


def current_timestamp() -> str:
    """Return ISO 8601 string timestamp for current IST time."""
    return datetime.now(IST).isoformat()


def ensure_column(conn, table: str, column: str, ddl: str) -> None:
    """Idempotently add database columns if missing."""
    if USE_POSTGRES:
        exists = execute(
            conn,
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_name = %s AND column_name = %s
            """,
            (table, column),
        ).fetchone()
    else:
        exists = any(row[1] == column for row in execute(conn, f"PRAGMA table_info({table})").fetchall())
    if not exists:
        execute(conn, ddl)


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


def current_user_id(conn, authorization: str | None) -> int:
    """Validate Bearer session token header and return authenticated user ID."""
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
    """Retrieve full database user record from Bearer session token."""
    user_id = current_user_id(conn, authorization)
    return execute(conn, "SELECT * FROM users WHERE id = %s", (user_id,)).fetchone()


def sprint_boundary_timestamp(year: int, N: int) -> float:
    """Calculate exact unix timestamp boundary for the Nth sprint of a year (100 Sprints = 3.6 days each)."""
    start = datetime(year, 1, 1, tzinfo=IST)
    end = datetime(year + 1, 1, 1, tzinfo=IST)
    days_in_year = (end - start).days
    total_half_hours = days_in_year * 48
    half_hours = round(N * (total_half_hours / 100.0))
    return start.timestamp() + half_hours * 1800.0


def year_progress(when: datetime | None = None) -> dict:
    """Calculate year completion percentage, day of year, and active sprint cycle (1 to 100)."""
    now = when.astimezone(IST) if when and when.tzinfo else (when or datetime.now(IST))
    start = datetime(now.year, 1, 1, tzinfo=IST)
    end = datetime(now.year + 1, 1, 1, tzinfo=IST)
    total_seconds = (end - start).total_seconds()
    elapsed = max(0, (now - start).total_seconds())
    percentage = min(100.0, elapsed / total_seconds * 100)

    sprint = 100
    for s in range(1, 101):
        if now.timestamp() < sprint_boundary_timestamp(now.year, s):
            sprint = s
            break

    sprint_start_ts = sprint_boundary_timestamp(now.year, sprint - 1)
    sprint_end_ts = sprint_boundary_timestamp(now.year, sprint)

    return {
        "year": now.year,
        "percentage": round(percentage, 2),
        "day_of_year": (now - start).days + 1,
        "days_in_year": round(total_seconds / 86400),
        "sprint_number": sprint,
        "sprint_start": datetime.fromtimestamp(sprint_start_ts, tz=IST).isoformat(),
        "sprint_end": datetime.fromtimestamp(sprint_end_ts, tz=IST).isoformat(),
    }


def sprint_window(year: int, sprint_number: int) -> tuple[str, str]:
    """Return start and end ISO timestamps for a given sprint number."""
    start_ts = sprint_boundary_timestamp(year, sprint_number - 1)
    end_ts = sprint_boundary_timestamp(year, sprint_number)
    return (
        datetime.fromtimestamp(start_ts, tz=IST).isoformat(),
        datetime.fromtimestamp(end_ts, tz=IST).isoformat(),
    )


def sprint_end_datetime(year: int, sprint_number: int) -> datetime:
    """Return timezone-aware IST datetime for end of sprint."""
    end_ts = sprint_boundary_timestamp(year, sprint_number)
    return datetime.fromtimestamp(end_ts, tz=IST)


# Pydantic Request Schemas
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


class ProfileUpdate(BaseModel):
    username: str = Field(min_length=3, max_length=24)
    display_name: str = Field(min_length=1, max_length=80)
    profile_photo: str | None = None
    bio: str | None = Field(default="", max_length=160)


class RoteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    description: str | None = Field(default="", max_length=255)
    date: str | None = None


class RoteToggle(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    completed: bool | None = None


class GoogleVerifyPayload(BaseModel):
    credential: str


def goal_dict(row) -> dict:
    """Format goal database row into API response dictionary."""
    data = row_dict(row)
    data["completed"] = bool(data["completed"])
    if data.get("progress_percent") is None:
        target = data.get("target") or 100
        data["progress_percent"] = round((data.get("progress") or 0) / target * 100) if target else 0
    return data


def resolve_source_goal_id(conn, row) -> int:
    """Recursively trace goal lineage to locate original root goal ID across sprint rollovers."""
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
    """Compute sprint completion metrics, goal counts, and goal arrays for a specific sprint cycle."""
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
    """Retrieve user creation timestamp."""
    row = execute(conn, "SELECT created_at FROM users WHERE id = %s", (user_id,)).fetchone()
    created_at = row["created_at"] if row else current_timestamp()
    return as_utc(created_at)


def previous_sprint(year: int, sprint_number: int) -> tuple[int, int] | None:
    """Calculate prior sprint number and year tuple."""
    if sprint_number > 1:
        return year, sprint_number - 1
    if year > 1:
        return year - 1, 100
    return None


def ensure_sprint_rollover(conn, year: int, sprint_number: int, user_id: int = DEMO_USER_ID) -> None:
    """Automatic Rollover Engine: copies uncompleted goals from prior sprints into current active sprint."""
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
        if USE_POSTGRES:
            inserted_id = int(new_goal["id"])
        else:
            inserted_id = int(new_goal["id"]) if new_goal and "id" in dict(new_goal) else int(execute(conn, "SELECT last_insert_rowid()").fetchone()[0])
        execute(conn, "UPDATE goals SET source_goal_id = %s WHERE id = %s", (source_goal_id, inserted_id))


def profile_stats(conn, year: int | None = None, user_id: int = DEMO_USER_ID) -> dict:
    """Calculate user streak metrics, sprint completion heatmaps, and total goal statistics."""
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

    # Calculate Rote completion stats for today
    today_str = datetime.now(IST).strftime("%Y-%m-%d")
    rote_rows = execute(
        conn,
        "SELECT * FROM rotes WHERE user_id = %s AND (rote_date = %s OR rote_date = '' OR rote_date IS NULL)",
        (user_id, today_str)
    ).fetchall()
    total_rotes = len(rote_rows)
    if total_rotes > 0:
        logs_rows = execute(
            conn,
            "SELECT * FROM rote_logs WHERE user_id = %s AND log_date = %s AND completed = 1",
            (user_id, today_str)
        ).fetchall()
        completed_rotes = len(logs_rows)
        rote_rate = round(completed_rotes / total_rotes * 100)
    else:
        all_logs = execute(
            conn,
            "SELECT COUNT(*) as c FROM rote_logs WHERE user_id = %s AND completed = 1",
            (user_id,)
        ).fetchone()
        completed_rotes = int(all_logs["c"]) if all_logs else 0
        all_rotes_count = execute(
            conn,
            "SELECT COUNT(*) as c FROM rotes WHERE user_id = %s",
            (user_id,)
        ).fetchone()
        total_rotes = int(all_rotes_count["c"]) if all_rotes_count else 0
        rote_rate = round(completed_rotes / total_rotes * 100) if total_rotes else 0


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
            "rote_completed": completed_rotes,
            "total_rotes": total_rotes,
            "rote_rate": rote_rate,
            "current_streak": current_streak,
            "longest_streak": longest_streak,
        },
        "heatmap": heatmap,
    }


def setup_database():
    """Initialize database schemas, tables, and indices for users, sessions, goals, rotes, and logs."""
    with db() as conn:
        if USE_POSTGRES:
            execute(conn, """
                CREATE TABLE IF NOT EXISTS users (
                    id BIGSERIAL PRIMARY KEY, name TEXT, email TEXT NOT NULL UNIQUE,
                    username TEXT, display_name TEXT, auth_provider TEXT NOT NULL DEFAULT 'google',
                    google_sub TEXT UNIQUE,
                    created_at TIMESTAMPTZ NOT NULL, last_login_at TIMESTAMPTZ, profile_photo TEXT, bio TEXT
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS goals (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL,
                    target INTEGER NOT NULL DEFAULT 1, progress INTEGER NOT NULL DEFAULT 0,
                    completed INTEGER NOT NULL DEFAULT 0, sprint_year INTEGER NOT NULL,
                    sprint_number INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL,
                    progress_percent INTEGER NOT NULL DEFAULT 0,
                    completion_note TEXT NOT NULL DEFAULT '',
                    rolled_from_goal_id BIGINT, source_goal_id BIGINT
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS sprint_email_reminders (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    sprint_year INTEGER NOT NULL,
                    sprint_number INTEGER NOT NULL,
                    reminder_type TEXT NOT NULL,
                    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (user_id, sprint_year, sprint_number, reminder_type)
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS rotes (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ NOT NULL
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS rote_logs (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    rote_id BIGINT NOT NULL REFERENCES rotes(id) ON DELETE CASCADE,
                    log_date TEXT NOT NULL,
                    completed INTEGER NOT NULL DEFAULT 0,
                    completed_at TIMESTAMPTZ,
                    UNIQUE (user_id, rote_id, log_date)
                )""")
        else:
            execute(conn, """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT NOT NULL UNIQUE,
                    username TEXT, display_name TEXT, auth_provider TEXT NOT NULL DEFAULT 'google',
                    google_sub TEXT UNIQUE,
                    created_at TEXT NOT NULL, last_login_at TEXT, profile_photo TEXT, bio TEXT
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS goals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL, title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL,
                    target INTEGER NOT NULL DEFAULT 1, progress INTEGER NOT NULL DEFAULT 0,
                    completed INTEGER NOT NULL DEFAULT 0, sprint_year INTEGER NOT NULL,
                    sprint_number INTEGER NOT NULL, created_at TEXT NOT NULL,
                    progress_percent INTEGER NOT NULL DEFAULT 0,
                    completion_note TEXT NOT NULL DEFAULT '',
                    rolled_from_goal_id INTEGER, source_goal_id INTEGER,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS sprint_email_reminders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    sprint_year INTEGER NOT NULL,
                    sprint_number INTEGER NOT NULL,
                    reminder_type TEXT NOT NULL,
                    sent_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                    UNIQUE (user_id, sprint_year, sprint_number, reminder_type)
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS rotes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS rote_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    rote_id INTEGER NOT NULL,
                    log_date TEXT NOT NULL,
                    completed INTEGER NOT NULL DEFAULT 0,
                    completed_at TEXT,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY(rote_id) REFERENCES rotes(id) ON DELETE CASCADE,
                    UNIQUE (user_id, rote_id, log_date)
                )""")

        alter_columns = [
            ("users", "username", "ALTER TABLE users ADD COLUMN username TEXT"),
            ("users", "display_name", "ALTER TABLE users ADD COLUMN display_name TEXT"),
            ("users", "auth_provider", "ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'google'"),
            ("users", "google_sub", "ALTER TABLE users ADD COLUMN google_sub TEXT"),
            ("users", "last_login_at", "ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ" if USE_POSTGRES else "ALTER TABLE users ADD COLUMN last_login_at TEXT"),
            ("users", "profile_photo", "ALTER TABLE users ADD COLUMN profile_photo TEXT"),
            ("users", "bio", "ALTER TABLE users ADD COLUMN bio TEXT"),
            ("goals", "progress_percent", "ALTER TABLE goals ADD COLUMN progress_percent INTEGER NOT NULL DEFAULT 0"),
            ("goals", "completion_note", "ALTER TABLE goals ADD COLUMN completion_note TEXT NOT NULL DEFAULT ''"),
            ("goals", "rolled_from_goal_id", "ALTER TABLE goals ADD COLUMN rolled_from_goal_id BIGINT" if USE_POSTGRES else "ALTER TABLE goals ADD COLUMN rolled_from_goal_id INTEGER"),
            ("goals", "source_goal_id", "ALTER TABLE goals ADD COLUMN source_goal_id BIGINT" if USE_POSTGRES else "ALTER TABLE goals ADD COLUMN source_goal_id INTEGER"),
            ("rotes", "rote_date", "ALTER TABLE rotes ADD COLUMN rote_date TEXT NOT NULL DEFAULT ''"),
        ]
        for table, column, ddl in alter_columns:
            ensure_column(conn, table, column, ddl)

        execute(conn, "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)")
        execute(conn, "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub)")


@app.on_event("startup")
def startup():
    """Application startup lifecycle event: initializes database and starts background email scheduler daemon."""
    setup_database()
    t = threading.Thread(target=run_email_scheduler_loop, daemon=True)
    t.start()


@app.get("/api/health")
def health():
    """Backend service health check endpoint."""
    return {"status": "ok"}


@app.post("/api/auth/google/verify")
@app.post("/api/auth/google/onetap")
@app.post("/api/auth/google")
async def auth_google_verify(payload: GoogleVerifyPayload, background_tasks: BackgroundTasks):
    """Google Identity Services (One Tap & Branded Button) credential verification."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google auth is not configured")

    credential = payload.credential.strip()
    if not credential:
        raise HTTPException(status_code=400, detail="Missing Google credential")

    if not google_id_token or not _google_auth_request:
        raise HTTPException(status_code=500, detail="Google token verification is unavailable")
    try:
        idinfo = google_id_token.verify_oauth2_token(
            credential, _google_auth_request, GOOGLE_CLIENT_ID,
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or expired Google credential")

    email = str(idinfo.get("email", "")).strip().lower()
    display_name = str(idinfo.get("name", "")).strip() or email.split("@")[0]
    google_sub = str(idinfo.get("sub", "")).strip()
    picture = str(idinfo.get("picture", "")).strip()

    if not email or not google_sub or idinfo.get("email_verified") is not True:
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
        return {
            "token": token,
            "user": user_to_dict(user_row),
            "is_new": is_new,
        }


@app.get("/api/auth/me")
def auth_me(authorization: str | None = Header(default=None)):
    """Retrieve current authenticated user metadata."""
    with db() as conn:
        user = current_user(conn, authorization)
        return {"user": user_to_dict(user)}


@app.post("/api/auth/profile")
def auth_complete_profile(payload: ProfileUpdate, authorization: str | None = Header(default=None)):
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
        user_id = current_user_id(conn, authorization)
        existing = execute(conn, "SELECT id FROM users WHERE username = %s AND id <> %s", (username, user_id)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Username already exists")

        if profile_photo is not None:
            execute(conn, "UPDATE users SET username = %s, display_name = %s, name = %s, profile_photo = %s, bio = %s WHERE id = %s", (username, display_name, display_name, profile_photo, bio, user_id))
        else:
            execute(conn, "UPDATE users SET username = %s, display_name = %s, name = %s, bio = %s WHERE id = %s", (username, display_name, display_name, bio, user_id))

        return {"user": user_to_dict(execute(conn, "SELECT * FROM users WHERE id = %s", (user_id,)).fetchone())}


@app.post("/api/auth/logout")
def auth_logout(authorization: str | None = Header(default=None)):
    """Revoke active session token on sign out."""
    with db() as conn:
        if authorization and authorization.startswith("Bearer "):
            execute(conn, "DELETE FROM sessions WHERE token_hash = %s", (token_hash(authorization.removeprefix("Bearer ").strip()),))
    return {"ok": True}


# --- DASHBOARD & GOALS ENDPOINTS ---

@app.get("/api/dashboard")
def dashboard(authorization: str | None = Header(default=None)):
    """Overview dashboard endpoint: returns year progress, user profile, and active sprint goals."""
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
    """List goals for active sprint or requested sprint cycle."""
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
    """Create a new goal for the active sprint."""
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
    """Update goal title, progress, completion status, or reflection notes."""
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
    """Delete goal and clean up all rolled-over instances across sprint cycles."""
    with db() as conn:
        user_id = current_user_id(conn, authorization)
        goal = execute(conn, "SELECT * FROM goals WHERE id = %s AND user_id = %s", (goal_id, user_id)).fetchone()
        if not goal:
            raise HTTPException(status_code=404, detail="Goal not found")
        source_id = resolve_source_goal_id(conn, goal)
        execute(conn, "DELETE FROM goals WHERE (id = %s OR source_goal_id = %s) AND user_id = %s", (source_id, source_id, user_id))


# --- ROTE DAILY HABIT ENDPOINTS ---

@app.get("/api/rotes")
def get_rotes(date: str | None = None, authorization: str | None = Header(default=None)):
    """Retrieve daily rote habits and completion logs for a given date."""
    target_date = date or datetime.now(IST).strftime("%Y-%m-%d")
    with db() as conn:
        user_id = current_user_id(conn, authorization)
        joined_dt = user_created_at(conn, user_id)
        joined_date = joined_dt.strftime("%Y-%m-%d")
        
        rotes_rows = execute(
            conn,
            "SELECT * FROM rotes WHERE user_id = %s AND (rote_date = %s OR rote_date = '' OR rote_date IS NULL) ORDER BY id ASC",
            (user_id, target_date)
        ).fetchall()
        
        logs_rows = execute(
            conn,
            "SELECT * FROM rote_logs WHERE user_id = %s AND log_date = %s",
            (user_id, target_date)
        ).fetchall()
        logs_map = {row["rote_id"]: bool(row["completed"]) for row in logs_rows}
        logs_time_map = {row["rote_id"]: row.get("completed_at") for row in logs_rows}

        rotes_list = []
        completed_count = 0
        for r in rotes_rows:
            r_dict = row_dict(r)
            r_id = r_dict["id"]
            is_completed = logs_map.get(r_id, False)
            if is_completed:
                completed_count += 1
            rotes_list.append({
                "id": r_id,
                "title": r_dict["title"],
                "description": r_dict.get("description", ""),
                "created_at": r_dict["created_at"],
                "rote_date": r_dict.get("rote_date", target_date),
                "completed": is_completed,
                "completed_at": logs_time_map.get(r_id),
            })
            
        completed_dates_rows = execute(
            conn,
            "SELECT DISTINCT log_date FROM rote_logs WHERE user_id = %s AND completed = 1",
            (user_id,)
        ).fetchall()
        completed_dates = [row["log_date"] for row in completed_dates_rows]

        return {
            "date": target_date,
            "user_joined_date": joined_date,
            "rotes": rotes_list,
            "completed_dates": completed_dates,
            "stats": {
                "total_rotes": len(rotes_list),
                "completed_rotes": completed_count,
            }
        }


@app.post("/api/rotes")
def create_rote(payload: RoteCreate, authorization: str | None = Header(default=None)):
    """Create a new daily habit / rote routine."""
    with db() as conn:
        user_id = current_user_id(conn, authorization)
        rote_date = payload.date or datetime.now(IST).strftime("%Y-%m-%d")
        now_iso = current_timestamp()
        row = execute(
            conn,
            """
            INSERT INTO rotes (user_id, title, description, rote_date, created_at)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
            """,
            (user_id, payload.title.strip(), (payload.description or "").strip(), rote_date, now_iso)
        ).fetchone()
        rote_id = int(row["id"])
        rote = execute(conn, "SELECT * FROM rotes WHERE id = %s", (rote_id,)).fetchone()
        r_dict = row_dict(rote)
        r_dict["completed"] = False
        return r_dict


@app.post("/api/rotes/{rote_id}/toggle")
def toggle_rote(rote_id: int, payload: RoteToggle, authorization: str | None = Header(default=None)):
    """Toggle daily completion status of a rote habit for a specific date."""
    with db() as conn:
        user_id = current_user_id(conn, authorization)
        rote = execute(conn, "SELECT * FROM rotes WHERE id = %s AND user_id = %s", (rote_id, user_id)).fetchone()
        if not rote:
            raise HTTPException(status_code=404, detail="Rote not found")

        log = execute(
            conn,
            "SELECT * FROM rote_logs WHERE user_id = %s AND rote_id = %s AND log_date = %s",
            (user_id, rote_id, payload.date)
        ).fetchone()

        if log:
            current_status = bool(log["completed"])
            new_status = not current_status if payload.completed is None else bool(payload.completed)
            now_iso = current_timestamp() if new_status else None
            execute(
                conn,
                "UPDATE rote_logs SET completed = %s, completed_at = %s WHERE id = %s",
                (int(new_status), now_iso, log["id"])
            )
        else:
            new_status = True if payload.completed is None else bool(payload.completed)
            now_iso = current_timestamp() if new_status else None
            execute(
                conn,
                """
                INSERT INTO rote_logs (user_id, rote_id, log_date, completed, completed_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (user_id, rote_id, payload.date, int(new_status), now_iso)
            )

        return {"rote_id": rote_id, "date": payload.date, "completed": new_status}


@app.delete("/api/rotes/{rote_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rote(rote_id: int, authorization: str | None = Header(default=None)):
    """Delete a rote habit and its associated completion logs."""
    with db() as conn:
        user_id = current_user_id(conn, authorization)
        rote = execute(conn, "SELECT * FROM rotes WHERE id = %s AND user_id = %s", (rote_id, user_id)).fetchone()
        if not rote:
            raise HTTPException(status_code=404, detail="Rote not found")
        execute(conn, "DELETE FROM rote_logs WHERE rote_id = %s AND user_id = %s", (rote_id, user_id))
        execute(conn, "DELETE FROM rotes WHERE id = %s AND user_id = %s", (rote_id, user_id))


# --- STATS, PROFILE & TIMELINE ENDPOINTS ---

@app.get("/api/stats")
def stats(authorization: str | None = Header(default=None)):
    """Retrieve overall goal and streak statistics for current user."""
    with db() as conn:
        user_id = current_user_id(conn, authorization)
        return profile_stats(conn, user_id=user_id)["stats"]


@app.get("/api/profile")
def profile(year: int | None = None, authorization: str | None = Header(default=None)):
    """Profile endpoint: returns heatmaps, streaks, user info, and sprint completion stats."""
    with db() as conn:
        user_id = current_user_id(conn, authorization)
        progress = year_progress()
        if year is None:
            ensure_sprint_rollover(conn, progress["year"], progress["sprint_number"], user_id)
        return profile_stats(conn, year, user_id)


@app.get("/api/timeline")
def timeline(year: int | None = None, authorization: str | None = Header(default=None)):
    """Timeline history endpoint: lists all past sprint summaries for the selected year."""
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
    """Retrieve detailed goal breakdown for a specific sprint in the timeline history."""
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


@app.get("/api/u/{username}")
def get_public_profile(username: str, year: int | None = None):
    """Public Profile Gateway: returns public user details, active goals, stats, and timeline history."""
    username = normalize_username(username)
    with db() as conn:
        user_row = execute(conn, "SELECT id, name, username, display_name, created_at, profile_photo, bio FROM users WHERE username = %s", (username,)).fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_data = row_dict(user_row)
        user_id = user_data["id"]
        
        progress = year_progress()
        current_year = progress["year"]
        current_sprint = progress["sprint_number"]
        
        # Get active goals
        goals_rows = execute(
            conn,
            "SELECT id, title, target, progress, completed, sprint_year, sprint_number FROM goals WHERE user_id = %s AND sprint_year = %s AND sprint_number = %s ORDER BY id",
            (user_id, current_year, current_sprint)
        ).fetchall()
        
        goals = []
        for row in goals_rows:
            d = row_dict(row)
            d["completed"] = bool(d["completed"])
            d["done"] = d["completed"]
            goals.append(d)
            
        # Get stats
        stats_data = profile_stats(conn, year, user_id)
        
        # Get timeline history
        joined = user_created_at(conn, user_id)
        selected_year = year or progress["year"]
        start_sprint = year_progress(joined)["sprint_number"] if selected_year == joined.year else 1
        end_sprint = progress["sprint_number"] if selected_year == progress["year"] else 100
        history_items = [sprint_summary(conn, selected_year, sprint_number, user_id) for sprint_number in range(start_sprint, end_sprint + 1)]
        
        history = {
            "year": selected_year,
            "years": list(range(joined.year, progress["year"] + 1)),
            "start_sprint": start_sprint,
            "end_sprint": end_sprint,
            "sprints": history_items,
        }
        
        joined_date = user_created_at(conn, user_id)
        joined_progress = year_progress(joined_date)
        
        return {
            "user": {
                "username": user_data["username"],
                "display_name": user_data["display_name"] or user_data["name"] or user_data["username"],
                "profile_photo": user_data["profile_photo"] or "",
                "bio": user_data["bio"] or "",
                "active_since": {
                    "year": joined_progress["year"],
                    "sprint_number": joined_progress["sprint_number"]
                }
            },
            "goals": goals,
            "stats": stats_data["stats"],
            "history": history,
            "sprint": current_sprint,
            "year": current_year
        }


# --- BREVO EMAIL NOTIFICATION SCHEDULER ---

def send_email_via_brevo(to_email: str, subject: str, html_body: str) -> bool:
    """Send transactional email via Brevo REST API v3."""
    if not BREVO_API_KEY or not BREVO_SENDER_EMAIL:
        print("Brevo credentials are not configured. Skipping email send.")
        return False
    try:
        response = httpx.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={
                "api-key": BREVO_API_KEY,
                "Content-Type": "application/json"
            },
            json={
                "sender": {"name": "OnePercentGoal", "email": BREVO_SENDER_EMAIL},
                "to": [{"email": to_email}],
                "subject": subject,
                "htmlContent": html_body
            },
            timeout=10.0
        )
        if response.status_code in (200, 201, 202):
            print(f"Successfully sent email to {to_email} via Brevo HTTP API")
            return True
        else:
            print(f"Failed to send email to {to_email} via Brevo: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"Error calling Brevo API: {e}")
        return False


def send_welcome_email(user_email: str, user_name: str):
    """Dispatch welcome onboarding email to new Google OAuth user."""
    subject = "Welcome to OnePercentGoal! Let's start compounding."
    logo_url = EMAIL_LOGO_URL if EMAIL_LOGO_URL else f"{FRONTEND_URL}/favicon.ico"
    html_body = f"""
    <div style="font-family: 'DM Sans', sans-serif; background: #141513; color: #f3f1ed; padding: 40px 24px; max-width: 580px; margin: 0 auto; border: 1px solid #2b2c28; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.5);">
        <div style="text-align: center; margin-bottom: 36px;">
            <img src="{logo_url}" alt="OnePercentGoal Logo" style="width: 32px; height: 32px; margin-bottom: 12px; display: inline-block;" />
            <div style="font-family: 'DM Mono', monospace; font-size: 10px; color: #8e9088; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 500;">ONEPERCENTGOAL</div>
        </div>
        <p style="font-family: 'DM Mono', monospace; font-size: 11px; color: #c9f36a; letter-spacing: 0.14em; text-transform: uppercase; margin: 0 0 12px; font-weight: 500;">ONEPERCENTGOAL ONBOARDING</p>
        <h1 style="font-size: 32px; font-weight: 600; color: #f6f5f1; letter-spacing: -0.05em; margin: 0 0 20px; font-family: 'Instrument Serif', serif; font-style: italic;">
            Welcome to OnePercentGoal, {user_name}!
        </h1>
        <p style="font-size: 15px; line-height: 1.6; color: #a5a79e; margin-bottom: 18px;">
            We're thrilled to have you here. OnePercentGoal is built around a single, powerful philosophy: 
            <strong>getting 1% better every sprint</strong>.
        </p>
        <p style="font-size: 15px; line-height: 1.6; color: #a5a79e; margin-bottom: 24px;">
            A year consists of 100 sprints (each sprint is exactly 3.6 days, representing 1% of the year). By completing your goals consistently, you leverage compounding growth, leading to a massive <strong>37.78x increase</strong> in capability by the end of the year.
        </p>
        
        <h3 style="color: #f6f5f1; font-size: 18px; margin-top: 28px; margin-bottom: 12px; font-weight: 500;">What you can do with the app:</h3>
        <ul style="padding-left: 20px; color: #a5a79e; font-size: 15px; line-height: 1.6; margin-bottom: 30px;">
            <li style="margin-bottom: 10px;">🎯 <strong>Create Sprint Goals</strong>: Set concrete, actionable goals for the current 3.6-day active sprint.</li>
            <li style="margin-bottom: 10px;">⏳ <strong>Track Progress In Real Time</strong>: Watch the compounding counter build up and count down towards the sprint limit.</li>
            <li style="margin-bottom: 10px;">🔄 <strong>Automatic Rollovers</strong>: Any goals left incomplete are automatically rolled over to the next sprint, ensuring nothing gets lost.</li>
            <li style="margin-bottom: 10px;">🔗 <strong>Share Your Profile</strong>: Copy your profile link to showcase your active goals and sprint history publicly with friends.</li>
        </ul>
        
        <div style="text-align: center; margin-top: 30px;">
            <a href="{FRONTEND_URL}" style="display: inline-block; background: #c9f36a; color: #121411; text-decoration: none; padding: 12px 28px; border-radius: 99px; font-size: 14px; font-weight: 600; box-shadow: 0 4px 15px rgba(201, 243, 106, 0.2);">
                Launch Your First Sprint
            </a>
        </div>
        <div style="border-top: 1px solid #2f322b; margin-top: 40px; padding-top: 20px; font-size: 11px; color: #8c9085; font-family: 'DM Mono', monospace; text-align: center;">
            1 SPRINT = 1% OF YEAR · 1 SPRINT = 3.6 DAYS
        </div>
    </div>
    """
    send_email_via_brevo(user_email, subject, html_body)


def log_sent_reminder(conn, user_id: int, year: int, sprint: int, rtype: str):
    """Record email notification sent state to prevent duplicate emails."""
    if USE_POSTGRES:
        execute(
            conn,
            "INSERT INTO sprint_email_reminders (user_id, sprint_year, sprint_number, reminder_type, sent_at) VALUES (%s, %s, %s, %s, NOW()) ON CONFLICT DO NOTHING",
            (user_id, year, sprint, rtype)
        )
    else:
        execute(
            conn,
            "INSERT OR IGNORE INTO sprint_email_reminders (user_id, sprint_year, sprint_number, reminder_type, sent_at) VALUES (%s, %s, %s, %s, %s)",
            (user_id, year, sprint, rtype, datetime.now(IST).isoformat())
        )


def check_and_send_sprint_reminders():
    """Background worker task: evaluates active sprints, pending goals, and sends automated 12h/6h countdown and rollover wrap-up emails."""
    now = datetime.now(IST)
    progress = year_progress(now)
    current_year = progress["year"]
    current_sprint = progress["sprint_number"]
    
    sprint_end = sprint_end_datetime(current_year, current_sprint)
    hours_left = (sprint_end - now).total_seconds() / 3600.0
    logo_url = EMAIL_LOGO_URL if EMAIL_LOGO_URL else f"{FRONTEND_URL}/favicon.ico"
    
    reminder_type = None
    if 0 < hours_left <= 6.0:
        reminder_type = "6h"
    elif 6.0 < hours_left <= 12.0:
        reminder_type = "12h"
        
    with db() as conn:
        users_rows = execute(conn, "SELECT id, email, display_name, name FROM users").fetchall()
        
        # 1. 12h / 6h active reminders
        if reminder_type:
            for u_row in users_rows:
                user_id = u_row["id"]
                user_email = u_row["email"]
                user_name = u_row["display_name"] or u_row["name"] or "User"
                
                reminder_sent = execute(
                    conn,
                    "SELECT id FROM sprint_email_reminders WHERE user_id = %s AND sprint_year = %s AND sprint_number = %s AND reminder_type = %s",
                    (user_id, current_year, current_sprint, reminder_type)
                ).fetchone()
                
                if reminder_sent:
                    continue
                    
                goals_rows = execute(
                    conn,
                    "SELECT title, target, progress FROM goals WHERE user_id = %s AND sprint_year = %s AND sprint_number = %s AND completed = 0",
                    (user_id, current_year, current_sprint)
                ).fetchall()
                
                if not goals_rows:
                    continue
                    
                goals_list_html = "".join([
                    f"<li style='margin-bottom: 12px; font-size: 15px; color: #eef0e9; list-style: none; display: flex; align-items: center;'><span style='color: #c9f36a; margin-right: 10px;'>▪</span> <span><strong>{row['title']}</strong> (Progress: {row['progress']}/{row['target']})</span></li>"
                    for row in goals_rows
                ])
                
                subject = f"{int(round(hours_left))} Hours Left! Complete your Sprint #{current_sprint} Goals"
                html_body = f"""
                <div style="font-family: 'DM Sans', sans-serif; background: #141513; color: #f3f1ed; padding: 40px 24px; max-width: 580px; margin: 0 auto; border: 1px solid #2b2c28; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.5);">
                    <div style="text-align: center; margin-bottom: 36px;">
                        <img src="{logo_url}" alt="OnePercentGoal Logo" style="width: 32px; height: 32px; margin-bottom: 12px; display: inline-block;" />
                        <div style="font-family: 'DM Mono', monospace; font-size: 10px; color: #8e9088; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 500;">ONEPERCENTGOAL</div>
                    </div>
                    <p style="font-family: 'DM Mono', monospace; font-size: 11px; color: #c9f36a; letter-spacing: 0.14em; text-transform: uppercase; margin: 0 0 12px; font-weight: 500;">SPRINT COUNTDOWN ALERT</p>
                    <h1 style="font-size: 26px; font-weight: 600; color: #f6f5f1; letter-spacing: -0.04em; line-height: 1.25; margin: 0 0 20px;">
                        Hi {user_name}, you have {round(hours_left, 1)} hours left!
                    </h1>
                    <p style="font-size: 15px; line-height: 1.6; color: #a5a79e; margin: 0 0 24px;">
                        Sprint #{current_sprint} of {current_year} is wrapping up. Don't let your compounding momentum slip. Here are the goals still requiring your attention:
                    </p>
                    <div style="background: #1c1d1a; border: 1px solid #2b2c28; border-radius: 8px; padding: 20px 20px 8px; margin-bottom: 28px;">
                        <ul style="padding-left: 0; list-style-type: none; margin: 0;">
                            {goals_list_html}
                        </ul>
                    </div>
                    <div style="text-align: center;">
                        <a href="{FRONTEND_URL}" style="display: inline-block; background: #c9f36a; color: #121411; text-decoration: none; padding: 12px 28px; border-radius: 99px; font-size: 14px; font-weight: 600; box-shadow: 0 4px 15px rgba(201, 243, 106, 0.2);">
                            Open Sprint Dashboard
                        </a>
                    </div>
                    <div style="border-top: 1px solid #2f322b; margin-top: 40px; padding-top: 20px; font-size: 11px; color: #8c9085; font-family: 'DM Mono', monospace; text-align: center;">
                        1 SPRINT = 1% OF YEAR · 1 SPRINT = 3.6 DAYS
                    </div>
                </div>
                """
                
                success = send_email_via_brevo(user_email, subject, html_body)
                if success:
                    log_sent_reminder(conn, user_id, current_year, current_sprint, reminder_type)

        # 2. Post-Sprint Outcomes check
        if current_sprint > 1:
            prev_sprint = current_sprint - 1
            prev_year = current_year
        else:
            prev_sprint = 100
            prev_year = current_year - 1

        for u_row in users_rows:
            user_id = u_row["id"]
            user_email = u_row["email"]
            user_name = u_row["display_name"] or u_row["name"] or "User"

            try:
                ensure_sprint_rollover(conn, current_year, current_sprint, user_id)
            except Exception as e:
                print(f"Error running rollover during email check: {e}")

            wrap_sent = execute(
                conn,
                """
                SELECT id FROM sprint_email_reminders 
                WHERE user_id = %s AND sprint_year = %s AND sprint_number = %s 
                  AND reminder_type IN ('sprint_end_congrats', 'sprint_end_rollover', 'sprint_end_skipped')
                """,
                (user_id, prev_year, prev_sprint)
            ).fetchone()

            if wrap_sent:
                continue

            prev_goals = execute(
                conn,
                "SELECT title, completed FROM goals WHERE user_id = %s AND sprint_year = %s AND sprint_number = %s",
                (user_id, prev_year, prev_sprint)
            ).fetchall()

            if not prev_goals:
                log_sent_reminder(conn, user_id, prev_year, prev_sprint, "sprint_end_skipped")
                continue

            total_count = len(prev_goals)
            completed_count = sum(1 for g in prev_goals if g["completed"])

            if completed_count == total_count:
                subject = f"100% Completion! Congratulations on Sprint #{prev_sprint}!"
                html_body = f"""
                <div style="font-family: 'DM Sans', sans-serif; background: #141513; color: #f3f1ed; padding: 40px 24px; max-width: 580px; margin: 0 auto; border: 1px solid #2b2c28; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.5);">
                    <div style="text-align: center; margin-bottom: 36px;">
                        <img src="{logo_url}" alt="OnePercentGoal Logo" style="width: 32px; height: 32px; margin-bottom: 12px; display: inline-block;" />
                        <div style="font-family: 'DM Mono', monospace; font-size: 10px; color: #8e9088; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 500;">ONEPERCENTGOAL</div>
                    </div>
                    <p style="font-family: 'DM Mono', monospace; font-size: 11px; color: #c9f36a; letter-spacing: 0.14em; text-transform: uppercase; margin: 0 0 12px; font-weight: 500;">SPRINT END REPORT</p>
                    <h1 style="font-size: 32px; font-weight: 600; color: #c9f36a; letter-spacing: -0.05em; margin: 0 0 20px; font-family: 'Instrument Serif', serif; font-style: italic;">
                        Flawless Sprint! 100% Complete.
                    </h1>
                    <p style="font-size: 15px; line-height: 1.6; color: #a5a79e; margin: 0 0 20px;">
                        Hi {user_name}, congratulations! You completed all <strong>{total_count}</strong> of your goals in Sprint #{prev_sprint} of {prev_year}.
                    </p>
                    <p style="font-size: 15px; line-height: 1.6; color: #a5a79e; margin: 0 0 28px;">
                        This is a huge milestone for your compounding momentum. Staying consistent leads to a massive 37.78x yield by the end of the year. Let's keep the fire burning!
                    </p>
                    <div style="text-align: center; margin-top: 30px;">
                        <a href="{FRONTEND_URL}" style="display: inline-block; background: #c9f36a; color: #121411; text-decoration: none; padding: 12px 28px; border-radius: 99px; font-size: 14px; font-weight: 600; box-shadow: 0 4px 15px rgba(201, 243, 106, 0.2);">
                            Define Sprint #{current_sprint} Directives
                        </a>
                    </div>
                    <div style="border-top: 1px solid #2f322b; margin-top: 40px; padding-top: 20px; font-size: 11px; color: #8c9085; font-family: 'DM Mono', monospace; text-align: center;">
                        1 SPRINT = 1% OF YEAR · 1 SPRINT = 3.6 DAYS
                    </div>
                </div>
                """
                success = send_email_via_brevo(user_email, subject, html_body)
                if success:
                    log_sent_reminder(conn, user_id, prev_year, prev_sprint, "sprint_end_congrats")

            else:
                rolled_goals = execute(
                    conn,
                    """
                    SELECT title, target, progress FROM goals 
                    WHERE user_id = %s AND sprint_year = %s AND sprint_number = %s 
                      AND rolled_from_goal_id IS NOT NULL
                    """,
                    (user_id, current_year, current_sprint)
                ).fetchall()

                if rolled_goals:
                    rolled_list_html = "".join([
                        f"<li style='margin-bottom: 12px; font-size: 15px; color: #eef0e9; list-style: none; display: flex; align-items: center;'><span style='color: #c9f36a; margin-right: 10px;'>▪</span> <span><strong>{row['title']}</strong> (Progress: {row['progress']}/{row['target']})</li>"
                        for row in rolled_goals
                    ])
                    subject = f"Rollover Agenda: Sprint #{prev_sprint} Wrap-up & New Targets"
                    html_body = f"""
                    <div style="font-family: 'DM Sans', sans-serif; background: #141513; color: #f3f1ed; padding: 40px 24px; max-width: 580px; margin: 0 auto; border: 1px solid #2b2c28; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.5);">
                        <div style="text-align: center; margin-bottom: 36px;">
                            <img src="{logo_url}" alt="OnePercentGoal Logo" style="width: 32px; height: 32px; margin-bottom: 12px; display: inline-block;" />
                            <div style="font-family: 'DM Mono', monospace; font-size: 10px; color: #8e9088; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 500;">ONEPERCENTGOAL</div>
                        </div>
                        <p style="font-family: 'DM Mono', monospace; font-size: 11px; color: #c9f36a; letter-spacing: 0.14em; text-transform: uppercase; margin: 0 0 12px; font-weight: 500;">SPRINT WRAP-UP AGENDA</p>
                        <h1 style="font-size: 26px; font-weight: 600; color: #f6f5f1; letter-spacing: -0.04em; line-height: 1.25; margin: 0 0 20px;">
                            Sprint #{prev_sprint} Wrapped: Goals Rolled Over
                        </h1>
                        <p style="font-size: 15px; line-height: 1.6; color: #a5a79e; margin: 0 0 20px;">
                            Hi {user_name}, Sprint #{prev_sprint} has officially ended. You successfully finished <strong>{completed_count} of {total_count}</strong> goals.
                        </p>
                        <p style="font-size: 15px; line-height: 1.6; color: #a5a79e; margin: 0 0 20px;">
                            To keep your momentum, your remaining incomplete goals have been automatically transferred to your active <strong>Sprint #{current_sprint}</strong>:
                        </p>
                        <div style="background: #1c1d1a; border: 1px solid #2b2c28; border-radius: 8px; padding: 20px 20px 8px; margin-bottom: 28px;">
                            <ul style="padding-left: 0; list-style-type: none; margin: 0;">
                                {rolled_list_html}
                            </ul>
                        </div>
                        <p style="font-size: 15px; line-height: 1.6; color: #a5a79e; margin-bottom: 28px;">
                            Let's start fresh and check these off early in the next 3.6 days. Keep compounding every single cycle!
                        </p>
                        <div style="text-align: center;">
                            <a href="{FRONTEND_URL}" style="display: inline-block; background: #c9f36a; color: #121411; text-decoration: none; padding: 12px 28px; border-radius: 99px; font-size: 14px; font-weight: 600; box-shadow: 0 4px 15px rgba(201, 243, 106, 0.2);">
                                Open Sprint Board
                            </a>
                        </div>
                        <div style="border-top: 1px solid #2f322b; margin-top: 40px; padding-top: 20px; font-size: 11px; color: #8c9085; font-family: 'DM Mono', monospace; text-align: center;">
                            1 SPRINT = 1% OF YEAR · 1 SPRINT = 3.6 DAYS
                        </div>
                    </div>
                    """
                    success = send_email_via_brevo(user_email, subject, html_body)
                    if success:
                        log_sent_reminder(conn, user_id, prev_year, prev_sprint, "sprint_end_rollover")
                else:
                    log_sent_reminder(conn, user_id, prev_year, prev_sprint, "sprint_end_skipped")


def run_email_scheduler_loop():
    """Background daemon loop: executes email notification checks every 5 minutes."""
    print("Email reminder background scheduler loop started.")
    while True:
        try:
            check_and_send_sprint_reminders()
        except Exception as e:
            print(f"Error in email reminder loop: {e}")
        time.sleep(300)
