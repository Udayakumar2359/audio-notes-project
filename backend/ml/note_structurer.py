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
    MAX_OUTPUT_TOKENS = 180
    NUM_BEAMS         = 4

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

        with torch.no_grad():
            output_ids = self.model.generate(
                **tokens,
                max_length=self.MAX_OUTPUT_TOKENS,
                num_beams=self.NUM_BEAMS,
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

        # Build sections: pair each summary with a generated heading
        sections = []
        for i, summary in enumerate(summaries):
            heading = f"Section {i + 1}"
            # Try to extract a meaningful heading from the summary
            words = summary.split()
            if len(words) >= 5:
                # Use first 4-6 words as a heading
                heading_candidate = " ".join(words[:5]).rstrip(".,;:")
                if len(heading_candidate) < 60:
                    heading = heading_candidate.title()
            sections.append({
                "heading": heading,
                "content": summary,
            })

        # Key points = all summaries as bullet items
        key_points = [s.strip() for s in summaries if s.strip()]

        return {
            "title":           title,
            "summary":         summaries[0] if summaries else "No summary available.",
            "key_points":      key_points,
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

        key_points = notes_dict.get("key_points", [])
        if key_points:
            lines += ["─" * 60, "  KEY POINTS", "─" * 60, ""]
            for i, pt in enumerate(key_points, 1):
                lines.append(f"  {i}. {pt}")
            lines.append("")

        sections = notes_dict.get("sections", [])
        if sections:
            lines += ["─" * 60, "  DETAILED NOTES", "─" * 60, ""]
            for sec in sections:
                lines.append(f"\n▶  {sec['heading']}")
                lines.append(f"   {sec['content']}")
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
