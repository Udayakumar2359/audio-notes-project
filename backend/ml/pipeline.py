# backend/ml/pipeline.py
# ─────────────────────────────────────────────────────────────
# Optimised Central Pipeline  (target: ≤150 s for 90-min audio on CPU)
#
# Key optimisations vs original:
#   • MAX_WORKERS auto-scales to logical CPU count (set in env or auto)
#   • torch.set_num_threads(1) per worker → true parallel Torch inference
#   • Noise removal skipped for recordings ≥ SKIP_NR_SECS (saves 20-40 s)
#   • Adaptive chunk size (30 s instead of 25 s) → 20 % fewer chunks
#   • All chunk + transcription DB writes batched in ONE commit
#   • T5 summarisation parallelised with ThreadPoolExecutor
#   • soundfile used directly instead of librosa for faster chunk load
#   • torch.inference_mode() instead of no_grad() (minor speedup)
#   • Pipeline timing printed for observability
# ─────────────────────────────────────────────────────────────

import os
import json
import shutil
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List

from ml.audio_processor import convert_to_wav, remove_noise, chunk_audio
from ml.cleaner         import clean_transcript
from ml.note_structurer import NoteStructurer
from ml.credibility     import score_t5_faithfulness, build_credibility_report

# ── Set torch thread counts ONCE at import time ───────────────
# These can only be set before any parallel work starts.
# Setting inside worker threads causes RuntimeError.
import torch as _torch
try:
    _torch.set_num_threads(1)            # intra-op threads per worker
except RuntimeError:
    pass
try:
    _torch.set_num_interop_threads(1)    # inter-op threads (can only set once)
except RuntimeError:
    pass

# ── Tuning constants ──────────────────────────────────────────
# Workers: honour env var, else use all logical cores, cap at 12.
# Raise PIPELINE_MAX_WORKERS in .env to override (e.g. 16 on high-core machines).
_cpu        = os.cpu_count() or 4
MAX_WORKERS = int(os.getenv("PIPELINE_MAX_WORKERS", str(min(_cpu, 12))))  # Fix 4: cap raised 8→12

# Skip noise reduction for audio longer than this (seconds).
SKIP_NR_SECS = int(os.getenv("SKIP_NR_SECS", "900"))   # 15 minutes

# Chunk duration: 25 s keeps safely within Whisper's 30-s mel window.
# 30-s chunks get silence-merged into 35-40 s segments by pydub,
# causing the last ~8 s of each chunk to be silently TRUNCATED by Whisper.
CHUNK_SECS = int(os.getenv("CHUNK_SECS", "25"))

# Fix 5: Max seconds to wait for a single chunk to finish.
# 90 s is safe even on a slow CPU for a 25-s audio segment.
CHUNK_TIMEOUT = int(os.getenv("CHUNK_TIMEOUT_S", "90"))

print(f"[Pipeline] workers={MAX_WORKERS}  chunk={CHUNK_SECS}s  timeout={CHUNK_TIMEOUT}s  noise-reduction=per-chunk")


# ─────────────────────────────────────────────────────────────
#  Worker: transcribe ONE chunk
# ─────────────────────────────────────────────────────────────
def _transcribe_one_chunk(args: tuple) -> dict:
    """
    Thread-pool worker.
    1. Force torch to 1 intra-op thread so workers don't fight each other (Fix 6)
    2. Load chunk WAV
    3. Strip silence (leading/trailing) → skip if chunk is effectively silent
    4. Apply per-chunk noise reduction
    5. Transcribe with Whisper ASR
    6. Validate: detect & discard hallucination loop outputs
    7. Detect language + translate to English
    """
    import soundfile as sf
    import numpy as np
    import librosa

    # Fix 6: enforce 1 torch thread per worker — some PyTorch builds ignore the
    # global set_num_threads() call made at module load time inside spawned threads.
    try:
        import torch as _t
        _t.set_num_threads(1)
    except Exception:
        pass

    try:
        import noisereduce as nr
        NR_OK = True
    except ImportError:
        NR_OK = False

    from ml.cleaner import is_hallucination_loop

    # Silence-skip thresholds
    MIN_RMS        = 0.002     # below this → treat as silent
    MIN_SPEECH_S   = 0.5      # minimum voiced audio after trim (seconds)
    TRIM_TOP_DB    = 35        # dB below peak to call "silence"

    chunk, transcriber = args
    try:
        # ── Load chunk (already 16 kHz mono from pydub export) ──
        audio_np, sr = sf.read(chunk["path"], dtype="float32", always_2d=False)
        if audio_np.ndim == 2:
            audio_np = audio_np.mean(axis=1)

        raw_duration_s = len(audio_np) / sr if sr > 0 else 0.0

        # ── Strip leading / trailing silence ─────────────────────
        # librosa.effects.trim removes silence below TRIM_TOP_DB dB
        audio_trimmed, trim_idx = librosa.effects.trim(audio_np, top_db=TRIM_TOP_DB)
        trimmed_s = len(audio_trimmed) / sr if sr > 0 else 0.0

        # ── Skip near-silent chunks ───────────────────────────────
        rms = float(np.sqrt(np.mean(audio_trimmed ** 2))) if len(audio_trimmed) > 0 else 0.0
        if rms < MIN_RMS or trimmed_s < MIN_SPEECH_S:
            print(f"[Pipeline] Chunk {chunk.get('index','?')} SKIPPED "
                  f"(silent: rms={rms:.4f}, voiced={trimmed_s:.2f}s)")
            return {
                **chunk,
                "raw_text": "", "language": "unknown", "english_text": "",
                "error": None, "_skipped": True,
            }

        # Re-add a tiny pad (0.1 s) so Whisper doesn't cut first phoneme
        pad = int(0.1 * sr)
        start_pad = max(0, trim_idx[0] - pad)
        end_pad   = min(len(audio_np), trim_idx[1] + pad)
        audio_np  = audio_np[start_pad:end_pad]

        # ── Apply per-chunk noise reduction ───────────────────────
        if NR_OK and len(audio_np) > 0:
            audio_np = nr.reduce_noise(
                y=audio_np, sr=sr,
                stationary=True,
                prop_decrease=0.75,
            )

        # ── Transcribe ────────────────────────────────────────────
        result = transcriber.process_chunk_array(audio_np, sr)
        raw_text = result["raw_text"]

        # ── Validate: discard hallucination loops ─────────────────
        voiced_duration = len(audio_np) / sr if sr > 0 else 0.0
        if is_hallucination_loop(raw_text, voiced_duration):
            print(f"[Pipeline] Chunk {chunk.get('index','?')} DISCARDED (hallucination)")
            return {
                **chunk,
                "raw_text": "", "language": "unknown", "english_text": "",
                "error": None, "_skipped": True,
            }

        return {
            **chunk,
            "raw_text":     raw_text,
            "language":     result["language"],
            "english_text": result["english_text"],
            "error":        None,
        }
    except Exception as exc:
        print(f"[Pipeline] Chunk {chunk.get('index','?')} failed: {exc}")
        return {
            **chunk,
            "raw_text": "", "language": "unknown", "english_text": "",
            "error": str(exc),
        }


# ─────────────────────────────────────────────────────────────
#  Worker: summarise ONE T5 segment
# ─────────────────────────────────────────────────────────────
def _summarise_segment(args: tuple) -> tuple:
    """Returns (index, summary_text). torch settings already applied at import."""
    idx, text, structurer = args
    summary = structurer._summarise_segment(text)
    return idx, summary


# ─────────────────────────────────────────────────────────────
#  Main pipeline
# ─────────────────────────────────────────────────────────────
def run_full_pipeline(
    audio_file_id: int,
    file_path:     str,
    db,                       # unused (pipeline opens its own session)
    transcriber,
    structurer:    NoteStructurer,
) -> None:
    """
    Full pipeline executed in a background thread.
    Updates AudioFile.status at each stage.
    Saves chunks + transcriptions + structured_notes to DB.
    """
    from database import (
        SessionLocal, AudioFile, AudioChunk,
        Transcription, StructuredNotes,
    )

    db       = SessionLocal()
    tmp_dirs: List[str] = []
    tmp_files: List[str] = []
    t0 = time.time()

    def _elapsed():
        return f"{time.time() - t0:.1f}s"

    try:
        record = db.query(AudioFile).filter(AudioFile.id == audio_file_id).first()
        if not record:
            return

        # ── Stage 1: Convert to WAV ───────────────────────────
        record.status = "converting"
        db.commit()

        base      = os.path.splitext(file_path)[0]
        wav_path  = base + "_raw.wav"
        clean_wav = base + "_clean.wav"
        tmp_files += [wav_path, clean_wav]

        convert_to_wav(file_path, wav_path)
        print(f"[Pipeline] conversion done  {_elapsed()}")

        # ── Stage 2: Chunk (noise reduction done per-chunk in worker) ──
        record.status = "chunking"
        db.commit()

        # Chunk the raw WAV directly.
        # Each parallel worker applies noisereduce on its own ~25 s slice,
        # which is ~1.6 MB per chunk — no RAM pressure, fully parallel.
        chunk_dir = base + "_chunks"
        tmp_dirs.append(chunk_dir)
        tmp_files.remove(clean_wav)   # not used anymore
        chunks = chunk_audio(wav_path, chunk_dir, chunk_duration_ms=CHUNK_SECS * 1_000)
        print(f"[Pipeline] {len(chunks)} chunks created  {_elapsed()}")

        # ── Stage 3: Parallel Transcription ──────────────────
        record.status = "transcribing"
        db.commit()

        chunk_results = [None] * len(chunks)
        args_list     = [(chunk, transcriber) for chunk in chunks]
        total_chunks  = len(chunks)

        # ── Fix 1 + Fix 5: Bulletproof collection with per-chunk timeout ──────
        # We wrap future.result() in try/except so that ONE bad future can NEVER
        # break the as_completed loop and silently orphan all remaining chunks.
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            future_to_idx = {
                pool.submit(_transcribe_one_chunk, a): i
                for i, a in enumerate(args_list)
            }
            completed = 0
            # Outer timeout = CHUNK_TIMEOUT × total chunks (absolute max wall time)
            for future in as_completed(future_to_idx, timeout=CHUNK_TIMEOUT * total_chunks):
                idx = future_to_idx[future]
                try:
                    chunk_results[idx] = future.result(timeout=CHUNK_TIMEOUT)
                except Exception as exc:
                    # Never leave as None — mark as error so Stage 4 can count it
                    print(f"[Pipeline] Chunk {idx} future failed: {exc}")
                    chunk_results[idx] = {
                        **chunks[idx],
                        "raw_text": "", "language": "unknown", "english_text": "",
                        "error": str(exc),
                    }
                completed += 1
                # Progress log every 5 chunks and at the very end
                if completed % 5 == 0 or completed == total_chunks:
                    pct = 100 * completed // total_chunks
                    print(f"[Pipeline] Progress: {completed}/{total_chunks} chunks ({pct}%)  {_elapsed()}")

        # ── Fix 2: Post-collection safety net ────────────────────────────────
        # Guarantees zero None slots even if the timeout fired before all futures
        # completed (extremely rare, but provides a hard safety guarantee).
        missed = [i for i, r in enumerate(chunk_results) if r is None]
        if missed:
            print(f"[Pipeline] WARNING: {len(missed)} chunks uncollected — filling with blank")
            for i in missed:
                chunk_results[i] = {
                    **chunks[i],
                    "raw_text": "", "language": "unknown", "english_text": "",
                    "error": "not_collected",
                }

        # ── Fix 3: Retry chunks that had actual errors (not silence-skips) ────
        # One extra attempt — helps when a worker hit a transient resource spike.
        failed_idxs = [
            i for i, r in enumerate(chunk_results)
            if r and r.get("error") and not r.get("_skipped")
        ]
        if failed_idxs:
            print(f"[Pipeline] Retrying {len(failed_idxs)} error chunk(s)...")
            for i in failed_idxs:
                try:
                    chunk_results[i] = _transcribe_one_chunk(args_list[i])
                except Exception as retry_exc:
                    print(f"[Pipeline] Chunk {i} retry also failed: {retry_exc}")
                    # Keep the original error record; do NOT reset to None

        done_count    = sum(1 for r in chunk_results if r and not r.get("error") and not r.get("_skipped"))
        skipped_count = sum(1 for r in chunk_results if r and r.get("_skipped"))
        err_count     = sum(1 for r in chunk_results if r and r.get("error") and not r.get("_skipped"))
        print(
            f"[Pipeline] transcribed {done_count}/{total_chunks} chunks  "
            f"({skipped_count} silent/hallucination skipped, {err_count} errors)  {_elapsed()}"
        )

        # ── Stage 4: Clean, collect English text ─────────────
        all_english_texts = []
        cleaned_results   = []   # for batch DB write

        for i, cr in enumerate(chunk_results):
            if cr is None:
                continue
            # Skip chunks that were silenced or detected as hallucinations
            if cr.get("_skipped"):
                continue
            # Compute chunk audio duration for density check
            chunk_dur = cr.get("end", 0.0) - cr.get("start", 0.0)
            cleaned = clean_transcript(cr["raw_text"], audio_duration_s=chunk_dur)
            cleaned_results.append((i, cr, cleaned))
            if cr["english_text"].strip():
                all_english_texts.append(cr["english_text"])

        # ── Stage 4b: BATCH DB write (chunks + transcriptions) ─
        for i, cr, cleaned in cleaned_results:
            db_chunk = AudioChunk(
                audio_file_id = audio_file_id,
                chunk_index   = cr.get("index", i),
                start_time    = cr.get("start", 0.0),
                end_time      = cr.get("end",   0.0),
                chunk_path    = cr.get("path",  ""),
            )
            db.add(db_chunk)
            db.flush()   # get db_chunk.id without committing yet

            db.add(Transcription(
                chunk_id          = db_chunk.id,
                raw_text          = cr["raw_text"],
                cleaned_text      = cleaned,
                detected_language = cr["language"],
                translated_text   = cr["english_text"],
            ))

        db.commit()   # ONE commit for ALL chunks + transcriptions
        print(f"[Pipeline] DB write done  {_elapsed()}")

        # ── Stage 5: Parallel T5 Note Structuring ─────────────
        record.status = "structuring"
        db.commit()

        full_transcript = " ".join(all_english_texts)

        if not full_transcript.strip():
            notes_dict = {
                "title": "Lecture Notes", "summary": "No speech detected.",
                "key_points": [], "sections": [], "full_transcript": "", "word_count": 0,
            }
        else:
            import re
            # Split into segments (same logic as NoteStructurer.structure_notes)
            sentences    = re.split(r'(?<=[.!?])\s+', full_transcript)
            segments, current, current_len = [], [], 0
            MAX_CHARS = structurer.MAX_INPUT_CHARS

            for sentence in sentences:
                current.append(sentence)
                current_len += len(sentence)
                if current_len >= MAX_CHARS:
                    segments.append(" ".join(current))
                    current, current_len = [], 0
            if current:
                segments.append(" ".join(current))

            print(f"[Pipeline] T5 summarising {len(segments)} segments in parallel  {_elapsed()}")

            # Parallel T5: dedicate ≤4 workers (T5 is small, diminishing returns)
            t5_workers  = min(len(segments), MAX_WORKERS, 4)
            summaries   = [None] * len(segments)
            t5_args     = [(i, seg, structurer) for i, seg in enumerate(segments)]

            with ThreadPoolExecutor(max_workers=t5_workers) as pool:
                t5_futures = {
                    pool.submit(_summarise_segment, a): a[0]
                    for a in t5_args
                }
                for fut in as_completed(t5_futures):
                    seg_idx, summary = fut.result()
                    summaries[seg_idx] = summary

            summaries = [s for s in summaries if s]
            print(f"[Pipeline] T5 done  {_elapsed()}")

            # Build structured output (same as NoteStructurer.structure_notes)
            word_count = len(full_transcript.split())
            title      = "Lecture Notes"
            if summaries:
                first_sent = re.split(r'[.!?]', summaries[0])[0].strip()
                if 10 < len(first_sent) < 80:
                    title = first_sent

            sections = []
            for i, summary in enumerate(summaries):
                heading = f"Section {i + 1}"
                words = summary.split()
                if len(words) >= 5:
                    candidate = " ".join(words[:5]).rstrip(".,;:")
                    if len(candidate) < 60:
                        heading = candidate.title()
                # Split summary into per-section key points
                raw_sents = re.split(r'(?<=[.!?])\s+', summary.strip())
                key_pts   = [s.strip() for s in raw_sents if len(s.strip()) > 20]
                sections.append({
                    "heading":    heading,
                    "definition": summary,
                    "key_points": key_pts,
                })

            overview_points = [
                re.split(r'[.!?]', s)[0].strip()
                for s in summaries if s.strip()
            ]

            notes_dict = {
                "title":           title,
                "summary":         summaries[0] if summaries else "No summary.",
                "key_points":      overview_points,
                "sections":        sections,
                "full_transcript": full_transcript,
                "word_count":      word_count,
            }

        notes_text     = NoteStructurer.to_plain_text(notes_dict)
        notes_json_str = json.dumps(notes_dict)

        # ── Stage 6: Credibility Scoring ──────────────────────
        # Score T5 faithfulness (ROUGE + coverage) — ~0.1s, no extra model
        try:
            t5_score       = score_t5_faithfulness(
                full_transcript if full_transcript.strip() else "",
                notes_text,
            )
            credibility    = build_credibility_report(t5_score)
            credibility_js = json.dumps(credibility)
            print(
                f"[Pipeline] Credibility — ROUGE-L={t5_score.rouge_l:.3f}  "
                f"grade={t5_score.grade}  {_elapsed()}"
            )
        except Exception as cred_exc:
            print(f"[Pipeline] Credibility scoring skipped: {cred_exc}")
            credibility_js = None

        db.add(StructuredNotes(
            audio_file_id  = audio_file_id,
            notes_text     = notes_text,
            notes_json     = notes_json_str,
            word_count     = notes_dict.get("word_count", 0),
            credibility_json = credibility_js,
        ))

        record.status = "done"
        db.commit()
        print(f"[Pipeline] Job {audio_file_id} DONE  total={_elapsed()} ✓")

    except Exception as exc:
        print(f"[Pipeline] ERROR job {audio_file_id}: {exc}")
        import traceback; traceback.print_exc()
        try:
            rec = db.query(AudioFile).filter(AudioFile.id == audio_file_id).first()
            if rec:
                rec.status = f"failed: {str(exc)[:200]}"
                db.commit()
        except Exception:
            pass

    finally:
        db.close()
        # Remove temp single files
        for f in tmp_files:
            try:
                if os.path.isfile(f):
                    os.remove(f)
            except OSError:
                pass
        # Remove chunk directories
        for d in tmp_dirs:
            try:
                if os.path.isdir(d):
                    shutil.rmtree(d, ignore_errors=True)
            except Exception:
                pass
        # Also clean any _chunks dir derived from file_path
        try:
            derived = os.path.splitext(file_path)[0] + "_chunks"
            if os.path.isdir(derived):
                shutil.rmtree(derived, ignore_errors=True)
        except Exception:
            pass
