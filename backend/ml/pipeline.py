# backend/ml/pipeline.py
# ─────────────────────────────────────────────────────────────
# Central Pipeline Integration
#
# Orchestrates the full audio → structured notes flow:
#   1. Convert to WAV
#   2. Remove noise
#   3. Split into chunks
#   4. Parallel ASR + language detect + translate (ThreadPool)
#   5. Clean each transcript segment
#   6. Combine → structure with T5
#   7. Persist to DB
# ─────────────────────────────────────────────────────────────

import os
import json
import shutil
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List

from ml.audio_processor  import convert_to_wav, remove_noise, chunk_audio
from ml.cleaner          import clean_transcript
from ml.note_structurer  import NoteStructurer


# Max parallel threads for chunk transcription
# Increase on multi-core machines; keep at 2 for CPU-only to avoid OOM
MAX_WORKERS = int(os.getenv("PIPELINE_MAX_WORKERS", "2"))


def _transcribe_one_chunk(args: tuple) -> dict:
    """
    Worker function for the thread pool.
    Returns enriched chunk dict with transcription results.
    """
    chunk, transcriber = args
    result = transcriber.process_chunk(chunk["path"])
    return {
        **chunk,
        "raw_text":     result["raw_text"],
        "language":     result["language"],
        "english_text": result["english_text"],
    }


def run_full_pipeline(
    audio_file_id: int,
    file_path:     str,
    db,
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
        Transcription, StructuredNotes
    )

    db = SessionLocal()
    tmp_files: List[str] = []   # track temp files for cleanup

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

        # ── Stage 2: Noise removal ────────────────────────────
        record.status = "chunking"
        db.commit()

        remove_noise(wav_path, clean_wav)

        chunk_dir = base + "_chunks"
        chunks    = chunk_audio(clean_wav, chunk_dir)
        tmp_files += [chunk["path"] for chunk in chunks]

        print(f"[Pipeline] {len(chunks)} chunks created for job {audio_file_id}")

        # ── Stage 3: Parallel Transcription ──────────────────
        record.status = "transcribing"
        db.commit()

        # Run transcription in parallel across chunks
        chunk_results = [None] * len(chunks)
        args_list     = [(chunk, transcriber) for chunk in chunks]

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            future_to_idx = {
                pool.submit(_transcribe_one_chunk, args): i
                for i, args in enumerate(args_list)
            }
            for future in as_completed(future_to_idx):
                idx = future_to_idx[future]
                try:
                    chunk_results[idx] = future.result()
                except Exception as exc:
                    print(f"[Pipeline] Chunk {idx} transcription failed: {exc}")
                    chunk_results[idx] = {
                        **chunks[idx],
                        "raw_text":     "",
                        "language":     "unknown",
                        "english_text": "",
                    }

        # ── Stage 4: Persist chunks & transcriptions ──────────
        all_english_texts = []

        for i, cr in enumerate(chunk_results):
            if cr is None:
                continue

            # Clean the raw text
            cleaned = clean_transcript(cr["raw_text"])

            # Persist chunk
            db_chunk = AudioChunk(
                audio_file_id = audio_file_id,
                chunk_index   = cr.get("index", i),
                start_time    = cr.get("start", 0.0),
                end_time      = cr.get("end",   0.0),
                chunk_path    = cr.get("path",  ""),
            )
            db.add(db_chunk)
            db.commit()
            db.refresh(db_chunk)

            # Persist transcription
            db_trans = Transcription(
                chunk_id          = db_chunk.id,
                raw_text          = cr["raw_text"],
                cleaned_text      = cleaned,
                detected_language = cr["language"],
                translated_text   = cr["english_text"],
            )
            db.add(db_trans)
            db.commit()

            if cr["english_text"].strip():
                all_english_texts.append(cr["english_text"])

        # ── Stage 5: Structure notes ──────────────────────────
        record.status = "structuring"
        db.commit()

        full_transcript = " ".join(all_english_texts)
        notes_dict      = structurer.structure_notes(full_transcript)
        notes_text      = NoteStructurer.to_plain_text(notes_dict)
        notes_json_str  = json.dumps(notes_dict)

        db.add(StructuredNotes(
            audio_file_id = audio_file_id,
            notes_text    = notes_text,
            notes_json    = notes_json_str,
            word_count    = notes_dict.get("word_count", 0),
        ))

        record.status = "done"
        db.commit()
        print(f"[Pipeline] Job {audio_file_id} completed ✓")

    except Exception as exc:
        print(f"[Pipeline] ERROR job {audio_file_id}: {exc}")
        try:
            record = db.query(AudioFile).filter(AudioFile.id == audio_file_id).first()
            if record:
                record.status = f"failed: {str(exc)[:200]}"
                db.commit()
        except Exception:
            pass

    finally:
        db.close()
        # Clean up temp audio files
        for f in tmp_files:
            try:
                if os.path.isfile(f):
                    os.remove(f)
            except OSError:
                pass
        # Clean up chunk directory
        try:
            chunk_dir_path = os.path.splitext(file_path)[0] + "_chunks"
            if os.path.isdir(chunk_dir_path):
                shutil.rmtree(chunk_dir_path, ignore_errors=True)
        except Exception:
            pass
