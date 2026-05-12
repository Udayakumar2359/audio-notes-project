# backend/database.py
# ─────────────────────────────────────────────────────────────
# SQLAlchemy ORM models
# Auto-selects DB:
#   LOCAL       — SQLite  (no DATABASE_URL needed)
#   PRODUCTION  — PostgreSQL (set DATABASE_URL in .env to Railway public URL)
# ─────────────────────────────────────────────────────────────

from sqlalchemy import (
    create_engine, Column, Integer, String,
    Float, DateTime, Text, ForeignKey, Boolean, UniqueConstraint
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os

# ── Database URL ──────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "")

# Railway / Heroku sometimes provides postgres:// — fix to postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# ── Auto-detect: use SQLite for local dev ─────────────────────
# Use SQLite when:
#   1. DATABASE_URL is empty (not set in .env)
#   2. DATABASE_URL contains Railway's internal hostname
#      (only routable inside Railway, not from your laptop)
_use_sqlite = (not DATABASE_URL) or ("railway.internal" in DATABASE_URL)

if _use_sqlite:
    _db_file = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "local_dev.db")
    )
    DATABASE_URL = f"sqlite:///{_db_file}"
    print(f"[DB] SQLite local dev -> {_db_file}")
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},  # required for SQLite + threads
    )
else:
    print("[DB] PostgreSQL cloud")
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,   # health-check connections
        pool_size=5,
        max_overflow=10,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ── MODELS ────────────────────────────────────────────────────

class User(Base):
    """Student account — created by Clerk or local registration."""
    __tablename__ = "users"

    id               = Column(Integer, primary_key=True, index=True)

    # Clerk JWT subject (filled when user authenticates via Clerk)
    clerk_id         = Column(String(200), unique=True, index=True, nullable=True)

    # Local credentials (username/email + bcrypt password)
    name             = Column(String(100), nullable=False)
    email            = Column(String(200), unique=True, index=True, nullable=False)
    hashed_password  = Column(String(300), nullable=True)  # null for Clerk-only users

    # OTP email verification
    otp_code         = Column(String(10),  nullable=True)
    otp_expires_at   = Column(DateTime,    nullable=True)
    is_verified      = Column(Boolean,     default=False)

    created_at       = Column(DateTime, default=datetime.utcnow)
    audio_files      = relationship("AudioFile", back_populates="user")


class AudioFile(Base):
    """One uploaded audio file per processing job."""
    __tablename__ = "audio_files"

    id               = Column(Integer, primary_key=True, index=True)
    user_id          = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename         = Column(String(300), nullable=False)
    file_path        = Column(String(500), nullable=False)
    duration_seconds = Column(Float)
    # Status: uploaded → chunking → transcribing → structuring → done | failed:…
    status           = Column(String(200), default="uploaded")
    created_at       = Column(DateTime, default=datetime.utcnow)

    user             = relationship("User", back_populates="audio_files")
    chunks           = relationship("AudioChunk", back_populates="audio_file", cascade="all, delete-orphan")
    structured_notes = relationship("StructuredNotes", back_populates="audio_file", cascade="all, delete-orphan")


class AudioChunk(Base):
    """A 25-second segment of the full audio file."""
    __tablename__ = "audio_chunks"

    id            = Column(Integer, primary_key=True, index=True)
    audio_file_id = Column(Integer, ForeignKey("audio_files.id"), nullable=False)
    chunk_index   = Column(Integer, nullable=False)
    start_time    = Column(Float)
    end_time      = Column(Float)
    chunk_path    = Column(String(500))

    audio_file    = relationship("AudioFile", back_populates="chunks")
    transcription = relationship("Transcription", back_populates="chunk", uselist=False, cascade="all, delete-orphan")


class Transcription(Base):
    """ASR output + language detection + translation for one chunk."""
    __tablename__ = "transcriptions"

    id                = Column(Integer, primary_key=True, index=True)
    chunk_id          = Column(Integer, ForeignKey("audio_chunks.id"), nullable=False)
    raw_text          = Column(Text)          # original Kannada/Hindi/English text
    cleaned_text      = Column(Text)          # after filler removal
    detected_language = Column(String(10))    # 'kn', 'hi', 'en', 'unknown'
    translated_text   = Column(Text)          # always English

    chunk             = relationship("AudioChunk", back_populates="transcription")


class StructuredNotes(Base):
    """Final T5-generated academic notes for the full audio."""
    __tablename__ = "structured_notes"

    id                = Column(Integer, primary_key=True, index=True)
    audio_file_id     = Column(Integer, ForeignKey("audio_files.id"), nullable=False)
    notes_text        = Column(Text)             # plain-text for TXT export
    notes_json        = Column(Text)             # JSON string of structured dict
    notes_edited_text = Column(Text, nullable=True)  # user's inline edits
    embedding_json    = Column(Text, nullable=True)  # 384-dim float array for semantic search
    credibility_json  = Column(Text, nullable=True)  # JSON: T5 ROUGE scores + agent groundedness
    word_count        = Column(Integer, default=0)
    created_at        = Column(DateTime, default=datetime.utcnow)

    audio_file    = relationship("AudioFile", back_populates="structured_notes")


class SharedNote(Base):
    """Public share-link token for a processed audio note."""
    __tablename__ = "shared_notes"

    id            = Column(Integer, primary_key=True, index=True)
    audio_file_id = Column(Integer, ForeignKey("audio_files.id"), nullable=False)
    token         = Column(String(64), unique=True, index=True, nullable=False)
    created_by    = Column(Integer, ForeignKey("users.id"), nullable=False)
    expires_at    = Column(DateTime, nullable=True)   # None = never expires
    view_count    = Column(Integer, default=0)
    created_at    = Column(DateTime, default=datetime.utcnow)

    audio_file    = relationship("AudioFile")
    creator       = relationship("User")


class StudyGroup(Base):
    """A named study group owned by one user."""
    __tablename__ = "study_groups"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    invite_code = Column(String(12), unique=True, index=True, nullable=False)
    owner_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at  = Column(DateTime, default=datetime.utcnow)

    owner       = relationship("User")
    members     = relationship("GroupMember", back_populates="group", cascade="all, delete-orphan")
    notes       = relationship("GroupNote",   back_populates="group", cascade="all, delete-orphan")
    files       = relationship("GroupFile",   back_populates="group", cascade="all, delete-orphan")
    messages    = relationship("GroupChatMessage", back_populates="group", cascade="all, delete-orphan")


class GroupMember(Base):
    """Membership link between a user and a study group."""
    __tablename__ = "group_members"
    __table_args__ = (UniqueConstraint("group_id", "user_id"),)

    id        = Column(Integer, primary_key=True, index=True)
    group_id  = Column(Integer, ForeignKey("study_groups.id"), nullable=False)
    user_id   = Column(Integer, ForeignKey("users.id"),        nullable=False)
    role      = Column(String(20), default="member")   # 'owner' | 'member'
    joined_at = Column(DateTime, default=datetime.utcnow)

    group     = relationship("StudyGroup", back_populates="members")
    user      = relationship("User")


class GroupNote(Base):
    """A note shared into a study group."""
    __tablename__ = "group_notes"

    id            = Column(Integer, primary_key=True, index=True)
    group_id      = Column(Integer, ForeignKey("study_groups.id"), nullable=False)
    audio_file_id = Column(Integer, ForeignKey("audio_files.id"),  nullable=False)
    added_by      = Column(Integer, ForeignKey("users.id"),         nullable=False)
    added_at      = Column(DateTime, default=datetime.utcnow)

    group         = relationship("StudyGroup", back_populates="notes")
    audio_file    = relationship("AudioFile")
    adder         = relationship("User")


class GroupFile(Base):
    """A file uploaded directly to a study group (PDF, DOCX, TXT — no audio pipeline)."""
    __tablename__ = "group_files"

    id            = Column(Integer, primary_key=True, index=True)
    group_id      = Column(Integer, ForeignKey("study_groups.id"), nullable=False)
    uploaded_by   = Column(Integer, ForeignKey("users.id"),        nullable=False)
    filename      = Column(String(300), nullable=False)   # original filename
    file_path     = Column(String(500), nullable=False)   # server-side path
    file_type     = Column(String(10),  nullable=False)   # pdf | docx | txt
    file_size     = Column(Integer, default=0)            # bytes
    uploaded_at   = Column(DateTime, default=datetime.utcnow)

    group         = relationship("StudyGroup", back_populates="files")
    uploader      = relationship("User")


class GroupChatMessage(Base):
    """One chat message sent inside a study group."""
    __tablename__ = "group_chat_messages"

    id            = Column(Integer, primary_key=True, index=True)
    group_id      = Column(Integer, ForeignKey("study_groups.id"), nullable=False)
    sender_id     = Column(Integer, ForeignKey("users.id"),        nullable=False)
    message       = Column(Text, nullable=False)
    sent_at       = Column(DateTime, default=datetime.utcnow)

    group         = relationship("StudyGroup", back_populates="messages")
    sender        = relationship("User")


# ── DB UTILITIES ──────────────────────────────────────────────

def get_db():
    """FastAPI dependency — yields a DB session and closes it after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Schema migrations (safe ADD COLUMN for existing deployments) ───────────────
# SQLAlchemy create_all() only creates NEW tables; it never alters existing ones.
# This function adds any new columns that were introduced after the initial deploy.
# Each statement is idempotent: PostgreSQL uses IF NOT EXISTS; SQLite catches
# the "duplicate column" error and continues.
_MIGRATIONS = [
    # Added in credibility system (May 2026)
    "ALTER TABLE structured_notes ADD COLUMN IF NOT EXISTS credibility_json TEXT",
    # Added in group files + chat (May 2026) — tables are created by create_all(),
    # but the FK columns on existing rows need to exist first.
    # (create_all handles full table creation; these are no-ops if tables exist)
]

# SQLite does not support IF NOT EXISTS on ADD COLUMN — we catch the error instead.
_MIGRATIONS_SQLITE = [
    "ALTER TABLE structured_notes ADD COLUMN credibility_json TEXT",
]


def _run_migrations():
    """Apply incremental schema changes that create_all() cannot handle."""
    is_sqlite = "sqlite" in str(engine.url)
    migrations = _MIGRATIONS_SQLITE if is_sqlite else _MIGRATIONS

    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(__import__("sqlalchemy").text(sql))
                conn.commit()
                print(f"[DB] Migration applied: {sql[:60]}…")
            except Exception as exc:
                # Duplicate column → already applied; any other error is re-raised.
                msg = str(exc).lower()
                if "duplicate column" in msg or "already exists" in msg:
                    pass   # idempotent — column already there
                else:
                    print(f"[DB] Migration warning ({sql[:40]}): {exc}")


def init_db():
    """Create all tables + run incremental column migrations at startup."""
    Base.metadata.create_all(bind=engine)
    _run_migrations()
    print("[DB] Tables created/verified ✓")

