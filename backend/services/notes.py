"""Private notes schemas and helpers. Notes are account-only and never public."""
from __future__ import annotations

from pydantic import BaseModel, Field


class NoteLink(BaseModel):
    goal_id: int | str | None = None
    rote_id: int | str | None = None


class NoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)
    title: str = Field(default="", max_length=140)
    goal_id: int | str | None = None
    rote_id: int | str | None = None
    links: list[NoteLink] = Field(default_factory=list)
    pinned: bool = False
    client_id: str | None = Field(default=None, max_length=64)


class NoteUpdate(BaseModel):
    body: str | None = Field(default=None, min_length=1, max_length=5000)
    title: str | None = Field(default=None, max_length=140)
    pinned: bool | None = None
    goal_id: int | str | None = None
    rote_id: int | str | None = None
    links: list[NoteLink] | None = None
    base_version: int | None = None


def coerce_id(value) -> int | None:
    """Integer ids persist server-side; temp/unsynced string ids resolve later client-side."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def note_dict(row) -> dict:
    """Format note database row into API response dictionary."""
    data = dict(row) if row else {}
    data["title"] = data.get("title") or ""
    data["goal_id"] = data.get("goal_id")
    data["rote_id"] = data.get("rote_id")
    data["pinned"] = bool(data.get("pinned") or 0)
    data["version"] = int(data.get("version") or 1)
    data["deleted"] = bool(data.get("deleted") or 0)
    data["client_id"] = data.get("client_id")
    data["links"] = []
    return data


def jsonable_note(row, links=None) -> dict:
    """Note dict safe to embed in error payloads (datetimes -> ISO strings)."""
    from datetime import datetime, date

    data = note_dict(row)
    for key, value in list(data.items()):
        if isinstance(value, (datetime, date)):
            data[key] = value.isoformat()
    if links is not None:
        data["links"] = links
    return data
