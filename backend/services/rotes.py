"""Rote schemas and domain services for daily habit routines."""
from __future__ import annotations

from pydantic import BaseModel, Field
from backend.config import current_timestamp
from backend.db.connection import execute


class RoteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    description: str | None = Field(default="", max_length=255)
    date: str | None = None


class RoteToggle(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    completed: bool | None = None


def toggle_rote_log(conn, user_id: int, rote_id: int, date_str: str, completed: bool | None = None) -> bool:
    """Atomically toggle or set daily rote habit completion using ON CONFLICT upsert."""
    now_iso = current_timestamp()
    if completed is not None:
        val = 1 if completed else 0
        completed_at = now_iso if val == 1 else None
        query = """
            INSERT INTO rote_logs (user_id, rote_id, log_date, completed, completed_at)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (user_id, rote_id, log_date)
            DO UPDATE SET
                completed = EXCLUDED.completed,
                completed_at = EXCLUDED.completed_at
            RETURNING completed
        """
        row = execute(conn, query, (user_id, rote_id, date_str, val, completed_at)).fetchone()
    else:
        query = """
            INSERT INTO rote_logs (user_id, rote_id, log_date, completed, completed_at)
            VALUES (%s, %s, %s, 1, %s)
            ON CONFLICT (user_id, rote_id, log_date)
            DO UPDATE SET
                completed = 1 - rote_logs.completed,
                completed_at = CASE WHEN rote_logs.completed = 0 THEN EXCLUDED.completed_at ELSE NULL END
            RETURNING completed
        """
        row = execute(conn, query, (user_id, rote_id, date_str, now_iso)).fetchone()

    return bool(row["completed"] if isinstance(row, dict) or hasattr(row, "__getitem__") else row[0])
