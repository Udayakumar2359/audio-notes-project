# backend/ml/note_structurer.py
# ─────────────────────────────────────────────────────────────
# Note Structuring Pipeline
#
# Model: allenai/led-base-16384  (Longformer Encoder-Decoder)
# Long-document abstractive summarisation — handles full lecture
# transcripts up to 16 384 tokens in a single pass (no chunking).
#
# Output shape (same dict schema as before, so the rest of the
# codebase is unaffected):
#   {title, summary, key_points, sections, full_transcript, word_count}
# ─────────────────────────────────────────────────────────────

from __future__ import annotations
import os
import re
import json
import torch
from transformers import AutoTokenizer, LEDForConditionalGeneration


class NoteStructurer:
    """
    Wraps the LED-base-16384 model.
    Converts a full English transcript → structured notes dict.
    """

    # LED can handle up to 16 384 tokens; we cap slightly below to stay safe
    MAX_INPUT_TOKENS  = 14_336
    MAX_OUTPUT_TOKENS = int(os.getenv("LED_MAX_OUTPUT", "1024"))
    NUM_BEAMS         = int(os.getenv("T5_BEAMS", "2"))      # env reuse for compat

    def __init__(self, model_id: str):
        self.device   = "cuda" if torch.cuda.is_available() else "cpu"
        hf_token      = os.getenv("HF_TOKEN")
        print(f"[NoteStructurer] Loading LED model: {model_id}")
        self.tokenizer = AutoTokenizer.from_pretrained(model_id, token=hf_token)
        self.model     = LEDForConditionalGeneration.from_pretrained(
            model_id, token=hf_token
        ).to(self.device)
        print("[NoteStructurer] LED model loaded ✓")

    # ─────────────────────────────────────────────────────────
    #  Internal: summarise the full transcript in one pass
    # ─────────────────────────────────────────────────────────
    def _summarise(self, text: str) -> str:
        """Run LED summarisation on the full transcript."""
        # LED accepts long input without a task prefix
        inputs = self.tokenizer(
            text,
            return_tensors="pt",
            max_length=self.MAX_INPUT_TOKENS,
            truncation=True,
            padding="longest",
        ).to(self.device)

        # LED requires global_attention_mask on the first token
        global_attention_mask = torch.zeros_like(inputs["input_ids"])
        global_attention_mask[:, 0] = 1          # attend globally on <s>

        with torch.inference_mode():
            output_ids = self.model.generate(
                input_ids=inputs["input_ids"],
                attention_mask=inputs["attention_mask"],
                global_attention_mask=global_attention_mask,
                max_length=self.MAX_OUTPUT_TOKENS,
                num_beams=self.NUM_BEAMS,
                no_repeat_ngram_size=3,
                length_penalty=2.0,
                early_stopping=True,
            )
        return self.tokenizer.decode(output_ids[0], skip_special_tokens=True).strip()

    # ─────────────────────────────────────────────────────────
    #  Public: transcript → structured notes dict
    # ─────────────────────────────────────────────────────────
    def structure_notes(self, full_transcript: str) -> dict:
        """
        Run LED on the full transcript and return a structured dict:
          title          – derived from first sentence of summary
          summary        – full LED output (flowing paragraph)
          key_points     – individual sentences from the summary
          sections       – each sentence-group wrapped as a section
          full_transcript
          word_count
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

        word_count = len(full_transcript.split())
        print("[NoteStructurer] Running LED summarisation…")
        summary_text = self._summarise(full_transcript)
        print(f"[NoteStructurer] Summary: {len(summary_text)} chars ✓")

        # ── Extract title from the first sentence ─────────────
        title = "Lecture Notes"
        first_sent = re.split(r"[.!?]", summary_text)[0].strip()
        if 10 < len(first_sent) < 100:
            title = first_sent

        # ── Split into individual sentences for key_points ────
        raw_sentences = re.split(r"(?<=[.!?])\s+", summary_text.strip())
        sentences     = [s.strip() for s in raw_sentences if len(s.strip()) > 20]

        # ── Build sections: group every 2-3 sentences together ─
        GROUP_SIZE = 3
        sections   = []
        for i in range(0, len(sentences), GROUP_SIZE):
            group   = sentences[i : i + GROUP_SIZE]
            para    = " ".join(group)
            # Short heading from first 6 words of first sentence
            words   = group[0].split()
            heading = " ".join(words[:6]).rstrip(".,;:") if len(words) >= 5 else f"Section {len(sections)+1}"
            heading = heading.title()
            sections.append({
                "heading":    heading,
                "definition": para,          # full paragraph for this section
                "key_points": group,         # individual bullet sentences
            })

        # Top-level key_points = one bullet per section (first sentence each)
        key_points = [sec["key_points"][0] for sec in sections if sec["key_points"]]

        return {
            "title":           title,
            "summary":         summary_text,   # full LED output shown as Overview
            "key_points":      key_points,
            "sections":        sections,
            "full_transcript": full_transcript,
            "word_count":      word_count,
        }

    # ─────────────────────────────────────────────────────────
    #  Plain text rendition (TXT download / DB notes_text)
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

        summary = notes_dict.get("summary", "")
        if summary:
            lines += ["─" * 60, "  OVERVIEW", "─" * 60, "", f"  {summary}", ""]

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
