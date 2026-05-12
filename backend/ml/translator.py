# backend/ml/translator.py
# ─────────────────────────────────────────────────────────────
# Notes Translator — powered by local Ollama (llama3.2)
# Translates AI-generated English lecture notes into a target language.
# Falls back to Groq cloud if Ollama is unavailable.
# ─────────────────────────────────────────────────────────────

from __future__ import annotations
import os
import json
import httpx

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL",    "llama3.2")
GROQ_API_KEY    = os.getenv("GROQ_API_KEY",    "")
GROQ_MODEL      = os.getenv("GROQ_MODEL",      "llama-3.3-70b-versatile")

# Supported languages — full set
LANGUAGES = {
    "hi": "Hindi",
    "kn": "Kannada",
}


def _make_messages(text: str, lang_name: str) -> list[dict]:
    """Build the chat messages list for a translation request."""
    system = (
        f"You are a professional academic translator. "
        f"Your ONLY task is to translate text from English into {lang_name}. "
        f"You MUST write your entire response in {lang_name} script only. "
        f"Never respond in English. Never explain. Only output the translated text."
    )
    user = (
        f"Translate the following English lecture notes into {lang_name}.\n\n"
        f"Important rules:\n"
        f"- Write EVERYTHING in {lang_name} — every single word of the output must be in {lang_name}\n"
        f"- Preserve the structure: headings, bullet points, numbered lists\n"
        f"- Keep technical terms in English only when no {lang_name} equivalent exists (e.g. 'CPU', 'algorithm')\n"
        f"- Do NOT output any English sentences or paragraphs\n"
        f"- Do NOT add commentary — output only the translated notes\n\n"
        f"English notes to translate:\n"
        f"---\n{text}\n---"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user",   "content": user},
    ]


def translate_notes_stream(text: str, target_lang: str):
    """
    Streaming translation — yields text tokens one at a time.
    Used for Server-Sent Events response.
    """
    if target_lang not in LANGUAGES:
        yield f"Unsupported language code: {target_lang}. Supported: {list(LANGUAGES.keys())}"
        return

    lang_name = LANGUAGES[target_lang]
    messages  = _make_messages(text, lang_name)

    # ── Try Ollama first ──────────────────────────────────────
    try:
        yield from _stream_ollama(messages)
        return
    except Exception as e:
        print(f"[Translator] Ollama stream failed ({e}), trying Groq…")

    # ── Groq fallback ─────────────────────────────────────────
    if not GROQ_API_KEY:
        yield (
            f"⚠️ Translation to {lang_name} unavailable: "
            "Ollama is not running and no Groq API key is configured. "
            "Please start Ollama with 'ollama serve' or set GROQ_API_KEY in .env."
        )
        return

    try:
        yield from _stream_groq(messages)
    except Exception as e:
        yield f"⚠️ Translation error: {e}"


def translate_notes(text: str, target_lang: str) -> str:
    """Blocking translation — returns full translated string."""
    return "".join(translate_notes_stream(text, target_lang))


# ── Internal streaming helpers ────────────────────────────────

def _stream_ollama(messages: list[dict], max_tokens: int = 8192):
    url     = f"{OLLAMA_BASE_URL}/api/chat"
    payload = {
        "model":    OLLAMA_MODEL,
        "messages": messages,
        "stream":   True,
        "options":  {"temperature": 0.1, "num_predict": max_tokens},  # low temp for accurate translation
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


def _stream_groq(messages: list[dict], max_tokens: int = 8192):
    url     = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type":  "application/json",
    }
    payload = {
        "model":       GROQ_MODEL,
        "messages":    messages,
        "stream":      True,
        "max_tokens":  max_tokens,
        "temperature": 0.1,  # low temperature = more faithful translation
    }
    with httpx.Client(timeout=180.0) as client:
        with client.stream("POST", url, headers=headers, json=payload) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line or not line.startswith("data: "):
                    continue
                raw = line[6:].strip()
                if raw == "[DONE]":
                    break
                try:
                    chunk = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                delta = chunk["choices"][0]["delta"].get("content", "")
                if delta:
                    yield delta
