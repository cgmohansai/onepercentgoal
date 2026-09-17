"""OnePercentGoal — Centralized Compounding Sprint Engine.

Single source of truth for:
- 100 Sprints / Year (each ~3.6 days, representing 1% of the year)
- IST UTC+5:30 anchor
- Sprint boundary calculation & timestamp quantization (half-hour blocks)
- Active sprint detection & progress tracking
- Leap-year awareness
- Previous / next sprint navigation
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

# Timezone Definition: India Standard Time (UTC+5:30)
IST = timezone(timedelta(hours=5, minutes=30))
TOTAL_SPRINTS_PER_YEAR = 100
HALF_HOUR_SECONDS = 1800.0


def is_leap_year(year: int) -> bool:
    """Return True if year is a leap year."""
    return (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0))


def days_in_year(year: int) -> int:
    """Return total number of days in the given year (366 for leap years, 365 otherwise)."""
    return 366 if is_leap_year(year) else 365


def year_start_datetime(year: int) -> datetime:
    """Return midnight IST at the start of the year (Jan 1 00:00:00 IST)."""
    return datetime(year, 1, 1, 0, 0, 0, tzinfo=IST)


def year_end_datetime(year: int) -> datetime:
    """Return midnight IST at the end of the year (Jan 1 00:00:00 IST of year+1)."""
    return datetime(year + 1, 1, 1, 0, 0, 0, tzinfo=IST)


def sprint_boundary_timestamp(year: int, N: int) -> float:
    """Calculate exact unix timestamp boundary for the Nth sprint of a year.
    
    100 sprints per year quantized to 30-minute blocks.
    N=0: start of year (Jan 1 00:00:00 IST)
    N=100: end of year (Jan 1 00:00:00 IST of year+1)
    """
    if N <= 0:
        return year_start_datetime(year).timestamp()
    if N >= TOTAL_SPRINTS_PER_YEAR:
        return year_end_datetime(year).timestamp()

    start = year_start_datetime(year)
    total_days = days_in_year(year)
    total_half_hours = total_days * 48
    half_hours = int(math.floor(N * (total_half_hours / 100.0) + 0.5))
    return start.timestamp() + half_hours * HALF_HOUR_SECONDS


def sprint_end_datetime(year: int, sprint_number: int) -> datetime:
    """Return timezone-aware IST datetime for the end of a sprint."""
    end_ts = sprint_boundary_timestamp(year, sprint_number)
    return datetime.fromtimestamp(end_ts, tz=IST)


def sprint_window(year: int, sprint_number: int) -> tuple[str, str]:
    """Return start and end ISO-8601 strings in IST for a given sprint number."""
    start_ts = sprint_boundary_timestamp(year, sprint_number - 1)
    end_ts = sprint_boundary_timestamp(year, sprint_number)
    return (
        datetime.fromtimestamp(start_ts, tz=IST).isoformat(),
        datetime.fromtimestamp(end_ts, tz=IST).isoformat(),
    )


def year_progress(when: datetime | None = None) -> dict:
    """Calculate year completion percentage, day of year, and active sprint cycle (1 to 100)."""
    now = when.astimezone(IST) if when and when.tzinfo else (when or datetime.now(IST))
    start = year_start_datetime(now.year)
    end = year_end_datetime(now.year)
    total_seconds = (end - start).total_seconds()
    elapsed = max(0.0, (now - start).total_seconds())
    percentage = min(100.0, max(0.0, elapsed / total_seconds * 100))

    sprint = 100
    for s in range(1, TOTAL_SPRINTS_PER_YEAR + 1):
        if now.timestamp() < sprint_boundary_timestamp(now.year, s):
            sprint = s
            break

    sprint_start_ts = sprint_boundary_timestamp(now.year, sprint - 1)
    sprint_end_ts = sprint_boundary_timestamp(now.year, sprint)

    return {
        "year": now.year,
        "percentage": round(percentage, 2),
        "day_of_year": (now - start).days + 1,
        "days_in_year": round(total_seconds / 86400),
        "sprint_number": sprint,
        "sprint_start": datetime.fromtimestamp(sprint_start_ts, tz=IST).isoformat(),
        "sprint_end": datetime.fromtimestamp(sprint_end_ts, tz=IST).isoformat(),
    }


def previous_sprint(year: int, sprint_number: int) -> tuple[int, int] | None:
    """Calculate prior sprint number and year tuple."""
    if sprint_number > 1:
        return year, sprint_number - 1
    if year > 1:
        return year - 1, TOTAL_SPRINTS_PER_YEAR
    return None


def next_sprint(year: int, sprint_number: int) -> tuple[int, int]:
    """Calculate subsequent sprint number and year tuple."""
    if sprint_number < TOTAL_SPRINTS_PER_YEAR:
        return year, sprint_number + 1
    return year + 1, 1
