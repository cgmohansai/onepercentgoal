"""Rote habit tracking API endpoints."""
from __future__ import annotations

from datetime import datetime
from fastapi import APIRouter, Header, Cookie, HTTPException, status

from backend.config import IST, current_timestamp
from backend.db.connection import db, execute, row_dict
from backend.auth.session import current_user_id, user_created_at
from backend.services.rotes import RoteCreate, RoteToggle

router = APIRouter(tags=["rotes"])


@router.get("/api/rotes")
def get_rotes(date: str | None = None, authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """Retrieve daily rote habits and completion logs for a given date."""
    target_date = date or datetime.now(IST).strftime("%Y-%m-%d")
    with db() as conn:
        user_id = current_user_id(conn, authorization, opg_session)
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


@router.post("/api/rotes")
def create_rote(payload: RoteCreate, authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """Create a new daily habit / rote routine."""
    with db() as conn:
        user_id = current_user_id(conn, authorization, opg_session)
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


@router.post("/api/rotes/{rote_id}/toggle")
def toggle_rote(rote_id: int, payload: RoteToggle, authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """Toggle daily completion status of a rote habit for a specific date."""
    with db() as conn:
        user_id = current_user_id(conn, authorization, opg_session)
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


@router.delete("/api/rotes/{rote_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rote(rote_id: int, authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """Delete a rote habit and its associated completion logs."""
    with db() as conn:
        user_id = current_user_id(conn, authorization, opg_session)
        rote = execute(conn, "SELECT * FROM rotes WHERE id = %s AND user_id = %s", (rote_id, user_id)).fetchone()
        if not rote:
            raise HTTPException(status_code=404, detail="Rote not found")
        execute(conn, "DELETE FROM rote_logs WHERE rote_id = %s AND user_id = %s", (rote_id, user_id))
        execute(conn, "DELETE FROM rotes WHERE id = %s AND user_id = %s", (rote_id, user_id))
