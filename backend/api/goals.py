"""Goal and dashboard management API endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Header, Cookie, HTTPException, status

from backend.config import current_timestamp
from backend.db.connection import db, execute, row_dict
from backend.auth.session import current_user_id, user_to_dict
from backend.sprint_engine import year_progress
from backend.services.goals import (
    GoalCreate,
    GoalUpdate,
    goal_dict,
    jsonable_goal,
    resolve_source_goal_id,
    ensure_sprint_rollover,
)

router = APIRouter(tags=["goals"])


@router.get("/api/dashboard")
def dashboard(authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """Overview dashboard endpoint: returns year progress, user profile, and active sprint goals."""
    progress = year_progress()
    with db() as conn:
        user_id = current_user_id(conn, authorization, opg_session)
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


@router.get("/api/goals")
def list_goals(sprint_number: int | None = None, authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """List goals for active sprint or requested sprint cycle."""
    progress = year_progress()
    number = sprint_number or progress["sprint_number"]
    with db() as conn:
        user_id = current_user_id(conn, authorization, opg_session)
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


@router.post("/api/goals", status_code=status.HTTP_201_CREATED)
def create_goal(payload: GoalCreate, authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """Create a new goal for the active sprint."""
    sprint = year_progress()
    completed = int(payload.progress_percent >= 100)
    with db() as conn:
        user_id = current_user_id(conn, authorization, opg_session)
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


@router.patch("/api/goals/{goal_id}")
def update_goal(goal_id: int, payload: GoalUpdate, authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """Update goal title, progress, completion status, or reflection notes."""
    with db() as conn:
        user_id = current_user_id(conn, authorization, opg_session)
        existing = execute(conn, "SELECT * FROM goals WHERE id = %s AND user_id = %s", (goal_id, user_id)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Goal not found")
        data = row_dict(existing)
        if payload.base_version is not None and int(payload.base_version) != int(data.get("version") or 1):
            raise HTTPException(status_code=409, detail={"message": "Goal changed elsewhere", "server": jsonable_goal(existing)})
        previous_progress = int(data.get("progress_percent", 0))
        for field, value in payload.model_dump(exclude_none=True).items():
            if field == "base_version":
                continue
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
            SET title = %s, description = %s, priority = %s, target = %s, progress = %s, progress_percent = %s, completed = %s, completion_note = %s, version = version + 1
            WHERE id = %s
            """,
            (data["title"], data["description"], data["priority"], data["target"], data["progress"], data["progress_percent"], int(data["completed"]), data.get("completion_note", ""), goal_id),
        )
        goal = execute(conn, "SELECT * FROM goals WHERE id = %s", (goal_id,)).fetchone()
    return goal_dict(goal)


@router.delete("/api/goals/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(goal_id: int, authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """Delete goal and clean up all rolled-over instances across sprint cycles."""
    with db() as conn:
        user_id = current_user_id(conn, authorization, opg_session)
        goal = execute(conn, "SELECT * FROM goals WHERE id = %s AND user_id = %s", (goal_id, user_id)).fetchone()
        if not goal:
            raise HTTPException(status_code=404, detail="Goal not found")
        source_id = resolve_source_goal_id(conn, goal)
        execute(conn, "DELETE FROM goals WHERE (id = %s OR source_goal_id = %s) AND user_id = %s", (source_id, source_id, user_id))
