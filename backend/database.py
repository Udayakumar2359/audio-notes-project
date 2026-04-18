# backend/database.py
# ─────────────────────────────────────────────────────────────
# SQLAlchemy ORM models
# Auto-selects DB:
#   LOCAL       — SQLite  (no DATABASE_URL needed)
#   PRODUCTION  — PostgreSQL (set DATABASE_URL in .env to Railway public URL)
# ─────────────────────────────────────────────────────────────

from sqlalchemy import (
    create_engine, Column, Integer, String,
    Float, DateTime, Text, ForeignKey, Boolean
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

    id            = Column(Integer, primary_key=True, index=True)
    audio_file_id = Column(Integer, ForeignKey("audio_files.id"), nullable=False)
    notes_text    = Column(Text)             # plain-text for TXT export
    notes_json    = Column(Text)             # JSON string of structured dict
    word_count    = Column(Integer, default=0)
    created_at    = Column(DateTime, default=datetime.utcnow)

    audio_file    = relationship("AudioFile", back_populates="structured_notes")


# ── DB UTILITIES ──────────────────────────────────────────────

def get_db():
    """FastAPI dependency — yields a DB session and closes it after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables (called once at app startup)."""
    Base.metadata.create_all(bind=engine)
    print("[DB] Tables created/verified ✓")
