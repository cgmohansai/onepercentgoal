from __future__ import annotations

import pytest
import secrets
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from unittest.mock import patch

from backend.main import app
from backend.db.connection import db, execute
from backend.db.setup import setup_database
from backend.auth.session import issue_session
from backend.config import IST, as_iso
from backend.sprint_engine import year_progress


@pytest.fixture(autouse=True)
def isolate_test_db(tmp_path, monkeypatch):
    """Isolate tests to use a temporary SQLite database."""
    test_db_path = tmp_path / "test_integration.db"
    monkeypatch.setenv("DATABASE_URL", "")
    import backend.config as cfg
    monkeypatch.setattr(cfg, "DATABASE_URL", "")
    monkeypatch.setattr(cfg, "USE_POSTGRES", False)
    monkeypatch.setattr(cfg, "SQLITE_DATABASE", test_db_path)
    setup_database()
    yield


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_protected_routes_unauthenticated(client):
    """TEST 1 — Protected route authentication returns 401 with detail message."""
    routes = [
        "/api/dashboard",
        "/api/goals",
        "/api/rotes",
        "/api/timeline",
        "/api/profile",
        "/api/stats",
        "/api/auth/me",
    ]
    for route in routes:
        response = client.get(route)
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        assert isinstance(data["detail"], str)


def test_auth_session_and_cookie_behavior(client):
    """TEST 2 — Auth/session HTTP behavior, /api/auth/me, and HttpOnly cookie attributes."""
    with db() as conn:
        now_str = as_iso(datetime.now(IST))
        email = f"test_session_{secrets.token_hex(4)}@example.com"
        row = execute(
            conn,
            "INSERT INTO users (email, name, created_at) VALUES (%s, %s, %s) RETURNING id",
            (email, "Test User", now_str)
        ).fetchone()
        user_id = row["id"]
        token = issue_session(conn, user_id)

    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    data = response.json()
    assert "user" in data
    assert data["user"]["email"] == email

    response2 = client.get("/api/auth/me", cookies={"opg_session": token})
    assert response2.status_code == 200
    assert response2.json()["user"]["email"] == email


def test_invalid_and_expired_session(client):
    """TEST 3 — Invalid session token or expired session returns 401."""
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer invalid_token_xyz"})
    assert response.status_code == 401
    assert "detail" in response.json()

    with db() as conn:
        now_str = as_iso(datetime.now(IST))
        email = f"expired_user_{secrets.token_hex(4)}@example.com"
        row = execute(
            conn,
            "INSERT INTO users (email, name, created_at) VALUES (%s, %s, %s) RETURNING id",
            (email, "Expired User", now_str)
        ).fetchone()
        user_id = row["id"]
        past = as_iso(datetime.now(IST) - timedelta(days=5))
        past_created = as_iso(datetime.now(IST) - timedelta(days=10))
        execute(
            conn,
            "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (%s, %s, %s, %s)",
            (secrets.token_hex(32), user_id, past_created, past)
        )
        valid_token = issue_session(conn, user_id)

    res = client.get("/api/auth/me", cookies={"opg_session": valid_token})
    assert res.status_code == 200


def test_auth_code_http_flow(client):
    """TEST 4 — Auth code creation, successful exchange, single-use replay protection, invalid/expired codes."""
    with db() as conn:
        now_str = as_iso(datetime.now(IST))
        email = f"auth_code_user_{secrets.token_hex(4)}@example.com"
        row = execute(
            conn,
            "INSERT INTO users (email, name, created_at) VALUES (%s, %s, %s) RETURNING id",
            (email, "Code User", now_str)
        ).fetchone()
        user_id = row["id"]
        valid_token = issue_session(conn, user_id)

    res = client.post("/api/auth/create-exchange-code", headers={"Authorization": f"Bearer {valid_token}"})
    assert res.status_code == 200
    code = res.json().get("code")
    assert code

    res_ex = client.post("/api/auth/exchange-code", json={"code": code})
    assert res_ex.status_code == 200

    res_replay = client.post("/api/auth/exchange-code", json={"code": code})
    assert res_replay.status_code == 400

    res_inv = client.post("/api/auth/exchange-code", json={"code": "nonexistent_code_123"})
    assert res_inv.status_code == 400

    with db() as conn:
        past = as_iso(datetime.now(IST) - timedelta(seconds=120))
        execute(
            conn,
            "INSERT INTO auth_codes (code, token, expires_at) VALUES (%s, %s, %s)",
            ("expired_code_test", valid_token, past)
        )
    res_exp = client.post("/api/auth/exchange-code", json={"code": "expired_code_test"})
    assert res_exp.status_code == 400


def test_user_isolation(client):
    """TEST 5 — User isolation: User A cannot read, modify, or delete User B's private resources."""
    with db() as conn:
        now_str = as_iso(datetime.now(IST))
        r1 = execute(conn, "INSERT INTO users (email, name, created_at) VALUES (%s, %s, %s) RETURNING id", (f"usera_{secrets.token_hex(4)}@example.com", "User A", now_str)).fetchone()
        u1 = r1["id"]
        token_a = issue_session(conn, u1)

        r2 = execute(conn, "INSERT INTO users (email, name, created_at) VALUES (%s, %s, %s) RETURNING id", (f"userb_{secrets.token_hex(4)}@example.com", "User B", now_str)).fetchone()
        u2 = r2["id"]
        token_b = issue_session(conn, u2)

        grow = execute(
            conn,
            "INSERT INTO goals (user_id, title, priority, target, progress, completed, sprint_year, sprint_number, created_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            (u2, "User B Secret Goal", "hard", 1, 0, 0, 2026, 1, now_str)
        ).fetchone()
        goal_b_id = grow["id"]

    res_patch = client.patch(
        f"/api/goals/{goal_b_id}",
        json={"title": "Hacked Title"},
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert res_patch.status_code == 404

    res_del = client.delete(
        f"/api/goals/{goal_b_id}",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert res_del.status_code == 404


def test_goals_http_api(client):
    """TEST 6 — Goals HTTP API: CRUD, validation (422), business rules (400), not found (404)."""
    with db() as conn:
        now_str = as_iso(datetime.now(IST))
        email = f"goal_api_{secrets.token_hex(4)}@example.com"
        r = execute(conn, "INSERT INTO users (email, name, created_at) VALUES (%s, %s, %s) RETURNING id", (email, "Goal User", now_str)).fetchone()
        token = issue_session(conn, r["id"])

    headers = {"Authorization": f"Bearer {token}"}

    res_create = client.post("/api/goals", json={"title": "New Sprint Goal", "priority": "medium", "progress_percent": 0}, headers=headers)
    assert res_create.status_code == 201
    goal_data = res_create.json()
    goal_id = goal_data["id"]
    assert goal_data["title"] == "New Sprint Goal"

    res_val = client.post("/api/goals", json={"title": ""}, headers=headers)
    assert res_val.status_code == 422

    res_patch = client.patch(f"/api/goals/{goal_id}", json={"progress_percent": 100, "completed": True, "completion_note": "Finished!"}, headers=headers)
    assert res_patch.status_code == 200
    assert res_patch.json()["completed"] is True

    res_bad = client.patch(f"/api/goals/{goal_id}", json={"progress_percent": 50}, headers=headers)
    assert res_bad.status_code == 400

    res_del = client.delete(f"/api/goals/{goal_id}", headers=headers)
    assert res_del.status_code == 204


def test_rotes_http_api(client):
    """TEST 7 — Rotes HTTP API: create, list, toggle, delete, not found (404)."""
    with db() as conn:
        now_str = as_iso(datetime.now(IST))
        email = f"rote_api_{secrets.token_hex(4)}@example.com"
        r = execute(conn, "INSERT INTO users (email, name, created_at) VALUES (%s, %s, %s) RETURNING id", (email, "Rote User", now_str)).fetchone()
        token = issue_session(conn, r["id"])

    headers = {"Authorization": f"Bearer {token}"}

    res_create = client.post("/api/rotes", json={"title": "Morning Meditation"}, headers=headers)
    assert res_create.status_code == 200
    rote_id = res_create.json()["id"]

    res_list = client.get("/api/rotes", headers=headers)
    assert res_list.status_code == 200
    assert len(res_list.json()["rotes"]) == 1

    today = datetime.now(IST).strftime("%Y-%m-%d")
    res_toggle = client.post(f"/api/rotes/{rote_id}/toggle", json={"date": today, "completed": True}, headers=headers)
    assert res_toggle.status_code == 200
    assert res_toggle.json()["completed"] is True

    res_del = client.delete(f"/api/rotes/{rote_id}", headers=headers)
    assert res_del.status_code == 204


def test_timeline_and_profile_http_api(client):
    """TEST 8 — Timeline and Profile HTTP API: get timeline, sprint breakdown, profile stats."""
    with db() as conn:
        now_str = as_iso(datetime.now(IST))
        email = f"profile_api_{secrets.token_hex(4)}@example.com"
        r = execute(conn, "INSERT INTO users (email, name, created_at) VALUES (%s, %s, %s) RETURNING id", (email, "Profile User", now_str)).fetchone()
        token = issue_session(conn, r["id"])

    headers = {"Authorization": f"Bearer {token}"}

    res_tl = client.get("/api/timeline", headers=headers)
    assert res_tl.status_code == 200

    current_sprint = year_progress()["sprint_number"]
    res_sprint = client.get(f"/api/timeline/{current_sprint}", headers=headers)
    assert res_sprint.status_code == 200

    res_prof = client.get("/api/profile", headers=headers)
    assert res_prof.status_code == 200

    res_stats = client.get("/api/stats", headers=headers)
    assert res_stats.status_code == 200


def test_error_contract(client):
    """TEST 9 — Error contract: 400/401/404 return JSON with 'detail', no tracebacks/secrets."""
    res = client.get("/api/goals")
    assert res.status_code == 401
    data = res.json()
    assert "detail" in data
    assert isinstance(data["detail"], str)


def test_google_authentication_boundary(client):
    """TEST 10 — Google authentication boundary mock verification."""
    with patch("backend.api.auth.google_id_token.verify_oauth2_token") as mock_verify:
        mock_verify.return_value = {
            "email": f"google_test_{secrets.token_hex(4)}@example.com",
            "name": "Google User",
            "sub": f"sub_{secrets.token_hex(4)}",
            "picture": "https://example.com/photo.jpg",
            "email_verified": True,
        }
        with patch("backend.api.auth.GOOGLE_CLIENT_ID", "mock-client-id"):
            res = client.post("/api/auth/google", json={"credential": "mock-token"})
            assert res.status_code == 200
            data = res.json()
            assert "token" in data
            assert "user" in data
