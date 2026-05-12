# backend/ml/agent.py
# ─────────────────────────────────────────────────────────────
# AI Study Agent — Transcript Q&A with streaming responses
#
# Primary  : Ollama (local, http://localhost:11434, llama3.2)
# Fallback : Groq cloud API (llama-3.3-70b-versatile, free tier)
#
# Voice input  : handled entirely by browser Web Speech API
# Voice output : handled entirely by browser SpeechSynthesis
# ─────────────────────────────────────────────────────────────

from __future__ import annotations
import os
import json
import httpx
from typing import Generator, Iterator

from ml.credibility import (
    score_agent_groundedness,
    aggregate_agent_scores,
    AgentGroundednessScore,
)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL",    "llama3.2")
GROQ_API_KEY    = os.getenv("GROQ_API_KEY",    "")
GROQ_MODEL      = os.getenv("GROQ_MODEL",      "llama-3.3-70b-versatile")

_SYSTEM_TEMPLATE = """\
You are an intelligent and friendly AI Study Agent embedded inside an audio lecture note-taking app.

You have been provided with the full English transcript of a lecture audio recording. Your job is to:
1. Summarise the lecture clearly and concisely when asked.
2. Answer any question the student asks, drawing ONLY from the transcript content.
3. Explain concepts in simple, easy-to-understand language — as if tutoring the student directly.
4. Generate relevant examples when the student asks.
5. Create quiz questions based on the content when asked.
6. When generating detailed study notes, structure them with clear headings, bullet points, and key takeaways.
7. If a question is unrelated to the transcript, politely say so and redirect to what IS in the transcript.

Keep replies conversational and suitable for being read aloud via text-to-speech.
Use short sentences. Avoid excessive markdown symbols like **, ## etc. when explaining — plain prose is better for speech.

━━━ LECTURE TRANSCRIPT ━━━
{transcript}
━━━ END OF TRANSCRIPT ━━━
"""


class TranscriptAgent:
    """Per-job conversational agent grounded on the lecture transcript."""

    def __init__(self, job_id: int, transcript_text: str):
        self.job_id              = job_id
        self.transcript          = transcript_text.strip()
        self.history: list[dict] = []
        self.model_preference    = "auto"   # 'auto' | 'local' | 'cloud'
        self._system             = _SYSTEM_TEMPLATE.format(transcript=self.transcript)
        # Live groundedness tracking — one entry per exchange
        self.groundedness_scores: list[AgentGroundednessScore] = []

    # ─────────────────────────────────────────────────────────
    #  Public streaming interface
    # ─────────────────────────────────────────────────────────
    def chat_stream(self, user_message: str) -> Generator[str, None, None]:
        """Yield text tokens as the agent responds. Maintains history."""
        self.history.append({"role": "user", "content": user_message})

        # ── Context audit log ───────────────────────────────────
        # Verify the transcript context is actually injected into the prompt.
        ctx_len = len(self.transcript)
        print(
            f"[Agent] job={self.job_id}  "
            f"context_injected={ctx_len} chars  "
            f"preview='{self.transcript[:200]}'"
        )

        messages = [{"role": "system", "content": self._system}] + self.history

        full_reply = ""
        try:
            if self.model_preference == "cloud":
                raise Exception("user selected cloud")
            for token in self._ollama_stream(messages):
                full_reply += token
                yield token
        except Exception as ollama_err:
            if self.model_preference == "local":
                msg = (
                    "⚠️ Local AI is not reachable. "
                    "Please ensure Ollama is running (run: ollama serve) "
                    "or switch to Cloud AI in the settings."
                )
                self.history.append({"role": "assistant", "content": msg})
                yield msg
                return
            full_reply = ""
            try:
                for token in self._groq_stream(messages):
                    full_reply += token
                    yield token
            except Exception as groq_err:
                msg = (
                    f"⚠️ Both Ollama and Groq are unavailable ({groq_err}). "
                    "Please check your configuration."
                )
                self.history.append({"role": "assistant", "content": msg})
                yield msg
                return

        self.history.append({"role": "assistant", "content": full_reply})

        # ── Live groundedness score ──────────────────────────────
        # Run after the full reply is accumulated (adds ~1 ms, no latency to stream).
        if full_reply.strip() and self.transcript:
            try:
                g_score = score_agent_groundedness(
                    self.transcript, user_message, full_reply
                )
                self.groundedness_scores.append(g_score)
            except Exception as g_err:
                print(f"[Agent] Groundedness scoring error: {g_err}")

    # ─────────────────────────────────────────────────────────
    #  Non-streaming — used for file generation (notes export)
    # ─────────────────────────────────────────────────────────
    def chat_complete(self, user_message: str) -> str:
        """Return the full reply as a string (blocking). Does NOT update history."""
        messages = [
            {"role": "system", "content": self._system},
            {"role": "user",   "content": user_message},
        ]
        reply = ""
        try:
            if self.model_preference != "cloud":
                for token in self._ollama_stream(messages, max_tokens=8192):
                    reply += token
                return reply
        except Exception:
            pass   # fall through to Groq; reset reply first
        if not GROQ_API_KEY:
            return "AI agent not available. Please configure Ollama or Groq."
        reply = ""  # discard any partial Ollama output before falling back
        try:
            for token in self._groq_stream(messages, max_tokens=8192):
                reply += token
            return reply
        except Exception as e:
            return f"Error generating content: {e}"

    def clear_history(self):
        self.history = []
        self.groundedness_scores = []

    def get_groundedness_report(self) -> dict:
        """Return the aggregated groundedness report for this session."""
        report = aggregate_agent_scores(self.groundedness_scores)
        return report.to_dict()

    # ─────────────────────────────────────────────────────────
    #  Ollama streaming (via raw httpx — no extra package needed)
    # ─────────────────────────────────────────────────────────
    def _ollama_stream(self, messages: list[dict], max_tokens: int = 8192) -> Iterator[str]:
        url     = f"{OLLAMA_BASE_URL}/api/chat"
        payload = {
            "model":    OLLAMA_MODEL,
            "messages": messages,
            "stream":   True,
            "options":  {"temperature": 0.7, "num_predict": max_tokens},
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

    # ─────────────────────────────────────────────────────────
    #  Groq streaming (OpenAI-compatible REST, via httpx)
    # ─────────────────────────────────────────────────────────
    def _groq_stream(self, messages: list[dict], max_tokens: int = 8192) -> Iterator[str]:
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
            "temperature": 0.7,
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
