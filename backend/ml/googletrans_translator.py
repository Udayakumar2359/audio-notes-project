# backend/ml/googletrans_translator.py
# ─────────────────────────────────────────────────────────────
# Transcript Translator — powered by deep-translator (Google Translate)
# Uses the `deep_translator` library which wraps Google Translate
# via `requests` — no httpx dependency, zero version conflicts.
#
# Exposes the SAME interface as translator.py so main.py only
# needs the import swap — zero other changes needed.
#
# Functions exported (identical signatures to translator.py):
#   translate_notes_stream(text, target_lang) -> Iterator[str]
#   translate_notes(text, target_lang)        -> str
#   LANGUAGES                                 -> dict
# ─────────────────────────────────────────────────────────────

from __future__ import annotations
from deep_translator import GoogleTranslator

# Supported target languages
LANGUAGES: dict[str, str] = {
    "hi": "Hindi",
    "kn": "Kannada",
    "te": "Telugu",
    "ta": "Tamil",
}

# deep_translator language code map
_LANG_CODE_MAP: dict[str, str] = {
    "hi": "hi",
    "kn": "kn",
    "te": "te",
    "ta": "ta",
}

# Max characters per GoogleTranslator call (Google's limit is ~5000)
_CHUNK_CHARS = 4500


def _split_text(text: str, size: int = _CHUNK_CHARS) -> list[str]:
    """Split long text into chunks at sentence boundaries where possible."""
    if len(text) <= size:
        return [text]

    chunks = []
    while text:
        if len(text) <= size:
            chunks.append(text)
            break
        # Try to split at last sentence-ending punctuation within size
        split_at = size
        for sep in (". ", "! ", "? ", "\n"):
            pos = text.rfind(sep, 0, size)
            if pos != -1:
                split_at = pos + len(sep)
                break
        chunks.append(text[:split_at])
        text = text[split_at:]
    return chunks


# ── Internal helpers ──────────────────────────────────────────

def _google_translate(text: str, target_lang: str) -> str:
    """
    Translate text using deep_translator.GoogleTranslator.
    Automatically handles long text by splitting into chunks.
    """
    lang_code = _LANG_CODE_MAP.get(target_lang, target_lang)
    parts = _split_text(text.strip())
    translated_parts = []
    for part in parts:
        result = GoogleTranslator(source="en", target=lang_code).translate(part)
        translated_parts.append(result or "")
    return " ".join(translated_parts)


# ── Public API (mirrors translator.py exactly) ────────────────

def translate_notes_stream(text: str, target_lang: str):
    """
    Streaming translation: English transcript → Hindi, Kannada, Telugu or Tamil.
    Yields text tokens one at a time (compatible with SSE event_stream).

    Note: GoogleTranslator returns the full translated text in one shot —
    we chunk it into ~80-char pieces to simulate a streaming feel in the UI.
    """
    if target_lang not in LANGUAGES:
        yield (
            f"Unsupported language code: {target_lang}. "
            f"Supported: {list(LANGUAGES.keys())}"
        )
        return

    try:
        translated = _google_translate(text, target_lang)
    except Exception as e:
        yield (
            f"Translation failed via Google Translate. "
            f"Error: {e}"
        )
        return

    # Simulate streaming: yield in sentence-sized chunks so the
    # frontend SSE consumer sees progressive output (not one huge blob).
    STREAM_CHUNK = 80
    for i in range(0, len(translated), STREAM_CHUNK):
        yield translated[i : i + STREAM_CHUNK]


def translate_notes(text: str, target_lang: str) -> str:
    """Blocking translation: English → target language. Returns full translated string."""
    return "".join(translate_notes_stream(text, target_lang))
