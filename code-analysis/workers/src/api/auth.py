"""Tenant-scoped JWT authentication.

Accepts the same token the rest of the platform issues:
HS256 over `{userId, email, tenantId}` signed with JWT_SECRET
(backend/src/services/auth/domain/session.ts). Verifying it here rather than
trusting a header means this service can be reached directly by the browser
without becoming a way to scan another organization's repositories.
"""

import os
from dataclasses import dataclass
from typing import Optional

import jwt
from fastapi import Depends, Header

from src.api.errors import ApiError


@dataclass(frozen=True)
class AuthContext:
    user_id: str
    email: str
    tenant_id: str


def _secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        # Fail closed. A missing secret must never mean "skip authentication".
        raise ApiError("Authentication is not configured.", "AUTH_NOT_CONFIGURED", 500)
    return secret


async def require_auth(authorization: Optional[str] = Header(default=None)) -> AuthContext:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError("Missing or malformed Authorization header.", "UNAUTHORIZED", 401)

    token = authorization.split(" ", 1)[1].strip()
    try:
        claims = jwt.decode(token, _secret(), algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise ApiError("Your session has expired. Please sign in again.", "UNAUTHORIZED", 401)
    except jwt.InvalidTokenError:
        raise ApiError("Your session is invalid. Please sign in again.", "UNAUTHORIZED", 401)

    user_id, email, tenant_id = claims.get("userId"), claims.get("email"), claims.get("tenantId")
    if not user_id or not email or not tenant_id:
        raise ApiError("Token is missing required claims.", "UNAUTHORIZED", 401)

    return AuthContext(user_id=user_id, email=email, tenant_id=tenant_id)


CurrentUser = Depends(require_auth)
