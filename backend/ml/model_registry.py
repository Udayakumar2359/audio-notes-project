# backend/ml/model_registry.py
# ─────────────────────────────────────────────────────────────
# Lazy Model Registry
#
# All heavy HuggingFace models are stored here as module-level
# singletons. The Whisper transcriber loads lazily on first audio
# upload. The Qwen NLP model is loaded eagerly at server startup
# via load_qwen_model() called from the FastAPI lifespan.
#
# Usage anywhere in the backend:
#   from ml.model_registry import get_transcriber, get_qwen_pipeline, get_agent_class
#   transcriber  = get_transcriber()       # loads once, cached forever
#   pipe         = get_qwen_pipeline()     # returns the Qwen HF pipeline
#   AgentClass   = get_agent_class()       # cheap import, returns TranscriptAgent class
# ─────────────────────────────────────────────────────────────

import os
import threading
import logging

logger = logging.getLogger(__name__)

# ── Private singletons & locks ────────────────────────────────
_transcriber      = None
_qwen_pipeline    = None
_transcriber_lock = threading.Lock()
_qwen_lock        = threading.Lock()

# Model IDs (read once from env at import time — these are just strings, cheap)
_WHISPER_ID = os.getenv("WHISPER_MODEL_ID", "udayakumar8214/whisper-classroom-kn-hi-en")
_TRANS_ID   = os.getenv("TRANSLATION_MODEL", "Helsinki-NLP/opus-mt-mul-en")
_QWEN_ID    = os.getenv("QWEN_MODEL_ID",    "Qwen/Qwen2.5-3B-Instruct")


# ── Public accessors ───────────────────────────────────────────

def get_transcriber():
    """
    Return the shared Transcriber (Whisper + translation model).
    Loads from HuggingFace Hub on first call; subsequent calls return
    the cached instance immediately.
    Thread-safe: at most one download/load happens even under concurrency.
    """
    global _transcriber
    if _transcriber is None:
        with _transcriber_lock:
            if _transcriber is None:          # double-checked locking
                logger.info("[ModelRegistry] Loading Transcriber (Whisper + Translation)…")
                print("[ModelRegistry] Loading Transcriber on first use — this may take a minute…")
                from ml.transcriber import Transcriber
                _transcriber = Transcriber(_WHISPER_ID, _TRANS_ID)
                print("[ModelRegistry] Transcriber ready")
    return _transcriber


def load_qwen_model():
    """
    Eagerly load the Qwen2.5-7B-Instruct model with 4-bit quantization.

    Called ONCE from the FastAPI lifespan startup handler.
    Uses BitsAndBytesConfig for 4-bit NF4 quantization to reduce VRAM
    footprint from ~16GB (fp16) to ~5–6GB (4-bit), making the model
    viable on consumer-grade GPUs.

    Falls back to CPU (float32) if no CUDA device is available.
    Thread-safe via double-checked locking.
    """
    global _qwen_pipeline
    if _qwen_pipeline is not None:
        logger.info("[ModelRegistry] Qwen pipeline already loaded — skipping.")
        return

    with _qwen_lock:
        if _qwen_pipeline is not None:
            return

        import torch
        from transformers import (
            AutoTokenizer,
            AutoModelForCausalLM,
            BitsAndBytesConfig,
            pipeline,
        )

        hf_token = os.getenv("HF_TOKEN")
        device   = "cuda" if torch.cuda.is_available() else "cpu"

        print(f"[ModelRegistry] Loading Qwen model: {_QWEN_ID} on {device.upper()}…")
        logger.info(f"[ModelRegistry] Loading Qwen: {_QWEN_ID} on {device}")

        tokenizer = AutoTokenizer.from_pretrained(
            _QWEN_ID,
            token=hf_token,
            trust_remote_code=True,
        )

        if device == "cuda":
            # 4-bit NF4 quantization via bitsandbytes
            bnb_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_use_double_quant=True,     # nested quantization for extra savings
            )
            model = AutoModelForCausalLM.from_pretrained(
                _QWEN_ID,
                token=hf_token,
                quantization_config=bnb_config,
                device_map="cuda",
                trust_remote_code=True,
            )
        else:
            # CPU fallback — no quantization (bitsandbytes requires CUDA)
            print("[ModelRegistry] WARNING: No CUDA found — loading Qwen in float32 on CPU (slow!).")
            logger.warning("[ModelRegistry] Loading Qwen on CPU — inference will be very slow.")
            model = AutoModelForCausalLM.from_pretrained(
                _QWEN_ID,
                token=hf_token,
                torch_dtype=torch.float32,
                device_map="cpu",
                trust_remote_code=True,
            )

        _qwen_pipeline = pipeline(
            "text-generation",
            model=model,
            tokenizer=tokenizer,
            device_map="auto" if device == "cuda" else None,
        )

        print(f"[ModelRegistry] Qwen2.5-7B-Instruct ready (device={device}, 4-bit={device == 'cuda'})")
        logger.info("[ModelRegistry] Qwen pipeline ready")


def get_qwen_pipeline():
    """
    Return the loaded Qwen text-generation pipeline.
    Raises RuntimeError if load_qwen_model() was not called first.
    Thread-safe.
    """
    global _qwen_pipeline
    if _qwen_pipeline is None:
        # Safety: attempt lazy load if startup somehow missed it
        logger.warning("[ModelRegistry] get_qwen_pipeline() called before load_qwen_model() — lazy loading now.")
        load_qwen_model()
    return _qwen_pipeline


def get_agent_class():
    """
    Return the TranscriptAgent class (not an instance — agents are per-job).
    This is a cheap module import cached by Python's module system.
    Call this instead of importing TranscriptAgent directly so all ML
    imports are centralised in the registry.
    """
    from ml.agent import TranscriptAgent
    return TranscriptAgent


def models_loaded() -> dict:
    """
    Return which models are currently loaded.
    Useful for a /health or /models/status endpoint.
    """
    return {
        "transcriber":    _transcriber    is not None,
        "qwen_pipeline":  _qwen_pipeline  is not None,
    }
