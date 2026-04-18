# backend/ml/cleaner.py
# ─────────────────────────────────────────────────────────────
# Transcript Cleaning Pipeline
#
# Removes: filler words, hallucinations, duplicate sentences,
#          noise tags, excessive punctuation
# ─────────────────────────────────────────────────────────────

import re

# ── Known Whisper hallucination phrases ──────────────────────
HALLUCINATION_PHRASES = {
    'thank you for watching',
    'thanks for watching',
    'please subscribe',
    'like and subscribe',
    'like share and subscribe',
    'see you in the next video',
    'see you next time',
    'thank you for listening',
    'thanks for listening',
    'stay tuned',
    'don\'t forget to subscribe',
    'hit the bell icon',
    'turn on notifications',
    'subscribe to my channel',
    'i hope you enjoyed this video',
    'if you have any questions',
    'leave a comment below',
    'music',
    '[music]',
    '[applause]',
    '[laughter]',
    '[noise]',
}

# ── Filler word patterns ──────────────────────────────────────
FILLER_PATTERNS = [
    r'\b(um+|uh+|hmm+|hm+|err+|ah+|oh+|mmm+|erm+)\b',
    r'\b(you know what i mean|you know|i mean)\b',
    r'\b(basically|literally|actually|frankly speaking)\b',
    r'\b(okay so|alright so|so basically|right so|so yeah)\b',
    r'\b(like i said|as i said|as i mentioned)\b',
    r'\b(sort of|kind of|type of thing)\b',
]

# ── Noise tags ────────────────────────────────────────────────
NOISE_TAGS = [
    r'\[.*?\]',           # [Music], [Applause]
    r'\(.*?\)',           # (background noise)
    r'<[^>]*>',           # HTML tags if any
]


def clean_transcript(raw: str) -> str:
    """
    Full cleaning pipeline for a raw ASR transcript segment.

    Steps:
      1. Remove noise tags and HTML
      2. Strip hallucination phrases
      3. Remove filler words
      4. Remove word repetitions (stutter: "the the")
      5. Deduplicate sentences
      6. Remove sentences shorter than 4 words
      7. Normalize whitespace and punctuation

    Returns cleaned text string.
    """
    if not raw or not raw.strip():
        return ''

    text = raw.strip()

    # Step 1: Remove noise tags
    for pattern in NOISE_TAGS:
        text = re.sub(pattern, ' ', text, flags=re.IGNORECASE)

    # Step 2: Strip hallucination sentences
    lower = text.lower()
    for phrase in HALLUCINATION_PHRASES:
        if phrase in lower:
            # Remove any sentence containing this phrase
            sentences = re.split(r'(?<=[.!?])\s+', text)
            text = ' '.join(
                s for s in sentences
                if phrase not in s.lower()
            )
            lower = text.lower()

    # Step 3: Remove filler words
    for pattern in FILLER_PATTERNS:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE)

    # Step 4: Remove stuttered word repetitions ("the the the" → "the")
    text = re.sub(r'\b(\w+)( \1)+\b', r'\1', text, flags=re.IGNORECASE)

    # Step 5: Deduplicate consecutive duplicate sentences
    sentences = re.split(r'(?<=[.!?])\s+', text)
    seen, deduped = set(), []
    for s in sentences:
        normalized = re.sub(r'\s+', ' ', s.strip().lower())
        if normalized and normalized not in seen:
            seen.add(normalized)
            deduped.append(s.strip())
    text = ' '.join(deduped)

    # Step 6: Drop sentences with < 4 words (noise fragments)
    sentences = re.split(r'(?<=[.!?])\s+', text)
    text = ' '.join(
        s for s in sentences
        if len(s.split()) >= 4
    )

    # Step 7: Normalize punctuation and whitespace
    text = re.sub(r'\.{2,}', '.', text)       # "..." → "."
    text = re.sub(r',{2,}', ',', text)        # ",," → ","
    text = re.sub(r'\s{2,}', ' ', text)       # multiple spaces
    text = re.sub(r'\s([.,!?;:])', r'\1', text)  # space before punct
    text = text.strip()

    return text
