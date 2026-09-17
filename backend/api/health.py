"""Health check and current sprint context endpoints."""
from fastapi import APIRouter
from backend.sprint_engine import year_progress

router = APIRouter(tags=["health"])


@router.get("/api/health")
def health():
    """Backend service health check endpoint."""
    return {"status": "ok"}


@router.get("/api/sprint/current")
def get_current_sprint():
    """Authoritative public sprint context endpoint for landing pages and client synchronization."""
    return year_progress()
