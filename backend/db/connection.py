"""Database connection and low-level query utilities."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from backend.config import DATABASE_URL, USE_POSTGRES, SQLITE_DATABASE


def sql(query: str) -> str:
    """Convert PostgreSQL %s placeholders to ? placeholders when running under SQLite."""
    return query if USE_POSTGRES else query.replace("%s", "?")


@contextmanager
def db():
    """Context manager supplying database connection (PostgreSQL in production, SQLite locally)."""
    if USE_POSTGRES:
        import psycopg
        from psycopg.rows import dict_row
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
    else:
        conn = sqlite3.connect(SQLITE_DATABASE)
        conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def execute(conn, query: str, params=()):
    """Helper to execute SQL queries with normalized placeholders."""
    return conn.execute(sql(query), params)


def row_dict(row) -> dict | None:
    """Convert database row object to dict."""
    return dict(row) if row else None


def ensure_column(conn, table: str, column: str, ddl: str) -> None:
    """Idempotently add database columns if missing."""
    if USE_POSTGRES:
        exists = execute(
            conn,
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_name = %s AND column_name = %s
            """,
            (table, column),
        ).fetchone()
    else:
        exists = any(row[1] == column for row in execute(conn, f"PRAGMA table_info({table})").fetchall())
    if not exists:
        execute(conn, ddl)
