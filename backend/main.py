# backend/main.py
# ─────────────────────────────────────────────────────────────
# AudioNotes AI — FastAPI Application (Production)
#
# Auth:      Clerk JWT  +  local email/password + OTP
# DB:        PostgreSQL (Railway / Supabase)
# Pipeline:  Whisper ASR → clean → translate → T5 notes
# Export:    /audio/{id}/download?format=txt|docx|pdf
# ─────────────────────────────────────────────────────────────

import os
import json
import shutil
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import (
    FastAPI, Depends, HTTPException, UploadFile,
    File, BackgroundTasks, status as http_status, Query
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session
from dotenv import load_dotenv

load_dotenv()

# ── App-local imports ─────────────────────────────────────────
from database import (
    get_db, init_db,
    User, AudioFile, AudioChunk, Transcription, StructuredNotes
)
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, generate_otp, send_otp_email,
    OTP_EXPIRE_MINUTES
)

# ── Environment ───────────────────────────────────────────────
UPLOAD_DIR     = os.getenv("UPLOAD_DIR", "uploads")
WHISPER_ID     = os.getenv("WHISPER_MODEL_ID",   "udayakumar8214/whisper-classroom-kn-hi-en")
T5_ID          = os.getenv("T5_MODEL_ID",         "udayakumar8214/t5-lecture-notes")
TRANS_ID       = os.getenv("TRANSLATION_MODEL",   "Helsinki-NLP/opus-mt-mul-en")
FRONTEND_URL   = os.getenv("FRONTEND_URL",         "http://localhost:5173")

ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".flac", ".webm", ".aac"}

# ─────────────────────────────────────────────────────────────
#  Lifespan — Init DB + load ML models on startup
# ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────
    init_db()
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    print(f"[Startup] Loading ML models from HuggingFace…")
    print(f"  Whisper : {WHISPER_ID}")
    print(f"  T5      : {T5_ID}")
    print(f"  Trans   : {TRANS_ID}")

    from ml.transcriber     import Transcriber
    from ml.note_structurer import NoteStructurer

    app.state.transcriber = Transcriber(WHISPER_ID, TRANS_ID)
    app.state.structurer  = NoteStructurer(T5_ID)
    print("[Startup] All models loaded ✓  Server ready!")

    yield   # app runs here while serving requests


# ─────────────────────────────────────────────────────────────
#  FastAPI App
# ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="AudioNotes AI API",
    description="Multilingual Lecture Audio → Structured Academic Notes",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_URL,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────
#  Pydantic Schemas
# ─────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    name:     str
    email:    str
    password: str

class OtpRequest(BaseModel):
    email: str

class OtpVerify(BaseModel):
    email: str
    otp:   str

class Token(BaseModel):
    access_token: str
    token_type:   str
    user:         dict

class UserOut(BaseModel):
    id:          int
    name:        str
    email:       str
    is_verified: bool
    created_at:  datetime

    model_config = {"from_attributes": True}

class ResetPasswordPayload(BaseModel):
    current_password: str
    new_password:     str


# ─────────────────────────────────────────────────────────────
#  AUTH ROUTES
# ─────────────────────────────────────────────────────────────

@app.post("/auth/register", status_code=201, tags=["Auth"])
def register(payload: UserCreate, db: Session = Depends(get_db)):
    """
    Step 1 of registration:
    Create account with name + email + password → send 6-digit OTP.
    Account cannot log in until OTP is verified via /auth/verify-otp.
    """
    email = payload.email.strip().lower()

    if not payload.name.strip():
        raise HTTPException(400, "Name is required.")
    if len(payload.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")

    existing = db.query(User).filter(User.email == email).first()

    # Already registered but unverified — resend OTP
    if existing and not existing.is_verified:
        otp = generate_otp()
        existing.otp_code       = otp
        existing.otp_expires_at = datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MINUTES)
        existing.hashed_password = hash_password(payload.password)  # update pw in case they changed it
        existing.name            = payload.name.strip()
        db.commit()
        send_otp_email(email, otp, existing.name, purpose="verification")
        return {
            "message": f"Account exists but not verified. A new OTP has been sent to {email}.",
            "next":    "POST /auth/verify-otp",
        }

    if existing and existing.is_verified:
        raise HTTPException(400, "Email is already registered. Please log in.")

    otp      = generate_otp()
    new_user = User(
        name            = payload.name.strip(),
        email           = email,
        hashed_password = hash_password(payload.password),
        otp_code        = otp,
        otp_expires_at  = datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MINUTES),
        is_verified     = False,
    )
    db.add(new_user)
    db.commit()

    send_otp_email(email, otp, payload.name.strip(), purpose="verification")
    return {
        "message": f"Account created! A 6-digit OTP has been sent to {email}.",
        "next":    "POST /auth/verify-otp",
    }


@app.post("/auth/verify-otp", tags=["Auth"])
def verify_otp(payload: OtpVerify, db: Session = Depends(get_db)):
    """
    Step 2 of registration:
    Verify OTP → mark account as verified → return JWT so user is logged in immediately.
    """
    email = payload.email.strip().lower()
    user  = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(404, "Email not found.")
    if user.is_verified:
        # Already verified — just log them in
        token = create_access_token({"sub": user.email})
        return {
            "message":      "Account already verified.",
            "verified":     True,
            "access_token": token,
            "token_type":   "bearer",
            "user":         {"id": user.id, "name": user.name, "email": user.email},
        }
    if not user.otp_code or user.otp_code != payload.otp:
        raise HTTPException(400, "Invalid OTP code. Please check and try again.")
    if user.otp_expires_at and datetime.utcnow() > user.otp_expires_at:
        raise HTTPException(400, "OTP expired. Click Resend to get a new code.")

    user.is_verified    = True
    user.otp_code       = None
    user.otp_expires_at = None
    db.commit()

    # Issue JWT immediately after registration verification
    token = create_access_token({"sub": user.email})
    return {
        "message":      "Email verified! Welcome to AudioNotes AI.",
        "verified":     True,
        "access_token": token,
        "token_type":   "bearer",
        "user":         {"id": user.id, "name": user.name, "email": user.email},
    }


@app.post("/auth/send-otp", tags=["Auth"])
def send_otp_route(payload: OtpRequest, db: Session = Depends(get_db)):
    """Resend registration OTP to unverified account."""
    email = payload.email.strip().lower()
    user  = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(404, "Email not found.")
    if user.is_verified:
        raise HTTPException(400, "Account is already verified. Please log in.")

    otp                 = generate_otp()
    user.otp_code       = otp
    user.otp_expires_at = datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MINUTES)
    db.commit()

    send_otp_email(email, otp, user.name, purpose="verification")
    return {"message": "OTP resent. Check your inbox (and Spam folder)."}


@app.post("/auth/login", tags=["Auth"])
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db:   Session = Depends(get_db),
):
    """
    Step 1 of login:
    Verify email + password → send 6-digit login OTP to email.
    Complete login via POST /auth/verify-login-otp.
    """
    email = form.username.strip().lower()
    user  = db.query(User).filter(User.email == email).first()

    if not user or not user.hashed_password:
        raise HTTPException(
            http_status.HTTP_401_UNAUTHORIZED,
            "Incorrect email or password.",
        )
    if not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            http_status.HTTP_401_UNAUTHORIZED,
            "Incorrect email or password.",
        )
    if not user.is_verified:
        raise HTTPException(
            http_status.HTTP_403_FORBIDDEN,
            "Email not verified. Please complete registration first.",
        )

    # Correct credentials → send login OTP
    otp                 = generate_otp()
    user.otp_code       = otp
    user.otp_expires_at = datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MINUTES)
    db.commit()

    send_otp_email(email, otp, user.name, purpose="login")

    return {
        "message": f"A login verification code has been sent to {email}.",
        "next":    "POST /auth/verify-login-otp",
        "email":   email,
    }


@app.post("/auth/verify-login-otp", response_model=Token, tags=["Auth"])
def verify_login_otp(payload: OtpVerify, db: Session = Depends(get_db)):
    """
    Step 2 of login:
    Verify login OTP → return JWT → user lands on dashboard.
    """
    email = payload.email.strip().lower()
    user  = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(404, "Email not found.")
    if not user.otp_code or user.otp_code != payload.otp:
        raise HTTPException(400, "Invalid login code. Please check and try again.")
    if user.otp_expires_at and datetime.utcnow() > user.otp_expires_at:
        raise HTTPException(400, "Code expired. Please log in again to get a new code.")

    user.otp_code       = None
    user.otp_expires_at = None
    db.commit()

    token = create_access_token({"sub": user.email})
    return {
        "access_token": token,
        "token_type":   "bearer",
        "user":         {"id": user.id, "name": user.name, "email": user.email},
    }


@app.get("/auth/me", response_model=UserOut, tags=["Auth"])
def me(current_user: User = Depends(get_current_user)):
    return current_user


@app.post("/auth/reset-password", tags=["Auth"])
def reset_password(
    payload:      ResetPasswordPayload,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """Change password (requires current password)."""
    if not current_user.hashed_password:
        raise HTTPException(400, "No password set on this account.")
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(400, "Current password is incorrect.")
    if len(payload.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters.")
    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password updated successfully."}


@app.post("/auth/send-password-change-otp", tags=["Auth"])
def send_password_change_otp(
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """Logged-in user: send OTP to their email to authorize a password change."""
    otp                         = generate_otp()
    current_user.otp_code       = otp
    current_user.otp_expires_at = datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MINUTES)
    db.commit()
    send_otp_email(current_user.email, otp, current_user.name, purpose="login")
    return {"message": f"A verification code has been sent to {current_user.email}."}


class ChangePasswordOtpPayload(BaseModel):
    otp:          str
    new_password: str

@app.post("/auth/verify-password-change", tags=["Auth"])
def verify_password_change(
    payload:      ChangePasswordOtpPayload,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """Logged-in user: verify OTP then set new password."""
    if not current_user.otp_code or current_user.otp_code != payload.otp:
        raise HTTPException(400, "Invalid verification code.")
    if current_user.otp_expires_at and datetime.utcnow() > current_user.otp_expires_at:
        raise HTTPException(400, "Code expired. Request a new one.")
    if len(payload.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    current_user.hashed_password = hash_password(payload.new_password)
    current_user.otp_code        = None
    current_user.otp_expires_at  = None
    db.commit()
    return {"message": "Password updated successfully."}


class ForgotPasswordPayload(BaseModel):
    email: str

@app.post("/auth/forgot-password", tags=["Auth"])
def forgot_password(payload: ForgotPasswordPayload, db: Session = Depends(get_db)):
    """Public: send OTP to registered email for password reset (no login required)."""
    email = payload.email.strip().lower()
    user  = db.query(User).filter(User.email == email).first()
    # Always return success to avoid email enumeration
    if user and user.hashed_password:
        otp             = generate_otp()
        user.otp_code       = otp
        user.otp_expires_at = datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MINUTES)
        db.commit()
        send_otp_email(email, otp, user.name, purpose="login")
    return {"message": "If that email is registered, a reset code has been sent."}


class ResetForgottenPasswordPayload(BaseModel):
    email:        str
    otp:          str
    new_password: str

@app.post("/auth/reset-forgotten-password", tags=["Auth"])
def reset_forgotten_password(
    payload: ResetForgottenPasswordPayload,
    db: Session = Depends(get_db),
):
    """Public: verify OTP + set new password (forgot-password flow)."""
    email = payload.email.strip().lower()
    user  = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(404, "Email not found.")
    if not user.otp_code or user.otp_code != payload.otp:
        raise HTTPException(400, "Invalid reset code.")
    if user.otp_expires_at and datetime.utcnow() > user.otp_expires_at:
        raise HTTPException(400, "Reset code expired. Request a new one.")
    if len(payload.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    user.hashed_password = hash_password(payload.new_password)
    user.otp_code        = None
    user.otp_expires_at  = None
    db.commit()
    return {"message": "Password reset successfully. You can now log in."}


@app.post("/audio/upload", tags=["Audio"])
async def upload_audio(
    background_tasks: BackgroundTasks,
    file:             UploadFile = File(...),
    db:               Session    = Depends(get_db),
    current_user:     User       = Depends(get_current_user),
):
    """
    Upload an audio file. Processing starts immediately in the background.
    Poll /audio/{job_id}/status for progress.
    Supports: .wav .mp3 .m4a .ogg .flac .webm .aac
    """
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400,
            f"Unsupported format '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    job_id    = str(uuid.uuid4())
    save_name = f"{job_id}{ext}"
    file_path = os.path.join(UPLOAD_DIR, save_name)

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    record = AudioFile(
        user_id   = current_user.id,
        filename  = file.filename,
        file_path = file_path,
        status    = "uploaded",
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    background_tasks.add_task(
        _run_pipeline_bg,
        record.id,
        file_path,
        app.state.transcriber,
        app.state.structurer,
    )

    return {
        "job_id":   record.id,
        "status":   "uploaded",
        "filename": file.filename,
        "message":  "Processing started. Poll /audio/{job_id}/status.",
    }


def _run_pipeline_bg(audio_file_id, file_path, transcriber, structurer):
    """Wrapper so pipeline.py doesn't need app.state."""
    from ml.pipeline import run_full_pipeline
    run_full_pipeline(audio_file_id, file_path, None, transcriber, structurer)


@app.get("/audio/{job_id}/status", tags=["Audio"])
def get_status(
    job_id:       int,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    record = db.query(AudioFile).filter(
        AudioFile.id      == job_id,
        AudioFile.user_id == current_user.id,
    ).first()
    if not record:
        raise HTTPException(404, "Job not found.")
    return {"job_id": job_id, "status": record.status, "filename": record.filename}


@app.get("/audio/{job_id}/notes", tags=["Audio"])
def get_notes(
    job_id:       int,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Retrieve structured notes (JSON + transcripts) once processing is done."""
    record = db.query(AudioFile).filter(
        AudioFile.id      == job_id,
        AudioFile.user_id == current_user.id,
    ).first()
    if not record:
        raise HTTPException(404, "Job not found.")
    if record.status != "done":
        raise HTTPException(400, f"Notes not ready. Current status: {record.status}")

    notes = db.query(StructuredNotes).filter(
        StructuredNotes.audio_file_id == job_id
    ).first()
    if not notes:
        raise HTTPException(404, "Notes record missing.")

    # Parse stored JSON
    notes_dict = {}
    if notes.notes_json:
        try:
            notes_dict = json.loads(notes.notes_json)
        except json.JSONDecodeError:
            pass

    # Per-chunk transcriptions
    chunks = (
        db.query(AudioChunk)
        .filter(AudioChunk.audio_file_id == job_id)
        .order_by(AudioChunk.chunk_index)
        .all()
    )
    transcription_list = []
    for chunk in chunks:
        if chunk.transcription:
            tr = chunk.transcription
            transcription_list.append({
                "chunk_index":      chunk.chunk_index,
                "start":            chunk.start_time,
                "end":              chunk.end_time,
                "raw_text":         tr.raw_text,
                "cleaned_text":     tr.cleaned_text,
                "detected_language":tr.detected_language,
                "translated_text":  tr.translated_text,
            })

    return {
        "job_id":          job_id,
        "filename":        record.filename,
        "notes_text":      notes.notes_text,
        "notes":           notes_dict,
        "word_count":      notes.word_count,
        "transcriptions":  transcription_list,
    }


@app.get("/audio/{job_id}/download", tags=["Audio"])
def download_notes(
    job_id:       int,
    format:       str     = Query("txt", pattern="^(txt|docx|pdf)$"),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """
    Download notes in the requested format.
    ?format=txt   → plain text file
    ?format=docx  → Microsoft Word document
    ?format=pdf   → PDF document
    """
    record = db.query(AudioFile).filter(
        AudioFile.id      == job_id,
        AudioFile.user_id == current_user.id,
    ).first()
    if not record:
        raise HTTPException(404, "Job not found.")
    if record.status != "done":
        raise HTTPException(400, "Notes not ready yet.")

    notes = db.query(StructuredNotes).filter(
        StructuredNotes.audio_file_id == job_id
    ).first()
    if not notes:
        raise HTTPException(404, "Notes not found.")

    notes_dict = {}
    if notes.notes_json:
        try:
            notes_dict = json.loads(notes.notes_json)
        except Exception:
            pass
    if not notes_dict:
        notes_dict = {
            "title": "Lecture Notes",
            "summary": "",
            "key_points": [],
            "sections": [],
            "full_transcript": notes.notes_text or "",
            "word_count": notes.word_count or 0,
        }

    safe_name = "".join(c for c in record.filename if c.isalnum() or c in "._- ")
    safe_name = safe_name.rsplit(".", 1)[0]  # strip original extension

    from ml.exporter import export_txt, export_docx, export_pdf

    if format == "txt":
        content      = export_txt(notes_dict)
        media_type   = "text/plain; charset=utf-8"
        filename     = f"{safe_name}_notes.txt"
    elif format == "docx":
        content      = export_docx(notes_dict)
        media_type   = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        filename     = f"{safe_name}_notes.docx"
    else:  # pdf
        content      = export_pdf(notes_dict)
        media_type   = "application/pdf"
        filename     = f"{safe_name}_notes.pdf"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.delete("/audio/{job_id}", tags=["Audio"])
def delete_upload(
    job_id:       int,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    record = db.query(AudioFile).filter(
        AudioFile.id      == job_id,
        AudioFile.user_id == current_user.id,
    ).first()
    if not record:
        raise HTTPException(404, "Job not found.")

    # Delete physical file
    if record.file_path and os.path.isfile(record.file_path):
        os.remove(record.file_path)

    db.delete(record)   # cascade deletes chunks, transcriptions, notes
    db.commit()
    return {"message": "Deleted successfully."}


# ─────────────────────────────────────────────────────────────
#  USER ROUTES
# ─────────────────────────────────────────────────────────────

@app.get("/user/uploads", tags=["User"])
def list_uploads(
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """List all audio uploads for the current user."""
    files = (
        db.query(AudioFile)
        .filter(AudioFile.user_id == current_user.id)
        .order_by(AudioFile.created_at.desc())
        .all()
    )
    return [
        {
            "id":         f.id,
            "filename":   f.filename,
            "status":     f.status,
            "created_at": str(f.created_at),
        }
        for f in files
    ]


# ─────────────────────────────────────────────────────────────
#  HEALTH CHECK
# ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
def health():
    return {
        "status":  "ok",
        "service": "AudioNotes AI API",
        "version": "2.0.0",
        "models":  {
            "whisper": WHISPER_ID,
            "t5":      T5_ID,
            "trans":   TRANS_ID,
        },
    }

@app.get("/", tags=["Health"])
def root():
    return {"message": "AudioNotes AI API v2.0 — visit /docs for API reference"}
