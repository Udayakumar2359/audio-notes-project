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
├── .env                    ← Configuration (USE_MOCK_ML, SECRET_KEY, etc.)
├── requirements.txt        ← Python dependencies
├── backend/
│   ├── main.py             ← FastAPI app (all routes + background pipeline)
│   ├── database.py         ← SQLAlchemy ORM models
│   ├── auth.py             ← JWT authentication
│   └── ml/
│       ├── audio_processor.py   ← Audio chunking + noise removal
│       ├── transcriber.py       ← Whisper ASR + translation
│       ├── note_structurer.py   ← T5 note generation
│       └── mock_pipeline.py     ← Mock ML (for testing without models)
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Upload.jsx
│   │   │   └── NotesViewer.jsx
│   │   ├── App.jsx
│   │   ├── api.js
│   │   └── index.css
│   ├── index.html
│   └── package.json
├── models/
│   ├── whisper-kn-hi/     ← Trained Whisper model (download from Colab)
│   └── t5-notes/          ← Trained T5 model (download from Colab)
├── notebooks/
│   ├── 01_Train_Whisper.ipynb
│   ├── 02_Train_T5_Notes.ipynb
│   └── 03_Evaluate_Models.ipynb
├── data/
│   ├── raw/               ← Source audio datasets
│   └── processed/         ← Preprocessed data
└── uploads/               ← User-uploaded audio files (created at runtime)
```

---

## ⚡ Quick Start (Mock Mode — No GPU Required)

### Step 1 — Create Python Virtual Environment

```bash
cd audio_notes_project
python -m venv venv

# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate
```

### Step 2 — Install Python Dependencies

```bash
pip install fastapi uvicorn[standard] python-multipart
pip install sqlalchemy passlib[bcrypt] python-jose[cryptography]
pip install python-dotenv aiofiles
pip install langdetect
```

> **For full ML support** (after Colab training):
> ```bash
> pip install -r requirements.txt
> ```

### Step 3 — Verify Mock Mode is ON

Open `.env` and confirm:
```
USE_MOCK_ML=true
```

### Step 4 — Start the Backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

✅ Visit **http://localhost:8000/docs** — you should see the API documentation.

### Step 5 — Start the Frontend (new terminal)

```bash
cd frontend
npm install   # first time only
npm run dev
```

✅ Visit **http://localhost:5173** — you should see the AudioNotes AI login page.

---

## 🔐 Test the Application

1. Open http://localhost:5173/register
2. Create a student account
3. Login with your credentials
4. Click **"Upload Audio"** — upload any `.mp3`, `.wav`, `.m4a` file
5. Watch the live pipeline progress (5 stages)
6. View your structured notes when done
7. Download the notes as `.txt`

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
| POST | `/auth/register` | Create student account |
| POST | `/auth/login` | Login → JWT token |
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
| `DATABASE_URL` | `sqlite:///./audio_notes.db` | Database path |
| `TRANSLATION_MODEL` | `Helsinki-NLP/opus-mt-mul-en` | HuggingFace translation model |

---

## ✅ Testing Checklist

- [ ] Backend starts: `uvicorn main:app --reload --port 8000`
- [ ] API docs visible: http://localhost:8000/docs
- [ ] Register user via `/auth/register`
- [ ] Login returns JWT token via `/auth/login`
- [ ] React frontend loads: http://localhost:5173
- [ ] Login redirects to Dashboard
- [ ] Upload a `.wav` file from Upload page
- [ ] Progress stages update every 3 seconds
- [ ] Notes appear when processing is done
- [ ] Download `.txt` works
- [ ] Dashboard shows all past uploads
- [ ] WER measured and recorded
- [ ] BLEU score measured and recorded
- [ ] ROUGE score measured and recorded

---

## 🛑 Troubleshooting

**Backend won't start:**
- Check virtual environment is activated: `(venv)` in terminal
- Run `pip install fastapi uvicorn python-multipart sqlalchemy passlib python-jose python-dotenv`
- Confirm `.env` file exists in `audio_notes_project/` root

**Frontend won't load:**
- Run `npm install` inside `frontend/` folder first
- Check Node.js version: `node --version` (need v18+)

**ffmpeg errors:**
- Only needed in non-mock mode for audio conversion
- Verify: `ffmpeg -version` in terminal
- Add ffmpeg `bin/` folder to system PATH on Windows

**Model not found error:**
- Check `USE_MOCK_ML=true` in `.env` for testing
- Or download trained models from Colab to `models/` folder

---

*End of README — JSS SMC MCA Institute, Dharwad*
