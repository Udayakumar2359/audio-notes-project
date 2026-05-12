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
from fastapi.responses import Response, StreamingResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session
from dotenv import load_dotenv

load_dotenv()

# ── App-local imports ─────────────────────────────────────────
from database import (
    get_db, init_db,
    User, AudioFile, AudioChunk, Transcription, StructuredNotes,
    SharedNote, StudyGroup, GroupMember, GroupNote,
    GroupFile, GroupChatMessage,
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
    app.state.agents      = {}   # job_id -> TranscriptAgent instance
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
    expose_headers=["Content-Disposition"],
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
#  EVALUATION ROUTE
#  POST /evaluate?model=all|asr|translation|notes
#  Requires auth. Runs evaluation in-process and returns JSON.
# ─────────────────────────────────────────────────────────────

@app.post("/evaluate", tags=["Evaluation"])
def run_evaluation(
    model:           str     = Query("all", description="Which model: all | asr | translation | notes"),
    current_user:    User    = Depends(get_current_user),
):
    """
    Evaluate one or all models with built-in test samples.
    Returns JSON with WER, CER, RTF, BLEU, chrF, ROUGE-1/2/L, coverage, latency.

    Note: first call takes longer because models are already loaded at startup.
    """
    from ml.evaluator import (
        TranslationSample, NotesSample,
        evaluate_translation, evaluate_notes,
        build_report,
    )
    from dataclasses import asdict

    transcriber = app.state.transcriber
    structurer  = app.state.structurer

    run_trans = model in ("translation", "all")
    run_notes = model in ("notes",       "all")

    # ── Translation samples ────────────────────────────────────
    TRANS_SAMPLES = [
        TranslationSample("ಇಂದಿನ ತರಗತಿಯಲ್ಲಿ ನಾವು ಯಂತ್ರ ಕಲಿಕೆಯ ಮೂಲ ತತ್ವಗಳನ್ನು ಕಲಿಯುತ್ತೇವೆ.",
                          "In today's class we will learn the basic principles of machine learning.", "kn"),
        TranslationSample("ಗಣಕಯಂತ್ರ ವಿಜ್ಞಾನದಲ್ಲಿ ಅಲ್ಗಾರಿದಮ್ ಬಹಳ ಮುಖ್ಯ.",
                          "Algorithm is very important in computer science.", "kn"),
        TranslationSample("आज हम मशीन लर्निंग के बुनियादी सिद्धांत सीखेंगे।",
                          "Today we will learn the basic principles of machine learning.", "hi"),
        TranslationSample("डेटा साइंस में सांख्यिकी बहुत महत्वपूर्ण है।",
                          "Statistics is very important in data science.", "hi"),
    ]

    # ── Notes samples ──────────────────────────────────────────
    NOTES_SAMPLES = [
        NotesSample(
            "Today we discuss neural networks. A neural network is a computational model "
            "inspired by the human brain. It consists of layers of interconnected nodes called "
            "neurons. Training uses backpropagation and gradient descent to minimise loss.",
            "Neural Networks — computational model inspired by human brain. "
            "Layers: input, hidden, output. Training: backpropagation, gradient descent.",
        ),
        NotesSample(
            "Database management systems. SQL is used to query databases. SELECT retrieves data, "
            "WHERE filters records, JOIN combines tables. Normalization reduces redundancy. "
            "Indexes improve performance. Transactions use ACID properties.",
            "DBMS — SQL, SELECT, WHERE, JOIN. Normalization: 1NF 2NF 3NF. "
            "Indexes for performance. ACID transactions.",
        ),
    ]

    results = {}

    if run_trans:
        tr = evaluate_translation(transcriber, TRANS_SAMPLES)
        results["translation"] = asdict(tr)

    if run_notes:
        nr = evaluate_notes(structurer, NOTES_SAMPLES)
        results["notes"] = asdict(nr)

    # ASR not run via API (requires audio file upload — use CLI instead)
    if model == "asr":
        results["asr"] = {
            "message": "ASR evaluation requires an audio file. Use the CLI instead: "
                       "python evaluate.py --model asr --audio path/to.wav --ref 'ground truth'"
        }

    from datetime import datetime
    return {
        "model":     model,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "results":   results,
    }


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

    # Parse credibility scores
    credibility_dict = {}
    if hasattr(notes, 'credibility_json') and notes.credibility_json:
        try:
            credibility_dict = json.loads(notes.credibility_json)
        except json.JSONDecodeError:
            pass

    return {
        "job_id":       job_id,
        "filename":     record.filename,
        "notes_text":   notes.notes_text,
        "notes":        notes_dict,
        "word_count":   notes.word_count,
        "credibility":  credibility_dict,
        # Transcriptions omitted from initial load — fetch lazily via /audio/{job_id}/transcripts
    }


@app.get("/audio/{job_id}/transcripts", tags=["Audio"])
def get_transcripts(
    job_id:       int,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Lazy-load per-chunk transcriptions (called only when user opens Transcript tab)."""
    record = db.query(AudioFile).filter(
        AudioFile.id == job_id, AudioFile.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(404, "Job not found.")

    chunks = (
        db.query(AudioChunk)
        .filter(AudioChunk.audio_file_id == job_id)
        .order_by(AudioChunk.chunk_index)
        .all()
    )
    result = []
    for chunk in chunks:
        if chunk.transcription:
            tr = chunk.transcription
            result.append({
                "chunk_index":       chunk.chunk_index,
                "start":             chunk.start_time,
                "end":               chunk.end_time,
                "raw_text":          tr.raw_text,
                "detected_language": tr.detected_language,
                "translated_text":   tr.translated_text,
            })
    return {"transcriptions": result}


# ─────────────────────────────────────────────────────────────
#  CREDIBILITY ROUTE
# ─────────────────────────────────────────────────────────────

@app.get("/audio/{job_id}/credibility", tags=["Credibility"])
def get_credibility(
    job_id:       int,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """
    Returns T5 faithfulness scores (from DB) + live agent groundedness
    (from the in-memory agent session, if any chat has happened).

    T5 scores are computed once at the end of the pipeline and cached.
    Agent groundedness accumulates live as the user chats.
    """
    record = db.query(AudioFile).filter(
        AudioFile.id      == job_id,
        AudioFile.user_id == current_user.id,
    ).first()
    if not record:
        raise HTTPException(404, "Job not found.")

    notes = db.query(StructuredNotes).filter(
        StructuredNotes.audio_file_id == job_id
    ).first()

    # ── T5 scores from DB ─────────────────────────────────────
    t5_data = {}
    if notes and hasattr(notes, 'credibility_json') and notes.credibility_json:
        try:
            stored = json.loads(notes.credibility_json)
            t5_data = stored.get("t5", {})
        except Exception:
            pass

    # ── Agent groundedness from live session ──────────────────
    agent_data = {
        "exchanges_checked": 0,
        "avg_overlap": 0.0,
        "grade": "Not checked yet",
        "per_exchange": [],
    }
    agents = getattr(app.state, "agents", {})
    agent  = agents.get(job_id)
    if agent and hasattr(agent, "get_groundedness_report"):
        try:
            agent_data = agent.get_groundedness_report()
        except Exception:
            pass

    return {
        "job_id": job_id,
        "t5":     t5_data,
        "agent":  agent_data,
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
#  AI STUDY AGENT ROUTES
#  POST /agent/{id}/init           → first auto-summary (SSE)
#  POST /agent/{id}/chat           → ask a question     (SSE)
#  POST /agent/{id}/generate-notes → detailed notes     (SSE)
#  GET  /agent/{id}/download-notes → Word/PDF download
#  DELETE /agent/{id}/history      → clear conversation
# ─────────────────────────────────────────────────────────────

class AgentChatRequest(BaseModel):
    message: str


def _get_or_create_agent(job_id: int, db):
    """Return cached TranscriptAgent or build fresh from DB transcript."""
    from ml.agent import TranscriptAgent

    if job_id in app.state.agents:
        return app.state.agents[job_id]

    record = db.query(StructuredNotes).filter(
        StructuredNotes.audio_file_id == job_id
    ).first()
    if not record:
        raise HTTPException(404, "Notes record not found for this job.")

    chunks = (
        db.query(AudioChunk)
        .filter(AudioChunk.audio_file_id == job_id)
        .order_by(AudioChunk.chunk_index)
        .all()
    )
    parts = []
    for c in chunks:
        if c.transcription:
            txt = c.transcription.translated_text or c.transcription.raw_text or ""
            if txt.strip():
                parts.append(txt.strip())

    full_transcript = " ".join(parts) or record.notes_text or ""
    agent = TranscriptAgent(job_id=job_id, transcript_text=full_transcript)
    app.state.agents[job_id] = agent
    return agent


def _sse(token_gen):
    """Wrap a text-token generator into SSE data: lines."""
    import json as _json
    try:
        for token in token_gen:
            yield f"data: {_json.dumps({'chunk': token})}\n\n"
    finally:
        yield f"data: {_json.dumps({'done': True})}\n\n"


@app.post("/agent/{job_id}/init", tags=["Agent"])
def agent_init(
    job_id:       int,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """
    Pre-warm the agent context — loads transcript into memory.
    Fast: NO LLM call. Returns immediately.
    The frontend calls this silently on page load so the first
    chat reply has no cold-start delay.
    """
    rec = db.query(AudioFile).filter(
        AudioFile.id == job_id, AudioFile.user_id == current_user.id
    ).first()
    if not rec:
        raise HTTPException(404, "Job not found.")

    try:
        agent = _get_or_create_agent(job_id, db)
        transcript_len = len(agent.transcript)
    except Exception:
        transcript_len = 0

    return {
        "status":         "ready",
        "job_id":         job_id,
        "transcript_len": transcript_len,
    }


@app.post("/agent/{job_id}/chat", tags=["Agent"])
def agent_chat(
    job_id:       int,
    payload:      AgentChatRequest,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Send a user message and stream back the agent reply."""
    rec = db.query(AudioFile).filter(
        AudioFile.id == job_id, AudioFile.user_id == current_user.id
    ).first()
    if not rec:
        raise HTTPException(404, "Job not found.")

    agent = _get_or_create_agent(job_id, db)
    return StreamingResponse(
        _sse(agent.chat_stream(payload.message)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/agent/{job_id}/generate-notes", tags=["Agent"])
def agent_generate_notes(
    job_id:       int,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Ask the agent to generate detailed study notes (streaming)."""
    rec = db.query(AudioFile).filter(
        AudioFile.id == job_id, AudioFile.user_id == current_user.id
    ).first()
    if not rec:
        raise HTTPException(404, "Job not found.")

    agent = _get_or_create_agent(job_id, db)
    prompt = _DETAILED_NOTES_PROMPT
    return StreamingResponse(
        _sse(agent.chat_stream(prompt)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


_DETAILED_NOTES_PROMPT = """
You are an expert academic note generator designed for university-level students.

Your task is to convert a raw transcript into **highly detailed, structured, exam-ready notes**.

---

## INPUT:

You will receive a long raw transcript (can exceed 10,000 words).

---

## CORE OBJECTIVE:

* Generate **comprehensive notes covering at least 50–60% of the original content length**
* Ensure **complete topic coverage without missing important concepts**

---

 CRITICAL INSTRUCTION (SECTION EXPANSION RULE)

 DO NOT limit the output to a fixed number of sections.

* The number of sections MUST be **dynamically determined based on the input content**
* If the transcript is long, you MUST generate **many sections (8–15+ if needed)**
* Each major topic, subtopic, or concept should become its **own section**

 Example:

* If input discusses:

  * Technology impact
  * Web
  * Computer basics
  * Hardware
  * Software
  * OS
  * Word
  * Excel
  * PowerPoint

Then output should have **separate sections for EACH**

---

## STRUCTURE REQUIREMENTS

Each section MUST follow this format:

### <Section Number>. <Section Title>

#### Explanation:

Write a **detailed paragraph (5–10 lines minimum)** explaining the concept clearly.

#### Key Points:

* Point 1 → Explanation (1–2 lines)
* Point 2 → Explanation (1–2 lines)
* Point 3 → Explanation (1–2 lines)
* Add more points if needed

#### Steps / Working (ONLY if applicable):

1. Step 1 → Explanation
2. Step 2 → Explanation
3. Step 3 → Explanation

---

## DEPTH REQUIREMENT (VERY IMPORTANT)

* Do NOT summarize aggressively
* Maintain **at least 50% of original content volume**
* Expand explanations where needed
* Cover ALL major ideas

---

## CONTENT PROCESSING RULES

* Remove filler (ads, greetings, repetition)
* Merge duplicate ideas intelligently
* Preserve all technical concepts
* Improve clarity where transcript is messy

---

## WRITING STYLE

* Formal + academic + student-friendly
* Clear and structured
* No conversational tone
* No vague explanations

---

## DO NOT:

* Do not restrict to 2–3 sections
* Do not skip Key Points
* Do not skip explanations
* Do not output only paragraphs
* Do not reduce content length significantly

---

Notice-The model MUST expand sections based on input content. Each section should contain atleast of 500-800 words of explanation.  

---

## FINAL TASK:

Convert the following transcript int  within a section that already has full prose paragraphs.
- No conversational phrases, filler, or repetition.
- Do NOT include timestamps, speaker names, or any non-academic content.
- If the transcript is short, expand each concept from first principles,
  textbook knowledge, and domain expertise to meet to **detailed, multi-section, structured notes** following ALL rules above.

IMPORTANT RULES:
- If have multiple key points in a section, add them in the same section with their detailed explanation with their properheadings.
- Every numbered section MUST be written in paragraph form (2-3 paragraphs minimum).
- Minimum 150 words per section.
- No bullet-only sections. Bullets may appear only as supplementary detail
he depth requirement.
"""


@app.get("/agent/{job_id}/download-notes", tags=["Agent"])
def agent_download_notes(
    job_id:       int,
    format:       str     = Query("docx", pattern="^(docx|pdf)$"),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """
    Generate AI study notes from the lecture transcript and return as Word or PDF.
    The content is ALWAYS generated fresh by the LLM — never copied from the transcript.
    Returns 503 if no LLM (Ollama/Groq) is available.
    """
    rec = db.query(AudioFile).filter(
        AudioFile.id == job_id, AudioFile.user_id == current_user.id
    ).first()
    if not rec:
        raise HTTPException(404, "Job not found.")

    # ── Load base notes metadata from DB (title, word_count) ──
    notes_rec = db.query(StructuredNotes).filter(
        StructuredNotes.audio_file_id == job_id
    ).first()

    base_notes: dict = {}
    if notes_rec and notes_rec.notes_json:
        try:
            base_notes = json.loads(notes_rec.notes_json)
        except Exception:
            pass

    # ── Build full_transcript from DB chunks ──────────────────
    chunks = (
        db.query(AudioChunk)
        .filter(AudioChunk.audio_file_id == job_id)
        .order_by(AudioChunk.chunk_index)
        .all()
    )
    full_transcript = " ".join(
        (c.transcription.translated_text or c.transcription.raw_text or "")
        for c in chunks if c.transcription
    ).strip()

    # ── Require LLM to generate structured notes ──────────────
    # The agent uses the transcript as context; we ask it to produce
    # a rich, fully structured academic notes document.
    try:
        agent      = _get_or_create_agent(job_id, db)
        notes_text = agent.chat_complete(_DETAILED_NOTES_PROMPT)
    except Exception as e:
        raise HTTPException(
            503,
            f"AI model unavailable: {e}. "
            "Please ensure Ollama is running or configure a Groq API key."
        )

    if not notes_text or len(notes_text.strip()) < 200:
        raise HTTPException(
            503,
            "AI agent returned an empty response. "
            "Please ensure Ollama is running (ollama serve) "
            "or set GROQ_API_KEY in your .env file."
        )
    if "not available" in notes_text.lower() or "error generating" in notes_text.lower():
        raise HTTPException(
            503,
            "AI model unavailable. "
            "Start Ollama with 'ollama serve' or configure GROQ_API_KEY."
        )

    # ── Parse the AI output into structured sections ──────────
    parsed = _parse_notes_sections(notes_text)

    safe = "".join(c for c in rec.filename if c.isalnum() or c in "._- ")
    safe = safe.rsplit(".", 1)[0]

    # ── Compose final notes dict ──────────────────────────────
    notes_dict = {
        "title":           parsed.get("title") or base_notes.get("title") or f"Study Notes \u2014 {safe}",
        "summary":         parsed.get("summary", ""),
        "key_points":      parsed.get("key_points", []),
        "sections":        parsed.get("sections", []),
        # Do NOT include full_transcript — agent download is AI notes only,
        # not a copy of the source transcript.
        "full_transcript": "",
        "word_count":      notes_rec.word_count if notes_rec else 0,
    }

    from ml.exporter import export_docx, export_pdf
    try:
        if format == "docx":
            content    = export_docx(notes_dict)
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            filename   = f"{safe}_ai_notes.docx"
        else:
            content    = export_pdf(notes_dict)
            media_type = "application/pdf"
            filename   = f"{safe}_ai_notes.pdf"
    except Exception as e:
        raise HTTPException(500, f"Export failed: {e}")

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.delete("/agent/{job_id}/history", tags=["Agent"])
def agent_clear_history(
    job_id:       int,
    current_user: User = Depends(get_current_user),
):
    """Clear conversation history for a job (fresh start)."""
    if job_id in app.state.agents:
        app.state.agents[job_id].clear_history()
    return {"message": "Conversation cleared."}


class AgentModelRequest(BaseModel):
    preference: str   # 'auto' | 'local' | 'cloud'

@app.post("/agent/{job_id}/model", tags=["Agent"])
def agent_set_model(
    job_id:       int,
    payload:      AgentModelRequest,
    current_user: User = Depends(get_current_user),
):
    """Switch the AI source for a job: auto | local | cloud."""
    pref = payload.preference
    if pref not in ("auto", "local", "cloud"):
        raise HTTPException(400, "preference must be 'auto', 'local', or 'cloud'")

    if job_id in app.state.agents:
        agent = app.state.agents[job_id]
        agent.model_preference = pref   # agent.py reads this on next call
    return {"message": f"Model preference set to '{pref}'."}


# ─────────────────────────────────────────────────────────────
#  Helper — parse numbered sections from AI notes output
# ─────────────────────────────────────────────────────────────

def _parse_notes_sections(text: str) -> dict:
    """
    Parse AI output in either of two formats:

    NEW (academic template):
      LECTURE TITLE:\\n<title>
      OVERVIEW:\\n<paragraph>
      1. Introduction\\n<prose>
      2. Topic Name\\n<prose>
      ...

    LEGACY (old SECTION N: format — kept for backward compatibility):
      SECTION N: <heading>\\n<body>

    Returns {title, summary, key_points, sections}.
    """
    import re

    result: dict = {"title": "", "summary": "", "key_points": [], "sections": []}

    # ── Normalise line-endings ─────────────────────────────────
    text = text.replace('\r\n', '\n').replace('\r', '\n')

    # ── LECTURE TITLE ─────────────────────────────────────────
    m = re.search(r'LECTURE TITLE:\s*\n(.+?)(?:\n(?:OVERVIEW:|SECTION|\d+\.))',
                  text, re.IGNORECASE | re.DOTALL)
    if m:
        result["title"] = m.group(1).strip()

    # ── OVERVIEW ──────────────────────────────────────────────
    m = re.search(r'OVERVIEW:\s*\n(.+?)(?:\n(?:KEY CONCEPTS:|SECTION\s*\d|\d+\.))',
                  text, re.IGNORECASE | re.DOTALL)
    if m:
        result["summary"] = m.group(1).strip()

    # ── KEY CONCEPTS (legacy format only) ─────────────────────
    m = re.search(r'KEY CONCEPTS:\s*\n(.+?)\n(?:SECTION\s*\d)',
                  text, re.IGNORECASE | re.DOTALL)
    if m:
        for line in m.group(1).split('\n'):
            kp = line.strip().lstrip('-\u2022*[]').strip()
            if kp and not kp.startswith('['):
                result["key_points"].append(kp)

    # ── NEW FORMAT: numbered sections (1. Heading, 2. Heading ...) ───
    # Matches lines at start of line: "1. Introduction", "2. Core Topic", etc.
    num_sec_pattern = re.compile(r'^\d+\.\s+(.+?)$', re.MULTILINE)
    num_matches = list(num_sec_pattern.finditer(text))

    if num_matches:
        for i, sm in enumerate(num_matches):
            heading = sm.group(1).strip().strip('[]')
            start   = sm.end()
            end     = num_matches[i + 1].start() if i + 1 < len(num_matches) else len(text)
            body    = text[start:end].strip()
            # Strip trailing rules block that may bleed into last section
            body = re.split(r'\nIMPORTANT RULES:', body, flags=re.IGNORECASE)[0].strip()
            body = re.split(r'\nSTRICT RULES:', body, flags=re.IGNORECASE)[0].strip()
            if heading and body:
                result["sections"].append({
                    "heading": heading,
                    "content": _reindent_content(body),
                })

    # ── LEGACY FORMAT fallback: SECTION N: Heading ────────────
    if not result["sections"]:
        sec_pattern = re.compile(r'^SECTION\s+\d+:\s*(.+?)$',
                                 re.IGNORECASE | re.MULTILINE)
        sec_matches = list(sec_pattern.finditer(text))
        for i, sm in enumerate(sec_matches):
            heading = sm.group(1).strip().strip('[]')
            start   = sm.end()
            end     = sec_matches[i + 1].start() if i + 1 < len(sec_matches) else len(text)
            body    = text[start:end].strip()
            body = re.split(r'\nRULES:', body, flags=re.IGNORECASE)[0].strip()
            if heading and body:
                result["sections"].append({
                    "heading": heading,
                    "content": _reindent_content(body),
                })

    # ── Final fallback: raw text as one section ────────────────
    if not result["sections"]:
        result["sections"] = [{"heading": "Study Notes", "content": _reindent_content(text)}]

    return result


def _reindent_content(text: str) -> str:
    """
    Normalise sub-bullet indentation so the exporter renders them correctly.
    Lines starting with two or more spaces / a tab / '  -' become '  - ' (sub-bullet).
    Lines starting with '-' or '•' become '• ' (top-level bullet).
    Numbered lines (1. 2. etc.) are kept as-is.
    Plain prose lines are kept as-is.
    """
    import re
    out = []
    for line in text.split('\n'):
        # Sub-bullet: indented dash/bullet
        if re.match(r'^(\t|  +)[\-•*]', line):
            out.append('  - ' + line.lstrip().lstrip('-•* ').strip())
        # Sub-bullet: indented numbered (  1. ...)
        elif re.match(r'^(\t|  +)\d+[.)]', line):
            out.append('  ' + line.strip())
        # Top-level bullet
        elif re.match(r'^[\-•*]\s+', line):
            out.append('• ' + line.lstrip('-•* ').strip())
        # Numbered list at root level
        elif re.match(r'^\d+[.)\s]', line):
            out.append(line.strip())
        else:
            out.append(line)
    return '\n'.join(out)



# ─────────────────────────────────────────────────────────────
#  FEATURE 1 — SUMMARIZATION LEVELS
#  POST /agent/{id}/summarize?level=brief|standard|detailed
# ─────────────────────────────────────────────────────────────

_BRIEF_PROMPT = """
You are an academic assistant. Create a BRIEF summary of this lecture in 150-250 words.
Format:
- One paragraph overview (3-4 sentences)
- 5 key bullet points maximum
Keep it concise. Students should read this in under 2 minutes.
"""

_STANDARD_PROMPT = _DETAILED_NOTES_PROMPT  # already defined above

_DETAILED_PROMPT = """
You are an expert academic note generator. Create EXTREMELY DETAILED, exam-ready lecture notes.
Include:
1. Full overview paragraph (200+ words)
2. Every concept explained in depth (300+ words per section)
3. Real-world examples for each concept
4. Step-by-step processes where applicable
5. 10+ key points
6. Potential exam questions at the end
Cover EVERY topic from the transcript. Minimum 2000 words total output.
"""

_LEVEL_PROMPTS = {
    "brief":    _BRIEF_PROMPT,
    "standard": _STANDARD_PROMPT,
    "detailed": _DETAILED_PROMPT,
}


@app.post("/agent/{job_id}/summarize", tags=["Agent"])
def agent_summarize(
    job_id:       int,
    level:        str     = Query("standard", pattern="^(brief|standard|detailed)$"),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Generate notes at a specific summarization level (brief/standard/detailed) — streaming SSE."""
    rec = db.query(AudioFile).filter(
        AudioFile.id == job_id, AudioFile.user_id == current_user.id
    ).first()
    if not rec:
        raise HTTPException(404, "Job not found.")

    agent  = _get_or_create_agent(job_id, db)
    prompt = _LEVEL_PROMPTS.get(level, _STANDARD_PROMPT)
    return StreamingResponse(
        _sse(agent.chat_stream(prompt)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─────────────────────────────────────────────────────────────
#  FEATURE 2 — INLINE NOTE EDITOR
#  PATCH /notes/{id}/edit
#  GET   /notes/{id}/edited
# ─────────────────────────────────────────────────────────────

class EditNotesPayload(BaseModel):
    edited_text: str


@app.patch("/notes/{job_id}/edit", tags=["Notes"])
def save_edited_notes(
    job_id:       int,
    payload:      EditNotesPayload,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Save user's inline edits to the notes."""
    rec = db.query(AudioFile).filter(
        AudioFile.id == job_id, AudioFile.user_id == current_user.id
    ).first()
    if not rec:
        raise HTTPException(404, "Job not found.")

    notes = db.query(StructuredNotes).filter(
        StructuredNotes.audio_file_id == job_id
    ).first()
    if not notes:
        raise HTTPException(404, "Notes not found.")

    notes.notes_edited_text = payload.edited_text
    db.commit()
    return {"message": "Notes saved successfully.", "job_id": job_id}


@app.get("/notes/{job_id}/edited", tags=["Notes"])
def get_edited_notes(
    job_id:       int,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Fetch the user's saved edited notes."""
    rec = db.query(AudioFile).filter(
        AudioFile.id == job_id, AudioFile.user_id == current_user.id
    ).first()
    if not rec:
        raise HTTPException(404, "Job not found.")

    notes = db.query(StructuredNotes).filter(
        StructuredNotes.audio_file_id == job_id
    ).first()
    return {
        "job_id":      job_id,
        "edited_text": notes.notes_edited_text if notes else None,
        "has_edits":   bool(notes and notes.notes_edited_text),
    }


# ─────────────────────────────────────────────────────────────
#  FEATURE 3 — SHARE NOTES VIA LINK
#  POST   /notes/{id}/share
#  DELETE /notes/{id}/share/{token}
#  GET    /shared/{token}  ← public, no auth
# ─────────────────────────────────────────────────────────────

class SharePayload(BaseModel):
    expires_hours: Optional[int] = None   # None = never expires


@app.post("/notes/{job_id}/share", tags=["Share"])
def create_share_link(
    job_id:       int,
    payload:      SharePayload,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Generate a public share token for a note."""
    import secrets
    rec = db.query(AudioFile).filter(
        AudioFile.id == job_id, AudioFile.user_id == current_user.id
    ).first()
    if not rec:
        raise HTTPException(404, "Job not found.")
    if rec.status != "done":
        raise HTTPException(400, "Notes not ready yet.")

    token      = secrets.token_urlsafe(32)
    expires_at = None
    if payload.expires_hours:
        expires_at = datetime.utcnow() + timedelta(hours=payload.expires_hours)

    share = SharedNote(
        audio_file_id = job_id,
        token         = token,
        created_by    = current_user.id,
        expires_at    = expires_at,
    )
    db.add(share)
    db.commit()
    db.refresh(share)

    return {
        "token":      token,
        "share_url":  f"{FRONTEND_URL}/shared/{token}",
        "expires_at": expires_at.isoformat() if expires_at else None,
        "share_id":   share.id,
    }


@app.get("/notes/{job_id}/shares", tags=["Share"])
def list_share_links(
    job_id:       int,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """List all active share links for a note."""
    rec = db.query(AudioFile).filter(
        AudioFile.id == job_id, AudioFile.user_id == current_user.id
    ).first()
    if not rec:
        raise HTTPException(404, "Job not found.")

    shares = db.query(SharedNote).filter(SharedNote.audio_file_id == job_id).all()
    return [
        {
            "share_id":   s.id,
            "token":      s.token,
            "share_url":  f"{FRONTEND_URL}/shared/{s.token}",
            "expires_at": s.expires_at.isoformat() if s.expires_at else None,
            "view_count": s.view_count,
            "created_at": s.created_at.isoformat(),
        }
        for s in shares
    ]


@app.delete("/notes/{job_id}/share/{share_id}", tags=["Share"])
def revoke_share_link(
    job_id:       int,
    share_id:     int,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Revoke (delete) a share link."""
    share = db.query(SharedNote).filter(
        SharedNote.id == share_id,
        SharedNote.audio_file_id == job_id,
        SharedNote.created_by == current_user.id,
    ).first()
    if not share:
        raise HTTPException(404, "Share link not found.")
    db.delete(share)
    db.commit()
    return {"message": "Share link revoked."}


@app.get("/shared/{token}", tags=["Share"])
def view_shared_note(token: str, db: Session = Depends(get_db)):
    """Public endpoint — view a shared note without authentication."""
    share = db.query(SharedNote).filter(SharedNote.token == token).first()
    if not share:
        raise HTTPException(404, "Share link not found or has been revoked.")
    if share.expires_at and datetime.utcnow() > share.expires_at:
        raise HTTPException(410, "This share link has expired.")

    share.view_count += 1
    db.commit()

    rec   = share.audio_file
    notes = db.query(StructuredNotes).filter(
        StructuredNotes.audio_file_id == rec.id
    ).first()

    notes_dict = {}
    if notes and notes.notes_json:
        try:
            notes_dict = json.loads(notes.notes_json)
        except Exception:
            pass

    return {
        "filename":   rec.filename,
        "notes_text": notes.notes_text if notes else "",
        "notes":      notes_dict,
        "word_count": notes.word_count if notes else 0,
        "view_count": share.view_count,
        "shared_by":  share.creator.name,
        "created_at": share.created_at.isoformat(),
    }


# ─────────────────────────────────────────────────────────────
#  FEATURE 4 — TRANSLATION (Ollama local model)
#  POST /notes/{id}/translate  body: {target_lang: "hi"|"kn"…}
# ─────────────────────────────────────────────────────────────

class TranslatePayload(BaseModel):
    target_lang: str


@app.post("/notes/{job_id}/translate", tags=["Translation"])
def translate_note(
    job_id:       int,
    payload:      TranslatePayload,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """
    Translate notes into a target language using Ollama (local AI).
    Returns Server-Sent Events stream of translated tokens.
    Supports: hi, kn, ta, te, ml, fr, de, es, ar, ja, zh
    """
    from ml.translator import translate_notes_stream, LANGUAGES

    if payload.target_lang not in LANGUAGES:
        raise HTTPException(400, f"Unsupported language. Supported: {list(LANGUAGES.keys())}")

    rec = db.query(AudioFile).filter(
        AudioFile.id == job_id, AudioFile.user_id == current_user.id
    ).first()
    if not rec:
        raise HTTPException(404, "Job not found.")

    notes = db.query(StructuredNotes).filter(
        StructuredNotes.audio_file_id == job_id
    ).first()
    if not notes:
        raise HTTPException(404, "Notes not found.")

    # Use edited text if available, otherwise original
    source_text = notes.notes_edited_text or notes.notes_text or ""
    if not source_text.strip():
        raise HTTPException(400, "No notes text available to translate.")

    def event_stream():
        import json as _json
        try:
            for token in translate_notes_stream(source_text, payload.target_lang):
                yield f"data: {_json.dumps({'chunk': token})}\n\n"
        finally:
            yield f"data: {_json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/translation/languages", tags=["Translation"])
def get_supported_languages():
    """List all supported translation target languages."""
    from ml.translator import LANGUAGES
    return {"languages": [{"code": k, "name": v} for k, v in LANGUAGES.items()]}


# ─────────────────────────────────────────────────────────────
#  FEATURE 5 — STUDY GROUPS
# ─────────────────────────────────────────────────────────────

class GroupCreate(BaseModel):
    name:        str
    description: Optional[str] = None


class GroupJoin(BaseModel):
    invite_code: str


class GroupNoteAdd(BaseModel):
    audio_file_id: int


@app.post("/groups", status_code=201, tags=["Groups"])
def create_group(
    payload:      GroupCreate,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Create a new study group. Creator becomes the owner."""
    import secrets, string
    code = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))

    group = StudyGroup(
        name        = payload.name.strip(),
        description = payload.description,
        invite_code = code,
        owner_id    = current_user.id,
    )
    db.add(group)
    db.flush()

    member = GroupMember(group_id=group.id, user_id=current_user.id, role="owner")
    db.add(member)
    db.commit()
    db.refresh(group)

    return {
        "id":          group.id,
        "name":        group.name,
        "invite_code": group.invite_code,
        "created_at":  group.created_at.isoformat(),
    }


@app.get("/groups", tags=["Groups"])
def list_groups(
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """List all groups the current user belongs to."""
    memberships = db.query(GroupMember).filter(
        GroupMember.user_id == current_user.id
    ).all()
    result = []
    for m in memberships:
        g = m.group
        result.append({
            "id":           g.id,
            "name":         g.name,
            "description":  g.description,
            "invite_code":  g.invite_code,
            "role":         m.role,
            "member_count": len(g.members),
            "note_count":   len(g.notes),
            "owner":        g.owner.name,
            "created_at":   g.created_at.isoformat(),
        })
    return result


@app.get("/groups/{group_id}", tags=["Groups"])
def get_group(
    group_id:     int,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Get full details of a group including members and shared notes."""
    membership = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id  == current_user.id,
    ).first()
    if not membership:
        raise HTTPException(403, "You are not a member of this group.")

    g = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, "Group not found.")

    members = [
        {
            "user_id":   m.user_id,
            "name":      m.user.name,
            "email":     m.user.email,
            "role":      m.role,
            "joined_at": m.joined_at.isoformat(),
        }
        for m in g.members
    ]

    notes = []
    for gn in g.notes:
        af  = gn.audio_file
        sn  = db.query(StructuredNotes).filter(
            StructuredNotes.audio_file_id == af.id
        ).first()
        notes.append({
            "group_note_id": gn.id,
            "audio_file_id": af.id,
            "filename":      af.filename,
            "status":        af.status,
            "word_count":    sn.word_count if sn else 0,
            "added_by":      gn.adder.name,
            "added_at":      gn.added_at.isoformat(),
        })

    files = []
    for gf in g.files:
        files.append({
            "id":          gf.id,
            "filename":    gf.filename,
            "file_type":   gf.file_type,
            "file_size":   gf.file_size,
            "uploaded_by": gf.uploader.name,
            "uploaded_at": gf.uploaded_at.isoformat(),
        })

    return {
        "id":          g.id,
        "name":        g.name,
        "description": g.description,
        "invite_code": g.invite_code if membership.role == "owner" else None,
        "owner":       g.owner.name,
        "my_role":     membership.role,
        "members":     members,
        "notes":       notes,
        "files":       files,
        "created_at":  g.created_at.isoformat(),
    }


@app.post("/groups/join", tags=["Groups"])
def join_group(
    payload:      GroupJoin,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Join a group using its invite code."""
    g = db.query(StudyGroup).filter(
        StudyGroup.invite_code == payload.invite_code.strip().upper()
    ).first()
    if not g:
        raise HTTPException(404, "Invalid invite code.")

    existing = db.query(GroupMember).filter(
        GroupMember.group_id == g.id,
        GroupMember.user_id  == current_user.id,
    ).first()
    if existing:
        return {"message": "You are already a member of this group.", "group_id": g.id}

    member = GroupMember(group_id=g.id, user_id=current_user.id, role="member")
    db.add(member)
    db.commit()
    return {"message": f"Joined '{g.name}' successfully!", "group_id": g.id}


@app.post("/groups/{group_id}/notes", status_code=201, tags=["Groups"])
def add_note_to_group(
    group_id:     int,
    payload:      GroupNoteAdd,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Share one of your notes into a study group."""
    membership = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id  == current_user.id,
    ).first()
    if not membership:
        raise HTTPException(403, "You are not a member of this group.")

    af = db.query(AudioFile).filter(
        AudioFile.id      == payload.audio_file_id,
        AudioFile.user_id == current_user.id,
    ).first()
    if not af:
        raise HTTPException(404, "Audio file not found or not yours.")

    existing = db.query(GroupNote).filter(
        GroupNote.group_id      == group_id,
        GroupNote.audio_file_id == payload.audio_file_id,
    ).first()
    if existing:
        raise HTTPException(409, "This note is already shared in the group.")

    gn = GroupNote(
        group_id      = group_id,
        audio_file_id = payload.audio_file_id,
        added_by      = current_user.id,
    )
    db.add(gn)
    db.commit()
    return {"message": "Note added to group.", "group_note_id": gn.id}


@app.delete("/groups/{group_id}/notes/{group_note_id}", tags=["Groups"])
def remove_note_from_group(
    group_id:      int,
    group_note_id: int,
    db:            Session = Depends(get_db),
    current_user:  User    = Depends(get_current_user),
):
    """Remove a note from a group (owner or the person who added it)."""
    gn = db.query(GroupNote).filter(
        GroupNote.id       == group_note_id,
        GroupNote.group_id == group_id,
    ).first()
    if not gn:
        raise HTTPException(404, "Note not found in group.")

    g = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    is_owner  = g and g.owner_id == current_user.id
    is_adder  = gn.added_by == current_user.id
    if not (is_owner or is_adder):
        raise HTTPException(403, "Permission denied.")

    db.delete(gn)
    db.commit()
    return {"message": "Note removed from group."}


@app.delete("/groups/{group_id}/leave", tags=["Groups"])
def leave_group(
    group_id:     int,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Leave a study group (owner cannot leave — must delete instead)."""
    g = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, "Group not found.")
    if g.owner_id == current_user.id:
        raise HTTPException(400, "Owner cannot leave the group. Delete the group instead.")

    m = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id  == current_user.id,
    ).first()
    if not m:
        raise HTTPException(404, "You are not in this group.")
    db.delete(m)
    db.commit()
    return {"message": "Left group successfully."}


@app.delete("/groups/{group_id}", tags=["Groups"])
def delete_group(
    group_id:     int,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Delete a study group (owner only)."""
    g = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, "Group not found.")
    if g.owner_id != current_user.id:
        raise HTTPException(403, "Only the owner can delete the group.")
    db.delete(g)
    db.commit()
    return {"message": "Group deleted."}


#  HEALTH CHECK
# ─────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────
#  GROUP FILES
# ─────────────────────────────────────────────────────────────

GROUP_FILE_EXTS = {".pdf", ".docx", ".txt", ".doc", ".pptx", ".xlsx", ".png", ".jpg", ".jpeg"}
GROUP_FILES_DIR = os.path.join(UPLOAD_DIR, "group_files")
os.makedirs(GROUP_FILES_DIR, exist_ok=True)


@app.post("/groups/{group_id}/files", status_code=201, tags=["Groups"])
async def upload_group_file(
    group_id:     int,
    file:         UploadFile         = File(...),
    db:           Session            = Depends(get_db),
    current_user: User               = Depends(get_current_user),
):
    """Upload a local file (PDF, DOCX, TXT, image) directly to a study group."""
    membership = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id  == current_user.id,
    ).first()
    if not membership:
        raise HTTPException(403, "You are not a member of this group.")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in GROUP_FILE_EXTS:
        raise HTTPException(400, f"File type '{ext}' not allowed. Allowed: {', '.join(sorted(GROUP_FILE_EXTS))}")

    safe_name = f"{uuid.uuid4()}{ext}"
    dest_path = os.path.join(GROUP_FILES_DIR, safe_name)
    content   = await file.read()
    with open(dest_path, "wb") as f:
        f.write(content)

    gf = GroupFile(
        group_id    = group_id,
        uploaded_by = current_user.id,
        filename    = file.filename or safe_name,
        file_path   = dest_path,
        file_type   = ext.lstrip("."),
        file_size   = len(content),
    )
    db.add(gf)
    db.commit()
    db.refresh(gf)
    return {
        "id":        gf.id,
        "filename":  gf.filename,
        "file_type": gf.file_type,
        "file_size": gf.file_size,
        "message":   "File uploaded to group.",
    }


@app.get("/groups/{group_id}/files", tags=["Groups"])
def list_group_files(
    group_id:     int,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """List all files uploaded to a group."""
    membership = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id  == current_user.id,
    ).first()
    if not membership:
        raise HTTPException(403, "You are not a member of this group.")

    files = (
        db.query(GroupFile)
        .filter(GroupFile.group_id == group_id)
        .order_by(GroupFile.uploaded_at.desc())
        .all()
    )
    return [
        {
            "id":          f.id,
            "filename":    f.filename,
            "file_type":   f.file_type,
            "file_size":   f.file_size,
            "uploaded_by": f.uploader.name,
            "uploaded_at": f.uploaded_at.isoformat(),
        }
        for f in files
    ]


@app.get("/groups/{group_id}/files/{file_id}/download", tags=["Groups"])
def download_group_file(
    group_id:     int,
    file_id:      int,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Download a group file."""
    membership = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id  == current_user.id,
    ).first()
    if not membership:
        raise HTTPException(403, "You are not a member of this group.")

    gf = db.query(GroupFile).filter(
        GroupFile.id       == file_id,
        GroupFile.group_id == group_id,
    ).first()
    if not gf:
        raise HTTPException(404, "File not found.")
    if not os.path.isfile(gf.file_path):
        raise HTTPException(404, "File not found on disk.")

    MIME_MAP = {
        "pdf":  "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc":  "application/msword",
        "txt":  "text/plain",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "png":  "image/png",
        "jpg":  "image/jpeg",
        "jpeg": "image/jpeg",
    }
    media_type = MIME_MAP.get(gf.file_type, "application/octet-stream")
    with open(gf.file_path, "rb") as f:
        content = f.read()
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{gf.filename}"'},
    )


@app.delete("/groups/{group_id}/files/{file_id}", tags=["Groups"])
def delete_group_file(
    group_id:     int,
    file_id:      int,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Delete a group file (uploader or group owner)."""
    gf = db.query(GroupFile).filter(
        GroupFile.id       == file_id,
        GroupFile.group_id == group_id,
    ).first()
    if not gf:
        raise HTTPException(404, "File not found.")

    g         = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    is_owner  = g and g.owner_id == current_user.id
    is_uploader = gf.uploaded_by == current_user.id
    if not (is_owner or is_uploader):
        raise HTTPException(403, "Permission denied.")

    if os.path.isfile(gf.file_path):
        os.remove(gf.file_path)
    db.delete(gf)
    db.commit()
    return {"message": "File deleted."}


# ─────────────────────────────────────────────────────────────
#  GROUP CHAT
# ─────────────────────────────────────────────────────────────

class GroupChatSend(BaseModel):
    message: str


@app.post("/groups/{group_id}/chat", status_code=201, tags=["Groups"])
def send_chat_message(
    group_id:     int,
    payload:      GroupChatSend,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Send a message in the group chat."""
    membership = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id  == current_user.id,
    ).first()
    if not membership:
        raise HTTPException(403, "You are not a member of this group.")

    text = payload.message.strip()
    if not text:
        raise HTTPException(400, "Message cannot be empty.")
    if len(text) > 2000:
        raise HTTPException(400, "Message too long (max 2000 chars).")

    msg = GroupChatMessage(
        group_id  = group_id,
        sender_id = current_user.id,
        message   = text,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return {
        "id":          msg.id,
        "sender":      current_user.name,
        "sender_id":   current_user.id,
        "message":     msg.message,
        "sent_at":     msg.sent_at.isoformat(),
    }


@app.get("/groups/{group_id}/chat", tags=["Groups"])
def get_chat_messages(
    group_id:     int,
    limit:        int     = Query(50, ge=1, le=200),
    before_id:    int     = Query(None),
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """
    Fetch paginated chat messages for a group.
    Returns messages in ascending chronological order.
    Use before_id to paginate backwards (load older messages).
    """
    membership = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id  == current_user.id,
    ).first()
    if not membership:
        raise HTTPException(403, "You are not a member of this group.")

    q = db.query(GroupChatMessage).filter(
        GroupChatMessage.group_id == group_id
    )
    if before_id:
        q = q.filter(GroupChatMessage.id < before_id)
    msgs = q.order_by(GroupChatMessage.id.desc()).limit(limit).all()
    msgs = list(reversed(msgs))   # return oldest-first

    return [
        {
            "id":        m.id,
            "sender":    m.sender.name,
            "sender_id": m.sender_id,
            "message":   m.message,
            "sent_at":   m.sent_at.isoformat(),
        }
        for m in msgs
    ]


#  HEALTH CHECK
# ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
def health():
    return {
        "status":  "ok",
        "service": "AudioNotes AI API",
        "version": "3.0.0",
        "models":  {
            "whisper": WHISPER_ID,
            "t5":      T5_ID,
            "trans":   TRANS_ID,
        },
    }

@app.get("/", tags=["Health"])
def root():
    return {"message": "AudioNotes AI API v3.0 — visit /docs for API reference"}

