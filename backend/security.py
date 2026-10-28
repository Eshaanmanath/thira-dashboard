
# backend/security.py

import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from database import get_db
import models
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY must be configured in the backend .env file"
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

bearer_scheme = HTTPBearer()


def create_access_token(user_id: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": user_id,
        "exp": expires_at,
        "iat": datetime.now(timezone.utc),
    }

    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    token = credentials.credentials

    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )
        user_id = payload.get("sub")

        if not user_id:
            raise unauthorized

    except JWTError:
        raise unauthorized

    user = db.query(models.User).filter(
        models.User.id == user_id
    ).first()

    if user is None:
        raise unauthorized

    return user


def require_roles(*allowed_roles: models.UserRole):
    def role_dependency(
        current_user: models.User = Depends(get_current_user),
    ) -> models.User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )

        return current_user

    return role_dependency


def require_event_access(
    event_id: str,
    current_user: models.User,
    db: Session,
) -> models.Event:
    """
    Resolve the event and authorize access.

    Legacy Event Head assignments are still supported temporarily.
    EventMembership will support explicit Volunteer assignments.
    """
    event = db.query(models.Event).filter(
        models.Event.id == event_id
    ).first()

    if event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    if current_user.role == models.UserRole.CORE:
        return event

    if current_user.role == models.UserRole.EVENT_HEAD:
        legacy_assignments = {
            str(value).strip().casefold()
            for value in (event.event_head_1, event.event_head_2)
            if value and str(value).strip().casefold() != "unassigned"
        }

        user_identifiers = {
            current_user.id.strip().casefold(),
            current_user.email.strip().casefold(),
        }

        if legacy_assignments & user_identifiers:
            return event

    membership = db.query(models.EventMembership).filter(
        models.EventMembership.event_id == event_id,
        models.EventMembership.user_id == current_user.id,
    ).first()

    if membership:
        return event

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have access to this event",
    )
