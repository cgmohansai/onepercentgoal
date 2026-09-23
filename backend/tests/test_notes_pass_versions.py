"""Tests for private notes, rote pass semantics, and goal optimistic concurrency."""
from __future__ import annotations

import secrets
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.db.connection import db, execute
from backend.db.setup import setup_database
from backend.auth.session import issue_session
from backend.config import IST, as_iso


@pytest.fixture(autouse=True)
def isolate_test_db(tmp_path, monkeypatch):
    """Isolate tests to use a temporary SQLite database."""
    test_db_path = tmp_path / "test_notes_pass.db"
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


def _make_user():
    with db() as conn:
        now_str = as_iso(datetime.now(IST))
        email = f"test_np_{secrets.token_hex(4)}@example.com"
        row = execute(
            conn,
            "INSERT INTO users (email, name, created_at) VALUES (%s, %s, %s) RETURNING id",
            (email, "Notes Pass User", now_str),
        ).fetchone()
        user_id = row["id"]
        token = issue_session(conn, user_id)
    return user_id, token


def test_notes_require_auth(client):
    assert client.get("/api/notes").status_code == 401
    assert client.post("/api/notes", json={"body": "x"}).status_code == 401


def test_notes_crud_and_tombstone(client):
    _, token = _make_user()
    headers = {"Authorization": f"Bearer {token}"}

    # Create global note
    res = client.post("/api/notes", json={"body": "my secret"}, headers=headers)
    assert res.status_code == 201
    note = res.json()
    assert note["body"] == "my secret"
    assert note["version"] == 1
    assert note["goal_id"] is None

    # List
    res = client.get("/api/notes", headers=headers)
    assert res.status_code == 200
    assert any(n["id"] == note["id"] for n in res.json())

    # Update with correct base version
    res = client.patch(f"/api/notes/{note['id']}", json={"body": "edited", "base_version": 1}, headers=headers)
    assert res.status_code == 200
    assert res.json()["version"] == 2

    # Stale base version -> 409, never silently merged
    res = client.patch(f"/api/notes/{note['id']}", json={"body": "stale", "base_version": 1}, headers=headers)
    assert res.status_code == 409

    # Soft delete -> tombstone hidden by default, visible on request
    res = client.delete(f"/api/notes/{note['id']}", headers=headers)
    assert res.status_code == 200
    assert client.get("/api/notes", headers=headers).json() == [
        n for n in client.get("/api/notes", headers=headers).json() if n["id"] != note["id"]
    ]
    res = client.get("/api/notes?include_deleted=true", headers=headers)
    tomb = [n for n in res.json() if n["id"] == note["id"]]
    assert len(tomb) == 1 and tomb[0]["deleted"] is True


def test_notes_title_pin_and_links(client):
    _, token = _make_user()
    headers = {"Authorization": f"Bearer {token}"}
    res = client.post("/api/goals", json={"title": "Linked goal"}, headers=headers)
    assert res.status_code == 201
    goal_id = res.json()["id"]
    res = client.post("/api/rotes", json={"title": "Linked rote"}, headers=headers)
    assert res.status_code in (200, 201)
    rote_id = res.json()["id"]

    # Goal-linked note with title + pin
    res = client.post(
        "/api/notes",
        json={"title": "Plan", "body": "steps", "goal_id": goal_id, "pinned": True},
        headers=headers,
    )
    assert res.status_code == 201
    note = res.json()
    assert note["title"] == "Plan"
    assert note["pinned"] is True
    assert note["goal_id"] == goal_id

    # Filter by goal
    res = client.get(f"/api/notes?goal_id={goal_id}", headers=headers)
    assert res.status_code == 200
    assert any(n["id"] == note["id"] for n in res.json())

    # Re-link to a rote and unpin via PATCH
    res = client.patch(
        f"/api/notes/{note['id']}",
        json={"goal_id": None, "rote_id": rote_id, "pinned": False, "base_version": note["version"]},
        headers=headers,
    )
    assert res.status_code == 200
    updated = res.json()
    assert updated["rote_id"] == rote_id
    assert updated["pinned"] is False

    # A note can link to a goal AND a rote together
    res = client.post(
        "/api/notes",
        json={"body": "both", "links": [{"goal_id": goal_id}, {"rote_id": rote_id}]},
        headers=headers,
    )
    assert res.status_code == 201
    both = res.json()
    assert len(both["links"]) == 2
    assert {l["goal_id"] for l in both["links"] if l["goal_id"]} == {goal_id}
    assert {l["rote_id"] for l in both["links"] if l["rote_id"]} == {rote_id}

    # Idempotent replay with the same client_id returns the same note, no duplicate
    res = client.post(
        "/api/notes",
        json={"body": "both", "client_id": "nc-test-dedupe-1", "links": [{"goal_id": goal_id}]},
        headers=headers,
    )
    assert res.status_code == 201
    first_id = res.json()["id"]
    res = client.post(
        "/api/notes",
        json={"body": "both", "client_id": "nc-test-dedupe-1", "links": [{"goal_id": goal_id}]},
        headers=headers,
    )
    assert res.status_code == 201
    assert res.json()["id"] == first_id
    res = client.get("/api/notes", headers=headers)
    assert sum(1 for n in res.json() if n.get("client_id") == "nc-test-dedupe-1") == 1


def test_notes_save_regardless_of_missing_links(client):
    """Links to unknown or not-yet-synced targets never block saving."""
    _, token = _make_user()
    headers = {"Authorization": f"Bearer {token}"}
    res = client.post(
        "/api/notes",
        json={"body": "future links", "links": [{"goal_id": 987654321}, {"rote_id": 123456789}]},
        headers=headers,
    )
    assert res.status_code == 201
    note = res.json()
    assert len(note["links"]) == 2

    # Temp (non-integer) ids are accepted, never 422, and simply not persisted as links
    res = client.post(
        "/api/notes",
        json={"body": "temp link", "links": [{"goal_id": "temp-goal-1"}]},
        headers=headers,
    )
    assert res.status_code == 201
    assert res.json()["links"] == []


def test_notes_scoped_to_owner_and_goal(client):
    _, token = _make_user()
    headers = {"Authorization": f"Bearer {token}"}
    # Nonexistent goal ids never block saving (link resolves later if ever)
    res = client.post("/api/notes", json={"body": "x", "goal_id": 999999}, headers=headers)
    assert res.status_code == 201

    # ...but linking to ANOTHER user's goal is still rejected
    _, other_token = _make_user()
    other_headers = {"Authorization": f"Bearer {other_token}"}
    res = client.post("/api/goals", json={"title": "Someone else"}, headers=other_headers)
    assert res.status_code == 201
    foreign_goal_id = res.json()["id"]
    res = client.post("/api/notes", json={"body": "snoop", "goal_id": foreign_goal_id}, headers=headers)
    assert res.status_code == 404


def test_rote_pass_semantics(client):
    _, token = _make_user()
    headers = {"Authorization": f"Bearer {token}"}
    res = client.post("/api/rotes", json={"title": "Read"}, headers=headers)
    assert res.status_code in (200, 201)
    rote_id = res.json()["id"]
    today = datetime.now(IST).strftime("%Y-%m-%d")

    res = client.post(f"/api/rotes/{rote_id}/pass", json={"date": today}, headers=headers)
    assert res.status_code == 200
    assert res.json()["passed"] is True

    res = client.get(f"/api/rotes?date={today}", headers=headers)
    data = res.json()
    item = [r for r in data["rotes"] if r["id"] == rote_id][0]
    assert item["completed"] is False
    assert item["passed"] is True
    assert today in data["passed_dates"]
    assert today not in data["completed_dates"]
    assert data["stats"]["passed_rotes"] == 1
    assert data["stats"]["completed_rotes"] == 0


def test_goal_version_conflict(client):
    _, token = _make_user()
    headers = {"Authorization": f"Bearer {token}"}
    res = client.post("/api/goals", json={"title": "Versioned goal"}, headers=headers)
    assert res.status_code == 201
    goal = res.json()
    assert goal["version"] == 1

    res = client.patch(f"/api/goals/{goal['id']}", json={"progress_percent": 20, "base_version": 1}, headers=headers)
    assert res.status_code == 200
    assert res.json()["version"] == 2
    assert res.json()["progress_percent"] == 20

    # Stale writer gets 409 with the server copy — no blind overwrite
    res = client.patch(f"/api/goals/{goal['id']}", json={"progress_percent": 40, "base_version": 1}, headers=headers)
    assert res.status_code == 409
    assert res.json()["detail"]["server"]["progress_percent"] == 20

    # Writes without a version still apply (offline-queue replay path)
    res = client.patch(f"/api/goals/{goal['id']}", json={"progress_percent": 40}, headers=headers)
    assert res.status_code == 200
    assert res.json()["progress_percent"] == 40
