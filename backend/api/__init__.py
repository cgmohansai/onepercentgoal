"""API router aggregation for OnePercentGoal."""
from fastapi import APIRouter

from backend.api.health import router as health_router
from backend.api.auth import router as auth_router
from backend.api.goals import router as goals_router
from backend.api.rotes import router as rotes_router
from backend.api.timeline import router as timeline_router
from backend.api.profile import router as profile_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(goals_router)
api_router.include_router(rotes_router)
api_router.include_router(timeline_router)
api_router.include_router(profile_router)

__all__ = ["api_router"]
