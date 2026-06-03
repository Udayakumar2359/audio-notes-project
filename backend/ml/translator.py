# backend/ml/translator.py
# ─────────────────────────────────────────────────────────────
# Transcript Translator — powered by local Ollama (llama3.2)
# Source: English transcript (already converted by Whisper + Helsinki model).
# Target: user's preferred language — Hindi ("hi") or Kannada ("kn").
# ─────────────────────────────────────────────────────────────

from __future__ import annotations
import os
import json
import httpx

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL",    "llama3.2")

# Supported target languages
LANGUAGES = {
    "hi": "Hindi",
    "kn": "Kannada",
}


def _make_messages(text: str, lang_name: str) -> list[dict]:
    """
    Build the chat messages for translating an English transcript
    into the user's chosen language (Hindi or Kannada).
    """
    system = (
        f"You are a professional academic translator. "
        f"Your ONLY task is to translate an English spoken transcript into {lang_name}. "
        f"You MUST write your entire response in {lang_name} script only. "
        f"Never respond in English. Never explain. Output only the translated text."
    )
    user = (
        f"Translate the following English transcript into {lang_name}.\n\n"
        f"Rules:\n"
        f"- Write EVERYTHING in {lang_name} — every word of the output must be in {lang_name}\n"
        f"- Preserve the natural spoken flow; do NOT add bullet points, headings, or structure\n"
        f"- Keep technical/domain terms in English only when no {lang_name} equivalent exists "
        f"(e.g. 'CPU', 'algorithm')\n"
        f"- Do NOT add commentary or any prefix like 'Translation:'\n\n"
        f"English transcript:\n"
        f"---\n{text}\n---"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user",   "content": user},
    ]


def translate_notes_stream(text: str, target_lang: str):
    """
    Streaming translation: English transcript → Hindi or Kannada.
    Yields text tokens one at a time for Server-Sent Events.
    Uses local Ollama model.
    """
    if target_lang not in LANGUAGES:
        yield f"Unsupported language code: {target_lang}. Supported: {list(LANGUAGES.keys())}"
        return

    lang_name = LANGUAGES[target_lang]
    messages  = _make_messages(text, lang_name)

    try:
        yield from _stream_ollama(messages)
    except Exception as e:
        yield (
            f"⚠️ Translation to {lang_name} unavailable: "
            f"Ollama is not running. Please start Ollama with 'ollama serve'. "
            f"Error: {e}"
        )


def translate_notes(text: str, target_lang: str) -> str:
    """Blocking translation: English → target language. Returns full translated string."""
    return "".join(translate_notes_stream(text, target_lang))


# ── Internal streaming helpers ────────────────────────────────

def _stream_ollama(messages: list[dict], max_tokens: int = 8192):
    url     = f"{OLLAMA_BASE_URL}/api/chat"
    payload = {
        "model":    OLLAMA_MODEL,
        "messages": messages,
        "stream":   True,
        "options":  {"temperature": 0.1, "num_predict": max_tokens},
    }
    with httpx.Client(timeout=180.0) as client:
        with client.stream("POST", url, json=payload) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue
                content = chunk.get("message", {}).get("content", "")
                if content:
                    yield content
                if chunk.get("done"):
                    break

