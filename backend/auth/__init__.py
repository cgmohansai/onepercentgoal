"""Authentication package for OnePercentGoal."""
from backend.auth.session import (
    token_hash,
    normalize_username,
    user_to_dict,
    issue_session,
    cleanup_expired_sessions,
    current_user_id,
    current_user,
    user_created_at,
)
from backend.auth.google import (
    GoogleVerifyPayload,
    google_id_token,
    _google_auth_request,
)

__all__ = [
    "token_hash",
    "normalize_username",
    "user_to_dict",
    "issue_session",
    "cleanup_expired_sessions",
    "current_user_id",
    "current_user",
    "user_created_at",
    "GoogleVerifyPayload",
    "google_id_token",
    "_google_auth_request",
]
