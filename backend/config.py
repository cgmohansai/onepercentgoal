"""Configuration and environment variables for OnePercentGoal backend."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(ROOT / ".env")

# Timezone Definition (India Standard Time UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))

# Database & OAuth Environment Configuration
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
USE_POSTGRES = DATABASE_URL.startswith(("postgresql://", "postgres://"))
SQLITE_DATABASE = ROOT / "onepercentgoal.db"

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").strip().rstrip("/")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "").strip()
BREVO_SENDER_EMAIL = os.getenv("BREVO_SENDER_EMAIL", "").strip()
EMAIL_LOGO_URL = os.getenv("EMAIL_LOGO_URL", "").strip()
SESSION_DAYS = 30


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


def current_timestamp() -> str:
    """Return ISO 8601 string timestamp for current IST time."""
    return datetime.now(IST).isoformat()
