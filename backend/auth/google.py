"""Google OAuth credential verification utilities and schemas."""
from __future__ import annotations

from pydantic import BaseModel

try:
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_requests
    _google_auth_request = google_requests.Request()
except Exception:
    google_id_token = None
    _google_auth_request = None


class GoogleVerifyPayload(BaseModel):
    credential: str | None = None
    access_token: str | None = None
