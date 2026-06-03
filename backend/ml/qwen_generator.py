# backend/ml/qwen_generator.py
# ─────────────────────────────────────────────────────────────
# Centralized Text Generation — Ollama (local API)
#
# Single entry point for all NLP tasks in the pipeline:
#   • Transcript cleaning
#   • Context reconstruction
#   • Topic extraction
#   • Chunk summarisation
#   • Final note generation
#
# Requests are sent to the local Ollama HTTP API, which:
#   - Is written in Go/C++ (llama.cpp) — far faster than the HF pipeline
#   - Manages its own VRAM/RAM efficiently
#   - Handles concurrent requests without OOM crashes
#   - Allows this Python layer to use ThreadPoolExecutor freely
# ─────────────────────────────────────────────────────────────

from __future__ import annotations
import os
import json
import logging
import httpx

logger = logging.getLogger(__name__)

# ── Ollama Configuration ──────────────────────────────────────
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_NLP_MODEL = os.getenv("OLLAMA_NLP_MODEL", "qwen2.5:3b")

# Timeout for a single generation call (seconds).
# Long for large final-notes generation; individual chunk calls are shorter.
OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "300"))

_SYSTEM_PROMPT = (
    "You are an expert academic note-taking assistant. "
    "Produce detailed, clear, and well-structured educational content. "
    "Use precise academic language. "
    "Capitalize important concepts. "
    "Follow all instructions exactly."
)


def generate(
    prompt: str,
    max_new_tokens: int = 1024,
    temperature: float = 0.2,
    do_sample: bool = False,
) -> str:
    """
    Run inference via the local Ollama API.

    Parameters
    ----------
    prompt        : The full instruction prompt to send to the model.
    max_new_tokens: Maximum tokens the model will generate.
    temperature   : Sampling temperature (low = more deterministic).
    do_sample     : Unused — kept for call-site compatibility with the old
                    HuggingFace signature. Ollama always uses sampling.

    Returns
    -------
    str: The generated assistant response text.
    """
    url = f"{OLLAMA_BASE_URL}/api/chat"
    payload = {
        "model": OLLAMA_NLP_MODEL,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user",   "content": prompt},
        ],
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": max_new_tokens,
        },
    }

    try:
        with httpx.Client(timeout=OLLAMA_TIMEOUT) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            content = data.get("message", {}).get("content", "")
            return content.strip()

    except httpx.ConnectError:
        msg = (
            f"[QwenGenerator] Cannot connect to Ollama at {OLLAMA_BASE_URL}. "
            "Please ensure 'ollama serve' is running."
        )
        logger.error(msg)
        raise RuntimeError(msg)

    except httpx.HTTPStatusError as exc:
        # Surface a clear error if the model name is wrong
        if exc.response.status_code == 404:
            msg = (
                f"[QwenGenerator] Ollama model '{OLLAMA_NLP_MODEL}' not found. "
                f"Run: ollama pull {OLLAMA_NLP_MODEL}"
            )
            logger.error(msg)
            raise RuntimeError(msg)
        logger.error(f"[QwenGenerator] Ollama HTTP error: {exc}")
        raise

    except Exception as exc:
        logger.error(f"[QwenGenerator] Generation failed: {exc}")
        raise
