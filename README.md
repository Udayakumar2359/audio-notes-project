# 🎙️ AudioNotes AI — Multilingual Lecture Audio to Structured Notes

**Student:** Udaya Kumar | **USN:** P02ME24S126024
**Institution:** JSS SMC MCA Institute, Dharwad
**Version:** 2.0.0
**Tech Stack:** Python · FastAPI · PyTorch · HuggingFace · React · Vite · SQLite / PostgreSQL

---

## 📌 Project Overview

**AudioNotes AI** is an end-to-end AI system that converts multilingual classroom audio (Kannada / Hindi / English) into well-structured academic notes. Students upload a lecture recording and the system automatically transcribes, translates, and summarizes it — with an interactive AI Study Agent to answer follow-up questions.

---

## 🚀 Full Pipeline

| Step | Module | What it does |
|------|--------|-------------|
| 1 | `audio_processor.py` | Splits audio into 25-second chunks + removes background noise |
| 2 | `transcriber.py` | Whisper ASR (fine-tuned on Kathbath) + per-chunk language detection |
| 3 | `translator.py` | Translates Kannada / Hindi → English (Helsinki-NLP `opus-mt-mul-en`) |
| 4 | `cleaner.py` | Post-processes and deduplicates raw transcription text |
| 5 | `note_structurer.py` | T5 summarization → structured academic notes (JSON + plain text) |
| 6 | `credibility.py` | Faithfulness scoring of notes vs. transcript (T5 score + agent groundedness) |
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
│
├── backend/
│   ├── main.py                      ← FastAPI app v2.0 — all routes (2252 lines)
│   ├── database.py                  ← SQLAlchemy models (Users, Audio, Groups, Chat, etc.)
│   ├── auth.py                      ← Custom email+password auth + OTP via SMTP
│   ├── evaluate.py                  ← CLI evaluation script (WER, BLEU, ROUGE)
│   ├── eval_results.json            ← Latest quick evaluation results
│   ├── eval_results_full.json       ← Full evaluation results (all metrics)
│   └── ml/
│       ├── __init__.py
│       ├── pipeline.py              ← End-to-end pipeline orchestrator
│       ├── audio_processor.py       ← Audio chunking + noise reduction
│       ├── transcriber.py           ← Whisper ASR + language detection
│       ├── translator.py            ← Helsinki-NLP translation
│       ├── cleaner.py               ← Text cleanup + deduplication
│       ├── note_structurer.py       ← T5 note generation
│       ├── credibility.py           ← Faithfulness + groundedness scoring
│       ├── exporter.py              ← TXT / DOCX / PDF export
│       ├── evaluator.py             ← Evaluation logic (WER, BLEU, ROUGE, chrF)
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
│           ├── Landing.jsx          ← Marketing / home page
│           ├── Register.jsx         ← Sign up (email + password)
│           ├── Login.jsx            ← Login + OTP 2FA
│           ├── ForgotPassword.jsx   ← Forgot / reset password flow
│           ├── SSOCallback.jsx      ← OAuth callback handler
│           ├── Dashboard.jsx        ← All uploads + notes history
│           ├── Upload.jsx           ← Audio upload + live pipeline progress
│           ├── NotesViewer.jsx      ← View notes, transcripts, chat with AI agent
│           ├── Profile.jsx          ← User profile + password change
│           ├── Groups.jsx           ← Study groups list
│           ├── GroupDetail.jsx      ← Group notes, files, and group chat
│           └── SharedNote.jsx       ← Public shared note viewer
│
├── notebooks/
│   ├── 01_Train_Whisper.ipynb       ← Fine-tune Whisper-Small on Kathbath dataset
│   ├── 01_Train_Whisper.py          ← Script version of Whisper training
│   ├── 02_Train_Whisper_Medium_v2.ipynb ← Whisper-Medium improved training run
│   ├── 02_Train_T5_Notes.ipynb      ← Train T5-Small for note structuring
│   └── 03_Evaluate_Models.ipynb     ← WER, BLEU, ROUGE evaluation
│
├── models/                          ← Downloaded trained models (not tracked in git)
│   ├── whisper-kn-hi/               ← Custom Whisper checkpoint
│   └── t5-notes/                    ← Custom T5 checkpoint
│
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

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | — | Create account |
| POST | `/auth/verify-otp` | — | Verify registration OTP |
| POST | `/auth/send-otp` | — | Resend registration OTP |
| POST | `/auth/login` | — | Login (triggers OTP) |
| POST | `/auth/verify-login-otp` | — | Verify login OTP → JWT |
| POST | `/auth/forgot-password` | — | Request password reset OTP |
| POST | `/auth/reset-forgotten-password` | — | Reset password via OTP |
| POST | `/auth/reset-password` | ✅ JWT | Change password (requires current password) |
| POST | `/auth/send-password-change-otp` | ✅ JWT | Send OTP to authorize password change |
| POST | `/auth/verify-password-change` | ✅ JWT | Verify OTP + set new password |
| GET | `/auth/me` | ✅ JWT | Get current user |

### Audio & Notes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/audio/upload` | Upload audio → background pipeline starts |
| GET | `/audio/{id}/status` | Poll processing status |
| GET | `/audio/{id}/notes` | Get structured notes (JSON + text) |
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

### Study Groups
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/groups` | Create a study group |
| GET | `/groups` | List user's groups |
| GET | `/groups/{id}` | Get group details |
| POST | `/groups/{id}/join` | Join a group |
| POST | `/groups/{id}/notes` | Share a note with group |
| GET | `/groups/{id}/notes` | Get group's shared notes |
| POST | `/groups/{id}/files` | Upload file to group |
| GET | `/groups/{id}/files` | List group files |
| POST | `/groups/{id}/chat` | Post a message in group chat |
| GET | `/groups/{id}/chat` | Get group chat messages |

### Evaluation
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/evaluate?model=all\|translation\|notes` | Run evaluation and return metrics |

> Interactive API docs: **http://localhost:8000/docs**

---

## 📊 Evaluation Results (Latest)

Evaluated on `2026-04-22` using built-in test samples:

| Module | Metric | Result | Target |
|--------|--------|--------|--------|
| **Translation** (Helsinki-NLP) | BLEU | **33.97** | > 20 ✅ |
| **Translation** (Helsinki-NLP) | chrF | **69.44** | > 50 ✅ |
| **Translation** | Latency | **0.36 s/sample** | — |
| **T5 Note Structuring** | ROUGE-1 | **28.86%** | > 25% ✅ |
| **T5 Note Structuring** | ROUGE-2 | **15.16%** | > 10% ✅ |
| **T5 Note Structuring** | ROUGE-L | **26.70%** | > 20% ✅ |
| **T5 Note Structuring** | Coverage | **92.09%** | — |
| **T5 Note Structuring** | Latency | **1.11 s/sample** | — |
| **Full Pipeline** | End-to-end | **4.41 s/clip** | — |

> ASR WER requires a reference audio file — run via CLI: `python evaluate.py --model asr --audio path/to.wav --ref "ground truth"`

---

## 📋 Prerequisites

| Tool | Version | Install | Verify |
|------|---------|---------|--------|
| Python | 3.10+ | https://python.org/downloads | `python --version` |
| Node.js | 18+ LTS | https://nodejs.org | `node --version` |
| ffmpeg | latest | https://ffmpeg.org/download.html | `ffmpeg -version` |
| Git | latest | https://git-scm.com | `git --version` |

> **Windows ffmpeg:** Extract zip → copy `bin/` path → add to **System → Environment Variables → PATH** → restart terminal.

---

## ⚡ Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/Udayakumar2359/audio-notes-project.git
cd audio-notes-project
```

### 2. Create Python Virtual Environment

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# Mac / Linux
source venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables

Create a `.env` file in the project root:

```env
# ── Database ──────────────────────────────────────────────
DATABASE_URL=sqlite:///./local_dev.db
# For production: DATABASE_URL=postgresql://user:pass@host:5432/dbname

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
T5_MODEL_ID=udayakumar8214/t5-lecture-notes
TRANSLATION_MODEL=Helsinki-NLP/opus-mt-mul-en

# ── AI Study Agent (Groq) ──────────────────────────────────
GROQ_API_KEY=your-groq-api-key

# ── App ────────────────────────────────────────────────────
UPLOAD_DIR=uploads
FRONTEND_URL=http://localhost:5173
```

> **Gmail tip:** Use a [Gmail App Password](https://support.google.com/accounts/answer/185833) — not your main Gmail password.
> **Groq API key:** Free at [console.groq.com](https://console.groq.com)

### 5. Start the Backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

✅ **http://localhost:8000/docs** — Swagger API docs

### 6. Start the Frontend (new terminal)

```bash
cd frontend
npm install       # first time only
npm run dev
```

✅ **http://localhost:5173** — AudioNotes AI app

---

## 🧪 Testing the App

1. Go to **http://localhost:5173/register** → create an account
2. Check your email for the **6-digit OTP** → verify it
3. **Login** → enter password → receive and enter login OTP
4. Click **Upload Audio** → upload any `.wav`, `.mp3`, `.m4a`, `.ogg`, `.flac`, `.aac`, or `.webm` file
5. Watch the live processing stages (chunking → transcription → translation → notes)
6. Once done, view **Structured Notes**, **Transcript**, and **Credibility Score**
7. Chat with the **AI Study Agent** to ask questions about the lecture
8. **Download** notes as `.txt`, `.docx`, or `.pdf`
9. **Share** notes or join a **Study Group** to collaborate

---

## 🤖 Model Training (Google Colab — GPU Required)

> All training is done on Colab (free T4 GPU). Do not train on CPU.

### Trained Models on HuggingFace Hub

| Model | HuggingFace ID |
|-------|---------------|
| Whisper (ASR) | `udayakumar8214/whisper-classroom-kn-hi-en` |
| T5 (Notes) | `udayakumar8214/t5-lecture-notes` |

The backend loads these automatically from HuggingFace on startup — no manual download needed.

### Re-training from Scratch

| Notebook | Purpose | Dataset | Time |
|----------|---------|---------|------|
| `01_Train_Whisper.ipynb` | Fine-tune Whisper-Small | Kathbath (Kn + Hi) | ~1.5–2 hrs |
| `02_Train_Whisper_Medium_v2.ipynb` | Fine-tune Whisper-Medium (improved) | Kathbath | ~3–4 hrs |
| `02_Train_T5_Notes.ipynb` | Train T5-Small for note generation | CNN/DailyMail (50k) | ~2–3 hrs |
| `03_Evaluate_Models.ipynb` | Evaluate all models | Test splits | ~15 min |

**Steps:**
1. Open [colab.research.google.com](https://colab.research.google.com)
2. Upload the notebook from the `notebooks/` folder
3. **Runtime → Change runtime type → T4 GPU**
4. Run all cells in order

---

## 🔧 Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./local_dev.db` | SQLite (local) or PostgreSQL (prod) |
| `SECRET_KEY` | *(set this!)* | JWT signing secret |
| `ALGORITHM` | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Token lifetime (24h) |
| `WHISPER_MODEL_ID` | `udayakumar8214/whisper-classroom-kn-hi-en` | HuggingFace Whisper model |
| `T5_MODEL_ID` | `udayakumar8214/t5-lecture-notes` | HuggingFace T5 model |
| `TRANSLATION_MODEL` | `Helsinki-NLP/opus-mt-mul-en` | Translation model |
| `GROQ_API_KEY` | *(required)* | Groq API key for AI agent |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | *(your email)* | Gmail address |
| `SMTP_PASSWORD` | *(app password)* | Gmail App Password |
| `UPLOAD_DIR` | `uploads` | Audio file storage dir |
| `FRONTEND_URL` | `http://localhost:5173` | For CORS whitelist |

---

## ✅ Testing Checklist

- [ ] Backend starts without errors: `uvicorn main:app --reload --port 8000`
- [ ] API docs load: http://localhost:8000/docs
- [ ] Register → OTP email received → account verified
- [ ] Login → OTP email received → JWT issued → Dashboard loads
- [ ] Forgot password flow works
- [ ] Audio upload accepted (wav / mp3 / m4a / ogg / flac / aac / webm)
- [ ] Pipeline stages visible in real-time on Upload page
- [ ] Notes display in NotesViewer (structured + plain text)
- [ ] Transcript tab shows per-chunk results with language labels
- [ ] Credibility badge shows faithfulness score
- [ ] AI Study Agent answers questions about the transcript
- [ ] Download works in TXT, DOCX, and PDF formats
- [ ] Study Groups — create, join, share notes, group chat
- [ ] Shared note public URL accessible without login
- [ ] Profile page — update name, change password
- [ ] Evaluation endpoint returns BLEU / ROUGE scores
- [ ] WER measured via CLI: `python evaluate.py --model asr`

---

## 🛑 Troubleshooting

**Backend won't start**
- Activate venv: `venv\Scripts\activate` (Windows) / `source venv/bin/activate` (Mac)
- Run `pip install -r requirements.txt`
- Confirm `.env` exists in the project root

**OTP emails not arriving**
- Check `SMTP_USER` and `SMTP_PASSWORD` in `.env`
- Use a Gmail **App Password** (not your regular password)
- Check spam/junk folder

**Models not loading**
- Ensure `WHISPER_MODEL_ID` and `T5_MODEL_ID` are correct HuggingFace IDs
- Check internet connection (models download on first startup)
- Startup takes ~1–3 minutes while models load

**ffmpeg errors**
- Add ffmpeg's `bin/` folder to your system PATH
- Verify: `ffmpeg -version`

**Groq AI agent not responding**
- Set `GROQ_API_KEY` in `.env`
- Get a free key at https://console.groq.com

**Frontend blank page**
- Run `npm install` inside the `frontend/` folder
- Check Node.js version ≥ 18: `node --version`

---

## 📦 Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| **Backend** | FastAPI 0.111, Python 3.10, SQLAlchemy 2.0 |
| **Database** | SQLite (dev) / PostgreSQL (prod via Railway/Render) |
| **Auth** | Custom JWT + bcrypt + SMTP OTP (2FA) |
| **ASR** | Whisper-Small/Medium (fine-tuned on Kathbath Kn+Hi) |
| **Translation** | Helsinki-NLP `opus-mt-mul-en` |
| **Note Gen** | T5-Small (fine-tuned on CNN/DailyMail) |
| **AI Agent** | Groq LLM API (Llama 3) |
| **Audio Processing** | pydub, librosa, noisereduce, soundfile |
| **Export** | python-docx, reportlab (PDF) |
| **Evaluation** | jiwer (WER/CER), sacrebleu (BLEU/chrF), rouge-score |
| **Frontend** | React 18, Vite, Axios |
| **Deployment** | Render (backend) + Vercel (frontend) |

---

*End of README — JSS SMC MCA Institute, Dharwad*
