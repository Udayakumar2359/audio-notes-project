# backend/ml/credibility.py
# ─────────────────────────────────────────────────────────────
# Credibility Scoring Engine
#
# Two independent checks — zero new ML models needed:
#
#   1. T5 Faithfulness  — did the note structurer stay true
#                         to the source transcript?
#      Metrics: ROUGE-1/2/L, content-word coverage %,
#               hallucination flag (notes words absent from transcript)
#
#   2. Agent Groundedness — is the AI answering from the
#                           injected transcript, not its weights?
#      Metrics: keyword overlap %, soft-match score, grade
#
# Usage:
#   from ml.credibility import score_t5_faithfulness, score_agent_groundedness
# ─────────────────────────────────────────────────────────────

from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from typing import List, Optional

# ── ROUGE import (already in requirements.txt) ────────────────
try:
    from rouge_score import rouge_scorer as _rouge_scorer
    _ROUGE_OK = True
except ImportError:                          # pragma: no cover
    _ROUGE_OK = False


# ─────────────────────────────────────────────────────────────
#  Shared helpers
# ─────────────────────────────────────────────────────────────

# Common English stopwords to exclude from coverage / overlap calculations
_STOPWORDS = frozenset({
    "the", "a", "an", "is", "was", "are", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "of", "in", "to", "for",
    "on", "at", "by", "with", "from", "as", "or", "and", "but", "if",
    "that", "this", "it", "its", "i", "we", "you", "he", "she", "they",
    "not", "so", "then", "than", "also", "very", "just", "more", "no",
    "all", "about", "up", "out", "into", "over", "after", "when", "there",
    "which", "who", "what", "how",
})


def _content_words(text: str) -> set[str]:
    """Lowercase alphanum tokens, stopwords removed."""
    tokens = re.sub(r"[^\w\s]", "", text.lower()).split()
    return {t for t in tokens if t and t not in _STOPWORDS and len(t) > 2}


def _grade_rouge(rouge_l: float) -> str:
    """Map ROUGE-L (0–1) to a human label."""
    if rouge_l >= 0.35:
        return "High"
    if rouge_l >= 0.18:
        return "Medium"
    return "Low"


def _grade_groundedness(overlap: float) -> str:
    if overlap >= 0.55:
        return "Grounded"
    if overlap >= 0.30:
        return "Partial"
    return "Off-Topic"


# ─────────────────────────────────────────────────────────────
#  Data classes
# ─────────────────────────────────────────────────────────────

@dataclass
class T5FaithfulnessScore:
    """ROUGE + coverage metrics for one (transcript → notes) pair."""
    rouge_1:            float = 0.0   # unigram F1  (0–1)
    rouge_2:            float = 0.0   # bigram F1   (0–1)
    rouge_l:            float = 0.0   # LCS F1      (0–1)
    coverage:           float = 0.0   # content-word coverage  (0–1)
    hallucination_flag: bool  = False  # True if >15% notes words absent from transcript
    grade:              str   = "Low"  # "High" | "Medium" | "Low"
    error:              Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class AgentGroundednessScore:
    """Keyword-overlap groundedness for one (question, answer) pair."""
    question:           str   = ""
    answer_snippet:     str   = ""    # first 120 chars of answer
    keyword_overlap:    float = 0.0   # fraction of answer content-words found in transcript
    grade:              str   = "Off-Topic"
    timestamp:          str   = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class AgentGroundednessReport:
    """Aggregated groundedness over all exchanges in one session."""
    exchanges_checked:   int   = 0
    avg_overlap:         float = 0.0
    grade:               str   = "Off-Topic"
    per_exchange:        List[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


# ─────────────────────────────────────────────────────────────
#  1. T5 Faithfulness scorer
# ─────────────────────────────────────────────────────────────

def score_t5_faithfulness(
    transcript: str,
    notes_text: str,
) -> T5FaithfulnessScore:
    """
    Score how faithful the T5-generated notes are to the source transcript.

    Args:
        transcript  – full English transcript (reference)
        notes_text  – flattened plain-text notes (hypothesis)

    Returns:
        T5FaithfulnessScore with ROUGE + coverage + hallucination_flag
    """
    if not transcript.strip() or not notes_text.strip():
        return T5FaithfulnessScore(error="Empty input — cannot score.")

    if not _ROUGE_OK:
        return T5FaithfulnessScore(
            error="rouge-score not installed. Run: pip install rouge-score"
        )

    try:
        scorer  = _rouge_scorer.RougeScorer(
            ["rouge1", "rouge2", "rougeL"], use_stemmer=True
        )
        scores  = scorer.score(transcript, notes_text)
        rouge_1 = round(scores["rouge1"].fmeasure, 4)
        rouge_2 = round(scores["rouge2"].fmeasure, 4)
        rouge_l = round(scores["rougeL"].fmeasure, 4)

        # ── Content-word coverage ──────────────────────────────
        # What fraction of transcript content-words appear in notes?
        src_words  = _content_words(transcript)
        note_words = _content_words(notes_text)
        coverage   = (
            round(len(src_words & note_words) / len(src_words), 4)
            if src_words else 0.0
        )

        # ── Hallucination flag ─────────────────────────────────
        # Flag if >15% of notes content-words are absent from the transcript.
        # This catches invented facts / names / numbers.
        if note_words:
            novel_ratio = len(note_words - src_words) / len(note_words)
            hallucination_flag = novel_ratio > 0.15
        else:
            hallucination_flag = False

        grade = _grade_rouge(rouge_l)

        print(
            f"[Credibility] T5 — ROUGE-L={rouge_l:.3f}  "
            f"cov={coverage:.2%}  hallucination={hallucination_flag}  "
            f"grade={grade}"
        )

        return T5FaithfulnessScore(
            rouge_1=rouge_1,
            rouge_2=rouge_2,
            rouge_l=rouge_l,
            coverage=coverage,
            hallucination_flag=hallucination_flag,
            grade=grade,
        )

    except Exception as exc:
        print(f"[Credibility] T5 scoring error: {exc}")
        return T5FaithfulnessScore(error=str(exc))


# ─────────────────────────────────────────────────────────────
#  2. Agent Groundedness scorer
# ─────────────────────────────────────────────────────────────

def score_agent_groundedness(
    transcript: str,
    question:   str,
    answer:     str,
) -> AgentGroundednessScore:
    """
    Score whether the agent's answer is grounded in the transcript.

    Algorithm:
    1. Extract content-words from the answer.
    2. Compute what fraction of them also appear in the transcript.
    3. Grade accordingly.

    This is fast (~1 ms) and adds no latency to the stream.

    Args:
        transcript – full English transcript (injected context)
        question   – user question (for logging)
        answer     – full agent answer text

    Returns:
        AgentGroundednessScore
    """
    from datetime import datetime

    if not transcript.strip() or not answer.strip():
        return AgentGroundednessScore(
            question=question,
            answer_snippet=answer[:120],
            grade="Off-Topic",
            timestamp=datetime.utcnow().isoformat() + "Z",
        )

    try:
        src_words    = _content_words(transcript)
        answer_words = _content_words(answer)

        overlap = (
            round(len(answer_words & src_words) / len(answer_words), 4)
            if answer_words else 0.0
        )
        grade = _grade_groundedness(overlap)

        print(
            f"[Credibility] Agent — Q='{question[:60]}…'  "
            f"overlap={overlap:.2%}  grade={grade}"
        )

        return AgentGroundednessScore(
            question=question,
            answer_snippet=answer[:120],
            keyword_overlap=overlap,
            grade=grade,
            timestamp=datetime.utcnow().isoformat() + "Z",
        )

    except Exception as exc:
        print(f"[Credibility] Agent scoring error: {exc}")
        return AgentGroundednessScore(
            question=question,
            answer_snippet=answer[:120],
            grade="Off-Topic",
            timestamp=datetime.utcnow().isoformat() + "Z",
        )


# ─────────────────────────────────────────────────────────────
#  3. Build combined credibility report dict
# ─────────────────────────────────────────────────────────────

def build_credibility_report(
    t5_score:     T5FaithfulnessScore,
    agent_report: Optional[AgentGroundednessReport] = None,
) -> dict:
    """
    Merge T5 and agent scores into one JSON-serialisable report.
    Stored in StructuredNotes.credibility_json.
    """
    report = {
        "t5": t5_score.to_dict(),
        "agent": agent_report.to_dict() if agent_report else {
            "exchanges_checked": 0,
            "avg_overlap": 0.0,
            "grade": "Not checked yet",
            "per_exchange": [],
        },
    }
    return report


def aggregate_agent_scores(
    scores: List[AgentGroundednessScore],
) -> AgentGroundednessReport:
    """Aggregate a list of per-exchange scores into a summary report."""
    if not scores:
        return AgentGroundednessReport()

    overlaps = [s.keyword_overlap for s in scores]
    avg      = round(sum(overlaps) / len(overlaps), 4)
    grade    = _grade_groundedness(avg)

    return AgentGroundednessReport(
        exchanges_checked=len(scores),
        avg_overlap=avg,
        grade=grade,
        per_exchange=[s.to_dict() for s in scores],
    )
