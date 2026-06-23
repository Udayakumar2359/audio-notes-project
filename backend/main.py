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
    FastAPI,
    Depends,
    HTTPException,
    UploadFile,
    File,
    BackgroundTasks,
    status as http_status,
    Query,
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
    get_db,
    init_db,
    User,
    AudioFile,
    AudioChunk,
    Transcription,
    StructuredNotes,
    SharedNote,
    StudyGroup,
    GroupMember,
    GroupNote,
    GroupFile,
    GroupChatMessage,
)
from auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    generate_otp,
    send_otp_email,
    OTP_EXPIRE_MINUTES,
)

# ── Environment ───────────────────────────────────────────────
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
WHISPER_ID = os.getenv("WHISPER_MODEL_ID", "udayakumar8214/whisper-classroom-kn-hi-en")
QWEN_ID = os.getenv("QWEN_MODEL_ID", "Qwen/Qwen2.5-7B-Instruct")
TRANS_ID = os.getenv("TRANSLATION_MODEL", "Helsinki-NLP/opus-mt-mul-en")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".flac", ".webm", ".aac"}

# ─────────────────────────────────────────────────────────────
#  Lifespan — Init DB only (models load lazily on first use)
# ─────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────
    init_db()
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    # Whisper loads lazily on first audio upload (unchanged).
    # Qwen2.5-7B-Instruct loads EAGERLY at startup with 4-bit quantization.
    app.state.agents = {}  # job_id -> TranscriptAgent instance
    print("[Startup] DB ready. NLP generation is handled by Ollama (external process).")
    print("[Startup] Server ready!  (Whisper loads on first audio upload)")

    yield  # app runs here while serving requests

    # ── Shutdown ──────────────────────────────────────────────
    import ml.pipeline

    ml.pipeline.SHUTDOWN = True
    print("[Shutdown] Marked pipeline for shutdown.")


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
    name: str
    email: str
    password: str


class OtpRequest(BaseModel):
    email: str


class OtpVerify(BaseModel):
    email: str
    otp: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    is_verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ResetPasswordPayload(BaseModel):
    current_password: str
    new_password: str


# ─────────────────────────────────────────────────────────────
#  EVALUATION ROUTE
#  POST /evaluate?model=all|asr|translation|notes
#  Requires auth. Runs evaluation in-process and returns JSON.
# ─────────────────────────────────────────────────────────────


@app.post("/evaluate", tags=["Evaluation"])
def run_evaluation(
    model: str = Query(
        "all", description="Which model: all | asr | translation | notes"
    ),
    current_user: User = Depends(get_current_user),
):
    """
    Evaluate one or all models with built-in test samples.
    Returns JSON with WER, CER, RTF, BLEU, chrF, ROUGE-1/2/L, coverage, latency.

    Note: first call takes longer because models are already loaded at startup.
    """
    from ml.evaluator import (
        TranslationSample,
        NotesSample,
        evaluate_translation,
        evaluate_notes,
        build_report,
    )
    from ml.model_registry import get_transcriber
    from dataclasses import asdict

    # Whisper loads lazily; Qwen was loaded at startup.
    # evaluate_notes() calls nlp_agent internally — no structurer needed.
    transcriber = get_transcriber()
    structurer = None  # kept for call-site compat; ignored inside evaluate_notes()

    run_trans = model in ("translation", "all")
    run_notes = model in ("notes", "all")

    # ── Translation samples ────────────────────────────────────
    TRANS_SAMPLES = [
        TranslationSample(
            "ಇಂದಿನ ತರಗತಿಯಲ್ಲಿ ನಾವು ಯಂತ್ರ ಕಲಿಕೆಯ ಮೂಲ ತತ್ವಗಳನ್ನು ಕಲಿಯುತ್ತೇವೆ.",
            "In today's class we will learn the basic principles of machine learning.",
            "kn",
        ),
        TranslationSample(
            "ಗಣಕಯಂತ್ರ ವಿಜ್ಞಾನದಲ್ಲಿ ಅಲ್ಗಾರಿದಮ್ ಬಹಳ ಮುಖ್ಯ.",
            "Algorithm is very important in computer science.",
            "kn",
        ),
        TranslationSample(
            "आज हम मशीन लर्निंग के बुनियादी सिद्धांत सीखेंगे।",
            "Today we will learn the basic principles of machine learning.",
            "hi",
        ),
        TranslationSample(
            "डेटा साइंस में सांख्यिकी बहुत महत्वपूर्ण है।",
            "Statistics is very important in data science.",
            "hi",
        ),
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
        "model": model,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "results": results,
    }


# ─────────────────────────────────────────────────────────────
#  GOOGLE OAUTH ROUTE
# ─────────────────────────────────────────────────────────────

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")


class GoogleTokenPayload(BaseModel):
    # GIS sends 'credential'; our old code sent 'id_token' — accept both
    credential: Optional[str] = None
    id_token: Optional[str] = None

    def get_token(self) -> str:
        """Return whichever field was provided."""
        return self.credential or self.id_token or ""


@app.post("/auth/google", tags=["Auth"])
async def google_auth(payload: GoogleTokenPayload, db: Session = Depends(get_db)):
    """
    Exchange a Google ID token (from the frontend GIS popup) for our app JWT.

    Flow:
      1. Verify the Google ID token with Google's public keys
      2. Extract google_id (sub), email, name, picture
      3. Upsert user in DB:
         - Found by google_id  → existing Google user, just log in
         - Found by email only → existing email/password user, link google_id
         - Not found           → create new user (no password, already verified)
      4. Return our JWT + user object
    """
    if not GOOGLE_CLIENT_ID or GOOGLE_CLIENT_ID == "YOUR_GOOGLE_CLIENT_ID":
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured. Set GOOGLE_CLIENT_ID in .env.",
        )

    # ── Extract the ID token (accept both field names) ─────────
    raw_token = payload.get_token()
    if not raw_token:
        raise HTTPException(
            status_code=422,
            detail="Missing Google credential. Send {'credential': '<id_token>'} in the request body.",
        )

    # ── Verify token with Google ───────────────────────────────
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests

        idinfo = google_id_token.verify_oauth2_token(
            raw_token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=10,
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {e}")

    # ── Extract claims ─────────────────────────────────────────
    google_id = idinfo["sub"]  # stable unique Google user ID
    email = idinfo.get("email", "").lower().strip()
    name = idinfo.get("name", email.split("@")[0].title())

    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email.")

    # ── Upsert user ────────────────────────────────────────────
    # Priority: find by google_id first, then by email
    user = db.query(User).filter(User.google_id == google_id).first()

    if not user:
        # Try to find by email (existing email/password account)
        user = db.query(User).filter(User.email == email).first()
        if user:
            # Link Google ID to the existing account
            user.google_id = google_id
            user.is_verified = True  # Google has already verified the email
            db.commit()
        else:
            # Brand-new user via Google
            user = User(
                google_id=google_id,
                name=name,
                email=email,
                hashed_password=None,  # no password for Google-only users
                is_verified=True,  # Google verified the email
            )
            db.add(user)
            db.commit()
            db.refresh(user)

    # ── Issue our app JWT ──────────────────────────────────────
    token = create_access_token({"sub": user.email})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
        },
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
        existing.otp_code = otp
        existing.otp_expires_at = datetime.utcnow() + timedelta(
            minutes=OTP_EXPIRE_MINUTES
        )
        existing.hashed_password = hash_password(
            payload.password
        )  # update pw in case they changed it
        existing.name = payload.name.strip()
        db.commit()
        send_otp_email(email, otp, existing.name, purpose="verification")
        return {
            "message": f"Account exists but not verified. A new OTP has been sent to {email}.",
            "next": "POST /auth/verify-otp",
        }

    if existing and existing.is_verified:
        raise HTTPException(400, "Email is already registered. Please log in.")

    otp = generate_otp()
    new_user = User(
        name=payload.name.strip(),
        email=email,
        hashed_password=hash_password(payload.password),
        otp_code=otp,
        otp_expires_at=datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MINUTES),
        is_verified=False,
    )
    db.add(new_user)
    db.commit()

    send_otp_email(email, otp, payload.name.strip(), purpose="verification")
    return {
        "message": f"Account created! A 6-digit OTP has been sent to {email}.",
        "next": "POST /auth/verify-otp",
    }


@app.post("/auth/verify-otp", tags=["Auth"])
def verify_otp(payload: OtpVerify, db: Session = Depends(get_db)):
    """
    Step 2 of registration:
    Verify OTP → mark account as verified → return JWT so user is logged in immediately.
    """
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(404, "Email not found.")
    if user.is_verified:
        # Already verified — just log them in
        token = create_access_token({"sub": user.email})
        return {
            "message": "Account already verified.",
            "verified": True,
            "access_token": token,
            "token_type": "bearer",
            "user": {"id": user.id, "name": user.name, "email": user.email},
        }
    if not user.otp_code or user.otp_code != payload.otp:
        raise HTTPException(400, "Invalid OTP code. Please check and try again.")
    if user.otp_expires_at and datetime.utcnow() > user.otp_expires_at:
        raise HTTPException(400, "OTP expired. Click Resend to get a new code.")

    user.is_verified = True
    user.otp_code = None
    user.otp_expires_at = None
    db.commit()

    # Issue JWT immediately after registration verification
    token = create_access_token({"sub": user.email})
    return {
        "message": "Email verified! Welcome to AudioNotes AI.",
        "verified": True,
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user.id, "name": user.name, "email": user.email},
    }


@app.post("/auth/send-otp", tags=["Auth"])
def send_otp_route(payload: OtpRequest, db: Session = Depends(get_db)):
    """Resend registration OTP to unverified account."""
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(404, "Email not found.")
    if user.is_verified:
        raise HTTPException(400, "Account is already verified. Please log in.")

    otp = generate_otp()
    user.otp_code = otp
    user.otp_expires_at = datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MINUTES)
    db.commit()

    send_otp_email(email, otp, user.name, purpose="verification")
    return {"message": "OTP resent. Check your inbox (and Spam folder)."}


@app.post("/auth/login", tags=["Auth"])
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Step 1 of login:
    Verify email + password → send 6-digit login OTP to email.
    Complete login via POST /auth/verify-login-otp.
    """
    email = form.username.strip().lower()
    user = db.query(User).filter(User.email == email).first()

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
    otp = generate_otp()
    user.otp_code = otp
    user.otp_expires_at = datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MINUTES)
    db.commit()

    send_otp_email(email, otp, user.name, purpose="login")

    return {
        "message": f"A login verification code has been sent to {email}.",
        "next": "POST /auth/verify-login-otp",
        "email": email,
    }


@app.post("/auth/verify-login-otp", response_model=Token, tags=["Auth"])
def verify_login_otp(payload: OtpVerify, db: Session = Depends(get_db)):
    """
    Step 2 of login:
    Verify login OTP → return JWT → user lands on dashboard.
    """
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(404, "Email not found.")
    if not user.otp_code or user.otp_code != payload.otp:
        raise HTTPException(400, "Invalid login code. Please check and try again.")
    if user.otp_expires_at and datetime.utcnow() > user.otp_expires_at:
        raise HTTPException(400, "Code expired. Please log in again to get a new code.")

    user.otp_code = None
    user.otp_expires_at = None
    db.commit()

    token = create_access_token({"sub": user.email})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user.id, "name": user.name, "email": user.email},
    }


@app.get("/auth/me", response_model=UserOut, tags=["Auth"])
def me(current_user: User = Depends(get_current_user)):
    return current_user


@app.post("/auth/reset-password", tags=["Auth"])
def reset_password(
    payload: ResetPasswordPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Logged-in user: send OTP to their email to authorize a password change."""
    otp = generate_otp()
    current_user.otp_code = otp
    current_user.otp_expires_at = datetime.utcnow() + timedelta(
        minutes=OTP_EXPIRE_MINUTES
    )
    db.commit()
    send_otp_email(current_user.email, otp, current_user.name, purpose="login")
    return {"message": f"A verification code has been sent to {current_user.email}."}


class ChangePasswordOtpPayload(BaseModel):
    otp: str
    new_password: str


@app.post("/auth/verify-password-change", tags=["Auth"])
def verify_password_change(
    payload: ChangePasswordOtpPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Logged-in user: verify OTP then set new password."""
    if not current_user.otp_code or current_user.otp_code != payload.otp:
        raise HTTPException(400, "Invalid verification code.")
    if current_user.otp_expires_at and datetime.utcnow() > current_user.otp_expires_at:
        raise HTTPException(400, "Code expired. Request a new one.")
    if len(payload.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    current_user.hashed_password = hash_password(payload.new_password)
    current_user.otp_code = None
    current_user.otp_expires_at = None
    db.commit()
    return {"message": "Password updated successfully."}


class ForgotPasswordPayload(BaseModel):
    email: str


@app.post("/auth/forgot-password", tags=["Auth"])
def forgot_password(payload: ForgotPasswordPayload, db: Session = Depends(get_db)):
    """Public: send OTP to registered email for password reset (no login required)."""
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    # Always return success to avoid email enumeration
    if user and user.hashed_password:
        otp = generate_otp()
        user.otp_code = otp
        user.otp_expires_at = datetime.utcnow() + timedelta(minutes=OTP_EXPIRE_MINUTES)
        db.commit()
        send_otp_email(email, otp, user.name, purpose="login")
    return {"message": "If that email is registered, a reset code has been sent."}


class ResetForgottenPasswordPayload(BaseModel):
    email: str
    otp: str
    new_password: str


@app.post("/auth/reset-forgotten-password", tags=["Auth"])
def reset_forgotten_password(
    payload: ResetForgottenPasswordPayload,
    db: Session = Depends(get_db),
):
    """Public: verify OTP + set new password (forgot-password flow)."""
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(404, "Email not found.")
    if not user.otp_code or user.otp_code != payload.otp:
        raise HTTPException(400, "Invalid reset code.")
    if user.otp_expires_at and datetime.utcnow() > user.otp_expires_at:
        raise HTTPException(400, "Reset code expired. Request a new one.")
    if len(payload.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    user.hashed_password = hash_password(payload.new_password)
    user.otp_code = None
    user.otp_expires_at = None
    db.commit()
    return {"message": "Password reset successfully. You can now log in."}


@app.post("/audio/upload", tags=["Audio"])
async def upload_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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

    job_id = str(uuid.uuid4())
    save_name = f"{job_id}{ext}"
    file_path = os.path.join(UPLOAD_DIR, save_name)

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    record = AudioFile(
        user_id=current_user.id,
        filename=file.filename,
        file_path=file_path,
        status="uploaded",
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    background_tasks.add_task(
        _run_pipeline_bg,
        record.id,
        file_path,
    )

    return {
        "job_id": record.id,
        "status": "uploaded",
        "filename": file.filename,
        "message": "Processing started. Poll /audio/{job_id}/status.",
    }


class YoutubeUploadPayload(BaseModel):
    url: str


@app.post("/audio/upload-youtube", tags=["Audio"])
async def upload_youtube(
    payload: YoutubeUploadPayload,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submit a YouTube (or any yt-dlp-supported) URL.
    Audio is downloaded server-side to WAV/M4A, then processed
    through the same pipeline as a regular file upload.
    """
    url = payload.url.strip()
    if not url:
        raise HTTPException(400, "URL is required.")

    # Basic sanity check — must look like a URL
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(400, "Please provide a valid http/https URL.")

    try:
        import yt_dlp  # noqa: F401  (imported here for lazy loading)
    except ImportError:
        raise HTTPException(503, "yt-dlp is not installed on the server.")

    import threading

    job_id = str(uuid.uuid4())
    out_tmpl = os.path.join(UPLOAD_DIR, f"{job_id}.%(ext)s")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": out_tmpl,
        "quiet": True,
        "no_warnings": True,
        # Prefer m4a for speed; ffmpeg post-processing is skipped intentionally
        # (the pipeline converts to WAV itself)
        "postprocessors": [],
        # Cap download to ~60 min at 128 kbps ≈ ~55 MB
        "max_filesize": 60 * 1024 * 1024,
        "socket_timeout": 30,
    }

    # --- Download (blocking, run in threadpool to not block the event loop) ---
    downloaded_path = None
    video_title = "YouTube Audio"

    def _download():
        nonlocal downloaded_path, video_title
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            video_title = info.get("title", "YouTube Audio")
            # Find the file yt-dlp actually wrote
            ext = info.get("ext", "m4a")
            downloaded_path = os.path.join(UPLOAD_DIR, f"{job_id}.{ext}")

    err_holder = []

    def _safe_download():
        try:
            _download()
        except Exception as e:
            err_holder.append(str(e))

    t = threading.Thread(target=_safe_download)
    t.start()
    t.join(timeout=120)  # 2-minute cap

    if t.is_alive():
        raise HTTPException(
            504, "Download timed out after 2 minutes. Try a shorter video."
        )
    if err_holder:
        raise HTTPException(400, f"Could not download video: {err_holder[0]}")
    if not downloaded_path or not os.path.exists(downloaded_path):
        raise HTTPException(500, "Download completed but file not found.")

    # --- Create DB record (same as regular upload) ---
    record = AudioFile(
        user_id=current_user.id,
        filename=f"{video_title[:120]}.yt",  # .yt suffix so UI can show YouTube icon
        file_path=downloaded_path,
        status="uploaded",
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    background_tasks.add_task(_run_pipeline_bg, record.id, downloaded_path)

    return {
        "job_id": record.id,
        "status": "uploaded",
        "filename": record.filename,
        "title": video_title,
        "message": "YouTube audio downloaded. Processing started.",
    }


def _run_pipeline_bg(audio_file_id, file_path):
    """Load transcriber lazily then run the full Qwen NLP pipeline, then pre-init the agent."""
    from ml.pipeline import run_full_pipeline
    from ml.model_registry import get_transcriber

    # Whisper loads here on first call; subsequent calls return cached instance.
    # Qwen was already loaded at startup via lifespan.
    transcriber = get_transcriber()
    run_full_pipeline(audio_file_id, file_path, None, transcriber)

    # ── Pre-initialise the TranscriptAgent for this job ────────────────
    # Build & cache it immediately so the first /agent/{id}/init call from
    # the frontend finds a warm agent instead of constructing it on demand.
    try:
        if audio_file_id not in app.state.agents:
            from database import SessionLocal, AudioChunk, StructuredNotes
            from ml.model_registry import get_agent_class

            _db = SessionLocal()
            try:
                notes = (
                    _db.query(StructuredNotes)
                    .filter(StructuredNotes.audio_file_id == audio_file_id)
                    .first()
                )
                chunks = (
                    _db.query(AudioChunk)
                    .filter(AudioChunk.audio_file_id == audio_file_id)
                    .order_by(AudioChunk.chunk_index)
                    .all()
                )
                parts = []
                for c in chunks:
                    if c.transcription:
                        txt = (
                            c.transcription.translated_text
                            or c.transcription.raw_text
                            or ""
                        ).strip()
                        if txt:
                            parts.append(txt)
                full_transcript = (
                    " ".join(parts) or (notes.notes_text if notes else "") or ""
                )
                TranscriptAgent = get_agent_class()
                agent = TranscriptAgent(
                    job_id=audio_file_id, transcript_text=full_transcript
                )
                app.state.agents[audio_file_id] = agent
                print(f"[Pipeline] Agent pre-initialised for job {audio_file_id}")
            finally:
                _db.close()
    except Exception as agent_err:
        # Agent init failure must never break the pipeline result
        print(f"[Pipeline] Agent pre-init skipped for job {audio_file_id}: {agent_err}")


# ─────────────────────────────────────────────────────────────
#  Access helper — owner OR group member
# ─────────────────────────────────────────────────────────────


def _can_access_audio(
    job_id: int, current_user_id: int, db: Session
) -> "AudioFile | None":
    """
    Return the AudioFile record if the current user may read it:
      • They own it (user_id matches), OR
      • The note is shared into a group they belong to.
    Returns None if no access.
    """
    record = db.query(AudioFile).filter(AudioFile.id == job_id).first()
    if not record:
        return None
    # Owner: always allowed
    if record.user_id == current_user_id:
        return record
    # Group member: note must be in a group the user belongs to
    shared = (
        db.query(GroupNote)
        .join(GroupMember, GroupMember.group_id == GroupNote.group_id)
        .filter(
            GroupNote.audio_file_id == job_id,
            GroupMember.user_id == current_user_id,
        )
        .first()
    )
    if shared:
        return record
    return None


@app.get("/audio/{job_id}/status", tags=["Audio"])
def get_status(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = (
        db.query(AudioFile)
        .filter(
            AudioFile.id == job_id,
            AudioFile.user_id == current_user.id,
        )
        .first()
    )
    if not record:
        raise HTTPException(404, "Job not found.")
    return {"job_id": job_id, "status": record.status, "filename": record.filename}


@app.delete("/audio/{job_id}/cancel", tags=["Audio"])
def cancel_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Cancel an in-progress processing job and delete the uploaded file + DB record.
    Safe to call at any pipeline stage.
    """
    record = (
        db.query(AudioFile)
        .filter(
            AudioFile.id == job_id,
            AudioFile.user_id == current_user.id,
        )
        .first()
    )
    if not record:
        raise HTTPException(404, "Job not found.")

    # ── Signal the pipeline worker to stop ────────────────────
    from ml.pipeline import CANCELLED_JOBS
    CANCELLED_JOBS.add(job_id)

    # ── Delete the uploaded audio file from disk ──────────────
    file_path = record.file_path
    if file_path:
        try:
            if os.path.isfile(file_path):
                os.remove(file_path)
                print(f"[Cancel] Deleted uploaded file: {file_path}")
            # Also try to remove derived temp files
            base = os.path.splitext(file_path)[0]
            for suffix in ("_raw.wav", "_clean.wav"):
                p = base + suffix
                if os.path.isfile(p):
                    os.remove(p)
            chunk_dir = base + "_chunks"
            if os.path.isdir(chunk_dir):
                shutil.rmtree(chunk_dir, ignore_errors=True)
        except Exception as e:
            print(f"[Cancel] File cleanup warning: {e}")

    # ── Delete the DB record (cascades to chunks/transcriptions) ─
    try:
        db.delete(record)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"DB cleanup failed: {e}")

    print(f"[Cancel] Job {job_id} cancelled and deleted by user {current_user.id}")
    return {"message": "Job cancelled and file deleted successfully.", "job_id": job_id}



@app.get("/audio/{job_id}/notes", tags=["Audio"])
def get_notes(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve structured notes. Accessible by the owner or any group member the note is shared with."""
    record = _can_access_audio(job_id, current_user.id, db)
    if not record:
        raise HTTPException(404, "Job not found or access denied.")
    if record.status != "done":
        raise HTTPException(400, f"Notes not ready. Current status: {record.status}")

    notes = (
        db.query(StructuredNotes)
        .filter(StructuredNotes.audio_file_id == job_id)
        .first()
    )
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
            transcription_list.append(
                {
                    "chunk_index": chunk.chunk_index,
                    "start": chunk.start_time,
                    "end": chunk.end_time,
                    "raw_text": tr.raw_text,
                    "cleaned_text": tr.cleaned_text,
                    "detected_language": tr.detected_language,
                    "translated_text": tr.translated_text,
                }
            )

    # Parse credibility scores
    credibility_dict = {}
    if hasattr(notes, "credibility_json") and notes.credibility_json:
        try:
            credibility_dict = json.loads(notes.credibility_json)
        except json.JSONDecodeError:
            pass

    return {
        "job_id": job_id,
        "filename": record.filename,
        "notes_text": notes.notes_text,
        "notes": notes_dict,
        "word_count": notes.word_count,
        "credibility": credibility_dict,
        # Transcriptions omitted from initial load — fetch lazily via /audio/{job_id}/transcripts
    }


@app.get("/audio/{job_id}/transcripts", tags=["Audio"])
def get_transcripts(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lazy-load per-chunk transcriptions. Accessible by owner or group member."""
    record = _can_access_audio(job_id, current_user.id, db)
    if not record:
        raise HTTPException(404, "Job not found or access denied.")

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
            result.append(
                {
                    "chunk_index": chunk.chunk_index,
                    "start": chunk.start_time,
                    "end": chunk.end_time,
                    "raw_text": tr.raw_text,
                    "detected_language": tr.detected_language,
                    "translated_text": tr.translated_text,
                }
            )
    return {"transcriptions": result}


@app.get("/audio/{job_id}/polished-transcript", tags=["Audio"])
def get_polished_transcript(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get the polished transcript (cleaned up, no shortening) and raw transcript.
    Polished: with repeated words removed, grammar fixed, but full content preserved.
    Raw: combined raw transcription from all chunks.
    """
    record = _can_access_audio(job_id, current_user.id, db)
    if not record:
        raise HTTPException(404, "Job not found or access denied.")

    # Try to get polished transcript from StructuredNotes
    notes = (
        db.query(StructuredNotes)
        .filter(StructuredNotes.audio_file_id == job_id)
        .first()
    )

    polished_text = ""
    if notes and notes.notes_json:
        try:
            import json as _json

            notes_dict = _json.loads(notes.notes_json)
            polished_text = notes_dict.get("polished_transcript", "")
        except Exception:
            pass

    # Get full transcript (raw) from chunks
    chunks = (
        db.query(AudioChunk)
        .filter(AudioChunk.audio_file_id == job_id)
        .order_by(AudioChunk.chunk_index)
        .all()
    )

    raw_parts = []
    for chunk in chunks:
        if chunk.transcription:
            text = (chunk.transcription.raw_text or "").strip()
            if text:
                raw_parts.append(text)

    raw_text = " ".join(raw_parts)

    return {
        "polished_transcript": polished_text,
        "raw_transcript": raw_text,
    }


# ─────────────────────────────────────────────────────────────
#  CREDIBILITY ROUTE
# ─────────────────────────────────────────────────────────────


@app.get("/audio/{job_id}/credibility", tags=["Credibility"])
def get_credibility(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns T5 faithfulness scores (from DB) + live agent groundedness.
    Accessible by the owner or any group member the note is shared with.
    """
    record = _can_access_audio(job_id, current_user.id, db)
    if not record:
        raise HTTPException(404, "Job not found or access denied.")

    notes = (
        db.query(StructuredNotes)
        .filter(StructuredNotes.audio_file_id == job_id)
        .first()
    )

    # ── T5 scores from DB ─────────────────────────────────────
    t5_data = {}
    if notes and hasattr(notes, "credibility_json") and notes.credibility_json:
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
    agent = agents.get(job_id)
    if agent and hasattr(agent, "get_groundedness_report"):
        try:
            agent_data = agent.get_groundedness_report()
        except Exception:
            pass

    return {
        "job_id": job_id,
        "t5": t5_data,
        "agent": agent_data,
    }


@app.get("/audio/{job_id}/download", tags=["Audio"])
def download_notes(
    job_id: int,
    format: str = Query("txt", pattern="^(txt|docx|pdf)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Download notes in the requested format.
    ?format=txt   → plain text file
    ?format=docx  → Microsoft Word document
    ?format=pdf   → PDF document
    """
    record = _can_access_audio(job_id, current_user.id, db)
    if not record:
        raise HTTPException(404, "Job not found or access denied.")
    if record.status != "done":
        raise HTTPException(400, "Notes not ready yet.")

    notes = (
        db.query(StructuredNotes)
        .filter(StructuredNotes.audio_file_id == job_id)
        .first()
    )
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
        content = export_txt(notes_dict)
        media_type = "text/plain; charset=utf-8"
        filename = f"{safe_name}_notes.txt"
    elif format == "docx":
        content = export_docx(notes_dict)
        media_type = (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        filename = f"{safe_name}_notes.docx"
    else:  # pdf
        content = export_pdf(notes_dict)
        media_type = "application/pdf"
        filename = f"{safe_name}_notes.pdf"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/audio/{job_id}/group-references", tags=["Audio"])
def get_group_references(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns all study groups and shared-link tokens that reference this audio file.
    Used by the frontend to warn the user before deletion.
    """
    record = (
        db.query(AudioFile)
        .filter(
            AudioFile.id == job_id,
            AudioFile.user_id == current_user.id,
        )
        .first()
    )
    if not record:
        raise HTTPException(404, "Job not found.")

    # Collect group names that reference this note
    group_notes = db.query(GroupNote).filter(GroupNote.audio_file_id == job_id).all()
    affected_groups = []
    for gn in group_notes:
        group = db.query(StudyGroup).filter(StudyGroup.id == gn.group_id).first()
        if group:
            affected_groups.append({"id": group.id, "name": group.name})

    # Shared link tokens
    shared_links = db.query(SharedNote).filter(SharedNote.audio_file_id == job_id).all()
    share_tokens = [
        {"token": s.token, "view_count": s.view_count} for s in shared_links
    ]

    return {
        "audio_file_id": job_id,
        "filename": record.filename,
        "affected_groups": affected_groups,
        "shared_links": share_tokens,
        "has_references": bool(affected_groups or share_tokens),
    }


@app.delete("/audio/{job_id}", tags=["Audio"])
def delete_upload(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Permanently delete an audio upload and ALL related data:
      - AudioChunks + Transcriptions (cascade via ORM)
      - StructuredNotes (cascade via ORM)
      - SharedNote tokens (explicit delete + ORM cascade)
      - GroupNote references in study groups (explicit delete + ORM cascade)
      - Physical audio file on disk
    """
    record = (
        db.query(AudioFile)
        .filter(
            AudioFile.id == job_id,
            AudioFile.user_id == current_user.id,
        )
        .first()
    )
    if not record:
        raise HTTPException(404, "Job not found.")

    # ── Step 1: explicitly remove FK-referencing rows that lack ORM cascade ──
    # (belt-and-suspenders: ORM cascade now covers these, but explicit removal
    #  ensures correctness even on legacy DB sessions / SQLite edge-cases)
    group_notes_deleted = (
        db.query(GroupNote)
        .filter(GroupNote.audio_file_id == job_id)
        .delete(synchronize_session=False)
    )
    shared_notes_deleted = (
        db.query(SharedNote)
        .filter(SharedNote.audio_file_id == job_id)
        .delete(synchronize_session=False)
    )

    # ── Step 2: delete physical file ─────────────────────────────────────────
    if record.file_path and os.path.isfile(record.file_path):
        try:
            os.remove(record.file_path)
        except OSError:
            pass  # file already gone — continue with DB cleanup

    # ── Step 3: delete the main record (ORM cascade: chunks, notes, etc.) ───
    db.delete(record)
    db.commit()

    # ── Step 4: cancel any in-flight pipeline job ────────────────────────────
    import ml.pipeline

    ml.pipeline.CANCELLED_JOBS.add(job_id)

    # Evict from in-memory agent cache
    if hasattr(app.state, "agents") and job_id in app.state.agents:
        del app.state.agents[job_id]

    return {
        "message": "Deleted successfully.",
        "audio_file_id": job_id,
        "group_notes_removed": group_notes_deleted,
        "shared_links_removed": shared_notes_deleted,
    }


# ─────────────────────────────────────────────────────────────
#  USER ROUTES
# ─────────────────────────────────────────────────────────────


@app.get("/user/uploads", tags=["User"])
def list_uploads(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
            "id": f.id,
            "filename": f.filename,
            "status": f.status,
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
    """Return the cached TranscriptAgent (pre-built by pipeline) or build fresh from DB."""
    from ml.model_registry import get_agent_class

    if job_id in app.state.agents:
        return app.state.agents[job_id]

    # Agent wasn't pre-built (e.g. old job processed before this version) — build now
    record = (
        db.query(StructuredNotes)
        .filter(StructuredNotes.audio_file_id == job_id)
        .first()
    )
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
            txt = (
                c.transcription.translated_text or c.transcription.raw_text or ""
            ).strip()
            if txt:
                parts.append(txt)

    full_transcript = " ".join(parts) or record.notes_text or ""
    TranscriptAgent = get_agent_class()
    agent = TranscriptAgent(job_id=job_id, transcript_text=full_transcript)
    app.state.agents[job_id] = agent
    print(f"[Agent] Built agent on-demand for job {job_id}")
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
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Pre-warm the agent context — loads transcript into memory.
    Fast: NO LLM call. Returns immediately.
    The frontend calls this silently on page load so the first
    chat reply has no cold-start delay.
    """
    rec = _can_access_audio(job_id, current_user.id, db)
    if not rec:
        raise HTTPException(404, "Job not found or access denied.")

    try:
        agent = _get_or_create_agent(job_id, db)
        transcript_len = len(agent.transcript)
    except Exception:
        transcript_len = 0

    return {
        "status": "ready",
        "job_id": job_id,
        "transcript_len": transcript_len,
    }


@app.post("/agent/{job_id}/chat", tags=["Agent"])
def agent_chat(
    job_id: int,
    payload: AgentChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a user message and stream back the agent reply."""
    rec = _can_access_audio(job_id, current_user.id, db)
    if not rec:
        raise HTTPException(404, "Job not found or access denied.")

    agent = _get_or_create_agent(job_id, db)
    return StreamingResponse(
        _sse(agent.chat_stream(payload.message)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/agent/{job_id}/generate-notes", tags=["Agent"])
def agent_generate_notes(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ask the agent to generate detailed study notes (streaming)."""
    rec = _can_access_audio(job_id, current_user.id, db)
    if not rec:
        raise HTTPException(404, "Job not found or access denied.")

    agent = _get_or_create_agent(job_id, db)
    prompt = _DETAILED_NOTES_PROMPT
    return StreamingResponse(
        _sse(agent.chat_stream(prompt)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


_DETAILED_NOTES_PROMPT = """\
Generate comprehensive, exam-ready academic notes from the lecture transcript provided in your system context.

## OUTPUT FORMAT

Start your response with:
LECTURE TITLE:
<derive a clear title from the lecture content>

OVERVIEW:
<10-13 sentence summary of the lecture>

Then write numbered sections. One section per major topic or concept from the transcript.
Long lectures (30+ min): 15-20 sections. Short lectures: 10-12 sections.

Each section MUST use this exact format:

### <N>. <Section Title>

#### Explanation:
Write a detailed paragraph (minimum 15-20 sentences) explaining the concept thoroughly in academic language.

#### Key Points:
bullet Point 1 with explanation
bullet Point 2 with explanation
bullet Point 3 with explanation
+ ...

#### Steps / Working (only if the topic involves a process or algorithm):
1. Step one
2. Step two
3. Step three
+ ...

---

## CRITICAL RULES

1. Cover ALL major ideas from the transcript - do not skip topics
2. Minimum 200-250 words per section
3. Every section MUST have an Explanation paragraph (bullet-only sections are NOT allowed)
4. Remove filler words, greetings, ads, and repetition from the transcript
5. Keep technical terms; add plain English explanations where helpful
6. Do NOT echo or repeat this prompt in your output
7. Do NOT add phrases like "Here are the notes" or "Sure! Here is..."
8. Begin your response IMMEDIATELY with: LECTURE TITLE:
"""


@app.get("/agent/{job_id}/download-notes", tags=["Agent"])
def agent_download_notes(
    job_id: int,
    format: str = Query("docx", pattern="^(docx|pdf)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate AI study notes from the lecture transcript and return as Word or PDF.
    The content is ALWAYS generated fresh by the LLM — never copied from the transcript.
    Returns 503 if Ollama is not available.
    """
    rec = _can_access_audio(job_id, current_user.id, db)
    if not rec:
        raise HTTPException(404, "Job not found or access denied.")

    # ── Load base notes metadata from DB (title, word_count) ──
    notes_rec = (
        db.query(StructuredNotes)
        .filter(StructuredNotes.audio_file_id == job_id)
        .first()
    )

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
        for c in chunks
        if c.transcription
    ).strip()

    # ── Require LLM to generate structured notes ──────────────
    # The agent uses the transcript as context; we ask it to produce
    # a rich, fully structured academic notes document.
    try:
        agent = _get_or_create_agent(job_id, db)
        notes_text = agent.chat_complete(_DETAILED_NOTES_PROMPT)
    except Exception as e:
        raise HTTPException(
            503,
            f"AI model unavailable: {e}. "
            "Please ensure Ollama is running with 'ollama serve'.",
        )

    if not notes_text or len(notes_text.strip()) < 200:
        raise HTTPException(
            503,
            "AI agent returned an empty response. "
            "Please ensure Ollama is running with 'ollama serve'.",
        )
    if (
        "not available" in notes_text.lower()
        or "error generating" in notes_text.lower()
    ):
        raise HTTPException(
            503,
            "AI model unavailable. " "Start Ollama with 'ollama serve'.",
        )

    # ── Parse the AI output into structured sections ──────────
    parsed = _parse_notes_sections(notes_text)

    safe = "".join(c for c in rec.filename if c.isalnum() or c in "._- ")
    safe = safe.rsplit(".", 1)[0]

    # ── Compose final notes dict ──────────────────────────────
    notes_dict = {
        "title": parsed.get("title")
        or base_notes.get("title")
        or f"Study Notes \u2014 {safe}",
        "summary": parsed.get("summary", ""),
        "key_points": parsed.get("key_points", []),
        "sections": parsed.get("sections", []),
        # Do NOT include full_transcript — agent download is AI notes only,
        # not a copy of the source transcript.
        "full_transcript": "",
        "word_count": notes_rec.word_count if notes_rec else 0,
    }

    from ml.exporter import export_docx, export_pdf

    try:
        if format == "docx":
            content = export_docx(notes_dict)
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            filename = f"{safe}_ai_notes.docx"
        else:
            content = export_pdf(notes_dict)
            media_type = "application/pdf"
            filename = f"{safe}_ai_notes.pdf"
    except Exception as e:
        raise HTTPException(500, f"Export failed: {e}")

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.delete("/agent/{job_id}/history", tags=["Agent"])
def agent_clear_history(
    job_id: int,
    current_user: User = Depends(get_current_user),
):
    """Clear conversation history for a job (fresh start)."""
    if job_id in app.state.agents:
        app.state.agents[job_id].clear_history()
    return {"message": "Conversation cleared."}


class AgentModelRequest(BaseModel):
    preference: str  # 'auto' | 'local' | 'cloud'


@app.post("/agent/{job_id}/model", tags=["Agent"])
def agent_set_model(
    job_id: int,
    payload: AgentModelRequest,
    current_user: User = Depends(get_current_user),
):
    """Switch the AI source for a job: auto | local | cloud."""
    pref = payload.preference
    if pref not in ("auto", "local", "cloud"):
        raise HTTPException(400, "preference must be 'auto', 'local', or 'cloud'")

    if job_id in app.state.agents:
        agent = app.state.agents[job_id]
        agent.model_preference = pref  # agent.py reads this on next call
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
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # ── LECTURE TITLE ─────────────────────────────────────────
    m = re.search(
        r"LECTURE TITLE:\s*\n(.+?)(?:\n(?:OVERVIEW:|SECTION|\d+\.))",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if m:
        result["title"] = m.group(1).strip()

    # ── OVERVIEW ──────────────────────────────────────────────
    m = re.search(
        r"OVERVIEW:\s*\n(.+?)(?:\n(?:KEY CONCEPTS:|SECTION\s*\d|\d+\.))",
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if m:
        result["summary"] = m.group(1).strip()

    # ── KEY CONCEPTS (legacy format only) ─────────────────────
    m = re.search(
        r"KEY CONCEPTS:\s*\n(.+?)\n(?:SECTION\s*\d)", text, re.IGNORECASE | re.DOTALL
    )
    if m:
        for line in m.group(1).split("\n"):
            kp = line.strip().lstrip("-\u2022*[]").strip()
            if kp and not kp.startswith("["):
                result["key_points"].append(kp)

    # ── NEW FORMAT: numbered sections (1. Heading, 2. Heading ...) ───
    # Matches lines at start of line: "1. Introduction", "2. Core Topic", etc.
    num_sec_pattern = re.compile(r"^\d+\.\s+(.+?)$", re.MULTILINE)
    num_matches = list(num_sec_pattern.finditer(text))

    if num_matches:
        for i, sm in enumerate(num_matches):
            heading = sm.group(1).strip().strip("[]")
            start = sm.end()
            end = num_matches[i + 1].start() if i + 1 < len(num_matches) else len(text)
            body = text[start:end].strip()
            # Strip trailing rules block that may bleed into last section
            body = re.split(r"\nIMPORTANT RULES:", body, flags=re.IGNORECASE)[0].strip()
            body = re.split(r"\nSTRICT RULES:", body, flags=re.IGNORECASE)[0].strip()
            if heading and body:
                result["sections"].append(
                    {
                        "heading": heading,
                        "content": _reindent_content(body),
                    }
                )

    # ── LEGACY FORMAT fallback: SECTION N: Heading ────────────
    if not result["sections"]:
        sec_pattern = re.compile(
            r"^SECTION\s+\d+:\s*(.+?)$", re.IGNORECASE | re.MULTILINE
        )
        sec_matches = list(sec_pattern.finditer(text))
        for i, sm in enumerate(sec_matches):
            heading = sm.group(1).strip().strip("[]")
            start = sm.end()
            end = sec_matches[i + 1].start() if i + 1 < len(sec_matches) else len(text)
            body = text[start:end].strip()
            body = re.split(r"\nRULES:", body, flags=re.IGNORECASE)[0].strip()
            if heading and body:
                result["sections"].append(
                    {
                        "heading": heading,
                        "content": _reindent_content(body),
                    }
                )

    # ── Final fallback: raw text as one section ────────────────
    if not result["sections"]:
        result["sections"] = [
            {"heading": "Study Notes", "content": _reindent_content(text)}
        ]

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
    for line in text.split("\n"):
        # Sub-bullet: indented dash/bullet
        if re.match(r"^(\t|  +)[\-•*]", line):
            out.append("  - " + line.lstrip().lstrip("-•* ").strip())
        # Sub-bullet: indented numbered (  1. ...)
        elif re.match(r"^(\t|  +)\d+[.)]", line):
            out.append("  " + line.strip())
        # Top-level bullet
        elif re.match(r"^[\-•*]\s+", line):
            out.append("• " + line.lstrip("-•* ").strip())
        # Numbered list at root level
        elif re.match(r"^\d+[.)\s]", line):
            out.append(line.strip())
        else:
            out.append(line)
    return "\n".join(out)


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
    "brief": _BRIEF_PROMPT,
    "standard": _STANDARD_PROMPT,
    "detailed": _DETAILED_PROMPT,
}


@app.post("/agent/{job_id}/summarize", tags=["Agent"])
def agent_summarize(
    job_id: int,
    level: str = Query("standard", pattern="^(brief|standard|detailed)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate notes at a specific summarization level (brief/standard/detailed) — streaming SSE."""
    rec = _can_access_audio(job_id, current_user.id, db)
    if not rec:
        raise HTTPException(404, "Job not found or access denied.")

    agent = _get_or_create_agent(job_id, db)
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
    job_id: int,
    payload: EditNotesPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save user's inline edits to the notes."""
    rec = (
        db.query(AudioFile)
        .filter(AudioFile.id == job_id, AudioFile.user_id == current_user.id)
        .first()
    )
    if not rec:
        raise HTTPException(404, "Job not found.")

    notes = (
        db.query(StructuredNotes)
        .filter(StructuredNotes.audio_file_id == job_id)
        .first()
    )
    if not notes:
        raise HTTPException(404, "Notes not found.")

    notes.notes_edited_text = payload.edited_text
    db.commit()
    return {"message": "Notes saved successfully.", "job_id": job_id}


@app.get("/notes/{job_id}/edited", tags=["Notes"])
def get_edited_notes(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch the user's saved edited notes."""
    rec = _can_access_audio(job_id, current_user.id, db)
    if not rec:
        raise HTTPException(404, "Job not found or access denied.")

    notes = (
        db.query(StructuredNotes)
        .filter(StructuredNotes.audio_file_id == job_id)
        .first()
    )
    return {
        "job_id": job_id,
        "edited_text": notes.notes_edited_text if notes else None,
        "has_edits": bool(notes and notes.notes_edited_text),
    }


# ─────────────────────────────────────────────────────────────
#  FEATURE 3 — SHARE NOTES VIA LINK
#  POST   /notes/{id}/share
#  DELETE /notes/{id}/share/{token}
#  GET    /shared/{token}  ← public, no auth
# ─────────────────────────────────────────────────────────────


class SharePayload(BaseModel):
    expires_hours: Optional[int] = None  # None = never expires


@app.post("/notes/{job_id}/share", tags=["Share"])
def create_share_link(
    job_id: int,
    payload: SharePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a public share token for a note."""
    import secrets

    rec = (
        db.query(AudioFile)
        .filter(AudioFile.id == job_id, AudioFile.user_id == current_user.id)
        .first()
    )
    if not rec:
        raise HTTPException(404, "Job not found.")
    if rec.status != "done":
        raise HTTPException(400, "Notes not ready yet.")

    token = secrets.token_urlsafe(32)
    expires_at = None
    if payload.expires_hours:
        expires_at = datetime.utcnow() + timedelta(hours=payload.expires_hours)

    share = SharedNote(
        audio_file_id=job_id,
        token=token,
        created_by=current_user.id,
        expires_at=expires_at,
    )
    db.add(share)
    db.commit()
    db.refresh(share)

    return {
        "token": token,
        "share_url": f"{FRONTEND_URL}/shared/{token}",
        "expires_at": expires_at.isoformat() if expires_at else None,
        "share_id": share.id,
    }


@app.get("/notes/{job_id}/shares", tags=["Share"])
def list_share_links(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all active share links for a note."""
    rec = _can_access_audio(job_id, current_user.id, db)
    if not rec:
        raise HTTPException(404, "Job not found or access denied.")

    shares = db.query(SharedNote).filter(SharedNote.audio_file_id == job_id).all()
    return [
        {
            "share_id": s.id,
            "token": s.token,
            "share_url": f"{FRONTEND_URL}/shared/{s.token}",
            "expires_at": s.expires_at.isoformat() if s.expires_at else None,
            "view_count": s.view_count,
            "created_at": s.created_at.isoformat(),
        }
        for s in shares
    ]


@app.delete("/notes/{job_id}/share/{share_id}", tags=["Share"])
def revoke_share_link(
    job_id: int,
    share_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revoke (delete) a share link."""
    share = (
        db.query(SharedNote)
        .filter(
            SharedNote.id == share_id,
            SharedNote.audio_file_id == job_id,
            SharedNote.created_by == current_user.id,
        )
        .first()
    )
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

    rec = share.audio_file
    notes = (
        db.query(StructuredNotes)
        .filter(StructuredNotes.audio_file_id == rec.id)
        .first()
    )

    notes_dict = {}
    if notes and notes.notes_json:
        try:
            notes_dict = json.loads(notes.notes_json)
        except Exception:
            pass

    return {
        "filename": rec.filename,
        "notes_text": notes.notes_text if notes else "",
        "notes": notes_dict,
        "word_count": notes.word_count if notes else 0,
        "view_count": share.view_count,
        "shared_by": share.creator.name,
        "created_at": share.created_at.isoformat(),
    }


# ─────────────────────────────────────────────────────────────
#  FEATURE 4 — TRANSLATION (Google Translate via googletrans)
#  POST /notes/{id}/translate  body: {target_lang: "hi"|"kn"…}
# ─────────────────────────────────────────────────────────────


class TranslatePayload(BaseModel):
    target_lang: str


@app.post("/notes/{job_id}/translate", tags=["Translation"])
def translate_note(
    job_id: int,
    payload: TranslatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Translate the AI-generated summary into the user's preferred language (Hindi or Kannada).
    Source: the summary field from the NLP agent output (notes_json → "summary").
    Falls back to chunk transcriptions if the summary is unavailable.
    Returns a Server-Sent Events stream of translated tokens.
    Supports: hi (Hindi), kn (Kannada)
    """
    from ml.googletrans_translator import translate_notes_stream, LANGUAGES

    if payload.target_lang not in LANGUAGES:
        raise HTTPException(
            400, f"Unsupported language. Supported: {list(LANGUAGES.keys())}"
        )

    rec = _can_access_audio(job_id, current_user.id, db)
    if not rec:
        raise HTTPException(404, "Job not found or access denied.")

    # ── Build the English transcript from Whisper chunks ─────────────────
    # translated_text = the English output from Whisper + Helsinki NMT model.
    # This is the same text shown in the Transcript tab in the UI.

    # Source: the AI-generated summary from the NLP agent (concise and accurate).
    notes = (
        db.query(StructuredNotes)
        .filter(StructuredNotes.audio_file_id == job_id)
        .first()
    )

    source_text = ""
    if notes and notes.notes_json:
        try:
            import json as _json

            notes_dict = _json.loads(notes.notes_json)
            source_text = notes_dict.get("summary", "")
        except Exception:
            pass

    # Fall back to raw_text if polished_transcript is empty
    if not source_text.strip():
        chunks = (
            db.query(AudioChunk)
            .filter(AudioChunk.audio_file_id == job_id)
            .order_by(AudioChunk.chunk_index)
            .all()
        )
        transcript_parts = []
        for chunk in chunks:
            if chunk.transcription:
                text = (
                    chunk.transcription.translated_text
                    or chunk.transcription.raw_text
                    or ""
                ).strip()
                if text:
                    transcript_parts.append(text)

        source_text = " ".join(transcript_parts)
    if not source_text.strip():
        raise HTTPException(
            400,
            "No transcript available to translate. Make sure processing is complete.",
        )

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
    from ml.googletrans_translator import LANGUAGES

    return {"languages": [{"code": k, "name": v} for k, v in LANGUAGES.items()]}


# ─────────────────────────────────────────────────────────────
#  FEATURE 5 — STUDY GROUPS
# ─────────────────────────────────────────────────────────────


class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None


class GroupJoin(BaseModel):
    invite_code: str


class GroupNoteAdd(BaseModel):
    audio_file_id: int


@app.post("/groups", status_code=201, tags=["Groups"])
def create_group(
    payload: GroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new study group. Creator becomes the owner."""
    import secrets, string

    code = "".join(
        secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8)
    )

    group = StudyGroup(
        name=payload.name.strip(),
        description=payload.description,
        invite_code=code,
        owner_id=current_user.id,
    )
    db.add(group)
    db.flush()

    member = GroupMember(group_id=group.id, user_id=current_user.id, role="owner")
    db.add(member)
    db.commit()
    db.refresh(group)

    return {
        "id": group.id,
        "name": group.name,
        "invite_code": group.invite_code,
        "created_at": group.created_at.isoformat(),
    }


@app.get("/groups", tags=["Groups"])
def list_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all groups the current user belongs to."""
    memberships = (
        db.query(GroupMember).filter(GroupMember.user_id == current_user.id).all()
    )
    result = []
    for m in memberships:
        g = m.group
        result.append(
            {
                "id": g.id,
                "name": g.name,
                "description": g.description,
                "invite_code": g.invite_code,
                "role": m.role,
                "member_count": len(g.members),
                "note_count": len(g.notes),
                "owner": g.owner.name,
                "created_at": g.created_at.isoformat(),
            }
        )
    return result


@app.get("/groups/{group_id}", tags=["Groups"])
def get_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get full details of a group including members and shared notes."""
    membership = (
        db.query(GroupMember)
        .filter(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(403, "You are not a member of this group.")

    g = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, "Group not found.")

    members = [
        {
            "user_id": m.user_id,
            "name": m.user.name,
            "email": m.user.email,
            "role": m.role,
            "joined_at": m.joined_at.isoformat(),
        }
        for m in g.members
    ]

    notes = []
    for gn in g.notes:
        af = gn.audio_file
        sn = (
            db.query(StructuredNotes)
            .filter(StructuredNotes.audio_file_id == af.id)
            .first()
        )
        notes.append(
            {
                "group_note_id": gn.id,
                "audio_file_id": af.id,
                "filename": af.filename,
                "status": af.status,
                "word_count": sn.word_count if sn else 0,
                "added_by": gn.adder.name,
                "added_by_id": gn.added_by,  # user id — for frontend permission check
                "added_at": gn.added_at.isoformat(),
            }
        )

    files = []
    for gf in g.files:
        files.append(
            {
                "id": gf.id,
                "filename": gf.filename,
                "file_type": gf.file_type,
                "file_size": gf.file_size,
                "uploaded_by": gf.uploader.name,
                "uploaded_at": gf.uploaded_at.isoformat(),
            }
        )

    return {
        "id": g.id,
        "name": g.name,
        "description": g.description,
        "invite_code": g.invite_code if membership.role == "owner" else None,
        "owner": g.owner.name,
        "my_role": membership.role,
        "my_user_id": current_user.id,  # current user's id — for permission checks
        "members": members,
        "notes": notes,
        "files": files,
        "created_at": g.created_at.isoformat(),
    }


@app.post("/groups/join", tags=["Groups"])
def join_group(
    payload: GroupJoin,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Join a group using its invite code."""
    g = (
        db.query(StudyGroup)
        .filter(StudyGroup.invite_code == payload.invite_code.strip().upper())
        .first()
    )
    if not g:
        raise HTTPException(404, "Invalid invite code.")

    existing = (
        db.query(GroupMember)
        .filter(
            GroupMember.group_id == g.id,
            GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if existing:
        return {"message": "You are already a member of this group.", "group_id": g.id}

    member = GroupMember(group_id=g.id, user_id=current_user.id, role="member")
    db.add(member)
    db.commit()
    return {"message": f"Joined '{g.name}' successfully!", "group_id": g.id}


@app.post("/groups/{group_id}/notes", status_code=201, tags=["Groups"])
def add_note_to_group(
    group_id: int,
    payload: GroupNoteAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Share one of your notes into a study group."""
    membership = (
        db.query(GroupMember)
        .filter(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(403, "You are not a member of this group.")

    af = (
        db.query(AudioFile)
        .filter(
            AudioFile.id == payload.audio_file_id,
            AudioFile.user_id == current_user.id,
        )
        .first()
    )
    if not af:
        raise HTTPException(404, "Audio file not found or not yours.")

    existing = (
        db.query(GroupNote)
        .filter(
            GroupNote.group_id == group_id,
            GroupNote.audio_file_id == payload.audio_file_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(409, "This note is already shared in the group.")

    gn = GroupNote(
        group_id=group_id,
        audio_file_id=payload.audio_file_id,
        added_by=current_user.id,
    )
    db.add(gn)
    db.commit()
    return {"message": "Note added to group.", "group_note_id": gn.id}


@app.delete("/groups/{group_id}/notes/{group_note_id}", tags=["Groups"])
def remove_note_from_group(
    group_id: int,
    group_note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a note from a group (owner or the person who added it)."""
    gn = (
        db.query(GroupNote)
        .filter(
            GroupNote.id == group_note_id,
            GroupNote.group_id == group_id,
        )
        .first()
    )
    if not gn:
        raise HTTPException(404, "Note not found in group.")

    g = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    is_owner = g and g.owner_id == current_user.id
    is_adder = gn.added_by == current_user.id
    if not (is_owner or is_adder):
        raise HTTPException(403, "Permission denied.")

    db.delete(gn)
    db.commit()
    return {"message": "Note removed from group."}


@app.delete("/groups/{group_id}/leave", tags=["Groups"])
def leave_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Leave a study group (owner cannot leave — must delete instead)."""
    g = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    if not g:
        raise HTTPException(404, "Group not found.")
    if g.owner_id == current_user.id:
        raise HTTPException(
            400, "Owner cannot leave the group. Delete the group instead."
        )

    m = (
        db.query(GroupMember)
        .filter(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not m:
        raise HTTPException(404, "You are not in this group.")
    db.delete(m)
    db.commit()
    return {"message": "Left group successfully."}


@app.delete("/groups/{group_id}", tags=["Groups"])
def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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

GROUP_FILE_EXTS = {
    ".pdf",
    ".docx",
    ".txt",
    ".doc",
    ".pptx",
    ".xlsx",
    ".png",
    ".jpg",
    ".jpeg",
}
GROUP_FILES_DIR = os.path.join(UPLOAD_DIR, "group_files")
os.makedirs(GROUP_FILES_DIR, exist_ok=True)


@app.post("/groups/{group_id}/files", status_code=201, tags=["Groups"])
async def upload_group_file(
    group_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a local file (PDF, DOCX, TXT, image) directly to a study group."""
    membership = (
        db.query(GroupMember)
        .filter(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(403, "You are not a member of this group.")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in GROUP_FILE_EXTS:
        raise HTTPException(
            400,
            f"File type '{ext}' not allowed. Allowed: {', '.join(sorted(GROUP_FILE_EXTS))}",
        )

    safe_name = f"{uuid.uuid4()}{ext}"
    dest_path = os.path.join(GROUP_FILES_DIR, safe_name)
    content = await file.read()
    with open(dest_path, "wb") as f:
        f.write(content)

    gf = GroupFile(
        group_id=group_id,
        uploaded_by=current_user.id,
        filename=file.filename or safe_name,
        file_path=dest_path,
        file_type=ext.lstrip("."),
        file_size=len(content),
    )
    db.add(gf)
    db.commit()
    db.refresh(gf)
    return {
        "id": gf.id,
        "filename": gf.filename,
        "file_type": gf.file_type,
        "file_size": gf.file_size,
        "message": "File uploaded to group.",
    }


@app.get("/groups/{group_id}/files", tags=["Groups"])
def list_group_files(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all files uploaded to a group."""
    membership = (
        db.query(GroupMember)
        .filter(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id,
        )
        .first()
    )
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
            "id": f.id,
            "filename": f.filename,
            "file_type": f.file_type,
            "file_size": f.file_size,
            "uploaded_by": f.uploader.name,
            "uploaded_at": f.uploaded_at.isoformat(),
        }
        for f in files
    ]


@app.get("/groups/{group_id}/files/{file_id}/download", tags=["Groups"])
def download_group_file(
    group_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download a group file."""
    membership = (
        db.query(GroupMember)
        .filter(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(403, "You are not a member of this group.")

    gf = (
        db.query(GroupFile)
        .filter(
            GroupFile.id == file_id,
            GroupFile.group_id == group_id,
        )
        .first()
    )
    if not gf:
        raise HTTPException(404, "File not found.")
    if not os.path.isfile(gf.file_path):
        raise HTTPException(404, "File not found on disk.")

    MIME_MAP = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc": "application/msword",
        "txt": "text/plain",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "png": "image/png",
        "jpg": "image/jpeg",
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
    group_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a group file (uploader or group owner)."""
    gf = (
        db.query(GroupFile)
        .filter(
            GroupFile.id == file_id,
            GroupFile.group_id == group_id,
        )
        .first()
    )
    if not gf:
        raise HTTPException(404, "File not found.")

    g = db.query(StudyGroup).filter(StudyGroup.id == group_id).first()
    is_owner = g and g.owner_id == current_user.id
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
    group_id: int,
    payload: GroupChatSend,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a message in the group chat."""
    membership = (
        db.query(GroupMember)
        .filter(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(403, "You are not a member of this group.")

    text = payload.message.strip()
    if not text:
        raise HTTPException(400, "Message cannot be empty.")
    if len(text) > 2000:
        raise HTTPException(400, "Message too long (max 2000 chars).")

    msg = GroupChatMessage(
        group_id=group_id,
        sender_id=current_user.id,
        message=text,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return {
        "id": msg.id,
        "sender": current_user.name,
        "sender_id": current_user.id,
        "message": msg.message,
        "sent_at": msg.sent_at.isoformat(),
    }


@app.get("/groups/{group_id}/chat", tags=["Groups"])
def get_chat_messages(
    group_id: int,
    limit: int = Query(50, ge=1, le=200),
    before_id: int = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Fetch paginated chat messages for a group.
    Returns messages in ascending chronological order.
    Use before_id to paginate backwards (load older messages).
    """
    membership = (
        db.query(GroupMember)
        .filter(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(403, "You are not a member of this group.")

    q = db.query(GroupChatMessage).filter(GroupChatMessage.group_id == group_id)
    if before_id:
        q = q.filter(GroupChatMessage.id < before_id)
    msgs = q.order_by(GroupChatMessage.id.desc()).limit(limit).all()
    msgs = list(reversed(msgs))  # return oldest-first

    return [
        {
            "id": m.id,
            "sender": m.sender.name,
            "sender_id": m.sender_id,
            "message": m.message,
            "sent_at": m.sent_at.isoformat(),
        }
        for m in msgs
    ]


#  HEALTH CHECK
# ─────────────────────────────────────────────────────────────


@app.get("/health", tags=["Health"])
def health():
    from ml.model_registry import models_loaded

    loaded = models_loaded()
    return {
        "status": "ok",
        "service": "AudioNotes AI API",
        "version": "3.0.0",
        "models_loaded": loaded,
        "model_ids": {
            "whisper": WHISPER_ID,
            "qwen": QWEN_ID,
            "trans": TRANS_ID,
        },
    }


@app.get("/models/status", tags=["Health"])
def models_status():
    """
    Check which ML models are currently loaded in memory.
    Models load lazily on the first audio upload — this endpoint
    never triggers loading itself.
    """
    from ml.model_registry import models_loaded

    loaded = models_loaded()
    return {
        "transcriber_loaded": loaded["transcriber"],
        "structurer_loaded": loaded["structurer"],
        "note": "Models load automatically on the first audio upload request.",
    }


@app.get("/", tags=["Health"])
def root():
    return {"message": "AudioNotes AI API v3.0 — visit /docs for API reference"}
