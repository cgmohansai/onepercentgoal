"""FastAPI application entrypoint for OnePercentGoal."""
from __future__ import annotations

import sys
from pathlib import Path

_THIS_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _THIS_DIR.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Core configuration and database
from backend.config import (
    IST,
    DATABASE_URL,
    USE_POSTGRES,
    SQLITE_DATABASE,
    FRONTEND_URL,
    GOOGLE_CLIENT_ID,
    BREVO_API_KEY,
    BREVO_SENDER_EMAIL,
    EMAIL_LOGO_URL,
    SESSION_DAYS,
    as_utc,
    as_iso,
    current_timestamp,
)
from backend.db.connection import (
    db,
    sql,
    execute,
    row_dict,
    ensure_column,
)
from backend.db.setup import setup_database

# Sprint engine authoritative exports
from backend.sprint_engine import (
    TOTAL_SPRINTS_PER_YEAR,
    days_in_year,
    is_leap_year,
    sprint_boundary_timestamp,
    sprint_end_datetime,
    sprint_window,
    year_progress,
    previous_sprint,
    next_sprint,
)

# Authentication helpers and schemas
from backend.auth.session import (
    token_hash,
    normalize_username,
    user_to_dict,
    issue_session,
    cleanup_expired_sessions,
    current_user_id,
    current_user,
    user_created_at,
)
from backend.auth.google import GoogleVerifyPayload

# Service logic and models
from backend.services.goals import (
    GoalCreate,
    GoalUpdate,
    goal_dict,
    resolve_source_goal_id,
    ensure_sprint_rollover,
)
from backend.services.timeline import sprint_summary
from backend.services.profile import ProfileUpdate, profile_stats
from backend.services.rotes import RoteCreate, RoteToggle, toggle_rote_log
from backend.services.email import (
    send_email_via_brevo,
    send_welcome_email,
    log_sent_reminder,
)
from backend.api.auth import cleanup_expired_auth_codes

# API Routers
from backend.api import api_router

app = FastAPI(title="OnePercentGoal API", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://onepercentgoal.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost",
        "https://localhost",
        "capacitor://localhost",
        FRONTEND_URL,
    ],
    allow_origin_regex=r"https://.*\.vercel\.app|http://localhost(:\d+)?|https://localhost(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.on_event("startup")
def startup():
    """Application startup lifecycle event: initializes database."""
    setup_database()


def check_and_send_sprint_reminders():
    """Delegated to backend.scheduler module."""
    from backend.scheduler import check_and_send_sprint_reminders as _check
    return _check()


def run_email_scheduler_loop(*args, **kwargs):
    """Delegated to backend.scheduler module."""
    from backend.scheduler import run_email_scheduler_loop as _run
    return _run(*args, **kwargs)


__all__ = [
    "app",
    "startup",
    "IST",
    "DATABASE_URL",
    "USE_POSTGRES",
    "SQLITE_DATABASE",
    "FRONTEND_URL",
    "GOOGLE_CLIENT_ID",
    "BREVO_API_KEY",
    "BREVO_SENDER_EMAIL",
    "EMAIL_LOGO_URL",
    "SESSION_DAYS",
    "as_utc",
    "as_iso",
    "current_timestamp",
    "db",
    "sql",
    "execute",
    "row_dict",
    "ensure_column",
    "setup_database",
    "TOTAL_SPRINTS_PER_YEAR",
    "days_in_year",
    "is_leap_year",
    "sprint_boundary_timestamp",
    "sprint_end_datetime",
    "sprint_window",
    "year_progress",
    "previous_sprint",
    "next_sprint",
    "token_hash",
    "normalize_username",
    "user_to_dict",
    "issue_session",
    "current_user_id",
    "current_user",
    "user_created_at",
    "GoogleVerifyPayload",
    "GoalCreate",
    "GoalUpdate",
    "goal_dict",
    "resolve_source_goal_id",
    "ensure_sprint_rollover",
    "sprint_summary",
    "ProfileUpdate",
    "profile_stats",
    "RoteCreate",
    "RoteToggle",
    "send_email_via_brevo",
    "send_welcome_email",
    "log_sent_reminder",
    "check_and_send_sprint_reminders",
    "run_email_scheduler_loop",
]
