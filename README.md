# 🎙️ AudioNotes AI — Multilingual Lecture Audio to Structured Notes

**Student:** Udaya Kumar | **USN:** P02ME24S126024
**Institution:** JSS SMC MCA Institute, Dharwad
**Version:** 2.0.0
**Tech Stack:** Python · FastAPI · PyTorch (CUDA) · HuggingFace · React · Vite · SQLite / PostgreSQL

---

## 📌 Project Overview

**AudioNotes AI** is an end-to-end AI system that converts multilingual classroom audio (Kannada / Hindi / English) into well-structured academic notes. Students upload a lecture recording and the system automatically transcribes and summarizes it. Users can then translate the generated summary into their preferred language (Kannada/Hindi) using state-of-the-art Indic NMT models, and interact with an AI Study Agent to answer follow-up questions.

---

## 🚀 Full Pipeline

| Step | Module | What it does |
|------|--------|-------------|
| 1 | `audio_processor.py` | Splits audio into 25-second chunks + removes background noise |
| 2 | `transcriber.py` | Whisper ASR (fine-tuned on Kathbath) + per-chunk language detection |
| 3 | `cleaner.py` | Post-processes and deduplicates raw transcription text |
| 4 | `note_structurer.py` | Qwen-0.5B (4-bit quantization) generates structured academic notes |
| 5 | `translator.py` | Translates the generated summary (En → Kn/Hi) via `ai4bharat/indictrans2-en-indic-1B` |
| 6 | `credibility.py` | Faithfulness scoring of notes vs. transcript (ROUGE/T5 score + agent groundedness) |
| 7 | `exporter.py` | Exports notes to `.txt`, `.docx`, or `.pdf` |
| 8 | `agent.py` | Groq-powered AI Study Agent for Q&A over the transcript |
| 9 | `pipeline.py` | Orchestrates all steps end-to-end as a background job |

---

## 🏗️ Project Structure

```
audio_notes_project/
├── .env                             ← Runtime config (SMTP, DB, model IDs, etc.)
├── .gitignore
├── Procfile                         ← Deployment config (Render / Heroku)
├── runtime.txt                      ← Python version pin
├── requirements.txt                 ← All Python dependencies
├── start_servers.bat                ← One-click startup script for backend + frontend
│
├── backend/
│   ├── main.py                      ← FastAPI app v2.0 — all routes
│   ├── database.py                  ← SQLAlchemy models (Users, Audio, Groups, Chat, etc.)
│   ├── auth.py                      ← Custom email+password auth + OTP via SMTP
│   └── ml/
│       ├── pipeline.py              ← End-to-end pipeline orchestrator
│       ├── audio_processor.py       ← Audio chunking + noise reduction
│       ├── transcriber.py           ← Whisper ASR + language detection
│       ├── translator.py            ← IndicTrans2 translation (En -> Indic)
│       ├── cleaner.py               ← Text cleanup + deduplication
│       ├── note_structurer.py       ← Qwen-0.5B note generation (bitsandbytes 4-bit)
│       ├── credibility.py           ← Faithfulness + groundedness scoring
│       ├── exporter.py              ← TXT / DOCX / PDF export
│       └── agent.py                 ← Groq AI Study Agent (Q&A over transcript)
│
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── vercel.json                  ← Frontend deployment config
│   ├── package.json
│   └── src/
│       ├── App.jsx                  ← React Router routes
│       ├── api.js                   ← Axios API client (all endpoints)
│       ├── index.css                ← Global styles + design system
│       ├── main.jsx
│       ├── components/
│       │   ├── Navbar.jsx           ← Responsive top navigation
│       │   ├── AgentChatPanel.jsx   ← AI Study Agent chat UI
│       │   ├── CredibilityBadge.jsx ← Faithfulness score display
│       │   └── SessionManager.jsx   ← Auth session handler
│       └── pages/
│           ├── Dashboard.jsx        ← All uploads + notes history
│           ├── Upload.jsx           ← Audio upload + live pipeline progress
│           ├── NotesViewer.jsx      ← View notes, transcripts, chat with AI agent
│           └── ...
│
├── notebooks/                       ← Training & evaluation notebooks
├── models/                          ← Downloaded trained models (not tracked in git)
└── uploads/                         ← User audio files at runtime (not tracked in git)
```

---

## 🔐 Authentication System

A fully **self-hosted, custom authentication system** — no third-party providers.

| Step | Endpoint | Description |
|------|----------|-------------|
| 1 | `POST /auth/register` | Sign up with name, email, password → sends 6-digit OTP |
| 2 | `POST /auth/verify-otp` | Verify registration OTP → account activated + JWT issued |
| 3 | `POST /auth/send-otp` | Resend registration OTP (if expired) |
| 4 | `POST /auth/login` | Login with email + password → sends login OTP (2FA) |
| 5 | `POST /auth/verify-login-otp` | Verify login OTP → JWT token returned |
| 6 | `POST /auth/forgot-password` | Send password reset OTP (public, no login needed) |
| 7 | `POST /auth/reset-forgotten-password` | OTP + new password → reset complete |
| 8 | `POST /auth/send-password-change-otp` | Logged-in: send OTP to authorize password change |
| 9 | `POST /auth/verify-password-change` | Verify OTP + set new password |
| 10 | `GET /auth/me` | Get current user info |

> Every login requires email + password **and** a fresh OTP — mandatory 2FA on every session.

---

## 🌐 Full API Reference

### Audio & Notes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/audio/upload` | Upload audio → background pipeline starts |
| GET | `/audio/{id}/status` | Poll processing status |
| GET | `/audio/{id}/notes` | Get structured notes (JSON + text) |
| POST | `/notes/{id}/translate` | Translate the generated summary to Kn/Hi via IndicTrans2 |
| GET | `/audio/{id}/transcripts` | Get per-chunk transcriptions (lazy loaded) |
| GET | `/audio/{id}/credibility` | Get T5 faithfulness + agent groundedness scores |
| GET | `/audio/{id}/download?format=txt\|docx\|pdf` | Download notes in chosen format |
| GET | `/user/uploads` | List all user uploads |
| DELETE | `/audio/{id}` | Delete a recording |

### AI Study Agent
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/audio/{id}/agent/chat` | Send message to AI agent (Groq-powered) |
| GET | `/audio/{id}/agent/history` | Get full chat history |
| DELETE | `/audio/{id}/agent/history` | Clear chat session |

---

## 📋 Prerequisites

| Tool | Version | Install | Verify |
|------|---------|---------|--------|
| Python | 3.10+ | https://python.org/downloads | `python --version` |
| Node.js | 18+ LTS | https://nodejs.org | `node --version` |
| ffmpeg | latest | https://ffmpeg.org/download.html | `ffmpeg -version` |
| Git | latest | https://git-scm.com | `git --version` |

> **GPU Acceleration (Highly Recommended):** This project requires PyTorch compiled with CUDA support (`torch==2.7.0+cu128`) and `bitsandbytes` for 4-bit quantization. Ensure you have an NVIDIA GPU (e.g., RTX 3050) with updated drivers.
> **Windows ffmpeg:** Extract zip → copy `bin/` path → add to **System → Environment Variables → PATH** → restart terminal.

---

## ⚡ Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/Udayakumar2359/audio-notes-project.git
cd audio-notes-project
```

### 2. Create Python Virtual Environment (Windows)

```bash
python -m venv venv
venv\Scripts\activate
```

### 3. Install Dependencies (with CUDA Support)

```bash
pip install -r requirements.txt
pip install bitsandbytes
pip install torch==2.7.0+cu128 torchaudio==2.7.0+cu128 --index-url https://download.pytorch.org/whl/cu128
```

### 4. Configure Environment Variables

Create a `.env` file in the project root:

```env
# ── Database ──────────────────────────────────────────────
DATABASE_URL=sqlite:///./local_dev.db

# ── Security ──────────────────────────────────────────────
SECRET_KEY=change-this-to-a-long-random-secret
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# ── SMTP (for OTP emails) ──────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-gmail-app-password
FROM_EMAIL=your-email@gmail.com

# ── HuggingFace Models ─────────────────────────────────────
WHISPER_MODEL_ID=udayakumar8214/whisper-classroom-kn-hi-en
TRANSLATION_MODEL=ai4bharat/indictrans2-en-indic-1B

# ── AI Study Agent (Groq) ──────────────────────────────────
GROQ_API_KEY=your-groq-api-key

# ── Performance Tuning ─────────────────────────────────────
PIPELINE_MAX_WORKERS=1

# ── App ────────────────────────────────────────────────────
UPLOAD_DIR=uploads
FRONTEND_URL=http://localhost:5173
```

### 5. Start the Application

The easiest way to start both the backend and frontend simultaneously is using the provided batch script:

```bash
.\start_servers.bat
```
*(This opens two terminals automatically, sets `PYTHONUTF8=1`, and runs both servers with hot-reloading enabled).*

✅ **http://localhost:8000/docs** — Swagger API docs
✅ **http://localhost:5173** — AudioNotes AI web app

---

## 🧪 Testing the App

1. Go to **http://localhost:5173/register** → create an account
2. Check your email for the **6-digit OTP** → verify it
3. **Login** → enter password → receive and enter login OTP
4. Click **Upload Audio** → upload any lecture recording
5. Watch the live processing stages (chunking → transcription → summarization)
6. Once done, view **Structured Notes** and **Transcript**
7. Use the language dropdown in the Notes tab to translate the AI-generated summary to Kannada or Hindi using IndicTrans2
8. Chat with the **AI Study Agent** to ask questions about the lecture
9. **Download** notes as `.txt`, `.docx`, or `.pdf`
10. **Share** notes or join a **Study Group** to collaborate

---

## 📦 Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| **Backend** | FastAPI 0.111, Python 3.10, SQLAlchemy 2.0 |
| **Database** | SQLite (dev) / PostgreSQL (prod via Supabase) |
| **Auth** | Custom JWT + bcrypt + SMTP OTP (2FA) |
| **ASR** | Whisper-Small/Medium (fine-tuned on Kathbath Kn+Hi) on GPU |
| **Translation** | `ai4bharat/indictrans2-en-indic-1B` (En → Indic) |
| **Note Gen** | Qwen-0.5B (4-bit quantized via `bitsandbytes`) on GPU |
| **AI Agent** | Groq LLM API (Llama 3) |
| **Audio Processing** | pydub, librosa, noisereduce, soundfile |
| **Export** | python-docx, reportlab (PDF) |
| **Frontend** | React 18, Vite, Axios |

---

*End of README — JSS SMC MCA Institute, Dharwad*
