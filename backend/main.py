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
import binascii
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
from datetime import datetime
from urllib.parse import quote
from sqlalchemy import or_, update
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

# --- Helper function for HTML Email generation ---
def generate_pass_html(participant_name: str, event_name: str, event_date: str, qr_token: str, message: str) -> str:
    # Uses QuickChart API to render a live embedded QR code image from the unique QR token
    safe_qr_token = quote(qr_token, safe="")
    qr_image_url = f"https://quickchart.io/qr?text={safe_qr_token}&size=200&margin=2"
    safe_event_name = html.escape(event_name)
    safe_event_date = html.escape(event_date)
    safe_qr_token_text = html.escape(qr_token)
    safe_message = html.escape(message or "").replace("\\n", "<br>")
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 20px; }}
            .card {{ max-width: 480px; margin: 0 auto; background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 24px; text-align: center; }}
            .brand {{ color: #818cf8; font-size: 20px; font-weight: bold; margin-bottom: 8px; }}
            .title {{ font-size: 22px; font-weight: bold; color: #ffffff; margin-bottom: 4px; }}
            .date {{ color: #94a3b8; font-size: 14px; margin-bottom: 20px; }}
            .msg {{ font-size: 14px; color: #cbd5e1; line-height: 1.5; text-align: left; background: #0f172a; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; }}
            .qr-box {{ background: #ffffff; padding: 16px; border-radius: 12px; display: inline-block; margin-bottom: 12px; }}
            .token {{ font-family: monospace; font-size: 16px; letter-spacing: 2px; color: #818cf8; font-weight: bold; }}
            .footer {{ font-size: 11px; color: #64748b; margin-top: 24px; }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="brand">thira-cochin</div>
            <div class="title">{safe_event_name}</div>
            <div class="date">📅 {safe_event_date}</div>
            
            <p class="msg">{safe_message}</p>
            
            <div class="qr-box">
                <img src="{qr_image_url}" alt="Entry QR Code" width="180" height="180" />
            </div>
            
            <div class="token">PASS TOKEN: {safe_qr_token_text}</div>
            <p style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Show this QR code or token to volunteers at gate entry.</p>
            
            <div class="footer">
                This is an automated pass issued by dashboard.thira-cochin.in
            </div>
        </div>
    </body>
    </html>
    """

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

    class Config:
        populate_by_name = True

class EventResponse(BaseModel):
    id: str
    name: str
    event_date: str
    event_head_1: Optional[str] = None
    event_head_2: Optional[str] = None
    status: str
    created_at: str

    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: models.UserRole  # "Core", "Event Head", or "Volunteer"

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: str
    created_at: str

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
            if not re.fullmatch(r"[^\\s@]+@[^\\s@]+\\.[^\\s@]+", email):
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
    current_user: models.User = Depends(
        require_roles(models.UserRole.CORE)
    ),
):
    users = db.query(models.User).order_by(
        models.User.created_at.desc()
    ).all()

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
        }
        for user in users
    ]

@app.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user: UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles(models.UserRole.CORE)
    ),
):
    # RBAC Rules for User Creation:
    # 1. Core can create Core or Event Head (and Volunteers).
    # 2. Event Head can ONLY create Volunteers.
    # 3. Volunteers cannot create users.
    
    target_role = user.role.value if hasattr(user.role, 'value') else user.role

    
    # Check if email already exists
    existing_user = db.query(models.User).filter(models.User.email == user.email.lower()).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists.")

    db_user = models.User(
        name=user.name,
        email=user.email.lower(),
        hashed_password=hash_password(user.password),
        role=user.role
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    return {
        "id": db_user.id,
        "name": db_user.name,
        "email": db_user.email,
        "role": db_user.role.value if hasattr(db_user.role, 'value') else db_user.role,
        "created_at": db_user.created_at.strftime("%Y-%m-%d")
    }


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


@app.post("/events/{event_id}/send-passes")
async def send_event_passes(
    event_id: str,
    payload: EmailPassRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # RBAC: Core & Event Heads can send emails
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

    participants = db.query(models.Participant).filter(models.Participant.event_id == event_id).all()
    if not participants:
        return {"message": "No participants found for this event", "sent": 0}

    # Retrieve SMTP credentials from environment variables (or fallback mock mode)
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", 587))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")

    sent_count = 0
    failed_count = 0

    # Real SMTP connection if configured, else simulation log
    use_real_smtp = bool(smtp_user and smtp_pass)

    server = None
    if use_real_smtp:
        try:
            server = smtplib.SMTP(smtp_host, smtp_port)
            server.starttls()
            server.login(smtp_user, smtp_pass)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"SMTP Authentication Failed: {str(e)}")

    for participant in participants:
        # Generate token if not already generated
        token = participant.qr_token or f"THIRA-{participant.id[:8].upper()}"
        if not participant.qr_token:
            participant.qr_token = token

        subject = payload.subject.replace("{event_name}", event.name).replace("{name}", participant.name)
        html_content = generate_pass_html(
            participant_name=participant.name,
            event_name=event.name,
            event_date=event.event_date,
            qr_token=token,
            message=payload.custom_message
        )

        if use_real_smtp and server:
            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = f"Thira Cochin Events <{smtp_user}>"
                msg["To"] = participant.email
                msg.attach(MIMEText(html_content, "html"))
                
                server.sendmail(smtp_user, participant.email, msg.as_string())
                sent_count += 1
            except Exception as err:
                print(f"Failed to email {participant.email}: {err}")
                failed_count += 1
        else:
            # Simulated send mode for local dev testing
            sent_count += 1

    if server:
        server.quit()

    db.commit()

    return {
        "message": "Email passes processed successfully",
        "total_participants": len(participants),
        "sent": sent_count,
        "failed": failed_count,
        "mode": "SMTP Live" if use_real_smtp else "Simulated (Configure SMTP_USER & SMTP_PASS in .env for real emails)"
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
