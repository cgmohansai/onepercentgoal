"""Rote schemas for daily habit routines."""
from __future__ import annotations

from pydantic import BaseModel, Field


class RoteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    description: str | None = Field(default="", max_length=255)
    date: str | None = None


class RoteToggle(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    completed: bool | None = None
