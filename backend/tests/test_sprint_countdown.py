"""Regression tests: sprint engine timestamps that the goal countdown
notification depends on (backend/sprint_engine.py is authoritative).

Covers: monotonic boundaries, N=100 == year end, current sprint window
contains now, and year_progress() sprint agreement with boundaries.
"""
from datetime import datetime

from backend.sprint_engine import (
    IST,
    days_in_year,
    is_leap_year,
    sprint_boundary_timestamp,
    sprint_end_datetime,
    sprint_window,
    year_progress,
    year_start_datetime,
)


def test_boundaries_anchor_at_ist_midnight():
    start = year_start_datetime(2026)
    assert (start.year, start.month, start.day, start.hour, start.tzinfo) == (2026, 1, 1, 0, IST)
    assert days_in_year(2026) == 365
    assert days_in_year(2024) == 366
    assert is_leap_year(2024) and not is_leap_year(2026)


def test_boundaries_strictly_increase_and_span_year():
    prev = float("-inf")
    for n in range(0, 101):
        b = sprint_boundary_timestamp(2026, n)
        assert b > prev, f"boundary {n} must increase"
        prev = b
    assert sprint_boundary_timestamp(2026, 100) == year_start_datetime(2027).timestamp()
    assert sprint_boundary_timestamp(2026, 0) == year_start_datetime(2026).timestamp()


def test_year_progress_sprint_contains_now():
    # Fixed instant: 2026-09-24 12:00 UTC (deterministic).
    when = datetime(2026, 9, 24, 12, 0, 0, tzinfo=IST).astimezone(IST)
    progress = year_progress(when)
    s = progress["sprint_number"]
    assert 1 <= s <= 100
    start_ts = sprint_boundary_timestamp(progress["year"], s - 1)
    end_ts = sprint_boundary_timestamp(progress["year"], s)
    assert start_ts <= when.timestamp() < end_ts
    assert end_ts > when.timestamp(), "current sprint end must be in the future"


def test_sprint_window_matches_boundaries():
    start_iso, end_iso = sprint_window(2026, 73)
    assert datetime.fromisoformat(start_iso).timestamp() == sprint_boundary_timestamp(2026, 72)
    assert datetime.fromisoformat(end_iso).timestamp() == sprint_boundary_timestamp(2026, 73)
    assert datetime.fromisoformat(start_iso) < datetime.fromisoformat(end_iso)
