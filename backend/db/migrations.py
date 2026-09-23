"""Dedicated database migration runner for historical schema updates and retirements."""
from __future__ import annotations

from backend.config import USE_POSTGRES
from backend.db.connection import execute


def run_migrations(conn) -> None:
    """Run pending one-time schema migrations idempotently."""
    # Ensure migration tracking table exists
    if USE_POSTGRES:
        execute(conn, """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                migration_name TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
    else:
        execute(conn, """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                migration_name TEXT PRIMARY KEY,
                applied_at TEXT NOT NULL
            )
        """)

    # Check if retire_legacy_auth migration was applied
    mig = execute(
        conn,
        "SELECT 1 FROM schema_migrations WHERE migration_name = %s",
        ("retire_legacy_auth_001",)
    ).fetchone()

    if not mig:
        # Check if legacy objects exist before dropping to avoid unnecessary destructive DDL
        has_oauth_states = False
        has_password_cols = False

        if USE_POSTGRES:
            res_tbl = execute(
                conn,
                "SELECT 1 FROM information_schema.tables WHERE table_name = 'oauth_states'"
            ).fetchone()
            has_oauth_states = bool(res_tbl)

            res_col = execute(
                conn,
                "SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('password_hash', 'password_salt')"
            ).fetchone()
            has_password_cols = bool(res_col)
        else:
            res_tbl = execute(
                conn,
                "SELECT name FROM sqlite_master WHERE type='table' AND name='oauth_states'"
            ).fetchone()
            has_oauth_states = bool(res_tbl)

            cols = [row[1] for row in execute(conn, "PRAGMA table_info(users)").fetchall()]
            has_password_cols = "password_hash" in cols or "password_salt" in cols

        # Execute retirement DDL only if legacy objects actually exist
        if has_oauth_states:
            execute(conn, "DROP TABLE IF EXISTS oauth_states;")
        if has_password_cols:
            if USE_POSTGRES:
                execute(conn, "ALTER TABLE users DROP COLUMN IF EXISTS password_hash;")
                execute(conn, "ALTER TABLE users DROP COLUMN IF EXISTS password_salt;")
            else:
                # SQLite has no DROP COLUMN IF EXISTS: PRAGMA-check each column first.
                sqlite_cols = [row[1] for row in execute(conn, "PRAGMA table_info(users)").fetchall()]
                if "password_hash" in sqlite_cols:
                    execute(conn, "ALTER TABLE users DROP COLUMN password_hash;")
                if "password_salt" in sqlite_cols:
                    execute(conn, "ALTER TABLE users DROP COLUMN password_salt;")

        # Record migration as applied
        from backend.config import current_timestamp
        timestamp = current_timestamp()
        execute(
            conn,
            "INSERT INTO schema_migrations (migration_name, applied_at) VALUES (%s, %s) ON CONFLICT (migration_name) DO NOTHING",
            ("retire_legacy_auth_001", timestamp)
        )
