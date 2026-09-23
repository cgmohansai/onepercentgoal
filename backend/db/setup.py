"""Database initialization and schema migration utilities."""
from __future__ import annotations

from backend.config import USE_POSTGRES
from backend.db.connection import db, execute, ensure_column
from backend.db.migrations import run_migrations


def setup_database():
    """Initialize database schemas, tables, and indices for users, sessions, goals, rotes, and logs."""
    with db() as conn:
        if USE_POSTGRES:
            execute(conn, """
                CREATE TABLE IF NOT EXISTS users (
                    id BIGSERIAL PRIMARY KEY, name TEXT, email TEXT NOT NULL UNIQUE,
                    username TEXT, display_name TEXT, auth_provider TEXT NOT NULL DEFAULT 'google',
                    google_sub TEXT UNIQUE,
                    created_at TIMESTAMPTZ NOT NULL, last_login_at TIMESTAMPTZ, profile_photo TEXT, bio TEXT
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS auth_codes (
                    code TEXT PRIMARY KEY,
                    token TEXT NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS goals (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL,
                    target INTEGER NOT NULL DEFAULT 1, progress INTEGER NOT NULL DEFAULT 0,
                    completed INTEGER NOT NULL DEFAULT 0, sprint_year INTEGER NOT NULL,
                    sprint_number INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL,
                    progress_percent INTEGER NOT NULL DEFAULT 0,
                    completion_note TEXT NOT NULL DEFAULT '',
                    rolled_from_goal_id BIGINT, source_goal_id BIGINT, version INTEGER NOT NULL DEFAULT 1
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS sprint_email_reminders (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    sprint_year INTEGER NOT NULL,
                    sprint_number INTEGER NOT NULL,
                    reminder_type TEXT NOT NULL,
                    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (user_id, sprint_year, sprint_number, reminder_type)
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS rotes (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ NOT NULL
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS rote_logs (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    rote_id BIGINT NOT NULL REFERENCES rotes(id) ON DELETE CASCADE,
                    log_date TEXT NOT NULL,
                    completed INTEGER NOT NULL DEFAULT 0,
                    completed_at TIMESTAMPTZ,
                    passed INTEGER NOT NULL DEFAULT 0,
                    UNIQUE (user_id, rote_id, log_date)
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS notes (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    goal_id BIGINT,
                    rote_id BIGINT,
                    title TEXT NOT NULL DEFAULT '',
                    body TEXT NOT NULL DEFAULT '',
                    pinned INTEGER NOT NULL DEFAULT 0,
                    version INTEGER NOT NULL DEFAULT 1,
                    deleted INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL,
                    client_id TEXT
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS note_links (
                    id BIGSERIAL PRIMARY KEY,
                    note_id BIGINT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                    goal_id BIGINT,
                    rote_id BIGINT,
                    created_at TIMESTAMPTZ NOT NULL
                )""")
        else:
            execute(conn, """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT NOT NULL UNIQUE,
                    username TEXT, display_name TEXT, auth_provider TEXT NOT NULL DEFAULT 'google',
                    google_sub TEXT UNIQUE,
                    created_at TEXT NOT NULL, last_login_at TEXT, profile_photo TEXT, bio TEXT
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS auth_codes (
                    code TEXT PRIMARY KEY,
                    token TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS goals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL, title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL,
                    target INTEGER NOT NULL DEFAULT 1, progress INTEGER NOT NULL DEFAULT 0,
                    completed INTEGER NOT NULL DEFAULT 0, sprint_year INTEGER NOT NULL,
                    sprint_number INTEGER NOT NULL, created_at TEXT NOT NULL,
                    progress_percent INTEGER NOT NULL DEFAULT 0,
                    completion_note TEXT NOT NULL DEFAULT '',
                    rolled_from_goal_id INTEGER, source_goal_id INTEGER, version INTEGER NOT NULL DEFAULT 1,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS sprint_email_reminders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    sprint_year INTEGER NOT NULL,
                    sprint_number INTEGER NOT NULL,
                    reminder_type TEXT NOT NULL,
                    sent_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                    UNIQUE (user_id, sprint_year, sprint_number, reminder_type)
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS rotes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS rote_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    rote_id INTEGER NOT NULL,
                    log_date TEXT NOT NULL,
                    completed INTEGER NOT NULL DEFAULT 0,
                    completed_at TEXT,
                    passed INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY(rote_id) REFERENCES rotes(id) ON DELETE CASCADE,
                    UNIQUE (user_id, rote_id, log_date)
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS notes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    goal_id INTEGER,
                    rote_id INTEGER,
                    title TEXT NOT NULL DEFAULT '',
                    body TEXT NOT NULL DEFAULT '',
                    pinned INTEGER NOT NULL DEFAULT 0,
                    version INTEGER NOT NULL DEFAULT 1,
                    deleted INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    client_id TEXT,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                )""")
            execute(conn, """
                CREATE TABLE IF NOT EXISTS note_links (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    note_id INTEGER NOT NULL,
                    goal_id INTEGER,
                    rote_id INTEGER,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
                )""")

        alter_columns = [
            ("users", "username", "ALTER TABLE users ADD COLUMN username TEXT"),
            ("users", "display_name", "ALTER TABLE users ADD COLUMN display_name TEXT"),
            ("users", "auth_provider", "ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'google'"),
            ("users", "google_sub", "ALTER TABLE users ADD COLUMN google_sub TEXT"),
            ("users", "last_login_at", "ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ" if USE_POSTGRES else "ALTER TABLE users ADD COLUMN last_login_at TEXT"),
            ("users", "profile_photo", "ALTER TABLE users ADD COLUMN profile_photo TEXT"),
            ("users", "bio", "ALTER TABLE users ADD COLUMN bio TEXT"),
            ("goals", "progress_percent", "ALTER TABLE goals ADD COLUMN progress_percent INTEGER NOT NULL DEFAULT 0"),
            ("goals", "completion_note", "ALTER TABLE goals ADD COLUMN completion_note TEXT NOT NULL DEFAULT ''"),
            ("goals", "rolled_from_goal_id", "ALTER TABLE goals ADD COLUMN rolled_from_goal_id BIGINT" if USE_POSTGRES else "ALTER TABLE goals ADD COLUMN rolled_from_goal_id INTEGER"),
            ("goals", "source_goal_id", "ALTER TABLE goals ADD COLUMN source_goal_id BIGINT" if USE_POSTGRES else "ALTER TABLE goals ADD COLUMN source_goal_id INTEGER"),
            ("rotes", "rote_date", "ALTER TABLE rotes ADD COLUMN rote_date TEXT NOT NULL DEFAULT ''"),
            ("rote_logs", "passed", "ALTER TABLE rote_logs ADD COLUMN passed INTEGER NOT NULL DEFAULT 0"),
            ("goals", "version", "ALTER TABLE goals ADD COLUMN version INTEGER NOT NULL DEFAULT 1"),
            ("notes", "title", "ALTER TABLE notes ADD COLUMN title TEXT NOT NULL DEFAULT ''"),
            ("notes", "pinned", "ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"),
            ("notes", "client_id", "ALTER TABLE notes ADD COLUMN client_id TEXT"),
        ]
        for table, column, ddl in alter_columns:
            ensure_column(conn, table, column, ddl)

        execute(conn, "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)")
        execute(conn, "DROP INDEX IF EXISTS idx_users_google_sub")

        # Deduplicate historical concurrent rollover duplicates if any exist
        execute(conn, """
            DELETE FROM goals
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM goals
                GROUP BY user_id, sprint_year, sprint_number, COALESCE(source_goal_id, id)
            )
        """)
        execute(conn, "CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_rolled_from_unique ON goals(rolled_from_goal_id)")
        execute(conn, "CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_user_sprint_source ON goals(user_id, sprint_year, sprint_number, source_goal_id)")
        execute(conn, "CREATE INDEX IF NOT EXISTS idx_rotes_user_id ON rotes(user_id)")
        execute(conn, "CREATE INDEX IF NOT EXISTS idx_rote_logs_user_date ON rote_logs(user_id, log_date)")
        execute(conn, "CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes(user_id, updated_at)")
        execute(conn, "CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON sessions(user_id, expires_at)")
        execute(conn, "CREATE INDEX IF NOT EXISTS idx_auth_codes_expires_at ON auth_codes(expires_at)")

        # Run dedicated historical migrations
        run_migrations(conn)
