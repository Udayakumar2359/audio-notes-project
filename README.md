# 🎙️ AudioNotes AI — Multilingual Lecture Audio to Structured Notes

**Student:** Udaya Kumar | **USN:** P02ME24S126024  
**Institution:** JSS SMC MCA Institute, Dharwad  
**Tech Stack:** Python · FastAPI · PyTorch · HuggingFace · React · Vite · SQLite

---

## 🚀 What This System Does

Upload a classroom audio file (Kannada / Hindi / English mixed) and the AI automatically:

| Step | Module | What happens |
|------|--------|-------------|
| 1 | Audio Chunking | Splits audio into 25-second segments |
| 2 | Noise Removal | Removes background noise (noisereduce) |
| 3 | Speech → Text | Whisper ASR (fine-tuned on Kathbath dataset) |
| 4 | Language Detection | Identifies Kannada / Hindi / English per chunk |
| 5 | Translation | Converts non-English → English (Helsinki-NLP) |
| 6 | Note Structuring | T5 summarization → organized academic notes |
| 7 | Storage | SQLite database per user |
| 8 | Frontend UI | React dashboard with live progress tracking |

---

## 📋 Pre-requisites (Install Once)

| Tool | Download | Verify |
|------|----------|--------|
| Python 3.10+ | https://python.org/downloads | `python --version` |
| Node.js 18+ LTS | https://nodejs.org/en/download | `node --version` |
| ffmpeg | https://ffmpeg.org/download.html | `ffmpeg -version` |
| Git | https://git-scm.com | `git --version` |

> **Windows ffmpeg tip:** Extract the zip, copy the `bin/` folder path, add it to  
> System → Environment Variables → PATH. Restart terminal.

---

## 🏗️ Project Structure

```
audio_notes_project/
├── .env                         ← Configuration (USE_MOCK_ML, SECRET_KEY, SMTP, etc.)
├── .env.example                 ← Template for environment variables
├── .gitignore
├── requirements.txt             ← Python dependencies
├── Procfile                     ← Deployment config (Heroku/Render)
├── runtime.txt                  ← Python version pin
├── backend/
│   ├── main.py                  ← FastAPI app (all routes + background pipeline)
│   ├── database.py              ← SQLAlchemy ORM models
│   ├── auth.py                  ← Custom Email+Password auth with OTP verification
│   └── ml/
│       ├── audio_processor.py   ← Audio chunking + noise removal
│       ├── transcriber.py       ← Whisper ASR + language detection + translation
│       ├── note_structurer.py   ← T5 note generation
│       ├── cleaner.py           ← Text post-processing and cleanup
│       ├── exporter.py          ← Export notes to .txt / .pdf
│       └── pipeline.py          ← End-to-end ML orchestration pipeline
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── vercel.json              ← Frontend deployment config
│   ├── package.json
│   └── src/
│       ├── App.jsx              ← Route definitions
│       ├── api.js               ← Axios API client
│       ├── index.css            ← Global styles
│       ├── main.jsx             ← React entry point
│       ├── components/
│       │   └── Navbar.jsx
│       └── pages/
│           ├── Landing.jsx       ← Home/marketing page
│           ├── Register.jsx      ← Sign up with email + password
│           ├── Login.jsx         ← Login + OTP email verification
│           ├── ForgotPassword.jsx← Password reset flow
│           ├── SSOCallback.jsx   ← OAuth callback handler
│           ├── Dashboard.jsx     ← All past uploads + notes
│           ├── Upload.jsx        ← Audio upload + live pipeline progress
│           ├── NotesViewer.jsx   ← View/download structured notes
│           └── Profile.jsx       ← User profile settings
├── notebooks/
│   ├── 01_Train_Whisper.ipynb   ← Fine-tune Whisper on Kathbath dataset
│   ├── 01_Train_Whisper.py      ← Script version of Whisper training
│   ├── 02_Train_T5_Notes.ipynb  ← Train T5 for note structuring
│   └── 03_Evaluate_Models.ipynb ← WER, BLEU, ROUGE evaluation
├── models/                      ← Trained models (not tracked in git)
│   ├── whisper-kn-hi/
│   └── t5-notes/
└── uploads/                     ← User audio files (created at runtime, not tracked)
```

---

## 🔐 Authentication System

This project uses a **custom email + password authentication system** with mandatory **OTP verification**:

| Step | Description |
|------|-------------|
| Register | User signs up with name, email, and password |
| OTP Email | A 6-digit OTP is sent to the registered email |
| Verify OTP | User enters OTP to activate account |
| Login | User logs in with email + password |
| OTP on Login | A fresh OTP is emailed on every login for 2FA |
| JWT Token | On successful OTP verification, a JWT token is issued |

> No third-party auth providers (Clerk, Auth0, etc.) — fully self-hosted and secure.

---

## ⚡ Quick Start (Mock Mode — No GPU Required)

### Step 1 — Clone the Repository

```bash
git clone https://github.com/Udayakumar2359/audio-notes-project.git
cd audio-notes-project
```

### Step 2 — Create Python Virtual Environment

```bash
python -m venv venv

# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate
```

### Step 3 — Install Python Dependencies

```bash
pip install -r requirements.txt
```

### Step 4 — Configure Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```env
USE_MOCK_ML=true
SECRET_KEY=your-super-secret-key-here
DATABASE_URL=sqlite:///./audio_notes.db

# Email (SMTP) — required for OTP auth
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
FROM_EMAIL=your-email@gmail.com
```

> **Gmail tip:** Use an [App Password](https://support.google.com/accounts/answer/185833) instead of your main password.

### Step 5 — Start the Backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

✅ Visit **http://localhost:8000/docs** — you should see the API documentation.

### Step 6 — Start the Frontend (new terminal)

```bash
cd frontend
npm install   # first time only
npm run dev
```

✅ Visit **http://localhost:5173** — you should see the AudioNotes AI landing page.

---

## 🧪 Test the Application

1. Open **http://localhost:5173/register**
2. Create an account with your email
3. Check your email for the **OTP code** and verify
4. **Login** → enter OTP again for 2FA
5. Click **"Upload Audio"** — upload any `.mp3`, `.wav`, `.m4a` file
6. Watch the live pipeline progress (5 stages)
7. View your structured notes when done
8. Download the notes as `.txt`

---

## 🤖 Model Training (Google Colab — GPU Required)

> Training happens on Colab (free T4 GPU). Do not train on CPU — it's 10-100x slower.

### Step A — Open Colab

1. Go to https://colab.research.google.com
2. Upload the notebook from `notebooks/` folder
3. **Runtime → Change runtime type → GPU (T4)**

### Step B — Train Whisper (ASR Model)

Open `notebooks/01_Train_Whisper.ipynb` and run all cells in order.

- Downloads Kathbath Kannada + Hindi dataset (~5 GB)
- Fine-tunes Whisper-Small for 1000 steps
- Training time: ~1.5–2 hours on T4
- Saves to Google Drive

### Step C — Train T5 (Note Structuring)

Open `notebooks/02_Train_T5_Notes.ipynb` and run all cells.

- Uses CNN/DailyMail dataset (50k samples)
- Trains T5-Small for 3 epochs
- Training time: ~2–3 hours on T4

### Step D — Download to Local Machine

Each notebook's last cell zips + downloads the model.

Extract to:
```
models/whisper-kn-hi/    ← from Whisper notebook
models/t5-notes/         ← from T5 notebook
```

### Step E — Switch to Real Models

In `.env`:
```
USE_MOCK_ML=false
```

Restart the backend — it will now load and use the real trained models.

---

## 📊 Evaluation

Open `notebooks/03_Evaluate_Models.ipynb` on Colab after training.

| Module | Metric | Target |
|--------|--------|--------|
| Whisper ASR | Word Error Rate (WER) | < 35% |
| Language Detection | Accuracy | > 85% |
| IndicTrans2 Translation | BLEU Score | > 20 |
| T5 Note Structuring | ROUGE-L | > 0.30 |

---

## 🌐 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register with email + password |
| POST | `/auth/verify-otp` | Verify registration OTP |
| POST | `/auth/login` | Login → triggers OTP email |
| POST | `/auth/verify-login-otp` | Verify login OTP → returns JWT |
| POST | `/auth/forgot-password` | Request password reset |
| POST | `/auth/reset-password` | Reset password with token |
| GET | `/auth/me` | Current user info |
| POST | `/audio/upload` | Upload audio file |
| GET | `/audio/{id}/status` | Poll processing status |
| GET | `/audio/{id}/notes` | Get structured notes |
| GET | `/audio/{id}/transcript` | Get chunk transcriptions |
| GET | `/user/uploads` | List all uploads |
| DELETE | `/audio/{id}` | Delete a recording |

Interactive docs: **http://localhost:8000/docs**

---

## 🔧 Configuration (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_MOCK_ML` | `true` | `false` to load real trained models |
| `SECRET_KEY` | (set this!) | JWT signing secret — change in production |
| `ALGORITHM` | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | 24-hour token expiry |
| `UPLOAD_DIR` | `uploads` | Where audio files are saved |
| `MODEL_DIR` | `models` | Where ML models are stored |
| `DATABASE_URL` | `sqlite:///./audio_notes.db` | SQLite database path |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server for OTP emails |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | Your Gmail address |
| `SMTP_PASSWORD` | — | Gmail App Password |
| `TRANSLATION_MODEL` | `Helsinki-NLP/opus-mt-mul-en` | HuggingFace translation model |

---

## ✅ Testing Checklist

- [ ] Backend starts: `uvicorn main:app --reload --port 8000`
- [ ] API docs visible: http://localhost:8000/docs
- [ ] Register user → receive OTP email
- [ ] OTP verification activates account
- [ ] Login → OTP email sent → verify OTP → redirected to Dashboard
- [ ] React frontend loads: http://localhost:5173
- [ ] Upload a `.wav` file from Upload page
- [ ] Progress stages update every 3 seconds
- [ ] Notes appear when processing is done
- [ ] Download `.txt` works
- [ ] Dashboard shows all past uploads
- [ ] Profile page loads user info
- [ ] WER measured and recorded
- [ ] BLEU score measured and recorded
- [ ] ROUGE score measured and recorded

---

## 🛑 Troubleshooting

**Backend won't start:**
- Check virtual environment is activated: `(venv)` in terminal
- Run `pip install -r requirements.txt`
- Confirm `.env` file exists in the root folder

**OTP emails not arriving:**
- Check `SMTP_USER` and `SMTP_PASSWORD` in `.env`
- Use Gmail App Password (not your main Gmail password)
- Check spam/junk folder

**Frontend won't load:**
- Run `npm install` inside `frontend/` folder first
- Check Node.js version: `node --version` (need v18+)

**ffmpeg errors:**
- Only needed in non-mock mode for audio conversion
- Verify: `ffmpeg -version` in terminal
- Add ffmpeg `bin/` folder to system PATH on Windows

**Model not found error:**
- Check `USE_MOCK_ML=true` in `.env` for testing without models
- Or download trained models from Colab to `models/` folder

---

*End of README — JSS SMC MCA Institute, Dharwad*
