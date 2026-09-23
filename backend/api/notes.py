"""Private notes API endpoints. Account-only: requires auth, never exposed publicly."""
from __future__ import annotations

from fastapi import APIRouter, Header, Cookie, HTTPException, status

from backend.config import current_timestamp
from backend.db.connection import db, execute
from backend.auth.session import current_user_id
from backend.services.notes import NoteCreate, NoteUpdate, NoteLink, note_dict, jsonable_note

router = APIRouter(tags=["notes"])


def _assert_ownership(conn, user_id: int, goal_id: int | None, rote_id: int | None) -> None:
    if goal_id is not None:
        goal = execute(conn, "SELECT id FROM goals WHERE id = %s AND user_id = %s", (goal_id, user_id)).fetchone()
        if not goal:
            raise HTTPException(status_code=404, detail="Goal not found")
    if rote_id is not None:
        rote = execute(conn, "SELECT id FROM rotes WHERE id = %s AND user_id = %s", (rote_id, user_id)).fetchone()
        if not rote:
            raise HTTPException(status_code=404, detail="Rote not found")


def _normalize_links(raw_links) -> list[dict]:
    """Deduplicate link entries; each entry references one goal or one rote (or is dropped)."""
    seen = set()
    out = []
    for entry in raw_links or []:
        goal_id = entry.goal_id if hasattr(entry, "goal_id") else entry.get("goal_id")
        rote_id = entry.rote_id if hasattr(entry, "rote_id") else entry.get("rote_id")
        if goal_id is None and rote_id is None:
            continue
        key = (goal_id, rote_id)
        if key in seen:
            continue
        seen.add(key)
        out.append({"goal_id": goal_id, "rote_id": rote_id})
    return out


def _set_note_links(conn, user_id: int, note_id: int, links: list[dict]) -> None:
    execute(conn, "DELETE FROM note_links WHERE note_id = %s", (note_id,))
    now = current_timestamp()
    for link in links:
        _assert_ownership(conn, user_id, link["goal_id"], link["rote_id"])
        execute(
            conn,
            "INSERT INTO note_links (note_id, goal_id, rote_id, created_at) VALUES (%s, %s, %s, %s)",
            (note_id, link["goal_id"], link["rote_id"], now),
        )


def _attach_links(conn, notes: list[dict]) -> list[dict]:
    """Batch-load reference links (with titles) for a set of note dicts."""
    ids = [n["id"] for n in notes if n.get("id") is not None]
    by_note: dict = {nid: [] for nid in ids}
    if not ids:
        return notes
    placeholders = ", ".join(["%s"] * len(ids))
    rows = execute(
        conn,
        f"""
        SELECT nl.note_id, nl.goal_id, nl.rote_id, g.title AS goal_title, r.title AS rote_title
        FROM note_links nl
        LEFT JOIN goals g ON g.id = nl.goal_id
        LEFT JOIN rotes r ON r.id = nl.rote_id
        WHERE nl.note_id IN ({placeholders})
        ORDER BY nl.id
        """,
        tuple(ids),
    ).fetchall()
    for row in rows:
        d = dict(row)
        by_note.setdefault(d["note_id"], []).append({
            "goal_id": d.get("goal_id"),
            "rote_id": d.get("rote_id"),
            "goal_title": d.get("goal_title"),
            "rote_title": d.get("rote_title"),
        })
    for note in notes:
        note["links"] = by_note.get(note["id"], [])
    return notes


@router.get("/api/notes")
def list_notes(
    goal_id: int | None = None,
    rote_id: int | None = None,
    include_deleted: bool = False,
    authorization: str | None = Header(default=None),
    opg_session: str | None = Cookie(default=None),
):
    """List the signed-in user's notes, optionally filtered by goal or rote. Tombstones included on request for sync."""
    with db() as conn:
        user_id = current_user_id(conn, authorization, opg_session)
        query = "SELECT * FROM notes WHERE user_id = %s"
        params: list = [user_id]
        if not include_deleted:
            query += " AND deleted = 0"
        if goal_id is not None:
            query += " AND (goal_id = %s OR id IN (SELECT note_id FROM note_links WHERE goal_id = %s))"
            params.extend([goal_id, goal_id])
        elif rote_id is not None:
            query += " AND (rote_id = %s OR id IN (SELECT note_id FROM note_links WHERE rote_id = %s))"
            params.extend([rote_id, rote_id])
        query += " ORDER BY updated_at DESC, id DESC"
        rows = execute(conn, query, tuple(params)).fetchall()
        notes = _attach_links(conn, [note_dict(row) for row in rows])
    return notes


@router.post("/api/notes", status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreate, authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """Create a private note with an optional title, pin, and reference links. Idempotent per client_id."""
    with db() as conn:
        user_id = current_user_id(conn, authorization, opg_session)
        if payload.client_id:
            existing = execute(
                conn, "SELECT * FROM notes WHERE user_id = %s AND client_id = %s", (user_id, payload.client_id)
            ).fetchone()
            if existing:
                notes = _attach_links(conn, [note_dict(existing)])
                return notes[0]
        links = _normalize_links(payload.links)
        if payload.goal_id is not None or payload.rote_id is not None:
            links = _normalize_links([NoteLink(goal_id=payload.goal_id, rote_id=payload.rote_id)] + list(payload.links or []))
        primary_goal = next((l["goal_id"] for l in links if l["goal_id"] is not None), None)
        primary_rote = next((l["rote_id"] for l in links if l["rote_id"] is not None), None)
        now = current_timestamp()
        row = execute(
            conn,
            """
            INSERT INTO notes (user_id, goal_id, rote_id, title, body, pinned, version, deleted, created_at, updated_at, client_id)
            VALUES (%s, %s, %s, %s, %s, %s, 1, 0, %s, %s, %s)
            RETURNING *
            """,
            (user_id, primary_goal, primary_rote, payload.title.strip(), payload.body.strip(), int(bool(payload.pinned)), now, now, payload.client_id),
        ).fetchone()
        note = note_dict(row)
        _set_note_links(conn, user_id, note["id"], links)
        notes = _attach_links(conn, [note])
    return notes[0]


@router.patch("/api/notes/{note_id}")
def update_note(note_id: int, payload: NoteUpdate, authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """Update a note. Pass base_version for optimistic concurrency; 409 returns the server copy on conflict.

    Simultaneous text edits are never silently merged: the conflicting write is
    rejected so the client can preserve both versions or prompt the user.
    """
    with db() as conn:
        user_id = current_user_id(conn, authorization, opg_session)
        existing = execute(conn, "SELECT * FROM notes WHERE id = %s AND user_id = %s", (note_id, user_id)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Note not found")
        current = note_dict(existing)
        if payload.base_version is not None and int(payload.base_version) != current["version"]:
            existing_links = _attach_links(conn, [current])
            raise HTTPException(status_code=409, detail={"message": "Note changed elsewhere", "server": jsonable_note(existing, links=existing_links[0]["links"])})
        body = payload.body.strip() if payload.body is not None else current["body"]
        title = payload.title.strip() if payload.title is not None else current.get("title", "")
        pinned = int(bool(payload.pinned)) if payload.pinned is not None else int(bool(current.get("pinned")))
        fields_set = payload.model_fields_set
        if payload.links is not None:
            links = _normalize_links(payload.links)
        elif "goal_id" in fields_set or "rote_id" in fields_set:
            links = [{"goal_id": payload.goal_id, "rote_id": payload.rote_id}]
            links = _normalize_links(links)
        else:
            links = None
        if links is not None:
            primary_goal = next((l["goal_id"] for l in links if l["goal_id"] is not None), None)
            primary_rote = next((l["rote_id"] for l in links if l["rote_id"] is not None), None)
        else:
            primary_goal = current.get("goal_id")
            primary_rote = current.get("rote_id")
        row = execute(
            conn,
            "UPDATE notes SET body = %s, title = %s, pinned = %s, goal_id = %s, rote_id = %s, version = version + 1, updated_at = %s WHERE id = %s RETURNING *",
            (body, title, pinned, primary_goal, primary_rote, current_timestamp(), note_id),
        ).fetchone()
        note = note_dict(row)
        if links is not None:
            _set_note_links(conn, user_id, note["id"], links)
        notes = _attach_links(conn, [note])
    return notes[0]


@router.delete("/api/notes/{note_id}", status_code=status.HTTP_200_OK)
def delete_note(note_id: int, authorization: str | None = Header(default=None), opg_session: str | None = Cookie(default=None)):
    """Soft-delete a note (tombstone) so deletions propagate across devices."""
    with db() as conn:
        user_id = current_user_id(conn, authorization, opg_session)
        existing = execute(conn, "SELECT id FROM notes WHERE id = %s AND user_id = %s", (note_id, user_id)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Note not found")
        row = execute(
            conn,
            "UPDATE notes SET deleted = 1, version = version + 1, updated_at = %s WHERE id = %s RETURNING *",
            (current_timestamp(), note_id),
        ).fetchone()
        notes = _attach_links(conn, [note_dict(row)])
    return notes[0]
