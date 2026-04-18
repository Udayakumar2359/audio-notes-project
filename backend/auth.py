# backend/auth.py
# ─────────────────────────────────────────────────────────────
# Pure email + password + OTP authentication (no Clerk/Google)
#
# Registration flow:
#   1. POST /auth/register  → create user (unverified) + send OTP
#   2. POST /auth/verify-otp → verify code → mark verified → return JWT
#
# Login flow (OTP on every login):
#   1. POST /auth/login → check email+password → send login OTP → 200
#   2. POST /auth/verify-login-otp → verify code → return JWT → dashboard
#
# ─────────────────────────────────────────────────────────────

import os
import random
import string
import smtplib
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from database import get_db, User

# ── Config ────────────────────────────────────────────────────
SECRET_KEY                  = os.getenv("SECRET_KEY", "audio-notes-secret-change-in-prod")
ALGORITHM                   = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 10080))  # 7 days

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")

OTP_EXPIRE_MINUTES = 10

# ── Bcrypt ────────────────────────────────────────────────────
pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── OAuth2 bearer ─────────────────────────────────────────────
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


# ─────────────────────────────────────────────────────────────
#  Password helpers
# ─────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ─────────────────────────────────────────────────────────────
#  JWT helpers
# ─────────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire    = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# ─────────────────────────────────────────────────────────────
#  OTP helpers
# ─────────────────────────────────────────────────────────────

def generate_otp(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


def send_otp_email(to_email: str, otp: str, name: str = "Student", purpose: str = "verification") -> bool:
    """
    Send OTP via Gmail SMTP.
    purpose: 'verification' (registration) or 'login' (login step)
    Returns True on success, prints OTP to console as fallback.
    """
    subject_map = {
        "verification": f"AudioNotes AI - Email Verification Code: {otp}",
        "login":        f"AudioNotes AI - Login Verification Code: {otp}",
    }
    subject = subject_map.get(purpose, f"AudioNotes AI - Verification Code: {otp}")
    purpose_text = "verify your email address" if purpose == "verification" else "complete your login"

    if not SMTP_USER or not SMTP_PASS:
        # Dev fallback: print to terminal
        print(f"\n{'='*55}")
        print(f"  OTP for {to_email}: {otp}")
        print(f"  (Set SMTP_USER + SMTP_PASS in .env to send real emails)")
        print(f"{'='*55}\n")
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"AudioNotes AI <{SMTP_USER}>"
        msg["To"]      = to_email

        html = f"""
        <html><body style="font-family:Inter,Arial,sans-serif;background:#F5F4EF;margin:0;padding:40px;">
          <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;
                      padding:40px;border:1px solid #E5E2D9;">
            <h2 style="color:#2D2B26;font-size:22px;margin:0 0 4px;">AudioNotes AI</h2>
            <p style="color:#6B6458;font-size:13px;margin:0 0 28px;">Email Verification</p>
            <p style="color:#2D2B26;margin:0 0 8px;">Hi {name},</p>
            <p style="color:#6B6458;margin:0 0 20px;">
              Use the code below to {purpose_text}:
            </p>
            <div style="font-size:42px;font-weight:800;letter-spacing:12px;
                        color:#D97706;text-align:center;padding:24px 0;
                        border:2px solid #FDE68A;border-radius:8px;margin:0 0 20px;">
              {otp}
            </div>
            <p style="color:#6B6458;font-size:13px;margin:0;">
              This code expires in {OTP_EXPIRE_MINUTES} minutes.<br>
              If you did not request this, you can safely ignore it.
            </p>
          </div>
        </body></html>
        """
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, to_email, msg.as_string())

        print(f"[OTP] Email sent to {to_email} ({purpose})")
        return True

    except Exception as e:
        # Always print to terminal as backup
        print(f"[OTP] Email send failed: {e}")
        print(f"\n{'='*55}")
        print(f"  OTP for {to_email}: {otp}  (email failed - use this code)")
        print(f"{'='*55}\n")
        return False


# ─────────────────────────────────────────────────────────────
#  FastAPI dependency — get current authenticated user from JWT
# ─────────────────────────────────────────────────────────────

def get_current_user(
    authorization: Optional[str] = Header(default=None),
    token: Optional[str]         = Depends(oauth2_scheme),
    db: Session                  = Depends(get_db),
) -> User:
    """
    Validates our own JWT (issued after OTP verification).
    Raises HTTP 401 if token is missing or invalid.
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials. Please log in.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Extract token from Authorization header or OAuth2 scheme
    bearer_token = None
    if authorization and authorization.startswith("Bearer "):
        bearer_token = authorization.split(" ", 1)[1]
    elif token:
        bearer_token = token

    if not bearer_token:
        raise credentials_exc

    # Decode and validate our JWT
    try:
        payload = jwt.decode(bearer_token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    # Look up user in DB
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.is_verified:
        raise credentials_exc

    return user
