# backend/ml/nlp_agent.py
# ─────────────────────────────────────────────────────────────
# Qwen NLP Agent — Advanced Transcript-to-Notes Pipeline
#
# Processes raw transcripts (up to 15,000–20,000 words from 90–120 min
# audio) through a sequential 4-stage pipeline:
#
#   Stage 1 — Transcript Cleaner
#             Remove fillers, fix grammar, add punctuation.
#   Stage 2 — Context Reconstructor
#             Expand fragmented STT text into full educational sentences.
#   Stage 3 — Topic Extractor
#             Extract main topic, subtopics, keywords as JSON.
#   Stage 4 — Hierarchical Summariser
#             First Pass:  summarise each ~1000-word chunk.
#             Second Pass: merge summaries → final structured notes.
#
# Long-transcript Chunking Strategy
# ──────────────────────────────────
# Qwen2.5-7B has a ~32k token context window, but keeping prompts
# under ~3000 words per call ensures quality and avoids OOM.
# We split at sentence boundaries with a small overlap so no concept
# is lost at a chunk seam.
# ─────────────────────────────────────────────────────────────

from __future__ import annotations
import re
import os
import json
import logging
from typing import List, Dict
from concurrent.futures import ThreadPoolExecutor, as_completed

from ml.qwen_generator import generate

logger = logging.getLogger(__name__)

# ── Chunking Configuration ────────────────────────────────────
CHUNK_WORDS       = 1100   # target words per chunk
OVERLAP_WORDS     = 80     # overlapping words between chunks (avoids seam loss)
MAX_RETRIES       = 2      # retry count on JSON parse failure

# ── Thread Pool for Parallel Chunk Processing ─────────────────
# Ollama handles concurrent requests safely, so we can parallelise
# all chunk-level generation tasks (clean, reconstruct, summarise).
# Default: 4 workers. Override with NLP_MAX_WORKERS env var.
NLP_MAX_WORKERS = int(os.getenv("NLP_MAX_WORKERS", "4"))

# ── Prompts ───────────────────────────────────────────────────

CLEAN_PROMPT = """\
You are an expert transcript editor for academic lecture recordings.

Clean the following raw transcript segment from an automatic speech recognition (ASR) system.

RULES:
- REMOVE filler words: um, uh, hmm, like, you know, okay so, right, etc.
- FIX grammatical errors and incomplete sentences.
- ADD proper punctuation (periods, commas, question marks).
- FIX capitalization for proper nouns, acronyms, and sentence starts.
- PRESERVE all technical terms, names, formulas, and domain-specific vocabulary exactly.
- KEEP the complete meaning — do NOT remove any educational content.
- Do NOT add any new information. Only clean and fix.
- Output ONLY the cleaned transcript. No preamble, no explanations.

RAW TRANSCRIPT SEGMENT:
{text}

CLEANED TRANSCRIPT:"""


CONTEXT_PROMPT = """\
You are an expert academic content reconstructor for lecture transcripts.

The following is a cleaned segment from a lecture transcript captured by an ASR system. 
It may contain fragmented sentences, incomplete thoughts, or missing context due to audio gaps.

RULES:
- EXPAND fragments into complete, clear educational sentences.
- RESTORE implied context and fill in logical gaps naturally.
- MAINTAIN the academic tone and subject matter.
- ORGANIZE into coherent paragraphs with smooth transitions.
- PRESERVE all technical terms, formulas, and specific concepts.
- Do NOT add new facts or concepts not implied by the original text.
- Output ONLY the reconstructed paragraphs. No preamble.

FRAGMENTED SEGMENT:
{text}

RECONSTRUCTED PARAGRAPHS:"""


TOPIC_PROMPT = """\
You are an expert academic topic analyzer.

Analyze the following lecture transcript and extract its topic structure.

RULES:
- Identify the MAIN TOPIC (single primary subject of the entire lecture).
- Identify 3–8 SUBTOPICS (major themes discussed).
- Extract 10–20 KEYWORDS (important technical terms, concepts, names).
- Output ONLY valid JSON. No markdown, no code blocks, no explanation.

OUTPUT FORMAT (strict JSON):
{{
  "main_topic": "string",
  "subtopics": ["string", "string", ...],
  "keywords": ["string", "string", ...]
}}

LECTURE TRANSCRIPT:
{text}

JSON OUTPUT:"""


CHUNK_PROMPT = """\
You are an expert academic summarizer.

Summarize the following lecture transcript segment into a detailed intermediate summary.
This summary will be merged with other chunk summaries to form the final lecture notes.

RULES:
- CAPTURE every key concept, definition, formula, and example.
- Use COMPLETE sentences — no bullet points in this summary.
- PRESERVE the logical flow and order of ideas.
- Keep technical terms and domain-specific vocabulary intact.
- Length: 200–350 words. Be thorough — missing detail here means it's lost forever.
- Output ONLY the summary paragraph(s). No preamble.

TRANSCRIPT SEGMENT:
{text}

DETAILED CHUNK SUMMARY:"""


FINAL_PROMPT = """\
You are a world-class academic note generator. 

Using the merged summaries from a full lecture, produce MAXIMUM DETAIL structured educational notes.

RULES:
- BE comprehensive — a student should be able to study ONLY from these notes.
- Use PRECISE academic language.
- CAPITALIZE important CONCEPTS and TERMS.
- Include EXAMPLES wherever mentioned or implied.
- Structure MUST follow the format below exactly.

OUTPUT FORMAT:

# TITLE: [Derive a clear, specific title from the content]

## MAIN TOPICS COVERED
[List all major topics as bullet points]

## DETAILED EXPLANATIONS
[For each major concept: write 2–5 sentences explaining it fully. 
 Use sub-headings for each concept. Include definitions, mechanisms, and significance.]

## EXAMPLES AND APPLICATIONS
[List all examples, case studies, or real-world applications mentioned or implied]

## KEY TAKEAWAYS
[5–10 bullet points of the most important concepts a student must remember]

## GLOSSARY OF TERMS
[Define all technical terms and keywords from the lecture]

---

MERGED LECTURE SUMMARIES:
{text}

STRUCTURED LECTURE NOTES:"""


# ─────────────────────────────────────────────────────────────
#  Chunking Engine
# ─────────────────────────────────────────────────────────────

def _split_into_sentences(text: str) -> List[str]:
    """Split text into individual sentences using regex."""
    # Split on sentence-ending punctuation followed by whitespace or end-of-string
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s.strip() for s in sentences if s.strip()]


def chunk_text(
    text: str,
    chunk_words: int = CHUNK_WORDS,
    overlap_words: int = OVERLAP_WORDS,
) -> List[str]:
    """
    Split a long transcript into overlapping sentence-boundary-aligned chunks.

    Algorithm:
    1. Split text into sentences.
    2. Greedily accumulate sentences until the chunk reaches `chunk_words` words.
    3. Start the next chunk `overlap_words` back from the current position
       (rounded to the nearest sentence boundary) to preserve cross-chunk context.

    Parameters
    ----------
    text         : Full transcript text (may be 15,000–20,000 words).
    chunk_words  : Target words per chunk (default 1100).
    overlap_words: Words of overlap between consecutive chunks (default 80).

    Returns
    -------
    List[str]: List of text chunks, each ≈ chunk_words words.
    """
    if not text.strip():
        return []

    sentences = _split_into_sentences(text)
    if not sentences:
        return [text]

    chunks: List[str] = []
    current_sentences: List[str] = []
    current_word_count = 0
    i = 0

    while i < len(sentences):
        sent = sentences[i]
        sent_words = len(sent.split())

        current_sentences.append(sent)
        current_word_count += sent_words

        # When chunk is full, save it and prepare overlap for next chunk
        if current_word_count >= chunk_words:
            chunks.append(" ".join(current_sentences))

            # Find the overlap starting point by walking back from the end
            overlap_accumulated = 0
            overlap_start = len(current_sentences) - 1
            while overlap_start > 0:
                prev_words = len(current_sentences[overlap_start].split())
                if overlap_accumulated + prev_words > overlap_words:
                    break
                overlap_accumulated += prev_words
                overlap_start -= 1

            # Start next chunk from the overlap sentences
            current_sentences = current_sentences[overlap_start:]
            current_word_count = sum(len(s.split()) for s in current_sentences)

        i += 1

    # Don't forget the last partial chunk
    if current_sentences:
        # Only add if this isn't a pure duplicate of the last chunk
        last_chunk = " ".join(current_sentences)
        if not chunks or last_chunk != chunks[-1]:
            chunks.append(last_chunk)

    total_words = len(text.split())
    logger.info(
        f"[NlpAgent] Chunked {total_words} words → {len(chunks)} chunks "
        f"(target={chunk_words} words/chunk, overlap={overlap_words} words)"
    )
    return chunks


# ─────────────────────────────────────────────────────────────
#  Stage 1 — Transcript Cleaner
# ─────────────────────────────────────────────────────────────

def clean_transcript(raw_transcript: str) -> str:
    """
    Remove ASR fillers, fix grammar, and add punctuation across all chunks.

    For long transcripts, processes chunk-by-chunk and stitches results.

    Parameters
    ----------
    raw_transcript: Raw Whisper output (may be 15,000–20,000 words).

    Returns
    -------
    str: Clean, grammatically correct transcript.
    """
    if not raw_transcript.strip():
        return ""

    chunks = chunk_text(raw_transcript)
    total = len(chunks)
    cleaned_chunks: List[str] = [""] * total

    def _clean_one(args):
        idx, chunk = args
        logger.info(f"[NlpAgent] Cleaning chunk {idx + 1}/{total} "
                    f"({len(chunk.split())} words)...")
        prompt = CLEAN_PROMPT.format(text=chunk)
        try:
            result = generate(prompt, max_new_tokens=1200, temperature=0.1)
            return idx, result.strip()
        except Exception as exc:
            logger.warning(f"[NlpAgent] Cleaning chunk {idx + 1} failed: {exc}. Using raw.")
            return idx, chunk  # fallback: use raw chunk

    with ThreadPoolExecutor(max_workers=NLP_MAX_WORKERS) as pool:
        futures = {pool.submit(_clean_one, (i, c)): i for i, c in enumerate(chunks)}
        for future in as_completed(futures):
            idx, text = future.result()
            cleaned_chunks[idx] = text

    result = " ".join(cleaned_chunks)
    logger.info(f"[NlpAgent] Cleaning complete: {len(result.split())} words")
    return result


# ─────────────────────────────────────────────────────────────
#  Stage 2 — Context Reconstructor
# ─────────────────────────────────────────────────────────────

def reconstruct_context(cleaned_transcript: str) -> str:
    """
    Expand fragmented STT sentences into full coherent educational paragraphs.

    Processes chunk-by-chunk to handle long transcripts.

    Parameters
    ----------
    cleaned_transcript: Output of clean_transcript().

    Returns
    -------
    str: Coherent multi-paragraph reconstructed text.
    """
    if not cleaned_transcript.strip():
        return ""

    chunks = chunk_text(cleaned_transcript)
    total = len(chunks)
    reconstructed_chunks: List[str] = [""] * total

    def _reconstruct_one(args):
        idx, chunk = args
        logger.info(f"[NlpAgent] Reconstructing chunk {idx + 1}/{total} "
                    f"({len(chunk.split())} words)...")
        prompt = CONTEXT_PROMPT.format(text=chunk)
        try:
            result = generate(prompt, max_new_tokens=1300, temperature=0.2)
            return idx, result.strip()
        except Exception as exc:
            logger.warning(f"[NlpAgent] Reconstruction chunk {idx + 1} failed: {exc}. Using cleaned.")
            return idx, chunk

    with ThreadPoolExecutor(max_workers=NLP_MAX_WORKERS) as pool:
        futures = {pool.submit(_reconstruct_one, (i, c)): i for i, c in enumerate(chunks)}
        for future in as_completed(futures):
            idx, text = future.result()
            reconstructed_chunks[idx] = text

    result = "\n\n".join(reconstructed_chunks)
    logger.info(f"[NlpAgent] Reconstruction complete: {len(result.split())} words")
    return result


# ─────────────────────────────────────────────────────────────
#  Stage 3 — Topic Extractor
# ─────────────────────────────────────────────────────────────

def extract_topics(reconstructed_transcript: str) -> Dict:
    """
    Extract main topic, subtopics, and keywords from the transcript as JSON.

    Runs on a representative ~3000-word sample for efficiency (running
    topic extraction on 20,000 words produces diminishing returns).

    Parameters
    ----------
    reconstructed_transcript: Output of reconstruct_context().

    Returns
    -------
    dict: {"main_topic": str, "subtopics": List[str], "keywords": List[str]}
    """
    if not reconstructed_transcript.strip():
        return {"main_topic": "Lecture", "subtopics": [], "keywords": []}

    # Use a representative sample (first + middle + last section)
    words = reconstructed_transcript.split()
    total = len(words)

    if total <= 3000:
        sample = reconstructed_transcript
    else:
        # Take ~1000 words from start, middle, end
        start  = " ".join(words[:1000])
        mid_s  = total // 2 - 500
        middle = " ".join(words[mid_s: mid_s + 1000])
        end    = " ".join(words[-1000:])
        sample = f"{start}\n\n[...]\n\n{middle}\n\n[...]\n\n{end}"

    prompt = TOPIC_PROMPT.format(text=sample)

    for attempt in range(MAX_RETRIES + 1):
        try:
            raw_output = generate(prompt, max_new_tokens=512, temperature=0.1)

            # Extract JSON block — model may wrap in markdown code fences
            json_match = re.search(r'\{.*\}', raw_output, re.DOTALL)
            if json_match:
                topics = json.loads(json_match.group())
                # Validate expected structure
                if "main_topic" in topics:
                    logger.info(
                        f"[NlpAgent] Topics extracted: {topics.get('main_topic')} "
                        f"({len(topics.get('subtopics', []))} subtopics)"
                    )
                    return topics
        except (json.JSONDecodeError, Exception) as exc:
            logger.warning(f"[NlpAgent] Topic extraction attempt {attempt + 1} failed: {exc}")

    # Fallback on all retries failing
    logger.warning("[NlpAgent] Topic extraction failed all retries — returning placeholder.")
    return {
        "main_topic": "Lecture Content",
        "subtopics": [],
        "keywords": [],
    }


# ─────────────────────────────────────────────────────────────
#  Stage 4 — Hierarchical Summariser
# ─────────────────────────────────────────────────────────────

def _summarise_chunk(chunk: str, idx: int, total: int) -> str:
    """
    First-pass summarisation of a single transcript chunk.
    Produces a dense intermediate summary (200–350 words).
    """
    logger.info(f"[NlpAgent] Summarising chunk {idx + 1}/{total} "
                f"({len(chunk.split())} words)...")
    prompt = CHUNK_PROMPT.format(text=chunk)
    try:
        summary = generate(prompt, max_new_tokens=512, temperature=0.2)
        return summary.strip()
    except Exception as exc:
        logger.warning(f"[NlpAgent] Chunk summary {idx + 1} failed: {exc}. Using truncated raw.")
        # Fallback: use first 300 words of the raw chunk
        return " ".join(chunk.split()[:300])


def summarise_hierarchically(reconstructed_transcript: str) -> str:
    """
    Two-pass hierarchical summarisation for long transcripts.

    Pass 1 (Chunk-Level):
        Split the full reconstructed transcript into ~1100-word chunks.
        Summarise EACH chunk individually so no sentence is lost.
        Each chunk produces a ~250-word intermediate summary.

    Pass 2 (Global-Level):
        Merge all intermediate summaries (typically ~3000–5000 words total).
        Run the FINAL_PROMPT to produce fully structured academic notes
        with Title, Topics, Detailed Explanations, Examples, and Key Takeaways.

    Parameters
    ----------
    reconstructed_transcript: Full reconstructed transcript from Stage 2.

    Returns
    -------
    str: Final structured lecture notes (markdown formatted).
    """
    if not reconstructed_transcript.strip():
        return "# Lecture Notes\n\nNo transcript content was detected."

    total_words = len(reconstructed_transcript.split())
    logger.info(f"[NlpAgent] Starting hierarchical summarisation "
                f"({total_words} words total)...")

    # ── Pass 1: Chunk-Level Summarisation (parallel) ──────────
    chunks = chunk_text(reconstructed_transcript, chunk_words=CHUNK_WORDS)
    total_chunks = len(chunks)
    logger.info(f"[NlpAgent] Pass 1: {total_chunks} chunks to summarise (parallel, workers={NLP_MAX_WORKERS})")

    chunk_summaries: List[str] = [""] * total_chunks

    def _summarise_one(args):
        idx, chunk = args
        summary = _summarise_chunk(chunk, idx, total_chunks)
        logger.info(f"[NlpAgent] Chunk {idx + 1}/{total_chunks} summarised "
                    f"→ {len(summary.split())} words")
        return idx, summary

    with ThreadPoolExecutor(max_workers=NLP_MAX_WORKERS) as pool:
        futures = {pool.submit(_summarise_one, (i, c)): i for i, c in enumerate(chunks)}
        for future in as_completed(futures):
            idx, summary = future.result()
            chunk_summaries[idx] = summary

    # ── Merge all chunk summaries ──────────────────────────────
    merged_summaries = "\n\n---\n\n".join(chunk_summaries)
    merged_word_count = len(merged_summaries.split())
    logger.info(f"[NlpAgent] Pass 1 complete. Merged summaries: {merged_word_count} words")

    # ── Pass 2: Global Final Notes Generation ─────────────────
    # If merged summaries are still very long (> 8000 words from very long
    # audio), apply one more intermediate reduction pass before final.
    if merged_word_count > 8000:
        logger.info(f"[NlpAgent] Merged summaries exceed 8000 words — running intermediate pass...")
        intermediate_chunks = chunk_text(merged_summaries, chunk_words=1500)
        intermediate_summaries: List[str] = []
        for idx, chunk in enumerate(intermediate_chunks):
            prompt = CHUNK_PROMPT.format(text=chunk)
            try:
                s = generate(prompt, max_new_tokens=600, temperature=0.2)
                intermediate_summaries.append(s.strip())
            except Exception as exc:
                logger.warning(f"[NlpAgent] Intermediate pass chunk {idx + 1} failed: {exc}")
                intermediate_summaries.append(" ".join(chunk.split()[:400]))
        merged_summaries = "\n\n---\n\n".join(intermediate_summaries)
        logger.info(f"[NlpAgent] Intermediate pass complete: {len(merged_summaries.split())} words")

    logger.info("[NlpAgent] Pass 2: Generating final structured notes...")
    final_prompt = FINAL_PROMPT.format(text=merged_summaries)
    try:
        final_notes = generate(final_prompt, max_new_tokens=2048, temperature=0.2)
        final_notes = final_notes.strip()
    except Exception as exc:
        logger.error(f"[NlpAgent] Final notes generation failed: {exc}")
        # Fallback: return merged summaries formatted simply
        final_notes = (
            "# Lecture Notes\n\n"
            "## Overview\n\n"
            + merged_summaries
        )

    logger.info(f"[NlpAgent] Final notes generated: {len(final_notes.split())} words")
    return final_notes


# ─────────────────────────────────────────────────────────────
#  Public Orchestrator
# ─────────────────────────────────────────────────────────────

def process_transcript(raw_transcript: str) -> dict:
    """
    Full sequential pipeline: raw ASR output → structured notes.

    Stages:
        1. clean_transcript()
        2. reconstruct_context()
        3. extract_topics()
        4. summarise_hierarchically()

    Parameters
    ----------
    raw_transcript: Raw Whisper ASR output (up to 20,000 words).

    Returns
    -------
    dict: {
        "title":               str,
        "main_topic":          str,
        "subtopics":           List[str],
        "keywords":            List[str],
        "summary":             str,   ← the full structured notes markdown
        "key_points":          List[str],
        "sections":            List[dict],
        "full_transcript":     str,   ← original raw transcript
        "clean_transcript":    str,   ← Stage 1 output
        "reconstructed_text":  str,   ← Stage 2 output
        "word_count":          int,
    }
    """
    if not raw_transcript or not raw_transcript.strip():
        return _empty_result()

    word_count = len(raw_transcript.split())
    logger.info(f"[NlpAgent] Starting full pipeline for {word_count} words")

    # Stage 1 — Clean
    logger.info("[NlpAgent] Stage 1: Cleaning transcript...")
    cleaned = clean_transcript(raw_transcript)

    # Stage 2 — Reconstruct
    logger.info("[NlpAgent] Stage 2: Reconstructing context...")
    reconstructed = reconstruct_context(cleaned)

    # Stage 3 — Topics
    logger.info("[NlpAgent] Stage 3: Extracting topics...")
    topics_data = extract_topics(reconstructed)

    # Stage 4 — Hierarchical Summarisation
    logger.info("[NlpAgent] Stage 4: Hierarchical summarisation...")
    structured_notes = summarise_hierarchically(reconstructed)

    # ── Parse final notes into structured dict ─────────────────
    # Extract title from first heading if present
    title = topics_data.get("main_topic", "Lecture Notes")
    title_match = re.search(r'#\s*TITLE:\s*(.+)', structured_notes)
    if title_match:
        title = title_match.group(1).strip()

    # Extract key takeaways section as bullet list
    key_points: List[str] = []
    takeaways_match = re.search(
        r'##\s*KEY TAKEAWAYS\s*\n(.*?)(?=\n##|\Z)', structured_notes, re.DOTALL
    )
    if takeaways_match:
        raw_kp = takeaways_match.group(1).strip()
        key_points = [
            line.lstrip("•-* ").strip()
            for line in raw_kp.splitlines()
            if line.strip() and not line.strip().startswith("#")
        ]

    # Build sections from the detailed explanations section
    sections: List[dict] = []
    explanations_match = re.search(
        r'##\s*DETAILED EXPLANATIONS\s*\n(.*?)(?=\n##|\Z)', structured_notes, re.DOTALL
    )
    if explanations_match:
        section_blocks = re.split(r'\n###\s+', explanations_match.group(1))
        for block in section_blocks:
            if not block.strip():
                continue
            lines = block.strip().splitlines()
            heading = lines[0].strip().rstrip(':') if lines else "Section"
            content = " ".join(lines[1:]).strip()
            if content:
                sections.append({
                    "heading":    heading,
                    "definition": content,
                    "key_points": [
                        line.lstrip("•-* ").strip()
                        for line in lines[1:]
                        if line.strip().startswith(("•", "-", "*"))
                    ],
                })

    logger.info(f"[NlpAgent] Pipeline complete — title='{title}', "
                f"sections={len(sections)}, key_points={len(key_points)}")

    return {
        "title":              title,
        "main_topic":         topics_data.get("main_topic", title),
        "subtopics":          topics_data.get("subtopics", []),
        "keywords":           topics_data.get("keywords", []),
        "summary":            structured_notes,
        "key_points":         key_points,
        "sections":           sections,
        "full_transcript":    raw_transcript,
        "clean_transcript":   cleaned,
        "reconstructed_text": reconstructed,
        "word_count":         word_count,
    }


def _empty_result() -> dict:
    """Return a safe empty result dict when no transcript is provided."""
    return {
        "title":              "Lecture Notes",
        "main_topic":         "",
        "subtopics":          [],
        "keywords":           [],
        "summary":            "No speech was detected in this audio file.",
        "key_points":         [],
        "sections":           [],
        "full_transcript":    "",
        "clean_transcript":   "",
        "reconstructed_text": "",
        "word_count":         0,
    }


# ─────────────────────────────────────────────────────────────
#  Backward-compatible plain-text renderer
# ─────────────────────────────────────────────────────────────

def to_plain_text(notes_dict: dict) -> str:
    """
    Render a notes dict to plain text for DB storage and TXT export.
    Mirrors the old NoteStructurer.to_plain_text() signature.
    """
    lines = [
        "=" * 60,
        f"  {notes_dict.get('title', 'LECTURE NOTES').upper()}",
        "=" * 60,
        "",
        f"Words transcribed: {notes_dict.get('word_count', 0)}",
        "",
    ]

    main_topic = notes_dict.get("main_topic", "")
    if main_topic:
        lines += ["─" * 60, "  MAIN TOPIC", "─" * 60, "", f"  {main_topic}", ""]

    subtopics = notes_dict.get("subtopics", [])
    if subtopics:
        lines += ["─" * 60, "  SUBTOPICS", "─" * 60, ""]
        for st in subtopics:
            lines.append(f"    • {st}")
        lines.append("")

    keywords = notes_dict.get("keywords", [])
    if keywords:
        lines += ["─" * 60, "  KEYWORDS", "─" * 60, ""]
        lines.append("  " + ", ".join(keywords))
        lines.append("")

    summary = notes_dict.get("summary", "")
    if summary:
        lines += ["─" * 60, "  STRUCTURED NOTES", "─" * 60, "", summary, ""]

    sections = notes_dict.get("sections", [])
    if sections:
        lines += ["─" * 60, "  SECTIONS", "─" * 60, ""]
        for i, sec in enumerate(sections, 1):
            lines.append(f"\n  {i}. {sec['heading'].upper()}")
            lines.append(f"  {'─' * 50}")
            lines.append(f"  {sec.get('definition', '')}")
            kps = sec.get("key_points", [])
            if kps:
                lines.append("")
                lines.append("  Key Points:")
                for pt in kps:
                    lines.append(f"    • {pt}")
            lines.append("")

    lines += [
        "─" * 60,
        "  FULL TRANSCRIPT (English)",
        "─" * 60,
        "",
        notes_dict.get("full_transcript", ""),
        "",
        "=" * 60,
        "  Generated by AudioNotes AI — Qwen2.5-7B-Instruct",
        "=" * 60,
    ]
    return "\n".join(lines)
