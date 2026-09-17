"""Sprint timeline summary calculation services."""
from __future__ import annotations

from backend.db.connection import execute
from backend.services.goals import goal_dict
from backend.sprint_engine import sprint_window


def sprint_summary(conn, year: int, sprint_number: int, user_id: int) -> dict:
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
