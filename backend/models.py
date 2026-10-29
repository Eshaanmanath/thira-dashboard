import enum
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Enum, UniqueConstraint, Integer
from sqlalchemy.orm import relationship
from database import Base

class UserRole(str, enum.Enum):
    CORE = "Core"
    EVENT_HEAD = "Event Head"
    VOLUNTEER = "Volunteer"

class EventStatus(str, enum.Enum):
    REGISTRATIONS_OPEN = "Registrations Open"
    ONGOING = "Ongoing"
    COMPLETED = "Completed"

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.VOLUNTEER, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Existing accounts stay active; invitation-created accounts remain inactive until setup.
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    invitation_token_hash = Column(String(64), nullable=True, unique=True, index=True)
    invitation_expires_at = Column(DateTime, nullable=True)

    checked_in_participants = relationship("Participant", back_populates="checked_in_by_volunteer")

class Event(Base):
    __tablename__ = "events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    event_date = Column(String, nullable=False)
    status = Column(Enum(EventStatus), default=EventStatus.REGISTRATIONS_OPEN, nullable=False)
    
    # Event Heads (Foreign keys to User)
    event_head_1 = Column(String, nullable=True) # Name/Email or User ID of Event Head 1
    event_head_2 = Column(String, nullable=True) # Name/Email or User ID of Event Head 2
    expected_participants = Column(Integer, nullable=False, default=0, server_default="0")

    created_at = Column(DateTime, default=datetime.utcnow)

    participants = relationship("Participant", back_populates="event", cascade="all, delete-orphan")


class EventMembership(Base):
    __tablename__ = "event_memberships"

    __table_args__ = (
        UniqueConstraint(
            "event_id",
            "user_id",
            name="uq_event_membership",
        ),
    )

    id = Column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    event_id = Column(
        String,
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_id = Column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    created_at = Column(DateTime, default=datetime.utcnow)

    event = relationship("Event")
    user = relationship("User")


class Participant(Base):
    __tablename__ = "participants"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    event_id = Column(String, ForeignKey("events.id"), nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, index=True)
    phone = Column(String, nullable=True)
    qr_token = Column(String, unique=True, index=True, default=lambda: f"THIRA-{uuid.uuid4().hex[:8].upper()}")
    # QR-pass email state is independent from announcements.
    # "sent" records successful SMTP handoff; "failed" can be retried.
    qr_email_status = Column(String(20), nullable=False, default="not_sent", server_default="not_sent")
    qr_email_attempted_at = Column(DateTime, nullable=True)
    qr_email_sent_at = Column(DateTime, nullable=True)
    qr_email_last_error = Column(String(1000), nullable=True)
    
    checked_in = Column(Boolean, default=False)
    checked_in_at = Column(DateTime, nullable=True)
    checked_in_by_id = Column(String, ForeignKey("users.id"), nullable=True)

    event = relationship("Event", back_populates="participants")
    checked_in_by_volunteer = relationship("User", back_populates="checked_in_participants")

class AnnouncementCampaign(Base):
    __tablename__ = "announcement_campaigns"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    event_id = Column(String, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by_id = Column(String, ForeignKey("users.id"), nullable=True)
    subject = Column(String(255), nullable=False)
    message = Column(String, nullable=False)
    recipient_filter = Column(String(30), nullable=False, default="all")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class AnnouncementRecipient(Base):
    __tablename__ = "announcement_recipients"
    __table_args__ = (UniqueConstraint("campaign_id", "participant_id", name="uq_announcement_campaign_participant"),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id = Column(String, ForeignKey("announcement_campaigns.id", ondelete="CASCADE"), nullable=False, index=True)
    participant_id = Column(String, ForeignKey("participants.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="pending", server_default="pending")
    attempted_at = Column(DateTime, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    last_error = Column(String(1000), nullable=True)
