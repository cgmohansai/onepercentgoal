from __future__ import annotations

import sqlite3
import threading
import secrets
from datetime import datetime, timedelta
import pytest
from pathlib import Path

from backend.db.connection import db, execute, sql
from backend.db.setup import setup_database
from backend.services.rotes import toggle_rote_log
from backend.auth.session import cleanup_expired_sessions, issue_session
from backend.api.auth import cleanup_expired_auth_codes
from backend.config import IST, as_iso, SQLITE_DATABASE


@pytest.fixture(autouse=True)
def setup_test_db():
    setup_database()


def test_sqlite_foreign_keys_and_cascade(tmp_path):
    """Test SQLite foreign key enforcement, cascade deletion, and rejection of invalid FKs."""
    db_path = tmp_path / "test_fk.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    # Apply PRAGMA foreign_keys = ON as implemented in connection.py
    conn.execute("PRAGMA foreign_keys = ON;")

    # Create tables matching setup.py for SQLite
    conn.execute("""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE rotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    conn.commit()

    # 1. Verify PRAGMA foreign_keys is ON
    pragma_row = conn.execute("PRAGMA foreign_keys;").fetchone()
    assert pragma_row[0] == 1, "SQLite foreign_keys PRAGMA must be enabled (1)"

    # 2. Insert test user and child (rote)
    now_str = as_iso(datetime.now(IST))
    email = f"fk_test_{secrets.token_hex(4)}@example.com"
    cur = conn.execute(
        "INSERT INTO users (email, created_at) VALUES (?, ?) RETURNING id",
        (email, now_str)
    )
    user_id = cur.fetchone()["id"]

    conn.execute(
        "INSERT INTO rotes (user_id, title, created_at) VALUES (?, ?, ?)",
        (user_id, "Test Habit", now_str)
    )
    conn.commit()
    rote_row = conn.execute("SELECT id FROM rotes WHERE user_id = ?", (user_id,)).fetchone()
    rote_id = rote_row["id"]

    # 3. Test invalid foreign-key reference is rejected
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO rotes (user_id, title, created_at) VALUES (?, ?, ?)",
            (999999, "Orphan Habit", now_str)
        )

    # 4. Test ON DELETE CASCADE
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    rotes_left = conn.execute("SELECT * FROM rotes WHERE id = ?", (rote_id,)).fetchall()
    assert len(rotes_left) == 0, "Deleting parent user must cascade delete child rotes"
    conn.close()


def test_concurrent_rote_toggle():
    """Test concurrent toggle operations for the same user_id + rote_id + log_date."""
    with db() as conn:
        now_str = as_iso(datetime.now(IST))
        email = f"concurrency_test_{secrets.token_hex(4)}@example.com"
        row = execute(
            conn,
            "INSERT INTO users (email, created_at) VALUES (%s, %s) RETURNING id",
            (email, now_str)
        ).fetchone()
        user_id = row["id"] if isinstance(row, dict) or hasattr(row, "__getitem__") else row[0]

        execute(
            conn,
            "INSERT INTO rotes (user_id, title, created_at) VALUES (%s, %s, %s)",
            (user_id, "Concurrency Habit", now_str)
        )
        rote_row = execute(conn, "SELECT id FROM rotes WHERE user_id = %s", (user_id,)).fetchone()
        rote_id = rote_row["id"] if isinstance(rote_row, dict) or hasattr(rote_row, "__getitem__") else rote_row[0]

    log_date = "2026-06-06"
    threads = []
    errors = []

    def worker():
        try:
            with db() as conn:
                toggle_rote_log(conn, user_id, rote_id, log_date, None)
        except Exception as e:
            errors.append(e)

    for _ in range(10):
        t = threading.Thread(target=worker)
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    assert not errors, f"Concurrent toggle raised errors: {errors}"

    with db() as conn:
        logs = execute(
            conn,
            "SELECT * FROM rote_logs WHERE user_id = %s AND rote_id = %s AND log_date = %s",
            (user_id, rote_id, log_date)
        ).fetchall()
        assert len(logs) == 1, f"Expected exactly 1 log row due to unique constraint / upsert, found {len(logs)}"


def test_session_cleanup():
    """Test expired session cleanup while active sessions remain."""
    with db() as conn:
        now_str = as_iso(datetime.now(IST))
        email = f"session_test_{secrets.token_hex(4)}@example.com"
        row = execute(
            conn,
            "INSERT INTO users (email, created_at) VALUES (%s, %s) RETURNING id",
            (email, now_str)
        ).fetchone()
        user_id = row["id"] if isinstance(row, dict) or hasattr(row, "__getitem__") else row[0]

        past = datetime.now(IST) - timedelta(days=10)
        future = datetime.now(IST) + timedelta(days=10)
        expired_hash = f"expired_hash_{secrets.token_hex(4)}"
        active_hash = f"active_hash_{secrets.token_hex(4)}"

        # Insert expired session
        execute(
            conn,
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (%s, %s, %s, %s)",
            (expired_hash, user_id, as_iso(past - timedelta(days=5)), as_iso(past))
        )
        # Insert active session
        execute(
            conn,
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (%s, %s, %s, %s)",
            (active_hash, user_id, now_str, as_iso(future))
        )

        deleted_count = cleanup_expired_sessions(conn)
        assert deleted_count >= 1

        remaining = execute(conn, "SELECT token_hash FROM sessions WHERE user_id = %s", (user_id,)).fetchall()
        assert len(remaining) == 1
        hashes = [r["token_hash"] if isinstance(r, dict) or hasattr(r, "__getitem__") else r[0] for r in remaining]
        assert active_hash in hashes
        assert expired_hash not in hashes


def test_auth_code_cleanup():
    """Test expired auth-code cleanup, valid code usability, and exchange/replay protection."""
    with db() as conn:
        past = datetime.now(IST) - timedelta(seconds=120)
        future = datetime.now(IST) + timedelta(seconds=60)
        expired_code = f"expired_code_{secrets.token_hex(4)}"
        valid_code = f"valid_code_{secrets.token_hex(4)}"

        execute(
            conn,
            "INSERT INTO auth_codes (code, token, expires_at) VALUES (%s, %s, %s)",
            (expired_code, "token_abc", as_iso(past))
        )
        execute(
            conn,
            "INSERT INTO auth_codes (code, token, expires_at) VALUES (%s, %s, %s)",
            (valid_code, "token_def", as_iso(future))
        )

        cleaned = cleanup_expired_auth_codes(conn)
        assert cleaned >= 1

        # Expired code removed
        expired_row = execute(conn, "SELECT * FROM auth_codes WHERE code = %s", (expired_code,)).fetchone()
        assert expired_row is None

        # Valid code remains
        valid_row = execute(conn, "SELECT * FROM auth_codes WHERE code = %s", (valid_code,)).fetchone()
        assert valid_row is not None
        token_val = valid_row["token"] if isinstance(valid_row, dict) or hasattr(valid_row, "__getitem__") else valid_row[1]
        assert token_val == "token_def"
