"""Timeline history API endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Header, Cookie, HTTPException

from backend.db.connection import db
from backend.auth.session import current_user_id, user_created_at
from backend.sprint_engine import year_progress
from backend.services.goals import ensure_sprint_rollover
from backend.services.timeline import sprint_summary

router = APIRouter(tags=["timeline"])


@router.get("/api/timeline")
def timeline(year: int | None = None, authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """Timeline history endpoint: lists all past sprint summaries for the selected year."""
    progress = year_progress()
    with db() as conn:
        user_id = current_user_id(conn, authorization, opg_session)
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


@router.get("/api/timeline/{sprint_number}")
def timeline_sprint(sprint_number: int, year: int | None = None, authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """Retrieve detailed goal breakdown for a specific sprint in the timeline history."""
    progress = year_progress()
    if sprint_number < 1 or sprint_number > 100:
        raise HTTPException(status_code=404, detail="Sprint not found")
    with db() as conn:
        user_id = current_user_id(conn, authorization, opg_session)
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
