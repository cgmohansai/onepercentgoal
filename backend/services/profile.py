"""User profile schemas and stats calculation services."""
from __future__ import annotations

from datetime import datetime
from fastapi import HTTPException
from pydantic import BaseModel, Field

from backend.config import IST
from backend.db.connection import execute
from backend.auth.session import user_to_dict, user_created_at
from backend.sprint_engine import year_progress
from backend.services.goals import resolve_source_goal_id
from backend.services.timeline import sprint_summary


class ProfileUpdate(BaseModel):
    username: str = Field(min_length=3, max_length=24)
    display_name: str = Field(min_length=1, max_length=80)
    profile_photo: str | None = None
    bio: str | None = Field(default="", max_length=160)


def profile_stats(conn, year: int | None = None, user_id: int | None = None) -> dict:
    """Calculate user streak metrics, sprint completion heatmaps, and total goal statistics."""
    if user_id is None:
        raise ValueError("user_id is required for profile_stats")
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
        (user_id, today_str),
    ).fetchall()
    total_rotes = len(rote_rows)
    if total_rotes > 0:
        logs_rows = execute(
            conn,
            "SELECT * FROM rote_logs WHERE user_id = %s AND log_date = %s AND completed = 1",
            (user_id, today_str),
        ).fetchall()
        completed_rotes = len(logs_rows)
        rote_rate = round(completed_rotes / total_rotes * 100)
    else:
        all_logs = execute(
            conn,
            "SELECT COUNT(*) as c FROM rote_logs WHERE user_id = %s AND completed = 1",
            (user_id,),
        ).fetchone()
        completed_rotes = int(all_logs["c"]) if all_logs else 0
        all_rotes_count = execute(
            conn,
            "SELECT COUNT(*) as c FROM rotes WHERE user_id = %s",
            (user_id,),
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
