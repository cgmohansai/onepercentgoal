"""Profile statistics and public profile gateway endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Header, Cookie, HTTPException

from backend.db.connection import db, execute, row_dict
from backend.auth.session import (
    current_user_id,
    user_created_at,
    normalize_username,
)
from backend.sprint_engine import year_progress, sprint_window
from backend.services.goals import ensure_sprint_rollover, goal_dict
from backend.services.timeline import sprint_summary
from backend.services.profile import profile_stats

router = APIRouter(tags=["profile"])


@router.get("/api/stats")
def stats(authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """Retrieve overall goal and streak statistics for current user."""
    with db() as conn:
        user_id = current_user_id(conn, authorization, opg_session)
        return profile_stats(conn, user_id=user_id)["stats"]


@router.get("/api/profile")
def profile(year: int | None = None, authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """Profile endpoint: returns heatmaps, streaks, user info, and sprint completion stats."""
    with db() as conn:
        user_id = current_user_id(conn, authorization, opg_session)
        progress = year_progress()
        if year is None:
            ensure_sprint_rollover(conn, progress["year"], progress["sprint_number"], user_id)
        return profile_stats(conn, year, user_id)


@router.get("/api/u/{username}")
def get_public_profile(username: str, year: int | None = None):
    """Public Profile Gateway: returns public user details, active goals, stats, and timeline history."""
    clean_username = normalize_username(username)
    with db() as conn:
        user_row = execute(
            conn,
            "SELECT id, name, username, display_name, created_at, profile_photo, bio FROM users WHERE LOWER(username) = LOWER(%s) OR username = %s",
            (clean_username, username.strip())
        ).fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")

        user_data = row_dict(user_row)
        user_id = user_data["id"]

        progress = year_progress()
        current_year = progress["year"]
        current_sprint = progress["sprint_number"]

        # Ensure goals rollover is up to date for current sprint only if not already present
        has_current_goals = execute(
            conn,
            "SELECT 1 FROM goals WHERE user_id = %s AND sprint_year = %s AND sprint_number = %s LIMIT 1",
            (user_id, current_year, current_sprint)
        ).fetchone()
        if not has_current_goals:
            ensure_sprint_rollover(conn, current_year, current_sprint, user_id)

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
        start_bound = min(start_sprint, end_sprint)

        history_rows = execute(
            conn,
            "SELECT * FROM goals WHERE user_id = %s AND sprint_year = %s AND sprint_number >= %s AND sprint_number <= %s ORDER BY sprint_number, id",
            (user_id, selected_year, start_bound, end_sprint)
        ).fetchall()
        goals_by_sprint: dict[int, list] = {}
        for r in history_rows:
            sn = r["sprint_number"]
            goals_by_sprint.setdefault(sn, []).append(goal_dict(r))

        history_items = []
        for sprint_number in range(start_bound, end_sprint + 1):
            s_goals = goals_by_sprint.get(sprint_number, [])
            tot = len(s_goals)
            comp = sum(1 for g in s_goals if g["completed"])
            avg_p = round(sum(g["progress_percent"] for g in s_goals) / tot) if tot else 0
            s_start, s_end = sprint_window(selected_year, sprint_number)
            history_items.append({
                "year": selected_year,
                "sprint_number": sprint_number,
                "sprint_start": s_start,
                "sprint_end": s_end,
                "goal_count": tot,
                "completed_count": comp,
                "average_progress": avg_p,
                "goals": s_goals,
            })

        min_year = min(joined.year, selected_year, progress["year"])
        history = {
            "year": selected_year,
            "years": list(range(min_year, progress["year"] + 1)),
            "start_sprint": start_bound,
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
