# 🎙️ AudioNotes AI — Multilingual Lecture Audio to Structured Notes

**Student:** Udaya Kumar | **USN:** P02ME24S126024  
**Institution:** JSS SMC MCA Institute, Dharwad  
**Version:** 3.0.0  
**Tech Stack:** Python · FastAPI · PyTorch (CUDA) · HuggingFace · Qwen2.5-7B · Ollama · React · Vite · SQLite / PostgreSQL

---

## 📌 Project Overview

**AudioNotes AI** is an end-to-end AI system that converts multilingual classroom audio (Kannada / Hindi / English) into well-structured, exam-ready academic notes. Students upload a lecture recording — or paste a YouTube URL — and the system automatically:

1. Splits and transcribes the audio using a **fine-tuned Whisper model**
2. Cleans, reconstructs, and summarises the transcript via a **4-stage Qwen2.5-7B NLP pipeline**
3. Generates structured notes with title, overview, sections, key concepts, and glossary
4. Lets students **translate** the notes to Hindi / Kannada via IndicTrans2
5. Enables **AI Study Agent** Q&A (powered by a local Ollama LLM) over the full transcript
6. Exports notes as **TXT / DOCX / PDF** and supports **study group sharing**

---

## 🚀 Full Pipeline

| Step | Module | What it does |
|------|--------|--------------|
| 1 | `audio_processor.py` | Splits audio into 25-second chunks + noise reduction |
| 2 | `transcriber.py` | Whisper ASR (fine-tuned on Kathbath Kn+Hi+En) + language detection per chunk |
| 3 | `cleaner.py` | Deduplication and post-processing of raw ASR text |
| 4 | `nlp_agent.py` — Stage 1 | **Transcript Cleaner** — removes fillers, fixes grammar, adds punctuation |
| 5 | `nlp_agent.py` — Stage 2 | **Context Reconstructor** — expands fragments into coherent paragraphs |
| 6 | `nlp_agent.py` — Stage 3 | **Topic Extractor** — extracts main topic, subtopics, keywords as JSON |
| 7 | `nlp_agent.py` — Stage 4 | **Hierarchical Summariser** — chunk summaries → final structured notes |
| 8 | `translator.py` | Translates notes (En → Kn/Hi) via `Helsinki-NLP/opus-mt-mul-en` |
| 9 | `credibility.py` | Faithfulness scoring (ROUGE/T5) + agent groundedness checks |
| 10 | `exporter.py` | Exports notes to `.txt`, `.docx`, or `.pdf` |
| 11 | `agent.py` | Local Ollama AI Study Agent — Q&A and note generation over the transcript |
| 12 | `pipeline.py` | Orchestrates all steps as a cancellable background job |

---

## 🧠 NLP Agent — 4-Stage Qwen2.5-7B Pipeline

The core intelligence of AudioNotes AI is a **sequential 4-stage pipeline** running locally on `Qwen2.5-7B-Instruct` via Ollama. It is designed to handle long transcripts (15,000–20,000 words from 90–120 min lectures).

### Chunking Strategy
- Long transcripts are split at **sentence boundaries** into ~1,100-word chunks with 80-word overlaps
- Each stage processes chunks in **parallel** (configurable workers via `NLP_MAX_WORKERS`)

### Stage 1 — Transcript Cleaner
Removes ASR fillers (um, uh, you know…), fixes grammar, adds punctuation, and fixes capitalisation — without adding any new information.

### Stage 2 — Context Reconstructor
Expands fragmented STT sentences into full, coherent educational paragraphs, restoring implied context across audio gaps.

### Stage 3 — Topic Extractor
Analyses a representative 3,000-word sample to extract `main_topic`, `subtopics`, and `keywords` as strict JSON.

### Stage 4 — Hierarchical Summariser
- **Pass 1:** Each chunk is summarised into a dense 200–350 word intermediate summary (parallel)
- **Pass 2:** All chunk summaries are merged → final structured notes via `FINAL_PROMPT`
- If merged summaries exceed 8,000 words, an intermediate reduction pass runs automatically

### Final Notes Output Format
```
# TITLE: [...]
## MAIN TOPICS COVERED
## DETAILED EXPLANATIONS
## EXAMPLES AND APPLICATIONS
## KEY TAKEAWAYS
## GLOSSARY OF TERMS
```

---

## 🤖 AI Study Agent — Download Notes Prompt

The AI Study Agent (`/agent/{id}/download-notes`) generates comprehensive, exam-ready notes on demand using this prompt:

```
Generate comprehensive, exam-ready academic notes from the lecture transcript.

LECTURE TITLE:        ← derived from content
OVERVIEW:             ← 10–13 sentence summary

### N. <Section Title>
#### Explanation:     ← minimum 15–20 sentences in academic language
#### Key Points:      ← bullet points with explanations
#### Steps / Working: ← only for processes or algorithms

CRITICAL RULES:
- Cover ALL major ideas — do not skip topics
- Minimum 200–250 words per section
- Every section MUST have an Explanation paragraph
- Begin response IMMEDIATELY with: LECTURE TITLE:
```

---

## 🏗️ Project Structure

```
audio_notes_project-1/
├── .env                             ← Runtime config (SMTP, DB, model IDs, etc.)
├── .gitignore
├── Procfile                         ← Deployment config (Render / Heroku)
├── runtime.txt                      ← Python version pin
├── requirements.txt                 ← All Python dependencies
│
├── backend/
│   ├── main.py                      ← FastAPI app — all routes (2,850+ lines)
│   ├── database.py                  ← SQLAlchemy models (Users, Audio, Groups, Chat, Notes…)
│   ├── auth.py                      ← Custom email+password auth + OTP via SMTP
│   └── ml/
│       ├── pipeline.py              ← End-to-end pipeline orchestrator (cancellable)
│       ├── nlp_agent.py             ← 4-stage Qwen2.5-7B NLP pipeline (main AI brain)
│       ├── qwen_generator.py        ← Qwen2.5-7B generation wrapper (via Ollama)
│       ├── audio_processor.py       ← Audio chunking + noise reduction (pydub/librosa)
│       ├── transcriber.py           ← Whisper ASR + per-chunk language detection
│       ├── translator.py            ← Helsinki-NLP translation (En → Indic)
│       ├── cleaner.py               ← Text cleanup + deduplication
│       ├── polisher.py              ← Grammar polish pass on transcripts
│       ├── note_structurer.py       ← Structured notes schema builder
│       ├── credibility.py           ← T5 faithfulness + groundedness scoring
│       ├── evaluator.py             ← Full pipeline evaluator
│       ├── exporter.py              ← TXT / DOCX / PDF export
│       ├── agent.py                 ← Ollama AI Study Agent (Q&A + note generation)
│       └── model_registry.py        ← Thread-safe model loader/cache
│
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── vercel.json                  ← Frontend deployment config
│   ├── package.json
│   └── src/
│       ├── App.jsx                  ← React Router routes
│       ├── api.js                   ← Axios API client
│       ├── index.css                ← Global styles + design system
│       ├── main.jsx
│       ├── components/
│       │   ├── Navbar.jsx           ← Responsive top navigation
│       │   ├── AgentChatPanel.jsx   ← AI Study Agent chat UI (SSE streaming)
│       │   ├── CredibilityBadge.jsx ← Faithfulness score display
│       │   └── SessionManager.jsx   ← Auth session handler
│       └── pages/
│           ├── Landing.jsx          ← Public landing page
│           ├── Login.jsx            ← Login + OTP 2FA flow
│           ├── Register.jsx         ← Registration + email verification
│           ├── ForgotPassword.jsx   ← Password reset via OTP
│           ├── Dashboard.jsx        ← All uploads + notes history
│           ├── Upload.jsx           ← Audio upload + live pipeline progress
│           ├── NotesViewer.jsx      ← Notes, Transcript, Translate, Edit, Share,
│           │                            AI Chat, AI Summary, Download views
│           ├── Groups.jsx           ← Study groups list
│           ├── GroupDetail.jsx      ← Group notes + file sharing
│           ├── SharedNote.jsx       ← Public shared notes viewer
│           └── Profile.jsx          ← User profile + account settings
│
├── notebooks/                       ← Training & evaluation notebooks
└── uploads/                         ← User audio files at runtime (git-ignored)
```

---

## 🔐 Authentication System

A fully **self-hosted, custom authentication system** — no third-party providers. Every login requires email + password **and** a fresh OTP — mandatory 2FA on every session.

| Endpoint | Description |
|----------|-------------|
| `POST /auth/register` | Sign up → sends 6-digit OTP to email |
| `POST /auth/verify-otp` | Verify OTP → account activated + JWT issued |
| `POST /auth/send-otp` | Resend registration OTP |
| `POST /auth/login` | Login → sends login OTP (2FA) |
| `POST /auth/verify-login-otp` | Verify login OTP → JWT returned |
| `POST /auth/forgot-password` | Send password reset OTP |
| `POST /auth/reset-forgotten-password` | OTP + new password → reset complete |
| `POST /auth/send-password-change-otp` | Logged-in: request password change OTP |
| `POST /auth/verify-password-change` | Verify OTP → new password saved |
| `GET /auth/me` | Get current user info |

---

## 🌐 Full API Reference

### Audio & Notes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/audio/upload` | Upload audio → background pipeline starts |
| POST | `/audio/upload-youtube` | Paste YouTube URL → audio downloaded + pipeline starts |
| GET | `/audio/{id}/status` | Poll processing status |
| GET | `/audio/{id}/notes` | Get structured notes (JSON + markdown text) |
| GET | `/audio/{id}/transcripts` | Per-chunk transcriptions (lazy loaded) |
| GET | `/audio/{id}/polished-transcript` | Polished + raw transcript |
| GET | `/audio/{id}/credibility` | T5 faithfulness + agent groundedness scores |
| GET | `/audio/{id}/download?format=txt\|docx\|pdf` | Download notes in chosen format |
| GET | `/audio/{id}/group-references` | Groups/links referencing this note |
| PATCH | `/notes/{id}/edit` | Save edited notes text |
| POST | `/notes/{id}/translate` | Translate summary to Kn/Hi (SSE stream) |
| POST | `/notes/{id}/share` | Generate a public share link (with optional expiry) |
| GET | `/user/uploads` | List all user uploads |
| DELETE | `/audio/{id}` | Delete recording + all associated data |

### AI Study Agent
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/agent/{id}/init` | Pre-warm agent context (no LLM call) |
| POST | `/agent/{id}/chat` | Send message → stream reply (SSE) |
| POST | `/agent/{id}/generate-notes` | Generate detailed study notes (SSE stream) |
| POST | `/agent/{id}/summarize?level=brief\|standard\|detailed` | Summarise at chosen depth (SSE) |
| GET | `/agent/{id}/download-notes?format=docx\|pdf` | Download AI-generated notes as Word/PDF |
| DELETE | `/agent/{id}/history` | Clear chat session |

### Study Groups
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/groups` | Create a study group |
| GET | `/groups` | List joined groups |
| GET | `/groups/{id}` | Group details + members |
| POST | `/groups/{id}/join` | Join a group |
| POST | `/groups/{id}/notes` | Share a note into a group |
| DELETE | `/groups/{id}/notes/{note_id}` | Remove a shared note |
| GET | `/groups/{id}/files` | List uploaded group files |
| POST | `/groups/{id}/files` | Upload a file to the group |
| GET | `/groups/{id}/files/{file_id}/download` | Download a group file |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check + loaded models status |
| GET | `/shared/{token}` | View a publicly shared note |

---

## 📋 Prerequisites

| Tool | Version | Install | Verify |
|------|---------|---------|--------|
| Python | 3.10+ | https://python.org/downloads | `python --version` |
| Node.js | 18+ LTS | https://nodejs.org | `node --version` |
| ffmpeg | latest | https://ffmpeg.org/download.html | `ffmpeg -version` |
| Ollama | latest | https://ollama.com | `ollama --version` |
| Git | latest | https://git-scm.com | `git --version` |

> **GPU Acceleration (Highly Recommended):** PyTorch with CUDA support (`torch==2.7.0+cu128`) for Whisper inference. An NVIDIA GPU (e.g., RTX 3050+) with updated drivers is strongly recommended.  
> **Ollama:** Required for the Qwen2.5-7B NLP agent and the AI Study Agent. Must be running (`ollama serve`) before starting the backend.  
> **Windows ffmpeg:** Extract zip → copy `bin/` path → add to **System → Environment Variables → PATH** → restart terminal.

---

## ⚡ Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/Udayakumar2359/audio-notes-project.git
cd audio-notes-project-1
```

### 2. Pull the Qwen2.5-7B Model via Ollama

```bash
ollama pull qwen2.5:7b-instruct
ollama serve
```

### 3. Create Python Virtual Environment (Windows)

```bash
python -m venv venv
venv\Scripts\activate
```

### 4. Install Dependencies

```bash
pip install -r requirements.txt
pip install torch==2.7.0+cu128 torchaudio==2.7.0+cu128 --index-url https://download.pytorch.org/whl/cu128
```

### 5. Configure Environment Variables

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
QWEN_MODEL_ID=Qwen/Qwen2.5-7B-Instruct
TRANSLATION_MODEL=Helsinki-NLP/opus-mt-mul-en

# ── Ollama ─────────────────────────────────────────────────
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b-instruct

# ── Performance Tuning ─────────────────────────────────────
NLP_MAX_WORKERS=4
PIPELINE_MAX_WORKERS=1

# ── App ────────────────────────────────────────────────────
UPLOAD_DIR=uploads
FRONTEND_URL=http://localhost:5173
```

### 6. Start the Application

```bash
.\start_servers.bat
```

*This opens two terminals — one for the FastAPI backend, one for the Vite frontend — both with hot-reload enabled.*

| URL | Service |
|-----|---------|
| http://localhost:8000/docs | Swagger API docs |
| http://localhost:5173 | AudioNotes AI web app |

---

## 🧪 Testing the App

1. Open **http://localhost:5173/register** → create an account
2. Check your email for the **6-digit OTP** → verify to activate account
3. **Login** → enter password → receive and enter the login OTP
4. Click **Upload Audio** → upload a lecture recording (`.wav`, `.mp3`, `.m4a`, `.ogg`, `.flac`, `.webm`, `.aac`)  
   *Or paste a YouTube URL to download and process automatically*
5. Watch **live pipeline stages**: chunking → transcription → cleaning → reconstruction → topic extraction → summarisation
6. View the **Structured Notes** with title, overview, sections, key concepts, and glossary
7. Click **Transcript** to see the polished + raw transcript and per-chunk breakdown
8. Click **Translate** to convert the transcript to Hindi or Kannada (via Helsinki-NLP)
9. Click **AI Chat** to ask questions about the lecture (answered by the local Ollama agent)
10. Click **AI Summary** to generate a brief / standard / detailed summary on demand
11. Click **Download** → choose **TXT**, **DOCX**, or **PDF**
12. Click **Share** to generate a public link (with optional expiry)
13. Visit **Groups** to create/join a study group and share notes with classmates

---

## 📦 Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| **Backend** | FastAPI 0.111, Python 3.10, SQLAlchemy 2.0 |
| **Database** | SQLite (dev) / PostgreSQL (prod via Supabase) |
| **Auth** | Custom JWT + bcrypt + SMTP OTP (mandatory 2FA) |
| **ASR** | `udayakumar8214/whisper-classroom-kn-hi-en` (fine-tuned Whisper on GPU) |
| **NLP Agent** | `Qwen2.5-7B-Instruct` via Ollama — 4-stage pipeline |
| **Translation** | `Helsinki-NLP/opus-mt-mul-en` (En → Kn/Hi) |
| **AI Study Agent** | Local Ollama LLM — streaming Q&A + note generation |
| **Credibility** | T5 faithfulness scoring + agent groundedness |
| **Audio Processing** | pydub, librosa, noisereduce, soundfile |
| **Export** | python-docx, reportlab (PDF) |
| **Frontend** | React 18, Vite, Axios (vanilla CSS, no Tailwind) |

---

## 🗂️ Key Design Decisions

- **Fully local AI stack** — Whisper + Qwen2.5-7B run entirely on your hardware via Ollama. No OpenAI API keys needed.
- **Chunked parallel processing** — 1,100-word chunks with 80-word overlaps, processed in parallel threads (`ThreadPoolExecutor`) to handle 90+ min lectures without OOM.
- **Hierarchical summarisation** — Two-pass approach (chunk summaries → global notes) ensures no content is lost from long lectures, with an automatic intermediate pass for very large merged summaries (>8,000 words).
- **Pre-warmed agent** — After pipeline completes, the AI Study Agent is pre-initialised and cached so the first user chat has no cold-start delay.
- **Cancellable jobs** — All in-flight pipeline jobs can be cancelled via a `CANCELLED_JOBS` set; deleting a recording stops any ongoing processing immediately.
- **Mandatory 2FA** — Every login session requires both a password and a fresh OTP — no exceptions.

---

*End of README*
