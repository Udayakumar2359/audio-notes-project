# backend/ml/transcriber.py
# ─────────────────────────────────────────────────────────────
# ASR + Language Detection + Translation Pipeline
#
# Models loaded from HuggingFace Hub:
#   Whisper  : udayakumar8214/whisper-classroom-kn-hi-en
#   Translate: Helsinki-NLP/opus-mt-mul-en
# ─────────────────────────────────────────────────────────────

import os
import torch
import librosa

from transformers import (
    WhisperProcessor,
    WhisperForConditionalGeneration,
    AutoTokenizer,
    AutoModelForSeq2SeqLM,
)

try:
    from langdetect import detect, LangDetectException
    LANGDETECT_AVAILABLE = True
except ImportError:
    LANGDETECT_AVAILABLE = False


class Transcriber:
    """
    Loads Whisper ASR (from HuggingFace Hub) and a translation model.
    Used once at startup and shared across all requests.
    """

    def __init__(self, whisper_model_id: str, translation_model_id: str):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[Transcriber] Device: {self.device}")

        # ── Load custom Whisper model ─────────────────────────
        print(f"[Transcriber] Loading Whisper: {whisper_model_id}")
        hf_token = os.getenv("HF_TOKEN")
        self.processor = WhisperProcessor.from_pretrained(
            whisper_model_id,
            token=hf_token,
        )
        self.asr_model = WhisperForConditionalGeneration.from_pretrained(
            whisper_model_id,
            token=hf_token,
        ).to(self.device)

        # Allow multilingual auto-detection
        self.asr_model.generation_config.language          = None
        self.asr_model.generation_config.task              = "transcribe"
        self.asr_model.generation_config.forced_decoder_ids = None
        print("[Transcriber] Whisper loaded ✓")

        # ── Load translation model ────────────────────────────
        print(f"[Transcriber] Loading translation: {translation_model_id}")
        self.trans_tokenizer = AutoTokenizer.from_pretrained(translation_model_id)
        self.trans_model     = AutoModelForSeq2SeqLM.from_pretrained(
            translation_model_id
        ).to(self.device)
        print("[Transcriber] Translation model loaded ✓")

    # ─────────────────────────────────────────────────────────
    #  1. Speech → Text
    # ─────────────────────────────────────────────────────────
    def transcribe_chunk(self, wav_path: str) -> str:
        """Run Whisper on one WAV chunk → raw text."""
        audio, sr = librosa.load(wav_path, sr=16_000)
        inputs    = self.processor(
            audio, sampling_rate=sr, return_tensors="pt"
        ).to(self.device)

        with torch.no_grad():
            generated_ids = self.asr_model.generate(inputs.input_features)

        return self.processor.batch_decode(
            generated_ids, skip_special_tokens=True
        )[0].strip()

    # ─────────────────────────────────────────────────────────
    #  2. Language Detection
    # ─────────────────────────────────────────────────────────
    def detect_language(self, text: str) -> str:
        """Returns 'en', 'kn', 'hi', or 'unknown'."""
        if not LANGDETECT_AVAILABLE or not text.strip():
            return "unknown"
        try:
            lang = detect(text)
            return lang if lang in ("en", "kn", "hi") else "other"
        except LangDetectException:
            return "unknown"

    # ─────────────────────────────────────────────────────────
    #  3. Translation → English
    # ─────────────────────────────────────────────────────────
    def translate_to_english(self, text: str, src_lang: str) -> str:
        """Translate Kannada/Hindi text to English; pass-through if already English."""
        if src_lang in ("en", "unknown", "other") or not text.strip():
            return text

        inputs = self.trans_tokenizer(
            text,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=512,
        ).to(self.device)

        with torch.no_grad():
            translated_ids = self.trans_model.generate(**inputs, max_length=512, num_beams=4)

        return self.trans_tokenizer.batch_decode(
            translated_ids, skip_special_tokens=True
        )[0].strip()

    # ─────────────────────────────────────────────────────────
    #  Full chunk pipeline
    # ─────────────────────────────────────────────────────────
    def process_chunk(self, wav_path: str) -> dict:
        """
        WAV file → {raw_text, language, english_text}
        Runs: ASR → lang detect → translate
        """
        raw_text     = self.transcribe_chunk(wav_path)
        language     = self.detect_language(raw_text)
        english_text = self.translate_to_english(raw_text, language)

        print(
            f"[Transcriber] lang={language} | "
            f"'{raw_text[:50]}...'"
        )
        return {
            "raw_text":     raw_text,
            "language":     language,
            "english_text": english_text,
        }
