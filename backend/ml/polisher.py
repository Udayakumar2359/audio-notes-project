# backend/ml/polisher.py
# ─────────────────────────────────────────────────────────────
# Transcript Polisher
# Uses an LLM to rewrite the raw transcript for grammar,
# flow, and hallucination removal while strictly preserving
# the original length and detail (no summarization).
# ─────────────────────────────────────────────────────────────

import os
import json
import httpx

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL",    "llama3.2")

def _make_messages(text: str) -> list[dict]:
    system = (
        "You are an expert transcript editor. Your ONLY task is to polish the provided raw spoken transcript "
        "to fix grammar, improve clarity, and enhance readability WITHOUT SHORTENING THE TEXT. "
        "CRITICAL RULES: "
        "1. DO NOT summarize or shorten. The output must be roughly the same length and contain all original details. "
        "2. REMOVE repeated words and phrases while keeping the meaning intact. "
        "   Example: 'so so we need to need to do this' → 'so we need to do this' "
        "3. FIX unclear sentences by improving grammar and structure. "
        "   Example: 'the thing um is that we can like do this way' → 'the point is that we can do this way' "
        "4. Remove stutters, filler words (uh, um, err, like), and verbal pauses. "
        "5. Keep all important details, concepts, and technical terms exactly as mentioned. "
        "6. Maintain the original tone and speaking pattern (academic/casual as appropriate). "
        "7. Do NOT add any conversational filler or explanations like 'Here is the polished transcript:'. "
        "8. Output ONLY the polished text, nothing else."
    )
    user = (
        f"Please polish the following raw transcript while maintaining its full content and length:\n\n{text}"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user",   "content": user},
    ]

def _stream_ollama(messages: list[dict], max_tokens: int = 8192):
    url     = f"{OLLAMA_BASE_URL}/api/chat"
    payload = {
        "model":    OLLAMA_MODEL,
        "messages": messages,
        "stream":   True,
        "options":  {"temperature": 0.1, "num_predict": max_tokens},
    }
    with httpx.Client(timeout=300.0) as client:
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

def polish_transcript(raw_text: str) -> str:
    """
    Polishes the raw transcript using Ollama.
    """
    if not raw_text.strip():
        return ""
        
    messages = _make_messages(raw_text)
    polished = ""
    
    try:
        for token in _stream_ollama(messages, max_tokens=8192):
            polished += token
        return polished.strip()
    except Exception as e:
        print(f"[Polisher] Ollama failed ({e}). Returning raw transcript.")
        return raw_text # Fallback to raw if Ollama fails
