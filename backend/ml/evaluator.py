# backend/ml/evaluator.py
# ─────────────────────────────────────────────────────────────────────────────
# AudioNotes AI — Model Evaluation Framework
#
# Evaluates all models in the pipeline:
#   1. Whisper ASR     → WER, CER, RTF
#   2. Translation     → BLEU, chrF (sacrebleu)
#   3. Qwen NLP Agent  → ROUGE-1/2/L, coverage, latency
#
# Usage:
#   from ml.evaluator import run_all_evaluations
#   results = run_all_evaluations(transcriber, structurer, test_data)
# ─────────────────────────────────────────────────────────────────────────────

import re
import time
import json
import statistics
from dataclasses import dataclass, field, asdict
from typing import List, Optional, Dict, Any

# ── Optional metric library imports ──────────────────────────────────────────
try:
    import jiwer
    JIWER_OK = True
except ImportError:
    JIWER_OK = False

try:
    from rouge_score import rouge_scorer
    ROUGE_OK = True
except ImportError:
    ROUGE_OK = False

try:
    import sacrebleu
    SACREBLEU_OK = True
except ImportError:
    SACREBLEU_OK = False

# ─────────────────────────────────────────────────────────────────────────────
#  Data structures
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class ASRSample:
    """One test sample for Whisper ASR evaluation."""
    audio_path:      str           # path to a WAV file (16 kHz mono)
    reference:       str           # ground-truth transcription
    language:        str = "en"    # expected language code
    duration_s:      float = 0.0   # audio duration (computed automatically)

@dataclass
class TranslationSample:
    """One test sample for translation model evaluation."""
    source_text:     str           # Kannada / Hindi source
    reference:       str           # reference English translation
    src_lang:        str = "kn"    # source language code

@dataclass
class NotesSample:
    """One test sample for Qwen NLP Agent evaluation."""
    input_transcript: str          # English transcript fed to the Qwen NLP Agent
    reference_notes:  str          # reference summary / structured notes text

@dataclass
class ASRMetrics:
    wer:        Optional[float] = None   # Word Error Rate  (lower = better)
    cer:        Optional[float] = None   # Character Error Rate
    rtf:        Optional[float] = None   # Real-Time Factor  (lower = better)
    samples:    int = 0
    errors:     List[str] = field(default_factory=list)

@dataclass
class TranslationMetrics:
    bleu:       Optional[float] = None   # SacreBLEU score  (higher = better)
    chrf:       Optional[float] = None   # chrF score
    latency_s:  Optional[float] = None   # mean inference time per sample
    samples:    int = 0
    errors:     List[str] = field(default_factory=list)

@dataclass
class NotesMetrics:
    rouge1:     Optional[float] = None   # ROUGE-1 F1
    rouge2:     Optional[float] = None   # ROUGE-2 F1
    rougeL:     Optional[float] = None   # ROUGE-L F1
    coverage:   Optional[float] = None   # word coverage ratio
    latency_s:  Optional[float] = None   # mean structuring time per sample
    samples:    int = 0
    errors:     List[str] = field(default_factory=list)

@dataclass
class EvaluationReport:
    asr:         Optional[ASRMetrics]         = None
    translation: Optional[TranslationMetrics] = None
    notes:       Optional[NotesMetrics]       = None
    pipeline_latency_s: Optional[float]       = None   # end-to-end for one clip
    timestamp:   str = ""
    summary:     str = ""


# ─────────────────────────────────────────────────────────────────────────────
#  1. Whisper ASR evaluator
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_asr(transcriber, samples: List[ASRSample]) -> ASRMetrics:
    """
    Compute WER, CER, and RTF for the Whisper model.

    WER = (S + D + I) / N    where S=substitutions, D=deletions, I=insertions
    CER = same at character level
    RTF = time_to_transcribe / audio_duration  (< 1.0 = faster than real-time)
    """
    if not samples:
        return ASRMetrics(errors=["No samples provided."])

    hypotheses, references, latencies = [], [], []
    errors = []

    print(f"\n[Evaluator] ASR — evaluating {len(samples)} samples…")

    for i, s in enumerate(samples):
        try:
            # Get audio duration via soundfile
            import soundfile as sf
            info = sf.info(s.audio_path)
            dur  = info.duration

            t0 = time.perf_counter()
            hyp = transcriber.transcribe_chunk(s.audio_path)
            elapsed = time.perf_counter() - t0

            hypotheses.append(hyp)
            references.append(s.reference)
            latencies.append(elapsed)

            rtf_sample = elapsed / dur if dur > 0 else 0.0
            print(f"  [{i+1}/{len(samples)}] RTF={rtf_sample:.3f}  hyp='{hyp[:60]}…'")

        except Exception as exc:
            err = f"Sample {i+1} ({s.audio_path}): {exc}"
            errors.append(err)
            print(f"  [{i+1}/{len(samples)}] ERROR: {exc}")

    if not hypotheses:
        return ASRMetrics(errors=errors or ["All samples failed."])

    # ── Show hypotheses ──
    print("\n[Evaluator] Whisper output (hypothesis):")
    for i, (h, r) in enumerate(zip(hypotheses, references)):
        print(f"  Sample {i+1}:")
        print(f"    Hypothesis : {h}")
        print(f"    Reference  : {r if r.strip() else '(none — WER skipped)'}")

    # ── WER / CER ──
    wer_val = cer_val = None
    # Filter out samples with empty references before computing WER
    valid_pairs = [(h, r) for h, r in zip(hypotheses, references) if r.strip()]

    if not valid_pairs:
        errors.append(
            "No reference transcription provided — WER/CER not computed. "
            "Re-run with: --ref 'your ground truth text here'"
        )
    elif not JIWER_OK:
        errors.append("jiwer not installed — WER/CER unavailable.")
    else:
        h_valid = [p[0] for p in valid_pairs]
        r_valid = [p[1] for p in valid_pairs]
        transform = jiwer.Compose([
            jiwer.ToLowerCase(),
            jiwer.RemovePunctuation(),
            jiwer.RemoveMultipleSpaces(),
            jiwer.Strip(),
            jiwer.ReduceToListOfListOfWords(),
        ])
        try:
            wer_val = jiwer.wer(
                r_valid, h_valid,
                reference_transform=transform,
                hypothesis_transform=transform,
            )
            cer_val = jiwer.cer(
                r_valid, h_valid,
                reference_transform=jiwer.Compose([
                    jiwer.ToLowerCase(),
                    jiwer.RemovePunctuation(),
                    jiwer.Strip(),
                    jiwer.ReduceToListOfListOfChars(),
                ]),
                hypothesis_transform=jiwer.Compose([
                    jiwer.ToLowerCase(),
                    jiwer.RemovePunctuation(),
                    jiwer.Strip(),
                    jiwer.ReduceToListOfListOfChars(),
                ]),
            )
        except Exception as exc:
            errors.append(f"WER computation error: {exc}")

    # ── RTF (mean) ──
    # Get audio durations for all samples
    total_audio = 0.0
    for s in samples[:len(latencies)]:
        try:
            import soundfile as sf
            total_audio += sf.info(s.audio_path).duration
        except Exception:
            pass
    total_time = sum(latencies)
    rtf = total_time / total_audio if total_audio > 0 else None

    return ASRMetrics(
        wer=round(wer_val * 100, 2) if wer_val is not None else None,
        cer=round(cer_val * 100, 2) if cer_val is not None else None,
        rtf=round(rtf, 4) if rtf is not None else None,
        samples=len(hypotheses),
        errors=errors,
    )


# ─────────────────────────────────────────────────────────────────────────────
#  2. Translation evaluator
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_translation(transcriber, samples: List[TranslationSample]) -> TranslationMetrics:
    """
    Compute BLEU and chrF for the Helsinki-NLP translation model.

    BLEU: n-gram precision with brevity penalty (standard MT metric)
    chrF: character-level F-score — more robust for morphologically rich languages
    """
    if not samples:
        return TranslationMetrics(errors=["No samples provided."])

    hypotheses, references, latencies = [], [], []
    errors = []

    print(f"\n[Evaluator] Translation — evaluating {len(samples)} samples…")

    for i, s in enumerate(samples):
        try:
            t0      = time.perf_counter()
            hyp     = transcriber.translate_to_english(s.source_text, s.src_lang)
            elapsed = time.perf_counter() - t0

            hypotheses.append(hyp)
            references.append(s.reference)
            latencies.append(elapsed)
            print(f"  [{i+1}/{len(samples)}] {elapsed:.2f}s  hyp='{hyp[:60]}…'")

        except Exception as exc:
            err = f"Sample {i+1}: {exc}"
            errors.append(err)
            print(f"  [{i+1}/{len(samples)}] ERROR: {exc}")

    if not hypotheses:
        return TranslationMetrics(errors=errors or ["All samples failed."])

    bleu_val = chrf_val = None
    if SACREBLEU_OK:
        try:
            bleu_result = sacrebleu.corpus_bleu(hypotheses, [references])
            bleu_val    = round(bleu_result.score, 2)
            chrf_result = sacrebleu.corpus_chrf(hypotheses, [references])
            chrf_val    = round(chrf_result.score, 2)
        except Exception as exc:
            errors.append(f"sacrebleu error: {exc}")
    else:
        errors.append("sacrebleu not installed — BLEU/chrF unavailable.")

    return TranslationMetrics(
        bleu=bleu_val,
        chrf=chrf_val,
        latency_s=round(statistics.mean(latencies), 3) if latencies else None,
        samples=len(hypotheses),
        errors=errors,
    )


# ─────────────────────────────────────────────────────────────────────────────
#  3. Notes Structurer evaluator (T5)
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_notes(structurer, samples: List[NotesSample]) -> NotesMetrics:
    """
    Compute ROUGE scores and word coverage for the Qwen NLP Agent.

    ROUGE-1:  unigram overlap with reference
    ROUGE-2:  bigram overlap
    ROUGE-L:  longest common subsequence
    Coverage: fraction of reference words appearing in generated notes
    """
    if not samples:
        return NotesMetrics(errors=["No samples provided."])

    if not ROUGE_OK:
        return NotesMetrics(errors=["rouge-score not installed. Run: pip install rouge-score"])

    scorer    = rouge_scorer.RougeScorer(["rouge1", "rouge2", "rougeL"], use_stemmer=True)
    r1s, r2s, rLs, coverages, latencies = [], [], [], [], []
    errors = []

    print(f"\n[Evaluator] Qwen NLP Agent — evaluating {len(samples)} samples…")

    for i, s in enumerate(samples):
        try:
            t0        = time.perf_counter()
            # Use the new Qwen NLP agent pipeline
            from ml import nlp_agent
            notes_dict = nlp_agent.process_transcript(s.input_transcript)
            elapsed   = time.perf_counter() - t0

            # Flatten generated notes to plain text
            generated_text = nlp_agent.to_plain_text(notes_dict)

            scores = scorer.score(s.reference_notes, generated_text)
            r1s.append(scores["rouge1"].fmeasure)
            r2s.append(scores["rouge2"].fmeasure)
            rLs.append(scores["rougeL"].fmeasure)
            latencies.append(elapsed)

            # Word coverage: fraction of reference words in generated text
            ref_words  = set(re.sub(r'[^\w\s]', '', s.reference_notes.lower()).split())
            gen_words  = set(re.sub(r'[^\w\s]', '', generated_text.lower()).split())
            if ref_words:
                coverages.append(len(ref_words & gen_words) / len(ref_words))

            print(f"  [{i+1}/{len(samples)}] ROUGE-1={r1s[-1]:.3f}  ROUGE-L={rLs[-1]:.3f}  {elapsed:.1f}s")

        except Exception as exc:
            err = f"Sample {i+1}: {exc}"
            errors.append(err)
            print(f"  [{i+1}/{len(samples)}] ERROR: {exc}")

    if not r1s:
        return NotesMetrics(errors=errors or ["All samples failed."])

    return NotesMetrics(
        rouge1=round(statistics.mean(r1s) * 100, 2),
        rouge2=round(statistics.mean(r2s) * 100, 2),
        rougeL=round(statistics.mean(rLs) * 100, 2),
        coverage=round(statistics.mean(coverages) * 100, 2) if coverages else None,
        latency_s=round(statistics.mean(latencies), 3),
        samples=len(r1s),
        errors=errors,
    )


# ─────────────────────────────────────────────────────────────────────────────
#  4. End-to-end pipeline latency
# ─────────────────────────────────────────────────────────────────────────────

def measure_pipeline_latency(transcriber, structurer, wav_path: str) -> float:
    """
    Time the full pipeline (load→transcribe→translate→structure) for one WAV.
    Returns total seconds.
    """
    import soundfile as sf
    audio_np, sr = sf.read(wav_path, dtype="float32", always_2d=False)
    if audio_np.ndim == 2:
        audio_np = audio_np.mean(axis=1)

    t0 = time.perf_counter()
    result     = transcriber.process_chunk_array(audio_np, sr)
    from ml import nlp_agent
    notes_dict = nlp_agent.process_transcript(result["english_text"])
    return round(time.perf_counter() - t0, 3)


# ─────────────────────────────────────────────────────────────────────────────
#  5. Report builder
# ─────────────────────────────────────────────────────────────────────────────

def build_report(
    asr:          Optional[ASRMetrics],
    translation:  Optional[TranslationMetrics],
    notes:        Optional[NotesMetrics],
    pipeline_s:   Optional[float] = None,
) -> EvaluationReport:
    from datetime import datetime
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    lines = []

    if asr:
        lines.append(f"ASR      → WER={asr.wer}%  CER={asr.cer}%  RTF={asr.rtf}  ({asr.samples} samples)")
    if translation:
        lines.append(f"Translate→ BLEU={translation.bleu}  chrF={translation.chrf}  lat={translation.latency_s}s  ({translation.samples} samples)")
    if notes:
        lines.append(f"Qwen NLP → ROUGE-1={notes.rouge1}%  ROUGE-2={notes.rouge2}%  ROUGE-L={notes.rougeL}%  cov={notes.coverage}%  ({notes.samples} samples)")
    if pipeline_s:
        lines.append(f"Pipeline → end-to-end={pipeline_s}s per clip")

    return EvaluationReport(
        asr=asr,
        translation=translation,
        notes=notes,
        pipeline_latency_s=pipeline_s,
        timestamp=ts,
        summary="\n".join(lines),
    )


def print_report(report: EvaluationReport):
    """Pretty-print evaluation report to stdout."""
    w = 68
    print("\n" + "=" * w)
    print(f"  AudioNotes AI — Model Evaluation Report")
    print(f"  {report.timestamp}")
    print("=" * w)

    if report.asr:
        m = report.asr
        print(f"\n{'─'*w}")
        print(f"  1. Whisper ASR  ({m.samples} test samples)")
        print(f"{'─'*w}")
        _row("Word Error Rate (WER)",       m.wer,      "%",  lower_is_better=True,  excellent=5, good=15)
        _row("Character Error Rate (CER)",  m.cer,      "%",  lower_is_better=True,  excellent=3, good=10)
        _row("Real-Time Factor (RTF)",       m.rtf,      "x",  lower_is_better=True,  excellent=0.3, good=1.0,
             note="<1.0 = faster than real-time")
        if m.errors:
            print(f"\n  ⚠  Errors: {'; '.join(m.errors[:3])}")

    if report.translation:
        m = report.translation
        print(f"\n{'─'*w}")
        print(f"  2. Helsinki-NLP Translation  ({m.samples} test samples)")
        print(f"{'─'*w}")
        _row("BLEU Score",     m.bleu,     "",    lower_is_better=False, excellent=40, good=25)
        _row("chrF Score",     m.chrf,     "",    lower_is_better=False, excellent=50, good=35)
        _row("Latency / clip", m.latency_s,"s",   lower_is_better=True,  excellent=0.5, good=2.0)
        if m.errors:
            print(f"\n  ⚠  Errors: {'; '.join(m.errors[:3])}")

    if report.notes:
        m = report.notes
        print(f"\n{'─'*w}")
        print(f"  3. Qwen NLP Agent  ({m.samples} test samples)")
        print(f"{'─'*w}")
        _row("ROUGE-1 (F1)",    m.rouge1,   "%",  lower_is_better=False, excellent=40, good=25)
        _row("ROUGE-2 (F1)",    m.rouge2,   "%",  lower_is_better=False, excellent=18, good=10)
        _row("ROUGE-L (F1)",    m.rougeL,   "%",  lower_is_better=False, excellent=35, good=22)
        _row("Coverage",        m.coverage, "%",  lower_is_better=False, excellent=60, good=40,
             note="reference words found in output")
        _row("Latency / clip",  m.latency_s,"s",  lower_is_better=True,  excellent=1.0, good=5.0)
        if m.errors:
            print(f"\n  ⚠  Errors: {'; '.join(m.errors[:3])}")

    if report.pipeline_latency_s:
        print(f"\n{'─'*w}")
        print(f"  4. Pipeline end-to-end latency: {report.pipeline_latency_s}s")

    print(f"\n{'='*w}\n")


def _row(name, val, unit, lower_is_better, excellent, good, note=""):
    if val is None:
        status = "—  (N/A)"
    else:
        if lower_is_better:
            emoji = "✅" if val <= excellent else ("🟡" if val <= good else "🔴")
        else:
            emoji = "✅" if val >= excellent else ("🟡" if val >= good else "🔴")
        status = f"{emoji}  {val}{unit}"
    label = f"  {name}"
    padding = max(1, 36 - len(label))
    suf = f"  ← {note}" if note else ""
    print(f"{label}{' '*padding}{status}{suf}")


def save_report_json(report: EvaluationReport, path: str):
    """Save the full report as JSON for further analysis."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(asdict(report), f, indent=2, default=str)
    print(f"[Evaluator] Report saved → {path}")
