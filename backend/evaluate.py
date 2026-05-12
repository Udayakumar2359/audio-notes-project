#!/usr/bin/env python
# backend/evaluate.py
# ─────────────────────────────────────────────────────────────────────────────
# AudioNotes AI — Model Evaluation Runner
#
# Run from the backend directory:
#   python evaluate.py                     # all models, built-in samples
#   python evaluate.py --model asr         # only Whisper
#   python evaluate.py --model translation # only Helsinki-NLP
#   python evaluate.py --model notes       # only T5
#   python evaluate.py --audio path/to.wav --ref "ground truth text"
#   python evaluate.py --report-json eval_results.json
#
# ─────────────────────────────────────────────────────────────────────────────

import os, sys, argparse, json, time, tempfile, struct, math
from pathlib import Path

# Ensure backend is on sys.path
sys.path.insert(0, str(Path(__file__).parent))
os.environ.setdefault("PYTHONUTF8", "1")

from dotenv import load_dotenv
load_dotenv()

# ─────────────────────────────────────────────────────────────────────────────
#  Argument parsing
# ─────────────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="AudioNotes AI — Model Evaluation")
parser.add_argument("--model",       choices=["asr", "translation", "notes", "all"], default="all",
                    help="Which model to evaluate (default: all)")
parser.add_argument("--audio",       type=str, default=None,
                    help="Path to a WAV/audio file for custom ASR evaluation")
parser.add_argument("--ref",         type=str, default=None,
                    help="Reference transcription for the custom audio file")
parser.add_argument("--report-json", type=str, default=None,
                    help="Save full evaluation report as JSON to this path")
parser.add_argument("--skip-load",   action="store_true",
                    help="Skip slow model loading (use for testing the script itself)")
args = parser.parse_args()


# ─────────────────────────────────────────────────────────────────────────────
#  Built-in test data (no external files needed)
# ─────────────────────────────────────────────────────────────────────────────

# Translation samples — Kannada/Hindi → English reference pairs
TRANSLATION_SAMPLES_KN = [
    {
        "source":    "ಇಂದಿನ ತರಗತಿಯಲ್ಲಿ ನಾವು ಯಂತ್ರ ಕಲಿಕೆಯ ಮೂಲ ತತ್ವಗಳನ್ನು ಕಲಿಯುತ್ತೇವೆ.",
        "reference": "In today's class we will learn the basic principles of machine learning.",
        "src_lang":  "kn",
    },
    {
        "source":    "ಗಣಕಯಂತ್ರ ವಿಜ್ಞಾನದಲ್ಲಿ ಅಲ್ಗಾರಿದಮ್ ಬಹಳ ಮುಖ್ಯ.",
        "reference": "Algorithm is very important in computer science.",
        "src_lang":  "kn",
    },
]

TRANSLATION_SAMPLES_HI = [
    {
        "source":    "आज हम मशीन लर्निंग के बुनियादी सिद्धांत सीखेंगे।",
        "reference": "Today we will learn the basic principles of machine learning.",
        "src_lang":  "hi",
    },
    {
        "source":    "डेटा साइंस में सांख्यिकी बहुत महत्वपूर्ण है।",
        "reference": "Statistics is very important in data science.",
        "src_lang":  "hi",
    },
]

# Notes structuring samples — English transcript → reference notes text
NOTES_SAMPLES = [
    {
        "transcript": (
            "Today we will discuss the concept of neural networks. "
            "A neural network is a computational model inspired by the human brain. "
            "It consists of layers of interconnected nodes called neurons. "
            "The first layer is called the input layer, which receives raw data. "
            "The hidden layers perform transformations on the data. "
            "The final layer is the output layer which produces predictions. "
            "Training a neural network involves adjusting weights using backpropagation. "
            "The loss function measures how wrong the model's predictions are. "
            "Gradient descent is used to minimize the loss function. "
            "Common activation functions include ReLU, sigmoid, and tanh."
        ),
        "reference": (
            "Neural Networks. "
            "A neural network is a computational model inspired by the human brain. "
            "It has input, hidden, and output layers. "
            "Training uses backpropagation and gradient descent. "
            "Key concepts: neurons, weights, loss function, activation functions."
        ),
    },
    {
        "transcript": (
            "In this lecture we cover database management systems. "
            "A database is an organized collection of structured information. "
            "SQL stands for Structured Query Language and is used to query databases. "
            "The SELECT statement retrieves data from one or more tables. "
            "The WHERE clause filters records based on conditions. "
            "JOIN operations combine rows from two or more tables. "
            "Normalization reduces data redundancy and improves data integrity. "
            "There are three normal forms: 1NF, 2NF, and 3NF. "
            "Indexes improve query performance on large tables. "
            "Transactions ensure data consistency using ACID properties."
        ),
        "reference": (
            "Database Management Systems. "
            "SQL is used to query databases. SELECT retrieves data, WHERE filters records. "
            "JOIN combines tables. Normalization reduces redundancy (1NF, 2NF, 3NF). "
            "Indexes improve performance. Transactions follow ACID properties."
        ),
    },
]


# ─────────────────────────────────────────────────────────────────────────────
#  Synthetic WAV generator (440 Hz sine wave — no audio file needed)
# ─────────────────────────────────────────────────────────────────────────────

def _make_synthetic_wav(duration_s: float = 4.0, freq: float = 440.0,
                        sample_rate: int = 16000) -> str:
    """
    Write a short sine-wave WAV to a temp file.
    Used as a placeholder when no real audio test files are available.
    Returns the temp file path.
    """
    n_samples = int(sample_rate * duration_s)
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_path = tmp.name

    # WAV header
    n_bytes    = n_samples * 2             # 16-bit PCM = 2 bytes per sample
    data_chunk = n_samples * 2
    with open(tmp_path, "wb") as f:
        # RIFF header
        f.write(b"RIFF")
        f.write(struct.pack("<I", 36 + data_chunk))
        f.write(b"WAVE")
        # fmt  chunk
        f.write(b"fmt ")
        f.write(struct.pack("<I", 16))           # chunk size
        f.write(struct.pack("<H", 1))            # PCM
        f.write(struct.pack("<H", 1))            # mono
        f.write(struct.pack("<I", sample_rate))
        f.write(struct.pack("<I", sample_rate * 2))  # byte rate
        f.write(struct.pack("<H", 2))            # block align
        f.write(struct.pack("<H", 16))           # bits per sample
        # data chunk
        f.write(b"data")
        f.write(struct.pack("<I", data_chunk))
        for i in range(n_samples):
            sample = int(32767 * math.sin(2 * math.pi * freq * i / sample_rate))
            f.write(struct.pack("<h", sample))

    tmp.close()
    return tmp_path


# ─────────────────────────────────────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    from ml.evaluator import (
        ASRSample, TranslationSample, NotesSample,
        evaluate_asr, evaluate_translation, evaluate_notes,
        build_report, print_report, save_report_json,
        measure_pipeline_latency,
    )

    asr_result          = None
    translation_result  = None
    notes_result        = None
    pipeline_latency    = None
    synth_wavs          = []      # track temp files to clean up

    if args.skip_load:
        print("[Eval] --skip-load: skipping model loading. Showing metric report template only.")
        report = build_report(None, None, None)
        print_report(report)
        return

    # ── Load models ────────────────────────────────────────────
    print("\n[Eval] Loading models… (this may take 30–60 s on first run)")
    t_load = time.perf_counter()

    from ml.transcriber     import Transcriber
    from ml.note_structurer import NoteStructurer

    whisper_id   = os.getenv("WHISPER_MODEL_ID",   "udayakumar8214/whisper-classroom-kn-hi-en")
    trans_id     = os.getenv("TRANS_MODEL_ID",     "Helsinki-NLP/opus-mt-mul-en")
    t5_id        = os.getenv("T5_MODEL_ID",        "udayakumar8214/t5-lecture-notes")

    transcriber = Transcriber(whisper_id, trans_id)
    structurer  = NoteStructurer(t5_id)
    print(f"[Eval] Models loaded in {time.perf_counter() - t_load:.1f}s\n")

    run_asr    = args.model in ("asr",   "all")
    run_trans  = args.model in ("translation", "all")
    run_notes  = args.model in ("notes", "all")

    # ─────────────────────────────────────────────────────────────
    #  ASR Evaluation
    # ─────────────────────────────────────────────────────────────
    if run_asr:
        print("━" * 60)
        print("  Evaluating Whisper ASR")
        print("━" * 60)

        if args.audio and args.ref:
            # User provided a real audio file + ground truth
            asr_samples = [ASRSample(
                audio_path  = args.audio,
                reference   = args.ref,
                language    = "en",
            )]
            print(f"  Using custom audio: {args.audio}")
        else:
            # Use a synthetic WAV (sine wave) as a smoke-test
            # NOTE: WER will be very high on a sine wave — this is expected.
            # Replace with real audio files for meaningful WER numbers.
            print("  ⚠  No --audio / --ref provided.")
            print("     Generating a 4-second synthetic tone for latency/RTF only.")
            print("     WER on synthetic audio is meaningless — provide real audio for WER.\n")
            synth = _make_synthetic_wav(duration_s=4.0)
            synth_wavs.append(synth)
            asr_samples = [ASRSample(
                audio_path = synth,
                reference  = "",   # empty reference — WER won't be computed
                language   = "en",
            )]

        asr_result = evaluate_asr(transcriber, asr_samples)

    # ─────────────────────────────────────────────────────────────
    #  Translation Evaluation
    # ─────────────────────────────────────────────────────────────
    if run_trans:
        print("\n" + "━" * 60)
        print("  Evaluating Helsinki-NLP Translation (Kannada + Hindi)")
        print("━" * 60)

        from ml.evaluator import TranslationSample
        samples = []
        for s in TRANSLATION_SAMPLES_KN + TRANSLATION_SAMPLES_HI:
            samples.append(TranslationSample(
                source_text = s["source"],
                reference   = s["reference"],
                src_lang    = s["src_lang"],
            ))
        translation_result = evaluate_translation(transcriber, samples)

    # ─────────────────────────────────────────────────────────────
    #  T5 Notes Evaluation
    # ─────────────────────────────────────────────────────────────
    if run_notes:
        print("\n" + "━" * 60)
        print("  Evaluating T5 Note Structurer")
        print("━" * 60)

        from ml.evaluator import NotesSample
        samples = [
            NotesSample(
                input_transcript = s["transcript"],
                reference_notes  = s["reference"],
            )
            for s in NOTES_SAMPLES
        ]
        notes_result = evaluate_notes(structurer, samples)

    # ─────────────────────────────────────────────────────────────
    #  Pipeline latency (end-to-end on one clip)
    # ─────────────────────────────────────────────────────────────
    if args.model == "all":
        synth = _make_synthetic_wav(duration_s=25.0)   # 25 s clip
        synth_wavs.append(synth)
        print("\n[Eval] Measuring end-to-end pipeline latency (25 s clip)…")
        pipeline_latency = measure_pipeline_latency(transcriber, structurer, synth)
        print(f"[Eval] Pipeline latency: {pipeline_latency}s")

    # ─────────────────────────────────────────────────────────────
    #  Report
    # ─────────────────────────────────────────────────────────────
    report = build_report(asr_result, translation_result, notes_result, pipeline_latency)
    print_report(report)

    if args.report_json:
        save_report_json(report, args.report_json)

    # Cleanup synthetic WAVs
    for p in synth_wavs:
        try:
            os.remove(p)
        except OSError:
            pass


if __name__ == "__main__":
    main()
