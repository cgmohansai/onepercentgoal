from __future__ import annotations

import pytest
import secrets
from datetime import datetime
from backend.db.connection import db, execute
from backend.db.setup import setup_database
from backend.services.profile import profile_stats
from backend.config import IST, as_iso


@pytest.fixture(autouse=True)
def setup_test_db():
    setup_database()


def test_profile_stats_zero_data():
    """Test profile_stats for a user with zero goals and rotes."""
    with db() as conn:
        now_str = as_iso(datetime.now(IST))
        email = f"profile_zero_{secrets.token_hex(4)}@example.com"
        row = execute(
            conn,
            "INSERT INTO users (email, created_at) VALUES (%s, %s) RETURNING id",
            (email, now_str)
        ).fetchone()
        user_id = row["id"] if isinstance(row, dict) or hasattr(row, "__getitem__") else row[0]

        stats_res = profile_stats(conn, user_id=user_id)

        assert "user" in stats_res
        assert "year" in stats_res
        assert "selected_year" in stats_res
        assert "stats" in stats_res
        assert "heatmap" in stats_res

        stats = stats_res["stats"]
        assert stats["goals_completed"] == 0
        assert stats["total_goals"] == 0
        assert stats["completion_rate"] == 0
        assert stats["rote_completed"] == 0
        assert stats["total_rotes"] == 0
        assert stats["rote_rate"] == 0
        assert stats["current_streak"] == 0
        assert stats["longest_streak"] == 0


def test_profile_stats_with_goals_and_rotes():
    """Test profile_stats counts match statistics semantics and user isolation."""
    with db() as conn:
        now_str = as_iso(datetime.now(IST))
        # User 1
        email1 = f"profile_user1_{secrets.token_hex(4)}@example.com"
        r1 = execute(
            conn,
            "INSERT INTO users (email, created_at) VALUES (%s, %s) RETURNING id",
            (email1, now_str)
        ).fetchone()
        u1_id = r1["id"] if isinstance(r1, dict) or hasattr(r1, "__getitem__") else r1[0]

        # User 2 (for isolation check)
        email2 = f"profile_user2_{secrets.token_hex(4)}@example.com"
        r2 = execute(
            conn,
            "INSERT INTO users (email, created_at) VALUES (%s, %s) RETURNING id",
            (email2, now_str)
        ).fetchone()
        u2_id = r2["id"] if isinstance(r2, dict) or hasattr(r2, "__getitem__") else r2[0]

        # Insert goals for User 1
        execute(
            conn,
            "INSERT INTO goals (user_id, title, priority, target, progress, completed, sprint_year, sprint_number, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (u1_id, "Goal 1", "medium", 1, 1, 1, 2026, 1, now_str)
        )
        execute(
            conn,
            "INSERT INTO goals (user_id, title, priority, target, progress, completed, sprint_year, sprint_number, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (u1_id, "Goal 2", "medium", 1, 0, 0, 2026, 1, now_str)
        )

        # Insert rotes for User 1
        execute(
            conn,
            "INSERT INTO rotes (user_id, title, created_at) VALUES (%s, %s, %s)",
            (u1_id, "Rote 1", now_str)
        )

        stats1 = profile_stats(conn, user_id=u1_id)
        stats2 = profile_stats(conn, user_id=u2_id)

        # User 1 stats
        assert stats1["stats"]["total_goals"] == 2
        assert stats1["stats"]["goals_completed"] == 1
        assert stats1["stats"]["completion_rate"] == 50
        assert stats1["stats"]["total_rotes"] == 1

        # User 2 stats (isolation)
        assert stats2["stats"]["total_goals"] == 0
        assert stats2["stats"]["goals_completed"] == 0
        assert stats2["stats"]["total_rotes"] == 0
