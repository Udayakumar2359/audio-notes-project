# backend/ml/note_structurer.py
# ─────────────────────────────────────────────────────────────
# Note Structuring Pipeline
#
# Fine-tuned T5 model: udayakumar8214/t5-lecture-notes
# Converts cleaned English transcript into structured JSON notes.
# ─────────────────────────────────────────────────────────────

import os
import re
import json
import torch
from transformers import T5Tokenizer, T5ForConditionalGeneration


class NoteStructurer:
    """
    Loads the fine-tuned T5 notes model from HuggingFace Hub.
    Converts full English transcript → structured dict of academic notes.
    """

    MAX_INPUT_CHARS   = 1_400   # chars per T5 segment
    MAX_INPUT_TOKENS  = 512
    MAX_OUTPUT_TOKENS = 256     # bumped for richer, longer notes
    # num_beams=4 → noticeably better output with no retraining
    NUM_BEAMS         = int(os.getenv("T5_BEAMS", "4"))

    def __init__(self, model_id: str):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        hf_token = os.getenv("HF_TOKEN")
        print(f"[NoteStructurer] Loading T5: {model_id}")
        self.tokenizer = T5Tokenizer.from_pretrained(model_id, token=hf_token)
        self.model     = T5ForConditionalGeneration.from_pretrained(
            model_id, token=hf_token
        ).to(self.device)
        print("[NoteStructurer] T5 loaded ✓")

    # ─────────────────────────────────────────────────────────
    #  Internal: summarise one text segment
    # ─────────────────────────────────────────────────────────
    def _summarise_segment(self, text: str) -> str:
        input_text = "summarize: " + text
        tokens = self.tokenizer(
            input_text,
            return_tensors="pt",
            max_length=self.MAX_INPUT_TOKENS,
            truncation=True,
        ).to(self.device)

        with torch.inference_mode():
            output_ids = self.model.generate(
                **tokens,
                max_length=self.MAX_OUTPUT_TOKENS,
                num_beams=self.NUM_BEAMS,
                no_repeat_ngram_size=3,   # prevents repetitive phrases
                length_penalty=1.5,        # encourages longer, complete outputs
                early_stopping=True,
            )
        return self.tokenizer.decode(output_ids[0], skip_special_tokens=True).strip()

    # ─────────────────────────────────────────────────────────
    #  Public: transcript → structured notes dict
    # ─────────────────────────────────────────────────────────
    def structure_notes(self, full_transcript: str) -> dict:
        """
        Split transcript into 1400-char segments, run T5 summarisation
        on each, then build a structured dict with:
          - title
          - summary (one-liner)
          - key_points (list of bullet strings)
          - sections (list of {heading, content})
          - full_transcript
          - word_count
        """
        if not full_transcript.strip():
            return {
                "title":           "Lecture Notes",
                "summary":         "No transcript content was detected.",
                "key_points":      [],
                "sections":        [],
                "full_transcript": "",
                "word_count":      0,
            }

        # ── Segment the transcript ────────────────────────────
        sentences = re.split(r'(?<=[.!?])\s+', full_transcript)
        segments, current, current_len = [], [], 0

        for sentence in sentences:
            current.append(sentence)
            current_len += len(sentence)
            if current_len >= self.MAX_INPUT_CHARS:
                segments.append(" ".join(current))
                current, current_len = [], 0
        if current:
            segments.append(" ".join(current))

        # ── Summarise each segment ────────────────────────────
        summaries = []
        for i, seg in enumerate(segments):
            print(f"[NoteStructurer] Summarising segment {i+1}/{len(segments)}…")
            summary = self._summarise_segment(seg)
            if summary:
                summaries.append(summary)

        # ── Build structured output ───────────────────────────
        word_count = len(full_transcript.split())

        # Extract a title from the first summary sentence
        title = "Lecture Notes"
        if summaries:
            first_sent = re.split(r'[.!?]', summaries[0])[0].strip()
            if 10 < len(first_sent) < 80:
                title = first_sent

        # ── Build sections with heading + definition + key_points ──
        # Each section gets:
        #   heading    – 4-6 word topic label
        #   definition – the full T5 summary paragraph
        #   key_points – individual sentences extracted from the summary
        sections = []
        for i, summary in enumerate(summaries):
            # Derive a short heading from the summary
            heading = f"Section {i + 1}"
            words = summary.split()
            if len(words) >= 5:
                heading_candidate = " ".join(words[:5]).rstrip(".,;:")
                if len(heading_candidate) < 60:
                    heading = heading_candidate.title()

            # Extract key points: split on sentence boundaries
            raw_sentences = re.split(r'(?<=[.!?])\s+', summary.strip())
            key_pts = [s.strip() for s in raw_sentences if len(s.strip()) > 20]

            sections.append({
                "heading":    heading,
                "definition": summary,        # full paragraph
                "key_points": key_pts,        # bullet sentences
            })

        # Top-level key_points = first sentence of every section (overview bullets)
        overview_points = [
            re.split(r'[.!?]', s)[0].strip()
            for s in summaries
            if s.strip()
        ]

        return {
            "title":           title,
            "summary":         summaries[0] if summaries else "No summary available.",
            "key_points":      overview_points,
            "sections":        sections,
            "full_transcript": full_transcript,
            "word_count":      word_count,
        }

    # ─────────────────────────────────────────────────────────
    #  Plain text rendition (for TXT download / DB notes_text)
    # ─────────────────────────────────────────────────────────
    @staticmethod
    def to_plain_text(notes_dict: dict) -> str:
        lines = [
            "=" * 60,
            f"  {notes_dict.get('title', 'LECTURE NOTES').upper()}",
            "=" * 60,
            "",
            f"Words transcribed: {notes_dict.get('word_count', 0)}",
            "",
        ]

        # ── Overview ──────────────────────────────────────────
        summary = notes_dict.get("summary", "")
        if summary:
            lines += ["─" * 60, "  OVERVIEW", "─" * 60, "", f"  {summary}", ""]

        # ── Sections: Heading → Definition → Key Points ───────
        sections = notes_dict.get("sections", [])
        if sections:
            lines += ["─" * 60, "  DETAILED NOTES", "─" * 60, ""]
            for i, sec in enumerate(sections, 1):
                lines.append(f"\n  {i}. {sec['heading'].upper()}")
                lines.append(f"  {'─' * 50}")
                lines.append(f"  {sec.get('definition', sec.get('content', ''))}")
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
            "  Generated by AudioNotes AI",
            "=" * 60,
        ]
        return "\n".join(lines)
