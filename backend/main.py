import csv
import io
import os
from contextlib import asynccontextmanager
from typing import Optional, List
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy.orm import Session
from database import engine, Base, get_db
import models
import hashlib
import html
import re
import secrets
import binascii
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from sqlalchemy import and_, or_, update
from security import (
    create_access_token,
    get_current_user,
    require_roles,
    require_event_access,
)

load_dotenv()

# Password hashing setup
def hash_password(password: str) -> str:
    salt = os.urandom(16)
    pwd_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return binascii.hexlify(salt).decode('ascii') + ":" + binascii.hexlify(pwd_hash).decode('ascii')

def verify_password(stored_password: str, provided_password: str) -> bool:
    try:
        salt_hex, hash_hex = stored_password.split(':')
        salt = binascii.unhexlify(salt_hex)
        pwd_hash = hashlib.pbkdf2_hmac('sha256', provided_password.encode('utf-8'), salt, 100000)
        return pwd_hash == binascii.unhexlify(hash_hex)
    except Exception:
        return False

# --- Email Request Schema ---
class EmailPassRequest(BaseModel):
    subject: str = "Your Entry Pass for {event_name}"
    custom_message: Optional[str] = "We are excited to welcome you! Please present the attached QR code token at the entry gate."


class AnnouncementRequest(BaseModel):
    subject: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1, max_length=10000)
    recipient_filter: str = Field(default="all", pattern="^(all|checked_in|not_checked_in)$")


# --- Helper function for HTML Email generation ---
# Brand palette (matches the dashboard)
_EMAIL_BRAND = "#C03410"
_EMAIL_ACCENT = "#0062C4"
_EMAIL_CREAM = "#FFDDAB"
_EMAIL_PAPER = "#FFF4E0"
_EMAIL_LINE = "#E6BE86"
_EMAIL_INK = "#2B1206"
_EMAIL_MUTED = "#66452D"
_EMAIL_FONT = "'Source Serif 4', Georgia, 'Times New Roman', serif"


def generate_pass_html(participant_name: str, event_name: str, event_date: str, qr_token: str, message: str) -> str:
    # Uses QuickChart API to render a live embedded QR code image from the unique QR token
    safe_qr_token = quote(qr_token, safe="")
    qr_image_url = f"https://quickchart.io/qr?text={safe_qr_token}&size=360&margin=1"
    safe_name = html.escape(participant_name or "there")
    safe_event_name = html.escape(event_name)
    safe_event_date = html.escape(event_date)
    safe_qr_token_text = html.escape(qr_token)
    safe_message = (
        html.escape(message or "")
        .replace("\r\n", "\n")
        .replace("\\n", "\n")
        .replace("\n", "<br>")
    )

    # Optional: a PNG of the logo (white on transparent) hosted somewhere public.
    # Email clients such as Gmail do not render SVG, so set EMAIL_LOGO_URL in .env.
    logo_url = os.getenv("EMAIL_LOGO_URL", "").strip()
    if logo_url:
        logo_html = (
            f'<img src="{html.escape(logo_url, quote=True)}" alt="Thira Cochin" height="72" '
            f'style="display:block;margin:0 auto 10px;height:72px;width:auto;border:0;" />'
        )
    else:
        logo_html = (
            f'<div style="font-family:{_EMAIL_FONT};font-size:30px;font-weight:700;'
            f'color:#ffffff;letter-spacing:0.5px;margin-bottom:6px;">thira-cochin</div>'
        )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>Your entry pass for {safe_event_name}</title>
</head>
<body style="margin:0;padding:0;background-color:{_EMAIL_CREAM};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:{_EMAIL_CREAM};">
    Your entry pass for {safe_event_name}. Show the QR code at the gate.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{_EMAIL_CREAM};">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;border-radius:16px;overflow:hidden;border:1px solid {_EMAIL_LINE};">

          <!-- Brand header -->
          <tr>
            <td align="center" style="background-color:{_EMAIL_BRAND};padding:28px 24px 24px;">
              {logo_html}
              <div style="font-family:{_EMAIL_FONT};font-size:16px;color:#ffffff;opacity:0.92;">Entry pass</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:{_EMAIL_PAPER};padding:32px 28px 8px;font-family:{_EMAIL_FONT};color:{_EMAIL_INK};">
              <div style="font-size:16px;color:{_EMAIL_MUTED};margin-bottom:6px;">Hi {safe_name},</div>
              <div style="font-size:28px;line-height:1.2;font-weight:700;color:{_EMAIL_INK};margin-bottom:6px;">{safe_event_name}</div>
              <div style="font-size:16px;font-weight:600;color:{_EMAIL_BRAND};margin-bottom:20px;">{safe_event_date}</div>
              <div style="font-size:16px;line-height:1.6;color:{_EMAIL_INK};border-left:4px solid {_EMAIL_BRAND};padding:2px 0 2px 14px;margin-bottom:28px;">{safe_message}</div>
            </td>
          </tr>

          <!-- QR code -->
          <tr>
            <td align="center" style="background-color:{_EMAIL_PAPER};padding:0 28px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border:2px solid {_EMAIL_BRAND};border-radius:16px;">
                <tr>
                  <td style="padding:16px;">
                    <img src="{qr_image_url}" alt="Entry QR code" width="200" height="200" style="display:block;width:200px;height:200px;border:0;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Token -->
          <tr>
            <td align="center" style="background-color:{_EMAIL_PAPER};padding:16px 28px 32px;font-family:{_EMAIL_FONT};">
              <div style="font-size:14px;color:{_EMAIL_MUTED};margin-bottom:8px;">Pass token</div>
              <div style="display:inline-block;background-color:#ffffff;border:1px solid {_EMAIL_LINE};border-radius:8px;padding:8px 14px;font-family:'Courier New',Courier,monospace;font-size:16px;font-weight:700;letter-spacing:1.5px;color:{_EMAIL_ACCENT};">{safe_qr_token_text}</div>
              <div style="font-size:14px;line-height:1.5;color:{_EMAIL_MUTED};margin-top:14px;">Show this QR code or token to a volunteer at the gate.</div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background-color:{_EMAIL_CREAM};border-top:1px solid {_EMAIL_LINE};padding:16px 24px;font-family:{_EMAIL_FONT};font-size:12px;line-height:1.5;color:{_EMAIL_MUTED};">
              This pass was issued automatically by dashboard.thira-cochin.in.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)
    print("🚀 FastAPI Backend Running & Connected to Supabase PostgreSQL!")
    yield
    print("👋 FastAPI Server shutting down...")

app = FastAPI(
    title="Thira Cochin Dashboard API",
    version="1.0.0",
    docs_url="/docs",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://dashboard.thira-cochin.in"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Schemas ---
class EventCreate(BaseModel):
    name: str
    event_date: str = Field(..., alias="eventDate")
    event_head_1: Optional[str] = Field(None, alias="eventHead1")
    event_head_2: Optional[str] = Field(None, alias="eventHead2")
    status: Optional[str] = "Registrations Open"
    expected_participants: int = Field(0, alias="expectedParticipants", ge=0)

    class Config:
        populate_by_name = True

class EventResponse(BaseModel):
    id: str
    name: str
    event_date: str
    event_head_1: Optional[str] = None
    event_head_2: Optional[str] = None
    status: str
    expected_participants: int = 0
    created_at: str

    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    role: models.UserRole  # Account is activated by a single-use email invitation

class InvitationCompleteRequest(BaseModel):
    token: str = Field(..., min_length=32, max_length=256)
    password: str = Field(..., min_length=10, max_length=128)

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    created_at: str
    is_active: bool = True
    invitation_pending: bool = False
    invitation_sent: Optional[bool] = None

    class Config:
        from_attributes = True
        
class CheckInRequest(BaseModel):
    qr_token: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 1800


class CurrentUserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str

class VolunteerAssignment(BaseModel):
    user_id: str

class EventHeadAssignments(BaseModel):
    user_ids: List[str] = Field(default_factory=list, max_length=2)


# --- API Endpoints ---
@app.get("/")
def read_root():
    return {"message": "Thira Cochin Dashboard API is live!"}

@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    return {"status": "connected_to_supabase_db"}

# --- EVENT ENDPOINTS ---
@app.get("/events", response_model=List[EventResponse])
def get_events(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    all_events = db.query(models.Event).order_by(
        models.Event.created_at.desc()
    ).all()

    visible_events = []

    for event in all_events:
        try:
            require_event_access(event.id, current_user, db)
            visible_events.append(event)
        except HTTPException as exc:
            if exc.status_code != 403:
                raise

    response = []
    for evt in visible_events:
        response.append({
            "id": evt.id,
            "name": evt.name,
            "event_date": evt.event_date,
            "event_head_1": evt.event_head_1 or "Unassigned",
            "event_head_2": evt.event_head_2 or "Unassigned",
            "status": (
                evt.status.value
                if hasattr(evt.status, "value")
                else evt.status
            ),
            "expected_participants": getattr(evt, "expected_participants", 0) or 0,
            "created_at": (
                evt.created_at.strftime("%Y-%m-%d")
                if evt.created_at else ""
            ),
        })

    return response

def resolve_event_head(db: Session, identifier: Optional[str]) -> Optional[models.User]:
    """Resolve an Event Head by user ID or email; never by display name."""
    if not identifier or identifier.strip().casefold() in {"unassigned", "none", "null"}:
        return None

    value = identifier.strip()
    user = db.query(models.User).filter(
        (models.User.id == value) | (models.User.email == value.casefold())
    ).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No user found for Event Head identifier: {value}",
        )
    if user.role != models.UserRole.EVENT_HEAD:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User {user.email} is not an Event Head",
        )
    return user


def add_event_membership(db: Session, event_id: str, user_id: str) -> None:
    existing = db.query(models.EventMembership).filter(
        models.EventMembership.event_id == event_id,
        models.EventMembership.user_id == user_id,
    ).first()
    if not existing:
        db.add(models.EventMembership(event_id=event_id, user_id=user_id))


@app.post("/events", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
def create_event(
    event: EventCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.UserRole.CORE)
    ),
):
    # The UI may send an Event Head's email or user ID. Authorization is stored
    # only in EventMembership; the old event_head fields remain display-only for
    # backward compatibility with the current frontend.
    head1 = resolve_event_head(db, event.event_head_1)
    head2 = resolve_event_head(db, event.event_head_2)
    if head1 and head2 and head1.id == head2.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose two different Event Heads or leave the second unassigned",
        )

    db_event = models.Event(
        name=event.name,
        event_date=event.event_date,
        event_head_1=head1.email if head1 else None,
        event_head_2=head2.email if head2 else None,
        status=event.status,
        expected_participants=event.expected_participants,
    )
    try:
        db.add(db_event)
        db.flush()
        if head1:
            add_event_membership(db, db_event.id, head1.id)
        if head2:
            add_event_membership(db, db_event.id, head2.id)
        db.commit()
        db.refresh(db_event)
    except Exception:
        db.rollback()
        raise

    return {
        "id": db_event.id,
        "name": db_event.name,
        "event_date": db_event.event_date,
        "event_head_1": db_event.event_head_1 or "Unassigned",
        "event_head_2": db_event.event_head_2 or "Unassigned",
        "status": db_event.status.value if hasattr(db_event.status, "value") else db_event.status,
        "expected_participants": db_event.expected_participants or 0,
        "created_at": db_event.created_at.strftime("%Y-%m-%d") if db_event.created_at else "",
    }


@app.put("/events/{event_id}/event-heads")
def assign_event_heads(
    event_id: str,
    payload: EventHeadAssignments,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(models.UserRole.CORE)),
):
    """Replace the Event Head assignments for an event (Core only)."""
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")

    # Normalize and validate the submitted user IDs, and disallow duplicates.
    ids = [value.strip() for value in payload.user_ids if value and value.strip()]
    if len(ids) > 2:
        raise HTTPException(status_code=400, detail="An event can have at most two Event Heads")
    if len(set(ids)) != len(ids):
        raise HTTPException(status_code=400, detail="Duplicate Event Head user IDs are not allowed")

    heads = []
    for user_id in ids:
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if user is None:
            raise HTTPException(status_code=404, detail=f"User not found: {user_id}")
        if user.role != models.UserRole.EVENT_HEAD:
            raise HTTPException(status_code=400, detail=f"{user.email} is not an Event Head")
        heads.append(user)

    try:
        # Remove only Event Head memberships; preserve Volunteer memberships.
        existing_head_memberships = (
            db.query(models.EventMembership)
            .join(models.User, models.EventMembership.user_id == models.User.id)
            .filter(
                models.EventMembership.event_id == event_id,
                models.User.role == models.UserRole.EVENT_HEAD,
            )
            .all()
        )
        for membership in existing_head_memberships:
            db.delete(membership)

        for head in heads:
            add_event_membership(db, event_id, head.id)

        event.event_head_1 = heads[0].email if len(heads) >= 1 else None
        event.event_head_2 = heads[1].email if len(heads) >= 2 else None
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "message": "Event Head assignments updated",
        "event_id": event_id,
        "event_heads": [{"id": user.id, "name": user.name, "email": user.email} for user in heads],
    }


# --- CSV IMPORT ENDPOINT ---
@app.post("/events/{event_id}/import-csv")
async def import_participants_csv(
    event_id: str, 
    file: UploadFile = File(...), 
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # RBAC: Core and Event Heads can import CSVs
    require_event_access(event_id, current_user, db)

    if current_user.role not in (
        models.UserRole.CORE,
        models.UserRole.EVENT_HEAD,
    ):
        raise HTTPException(
            status_code=403,
            detail="Only Core and assigned Event Heads can perform this action",
        )

    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Bound upload size before decoding/parsing to avoid excessive memory use.
    MAX_CSV_BYTES = 5 * 1024 * 1024
    MAX_CSV_ROWS = 10000
    contents = await file.read(MAX_CSV_BYTES + 1)
    if len(contents) > MAX_CSV_BYTES:
        raise HTTPException(status_code=413, detail="CSV file exceeds the 5 MB limit")
    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded CSV file is empty")

    try:
        decoded = contents.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="CSV must be encoded as UTF-8")

    try:
        reader = csv.DictReader(io.StringIO(decoded, newline=""))
        if not reader.fieldnames:
            raise HTTPException(status_code=400, detail="CSV header row is missing")

        # Normalize headers and reject malformed/duplicate headers.
        headers = [h.strip().lower() if h else "" for h in reader.fieldnames]
        if any(not h for h in headers) or len(set(headers)) != len(headers):
            raise HTTPException(status_code=400, detail="CSV contains blank or duplicate column headers")

        name_columns = ("name", "full name", "participant name")
        email_columns = ("email", "email address")
        phone_columns = ("phone", "phone number", "mobile")
        if not any(h in headers for h in name_columns) or not any(h in headers for h in email_columns):
            raise HTTPException(
                status_code=400,
                detail="CSV must contain name and email columns",
            )

        added_count = 0
        skipped_count = 0
        seen_rows = set()

        for row_number, row in enumerate(reader, start=2):
            if row_number > MAX_CSV_ROWS + 1:
                raise HTTPException(status_code=413, detail=f"CSV exceeds the {MAX_CSV_ROWS}-row limit")
            # DictReader uses key None when a row has more cells than the header.
            if None in row:
                skipped_count += 1
                continue

            normalized_row = {
                (key.strip().lower() if key else ""): (value.strip() if value else "")
                for key, value in row.items()
                if key
            }
            name = next((normalized_row.get(k) for k in name_columns if normalized_row.get(k)), "")
            email = next((normalized_row.get(k) for k in email_columns if normalized_row.get(k)), "").strip().lower()
            phone = next((normalized_row.get(k) for k in phone_columns if normalized_row.get(k)), None)

            if not name or not email:
                skipped_count += 1
                continue
            if len(name) > 255 or len(email) > 320 or (phone and len(phone) > 50):
                skipped_count += 1
                continue
            if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
                skipped_count += 1
                continue

            row_key = (name.casefold(), email)
            if row_key in seen_rows:
                skipped_count += 1
                continue
            seen_rows.add(row_key)

            existing = db.query(models.Participant).filter(
                models.Participant.event_id == event_id,
                models.Participant.email == email,
                models.Participant.name == name,
            ).first()
            if existing:
                skipped_count += 1
                continue

            db.add(models.Participant(
                event_id=event_id,
                name=name,
                email=email,
                phone=phone or None,
            ))
            added_count += 1

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except csv.Error:
        db.rollback()
        raise HTTPException(status_code=400, detail="CSV file could not be parsed")
    except Exception:
        db.rollback()
        raise

    return {
        "message": "CSV imported successfully",
        "added": added_count,
        "skipped": skipped_count,
        "total_processed": added_count + skipped_count,
    }

# --- USER MANAGEMENT ENDPOINTS ---
@app.get(
    "/users",
    response_model=List[UserResponse],
)
def get_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role == models.UserRole.CORE:
        query = db.query(models.User)
    elif current_user.role == models.UserRole.EVENT_HEAD:
        query = db.query(models.User).filter(models.User.role == models.UserRole.VOLUNTEER)
    else:
        raise HTTPException(status_code=403, detail="Only Core and Event Heads can list users")
    users = query.order_by(models.User.created_at.desc()).all()

    return [
        {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role.value,
            "created_at": (
                user.created_at.strftime("%Y-%m-%d")
                if user.created_at else ""
            ),
            "is_active": bool(user.is_active),
            "invitation_pending": not bool(user.is_active),
        }
        for user in users
    ]

def _smtp_credentials():
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", 587))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    if not (smtp_user and smtp_pass):
        raise HTTPException(
            status_code=503,
            detail="Invitation email is unavailable because SMTP_USER and SMTP_PASS are not configured.",
        )
    return smtp_host, smtp_port, smtp_user, smtp_pass


def _send_invitation_email(recipient_name: str, recipient_email: str, role: str, raw_token: str):
    smtp_host, smtp_port, smtp_user, smtp_pass = _smtp_credentials()
    frontend_url = os.getenv("FRONTEND_URL", "https://dashboard.thira-cochin.in").strip().rstrip("/")
    invite_url = f"{frontend_url}/?invite={quote(raw_token, safe='')}"
    safe_name = html.escape(recipient_name or "there")
    safe_role = html.escape(role)
    safe_url = html.escape(invite_url, quote=True)
    body = f"""<!doctype html><html><body style="font-family:Arial,sans-serif;background:#fff4e0;color:#2b1206;padding:24px">
    <div style="max-width:600px;margin:auto;background:#ffffff;border:1px solid #e6be86;border-radius:12px;padding:28px">
    <h2 style="color:#c03410;margin-top:0">Welcome to Thira Cochin</h2>
    <p>Hi {safe_name},</p><p>You have been invited to join the Thira Dashboard as <strong>{safe_role}</strong>.</p>
    <p>Use the secure link below to create your own password. This link expires in 24 hours and can only be used once.</p>
    <p style="margin:28px 0"><a href="{safe_url}" style="background:#c03410;color:#ffffff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Set your password</a></p>
    <p>If you weren't expecting this invitation, you can ignore this email.</p>
    <p style="font-size:12px;color:#66452d">Thira Cochin Events</p></div></body></html>"""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Your Thira Dashboard invitation"
    msg["From"] = f"Thira Cochin Events <{smtp_user}>"
    msg["To"] = recipient_email
    msg.attach(MIMEText(
        f"Hi {recipient_name}, you have been invited to Thira Dashboard as {role}. Set your password using this link (expires in 24 hours): {invite_url}",
        "plain", "utf-8"
    ))
    msg.attach(MIMEText(body, "html", "utf-8"))
    server = None
    try:
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=30)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.sendmail(smtp_user, recipient_email, msg.as_string())
    finally:
        if server:
            try:
                server.quit()
            except Exception:
                pass


def _new_invitation_token():
    raw_token = secrets.token_urlsafe(36)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expires_at = datetime.utcnow() + timedelta(hours=24)
    return raw_token, token_hash, expires_at


@app.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user: UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Core can create any role; Event Heads can create Volunteers only.
    if current_user.role == models.UserRole.EVENT_HEAD and user.role != models.UserRole.VOLUNTEER:
        raise HTTPException(status_code=403, detail="Event Heads can create Volunteer accounts only")
    if current_user.role == models.UserRole.VOLUNTEER:
        raise HTTPException(status_code=403, detail="Volunteers cannot create users")

    # Fail before creating a pending account if invitation email cannot be sent.
    _smtp_credentials()
    email = str(user.email).strip().lower()
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(status_code=400, detail="User with this email already exists.")

    raw_token, token_hash, expires_at = _new_invitation_token()
    # Store a random unusable password hash until the invite is completed.
    db_user = models.User(
        name=user.name.strip(),
        email=email,
        hashed_password=hash_password(secrets.token_urlsafe(48)),
        role=user.role,
        is_active=False,
        invitation_token_hash=token_hash,
        invitation_expires_at=expires_at,
    )
    db.add(db_user)
    try:
        db.commit()
        db.refresh(db_user)
    except Exception:
        db.rollback()
        raise

    try:
        _send_invitation_email(db_user.name, db_user.email, db_user.role.value, raw_token)
    except Exception as exc:
        # Keep the account pending so Core can resend the invitation without recreating it.
        print(f"Invitation email failed for {db_user.email}: {exc}")
        raise HTTPException(
            status_code=502,
            detail=f"Account was created but the invitation email could not be sent. Use Resend invitation. ({type(exc).__name__})",
        )

    return {
        "id": db_user.id,
        "name": db_user.name,
        "email": db_user.email,
        "role": db_user.role.value,
        "created_at": db_user.created_at.strftime("%Y-%m-%d") if db_user.created_at else "",
        "is_active": db_user.is_active,
        "invitation_pending": True,
        "invitation_sent": True,
    }


@app.post("/users/{user_id}/resend-invitation")
def resend_user_invitation(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in (models.UserRole.CORE, models.UserRole.EVENT_HEAD):
        raise HTTPException(status_code=403, detail="You do not have permission to resend invitations")
    target = db.query(models.User).filter(models.User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.role == models.UserRole.EVENT_HEAD and target.role != models.UserRole.VOLUNTEER:
        raise HTTPException(status_code=403, detail="Event Heads can resend invitations for Volunteer accounts only")
    if target.is_active:
        raise HTTPException(status_code=400, detail="This user has already activated their account")
    _smtp_credentials()
    raw_token, token_hash, expires_at = _new_invitation_token()
    target.invitation_token_hash = token_hash
    target.invitation_expires_at = expires_at
    db.commit()
    try:
        _send_invitation_email(target.name, target.email, target.role.value, raw_token)
    except Exception as exc:
        print(f"Invitation resend failed for {target.email}: {exc}")
        raise HTTPException(status_code=502, detail=f"Could not send invitation email ({type(exc).__name__})")
    return {"message": f"Invitation email sent to {target.email}", "user_id": target.id}


@app.post("/auth/complete-invitation")
def complete_invitation(
    payload: InvitationCompleteRequest,
    db: Session = Depends(get_db),
):
    token_hash = hashlib.sha256(payload.token.encode("utf-8")).hexdigest()
    user = db.query(models.User).filter(
        models.User.invitation_token_hash == token_hash,
        models.User.is_active.is_(False),
    ).first()
    now = datetime.utcnow()
    if user is None or user.invitation_expires_at is None or user.invitation_expires_at < now:
        raise HTTPException(status_code=400, detail="This invitation link is invalid, expired, or already used. Ask an administrator to resend it.")
    user.hashed_password = hash_password(payload.password)
    user.is_active = True
    user.invitation_token_hash = None
    user.invitation_expires_at = None
    db.commit()
    return {"message": "Password set successfully. You can now sign in."}


@app.post("/events/{event_id}/volunteers", status_code=201)
def assign_volunteer(
    event_id: str,
    payload: VolunteerAssignment,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    event = require_event_access(event_id, current_user, db)

    if current_user.role not in (
        models.UserRole.CORE,
        models.UserRole.EVENT_HEAD,
    ):
        raise HTTPException(
            status_code=403,
            detail="Only Core and assigned Event Heads can assign volunteers",
        )

    volunteer = db.query(models.User).filter(
        models.User.id == payload.user_id
    ).first()

    if volunteer is None:
        raise HTTPException(status_code=404, detail="User not found")

    if volunteer.role != models.UserRole.VOLUNTEER:
        raise HTTPException(
            status_code=400,
            detail="The selected user is not a Volunteer",
        )

    existing = db.query(models.EventMembership).filter(
        models.EventMembership.event_id == event.id,
        models.EventMembership.user_id == volunteer.id,
    ).first()

    if existing:
        return {
            "message": "Volunteer is already assigned to this event",
            "event_id": event.id,
            "user_id": volunteer.id,
        }

    membership = models.EventMembership(
        event_id=event.id,
        user_id=volunteer.id,
    )

    db.add(membership)
    db.commit()

    return {
        "message": "Volunteer assigned successfully",
        "event_id": event.id,
        "user_id": volunteer.id,
    }



class EventStatusUpdate(BaseModel):
    status: str


@app.put("/events/{event_id}/status")
def update_event_status(
    event_id: str,
    payload: EventStatusUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update event status. Core and assigned Event Heads only."""
    event = require_event_access(event_id, current_user, db)
    if current_user.role not in (models.UserRole.CORE, models.UserRole.EVENT_HEAD):
        raise HTTPException(status_code=403, detail="Only Core and Event Heads can change event status")

    allowed_statuses = {
        "Registrations Open": models.EventStatus.REGISTRATIONS_OPEN,
        "Ongoing": models.EventStatus.ONGOING,
        "Completed": models.EventStatus.COMPLETED,
    }
    new_status = allowed_statuses.get(payload.status)
    if new_status is None:
        raise HTTPException(status_code=400, detail="Invalid event status")

    event.status = new_status
    db.commit()
    db.refresh(event)
    return {"event_id": event.id, "status": event.status.value if hasattr(event.status, "value") else event.status}


@app.get("/events/{event_id}/volunteers")
def list_event_volunteers(
    event_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List volunteers assigned to this event. Only Core and assigned Event Heads."""
    event = require_event_access(event_id, current_user, db)
    if current_user.role not in (models.UserRole.CORE, models.UserRole.EVENT_HEAD):
        raise HTTPException(status_code=403, detail="Only Core and Event Heads can manage event volunteers")

    rows = (
        db.query(models.User)
        .join(models.EventMembership, models.EventMembership.user_id == models.User.id)
        .filter(models.EventMembership.event_id == event.id, models.User.role == models.UserRole.VOLUNTEER)
        .order_by(models.User.name.asc())
        .all()
    )
    return [{"id": user.id, "name": user.name, "email": user.email, "role": user.role.value if hasattr(user.role, "value") else user.role} for user in rows]


@app.delete("/events/{event_id}/volunteers/{user_id}")
def remove_event_volunteer(
    event_id: str,
    user_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a volunteer's membership from an event without deleting their user account."""
    event = require_event_access(event_id, current_user, db)
    if current_user.role not in (models.UserRole.CORE, models.UserRole.EVENT_HEAD):
        raise HTTPException(status_code=403, detail="Only Core and Event Heads can remove event volunteers")

    volunteer = db.query(models.User).filter(models.User.id == user_id).first()
    if volunteer is None:
        raise HTTPException(status_code=404, detail="User not found")
    if volunteer.role != models.UserRole.VOLUNTEER:
        raise HTTPException(status_code=400, detail="The selected user is not a Volunteer")

    membership = db.query(models.EventMembership).filter(
        models.EventMembership.event_id == event.id,
        models.EventMembership.user_id == volunteer.id,
    ).first()
    if membership is None:
        raise HTTPException(status_code=404, detail="Volunteer is not assigned to this event")

    db.delete(membership)
    db.commit()
    return {"message": "Volunteer removed from this event", "event_id": event.id, "user_id": volunteer.id}

@app.post("/events/{event_id}/send-passes")
async def send_event_passes(
    event_id: str,
    payload: EmailPassRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Send QR passes only to participants whose pass email has not already
    been successfully sent. Failed attempts can be retried. A stale "sending"
    claim is recoverable after 15 minutes if a process crashes.
    """
    require_event_access(event_id, current_user, db)

    if current_user.role not in (
        models.UserRole.CORE,
        models.UserRole.EVENT_HEAD,
    ):
        raise HTTPException(
            status_code=403,
            detail="Only Core and assigned Event Heads can perform this action",
        )

    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    participants = (
        db.query(models.Participant)
        .filter(models.Participant.event_id == event_id)
        .order_by(models.Participant.name.asc(), models.Participant.id.asc())
        .all()
    )
    if not participants:
        return {
            "message": "No participants found for this event",
            "total_participants": 0,
            "sent": 0,
            "skipped": 0,
            "failed": 0,
            "mode": "No participants",
        }

    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", 587))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    use_real_smtp = bool(smtp_user and smtp_pass)

    server = None
    if use_real_smtp:
        try:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=30)
            server.starttls()
            server.login(smtp_user, smtp_pass)
        except Exception as exc:
            if server:
                try:
                    server.quit()
                except Exception:
                    pass
            raise HTTPException(
                status_code=500,
                detail=f"SMTP Authentication Failed: {str(exc)}",
            )

    sent_count = 0
    skipped_count = 0
    failed_count = 0
    simulated_count = 0
    now = datetime.utcnow()
    stale_claim_before = now - timedelta(minutes=15)

    try:
        for participant in participants:
            # Persist a stable token before attempting the email.
            if not participant.qr_token:
                participant.qr_token = f"THIRA-{participant.id[:8].upper()}"
                db.commit()

            # Atomic claim: concurrent requests cannot claim the same participant.
            # A stale claim is recoverable if a worker crashed during sending.
            claim = (
                db.query(models.Participant)
                .filter(
                    models.Participant.id == participant.id,
                    models.Participant.event_id == event_id,
                    or_(
                        models.Participant.qr_email_status.in_(["not_sent", "failed"]),
                        and_(
                            models.Participant.qr_email_status == "sending",
                            models.Participant.qr_email_attempted_at < stale_claim_before,
                        ),
                    ),
                )
                .update(
                    {
                        models.Participant.qr_email_status: "sending",
                        models.Participant.qr_email_attempted_at: now,
                        models.Participant.qr_email_last_error: None,
                    },
                    synchronize_session=False,
                )
            )
            db.commit()

            if claim == 0:
                skipped_count += 1
                continue

            # Development mode must not permanently mark a real email as sent.
            if not use_real_smtp or not server:
                db.query(models.Participant).filter(
                    models.Participant.id == participant.id
                ).update(
                    {
                        models.Participant.qr_email_status: "not_sent",
                        models.Participant.qr_email_last_error: None,
                    },
                    synchronize_session=False,
                )
                db.commit()
                simulated_count += 1
                continue

            subject = (
                payload.subject
                .replace("{event_name}", event.name)
                .replace("{name}", participant.name)
            )
            html_content = generate_pass_html(
                participant_name=participant.name,
                event_name=event.name,
                event_date=event.event_date,
                qr_token=participant.qr_token,
                message=payload.custom_message,
            )

            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = f"Thira Cochin Events <{smtp_user}>"
                msg["To"] = participant.email
                msg.attach(MIMEText(html_content, "html"))
                server.sendmail(smtp_user, participant.email, msg.as_string())

                db.query(models.Participant).filter(
                    models.Participant.id == participant.id
                ).update(
                    {
                        models.Participant.qr_email_status: "sent",
                        models.Participant.qr_email_sent_at: datetime.utcnow(),
                        models.Participant.qr_email_last_error: None,
                    },
                    synchronize_session=False,
                )
                db.commit()
                sent_count += 1
            except Exception as exc:
                db.query(models.Participant).filter(
                    models.Participant.id == participant.id
                ).update(
                    {
                        models.Participant.qr_email_status: "failed",
                        models.Participant.qr_email_last_error: str(exc)[:1000],
                    },
                    synchronize_session=False,
                )
                db.commit()
                print(f"Failed to email {participant.email}: {exc}")
                failed_count += 1
    finally:
        if server:
            try:
                server.quit()
            except Exception:
                pass

    return {
        "message": "QR pass email processing completed",
        "total_participants": len(participants),
        "sent": sent_count,
        "skipped": skipped_count,
        "failed": failed_count,
        "simulated": simulated_count,
        "mode": "SMTP Live" if use_real_smtp else "Simulated (configure SMTP_USER and SMTP_PASS for real emails)",
    }


def _announcement_smtp_connection():
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", 587))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    if not (smtp_user and smtp_pass):
        return None, smtp_user
    server = smtplib.SMTP(smtp_host, smtp_port, timeout=30)
    server.starttls()
    server.login(smtp_user, smtp_pass)
    return server, smtp_user


def _send_announcement_message(server, smtp_user, participant, event, subject, message):
    safe_name = html.escape(participant.name or "there")
    safe_event = html.escape(event.name)
    safe_message = html.escape(message).replace("\r\n", "\n").replace("\n", "<br>")
    body = f"""<!doctype html><html><body style="font-family:Arial,sans-serif;background:#fff4e0;color:#2b1206;padding:24px">
    <div style="max-width:600px;margin:auto;background:#ffffff;border:1px solid #e6be86;border-radius:12px;padding:24px">
    <h2 style="color:#c03410">{safe_event}</h2><p>Hi {safe_name},</p><p style="line-height:1.6">{safe_message}</p>
    <p style="font-size:12px;color:#66452d">Thira Cochin Events</p></div></body></html>"""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject.replace("{event_name}", event.name).replace("{name}", participant.name)
    msg["From"] = f"Thira Cochin Events <{smtp_user}>"
    msg["To"] = participant.email
    msg.attach(MIMEText(message, "plain", "utf-8"))
    msg.attach(MIMEText(body, "html", "utf-8"))
    server.sendmail(smtp_user, participant.email, msg.as_string())


@app.post("/events/{event_id}/announcements")
def send_announcement(
    event_id: str,
    payload: AnnouncementRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a separately tracked announcement campaign for an event."""
    event = require_event_access(event_id, current_user, db)
    if current_user.role not in (models.UserRole.CORE, models.UserRole.EVENT_HEAD):
        raise HTTPException(status_code=403, detail="Only Core and assigned Event Heads can send announcements")

    query = db.query(models.Participant).filter(models.Participant.event_id == event_id)
    if payload.recipient_filter == "checked_in":
        query = query.filter(models.Participant.checked_in.is_(True))
    elif payload.recipient_filter == "not_checked_in":
        query = query.filter(or_(models.Participant.checked_in.is_(False), models.Participant.checked_in.is_(None)))
    recipients = query.order_by(models.Participant.name.asc(), models.Participant.id.asc()).all()
    if not recipients:
        return {"message": "No participants match this recipient selection", "campaign_id": None, "total": 0, "sent": 0, "failed": 0, "skipped": 0, "mode": "No recipients"}

    campaign = models.AnnouncementCampaign(
        event_id=event_id, created_by_id=current_user.id,
        subject=payload.subject.strip(), message=payload.message,
        recipient_filter=payload.recipient_filter,
    )
    db.add(campaign)
    db.flush()
    for participant in recipients:
        db.add(models.AnnouncementRecipient(campaign_id=campaign.id, participant_id=participant.id, status="pending"))
    db.commit()
    campaign_id = campaign.id

    try:
        server, smtp_user = _announcement_smtp_connection()
    except Exception as exc:
        db.query(models.AnnouncementRecipient).filter(
            models.AnnouncementRecipient.campaign_id == campaign_id,
            models.AnnouncementRecipient.status == "pending",
        ).update({models.AnnouncementRecipient.status: "failed", models.AnnouncementRecipient.last_error: str(exc)[:1000], models.AnnouncementRecipient.attempted_at: datetime.utcnow()}, synchronize_session=False)
        db.commit()
        return {
            "message": "Announcement campaign saved, but SMTP connection failed. You can retry failed recipients.",
            "campaign_id": campaign_id,
            "total": len(recipients),
            "sent": 0,
            "failed": len(recipients),
            "skipped": 0,
            "simulated": 0,
            "mode": "SMTP Connection Failed",
            "error": str(exc),
        }

    sent = failed = simulated = 0
    try:
        for participant in recipients:
            log = db.query(models.AnnouncementRecipient).filter_by(campaign_id=campaign_id, participant_id=participant.id).first()
            log.attempted_at = datetime.utcnow()
            if not server:
                # Never label a simulated local send as a real delivery.
                log.status = "simulated"
                log.last_error = None
                simulated += 1
            else:
                try:
                    _send_announcement_message(server, smtp_user, participant, event, campaign.subject, campaign.message)
                    log.status = "sent"
                    log.sent_at = datetime.utcnow()
                    log.last_error = None
                    sent += 1
                except Exception as exc:
                    log.status = "failed"
                    log.last_error = str(exc)[:1000]
                    failed += 1
            db.commit()
    finally:
        if server:
            try:
                server.quit()
            except Exception:
                pass
    return {"message": "Announcement processing completed", "campaign_id": campaign_id, "total": len(recipients), "sent": sent, "failed": failed, "skipped": 0, "simulated": simulated, "mode": "SMTP Live" if server else "Simulated (configure SMTP_USER and SMTP_PASS for real emails)"}


@app.post("/events/{event_id}/announcements/{campaign_id}/retry")
def retry_announcement_failures(
    event_id: str,
    campaign_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retry only failed recipients from an existing campaign; successful recipients are never resent."""
    event = require_event_access(event_id, current_user, db)
    if current_user.role not in (models.UserRole.CORE, models.UserRole.EVENT_HEAD):
        raise HTTPException(status_code=403, detail="Only Core and assigned Event Heads can retry announcements")
    campaign = db.query(models.AnnouncementCampaign).filter_by(id=campaign_id, event_id=event_id).first()
    if campaign is None:
        raise HTTPException(status_code=404, detail="Announcement campaign not found")
    logs = db.query(models.AnnouncementRecipient).filter_by(campaign_id=campaign_id, status="failed").all()
    if not logs:
        return {"message": "There are no failed recipients to retry", "campaign_id": campaign_id, "sent": 0, "failed": 0, "skipped": db.query(models.AnnouncementRecipient).filter_by(campaign_id=campaign_id, status="sent").count(), "mode": "No retries needed"}
    try:
        server, smtp_user = _announcement_smtp_connection()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"SMTP connection failed: {str(exc)}")
    if not server:
        return {"message": "SMTP is not configured; no retry was sent", "campaign_id": campaign_id, "sent": 0, "failed": len(logs), "skipped": db.query(models.AnnouncementRecipient).filter_by(campaign_id=campaign_id, status="sent").count(), "mode": "Simulated"}
    sent = failed = 0
    try:
        for log in logs:
            participant = db.query(models.Participant).filter_by(id=log.participant_id, event_id=event_id).first()
            if not participant:
                continue
            log.status = "sending"
            log.attempted_at = datetime.utcnow()
            db.commit()
            try:
                _send_announcement_message(server, smtp_user, participant, event, campaign.subject, campaign.message)
                log.status = "sent"
                log.sent_at = datetime.utcnow()
                log.last_error = None
                sent += 1
            except Exception as exc:
                log.status = "failed"
                log.last_error = str(exc)[:1000]
                failed += 1
            db.commit()
    finally:
        try:
            server.quit()
        except Exception:
            pass
    return {"message": "Announcement retry completed", "campaign_id": campaign_id, "sent": sent, "failed": failed, "skipped": db.query(models.AnnouncementRecipient).filter_by(campaign_id=campaign_id, status="sent").count(), "mode": "SMTP Live"}


class ExpectedParticipantsUpdate(BaseModel):
    expected_participants: int = Field(..., alias="expectedParticipants", ge=0)

    class Config:
        populate_by_name = True


@app.put("/events/{event_id}/expected-participants")
def update_expected_participants(
    event_id: str,
    payload: ExpectedParticipantsUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an event's target count for any user assigned to that event."""
    event = require_event_access(event_id, current_user, db)
    event.expected_participants = payload.expected_participants
    db.commit()
    db.refresh(event)
    return {"event_id": event.id, "expected_participants": event.expected_participants}


@app.get("/events/{event_id}/participants")
def list_event_participants(
    event_id: str,
    q: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List participants for an event, optionally searching name/email.

    All roles may read the list only when they have access to this event.
    QR tokens are intentionally excluded from this response.
    """
    require_event_access(event_id, current_user, db)

    if limit < 1 or limit > 200:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 200")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset cannot be negative")

    query = db.query(models.Participant).filter(
        models.Participant.event_id == event_id
    )

    search_term = (q or "").strip()
    if search_term:
        pattern = f"%{search_term}%"
        query = query.filter(
            or_(
                models.Participant.name.ilike(pattern),
                models.Participant.email.ilike(pattern),
            )
        )

    total = query.count()
    participants = query.order_by(
        models.Participant.name.asc(), models.Participant.id.asc()
    ).offset(offset).limit(limit).all()

    return {
        "event_id": event_id,
        "total": total,
        "limit": limit,
        "offset": offset,
        "participants": [
            {
                "id": participant.id,
                "name": participant.name,
                "email": participant.email,
                "phone": participant.phone,
                "checked_in": bool(participant.checked_in),
                "checked_in_at": (
                    participant.checked_in_at.isoformat()
                    if participant.checked_in_at else None
                ),
            }
            for participant in participants
        ],
    }


@app.get("/events/{event_id}/stats")
def get_event_stats(
    event_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return current registration and attendance counts for an authorized event."""
    require_event_access(event_id, current_user, db)

    registered_count = db.query(models.Participant).filter(
        models.Participant.event_id == event_id
    ).count()
    checked_in_count = db.query(models.Participant).filter(
        models.Participant.event_id == event_id,
        models.Participant.checked_in.is_(True),
    ).count()

    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    expected_count = (event.expected_participants or 0) if event else 0
    return {
        "event_id": event_id,
        "registered_count": registered_count,
        "expected_count": expected_count,
        "registration_difference": registered_count - expected_count,
        "checked_in_count": checked_in_count,
        "not_checked_in_count": registered_count - checked_in_count,
        "attendance_rate": round((checked_in_count / registered_count) * 100, 1) if registered_count else 0,
    }


@app.post("/events/{event_id}/participants/{participant_id}/manual-check-in")
def manual_check_in_participant(
    event_id: str,
    participant_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Check in a selected participant without requiring their QR token."""
    require_event_access(event_id, current_user, db)

    participant = db.query(models.Participant).filter(
        models.Participant.id == participant_id,
        models.Participant.event_id == event_id,
    ).first()
    if participant is None:
        raise HTTPException(
            status_code=404,
            detail="Participant not found for this event",
        )

    # Match the QR flow's conditional update so concurrent check-ins cannot
    # record the same participant twice.
    checked_in_at = datetime.utcnow()
    result = db.query(models.Participant).filter(
        models.Participant.id == participant_id,
        models.Participant.event_id == event_id,
        or_(
            models.Participant.checked_in.is_(False),
            models.Participant.checked_in.is_(None),
        ),
    ).update(
        {
            models.Participant.checked_in: True,
            models.Participant.checked_in_at: checked_in_at,
            models.Participant.checked_in_by_id: current_user.id,
        },
        synchronize_session=False,
    )
    db.commit()
    db.refresh(participant)

    participant_details = {
        "id": participant.id,
        "name": participant.name,
        "email": participant.email,
        "checked_in": bool(participant.checked_in),
        "checked_in_at": (
            participant.checked_in_at.isoformat()
            if participant.checked_in_at else None
        ),
    }

    if result == 0:
        return {
            "status": "already_checked_in",
            "message": f"{participant.name} was already checked in.",
            "participant": participant_details,
        }

    return {
        "status": "success",
        "message": f"Manual check-in successful for {participant.name}.",
        "participant": participant_details,
    }


@app.post("/events/{event_id}/verify-pass")
def verify_participant_pass(
    event_id: str,
    payload: CheckInRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Validate a pass and return minimal participant details without checking them in."""
    require_event_access(event_id, current_user, db)

    token = payload.qr_token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="QR pass token cannot be empty")

    participant = db.query(models.Participant).filter(
        models.Participant.event_id == event_id,
        models.Participant.qr_token == token,
    ).first()
    if participant is None:
        raise HTTPException(
            status_code=404,
            detail="Invalid QR pass token. Participant not found for this event.",
        )

    return {
        "status": "verified",
        "participant": {
            "id": participant.id,
            "name": participant.name,
            "email": participant.email,
            "checked_in": bool(participant.checked_in),
            "checked_in_at": (
                participant.checked_in_at.isoformat()
                if participant.checked_in_at else None
            ),
        },
    }


@app.post("/events/{event_id}/check-in")
def check_in_participant(
    event_id: str,
    payload: CheckInRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # RBAC: Volunteers and Event Heads (and Core) can perform gate check-ins
    require_event_access(event_id, current_user, db)

    token = payload.qr_token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="QR pass token cannot be empty")

    participant = db.query(models.Participant).filter(
        models.Participant.event_id == event_id,
        models.Participant.qr_token == token,
    ).first()

    if participant is None:
        raise HTTPException(
            status_code=404,
            detail="Invalid QR Pass Token. Participant not found for this event.",
        )

    # Conditional UPDATE makes the check-in atomic: only one concurrent request
    # can change a participant from not checked in to checked in.
    checked_in_at = datetime.utcnow()
    result = db.query(models.Participant).filter(
        models.Participant.id == participant.id,
        or_(
            models.Participant.checked_in.is_(False),
            models.Participant.checked_in.is_(None),
        ),
    ).update(
        {
            models.Participant.checked_in: True,
            models.Participant.checked_in_at: checked_in_at,
            models.Participant.checked_in_by_id: current_user.id,
        },
        synchronize_session=False,
    )
    db.commit()
    db.refresh(participant)

    if result == 0:
        return {
            "status": "already_checked_in",
            "message": f"Warning: {participant.name} was already checked in!",
            "participant": {
                "name": participant.name,
                "email": participant.email,
                "checked_in_at": (
                    participant.checked_in_at.isoformat()
                    if participant.checked_in_at else None
                ),
            },
        }

    return {
        "status": "success",
        "message": f"Check-in successful for {participant.name}!",
        "participant": {
            "name": participant.name,
            "email": participant.email,
            "checked_in_at": (
                participant.checked_in_at.isoformat()
                if participant.checked_in_at else checked_in_at.isoformat()
            ),
        },
    }



@app.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = str(payload.email).strip().lower()

    user = db.query(models.User).filter(
        models.User.email == email
    ).first()

    if user is not None and not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account invitation has not been completed. Open the invitation email to set your password.",
        )

    if not user or not verify_password(
        user.hashed_password, payload.password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(user.id)

    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 1800,
    }


@app.get("/auth/me", response_model=CurrentUserResponse)
def get_me(
    current_user: models.User = Depends(get_current_user),
):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role.value,
    }
