"""Goal schemas, formatting, and rollover business logic."""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field

from backend.config import USE_POSTGRES, current_timestamp
from backend.db.connection import execute, row_dict
from backend.auth.session import user_created_at
from backend.sprint_engine import year_progress, previous_sprint


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


def ensure_sprint_rollover(conn, year: int, sprint_number: int, user_id: int) -> None:
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
            ON CONFLICT (rolled_from_goal_id) DO NOTHING
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
        if not new_goal:
            continue
        if USE_POSTGRES:
            inserted_id = int(new_goal["id"])
        else:
            inserted_id = int(new_goal["id"]) if new_goal and "id" in dict(new_goal) else int(execute(conn, "SELECT last_insert_rowid()").fetchone()[0])
        execute(conn, "UPDATE goals SET source_goal_id = %s WHERE id = %s", (source_goal_id, inserted_id))
