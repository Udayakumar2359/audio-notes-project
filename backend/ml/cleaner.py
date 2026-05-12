# backend/ml/cleaner.py
# ─────────────────────────────────────────────────────────────
# Transcript Cleaning Pipeline
#
# Removes: filler words, hallucinations, duplicate sentences,
#          noise tags, excessive punctuation,
#          Whisper loop-hallucinations (repeated phrase patterns)
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
    "don't forget to subscribe",
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

# ── Whisper speech density: max realistic words per second ────
# 250 wpm / 60 = ~4.2 words/sec.  >5 words/sec = hallucination
MAX_WORDS_PER_SECOND = 5.0

# ── Minimum phrase length for repetition detection ───────────
# Catch "or a delicious, or a delicious, ..." patterns
_MIN_PHRASE_REPEAT = 4     # phrase must repeat ≥ 4 times to be flagged
_MAX_PHRASE_WORDS  = 8     # phrase length to check (2..8 words)


# ─────────────────────────────────────────────────────────────
#  Hallucination Loop Detector
# ─────────────────────────────────────────────────────────────

def is_hallucination_loop(text: str, audio_duration_s: float = 0.0) -> bool:
    """
    Returns True if `text` looks like a Whisper loop hallucination.

    Two checks:
      1. Word density > MAX_WORDS_PER_SECOND  (too many words for the clip)
      2. Any 2-8 word phrase repeats ≥ 4 consecutive times

    Example hallucination: "or a delicious, or a delicious, or a delicious, ..."
    """
    if not text or not text.strip():
        return False

    words = text.split()
    n     = len(words)

    # Check 1: density (only when we know the duration)
    if audio_duration_s > 0 and n > 0:
        density = n / audio_duration_s
        if density > MAX_WORDS_PER_SECOND:
            print(f"[Cleaner] Density hallucination: {density:.1f} words/s > {MAX_WORDS_PER_SECOND}  → discarding")
            return True

    # Check 2: consecutive phrase repetition
    for phrase_len in range(2, min(_MAX_PHRASE_WORDS + 1, n // _MIN_PHRASE_REPEAT + 1)):
        for start in range(n - phrase_len * _MIN_PHRASE_REPEAT + 1):
            phrase = words[start: start + phrase_len]
            count  = 1
            pos    = start + phrase_len
            while pos + phrase_len <= n and words[pos: pos + phrase_len] == phrase:
                count += 1
                pos   += phrase_len
            if count >= _MIN_PHRASE_REPEAT:
                snippet = ' '.join(phrase)
                print(f"[Cleaner] Loop hallucination detected: '{snippet}' × {count}  → discarding")
                return True

    return False


def _remove_partial_repeats(text: str) -> str:
    """
    Remove non-consecutive repeated phrases that appear ≥ 3 times anywhere
    in the text (looser version for partial hallucinations, keeps first occurrence).
    """
    words = text.split()
    n     = len(words)
    if n < 9:
        return text

    for phrase_len in range(3, min(7, n // 3 + 1)):
        phrase_counts: dict = {}
        for i in range(n - phrase_len + 1):
            key = tuple(words[i: i + phrase_len])
            phrase_counts[key] = phrase_counts.get(key, 0) + 1

        for key, cnt in phrase_counts.items():
            if cnt >= 3:
                # Remove all but first occurrence
                pattern = r'(?<!\w)' + r'\s+'.join(re.escape(w) for w in key) + r'(?!\w)'
                occurrences = [m.start() for m in re.finditer(pattern, text, re.IGNORECASE)]
                if len(occurrences) >= 3:
                    # Keep first, remove rest
                    for occ in reversed(occurrences[1:]):
                        text = text[:occ] + text[occ + len(' '.join(key)):]
                    text = re.sub(r'\s{2,}', ' ', text).strip()
                    words = text.split()
                    n     = len(words)
    return text


# ─────────────────────────────────────────────────────────────
#  Main cleaning pipeline
# ─────────────────────────────────────────────────────────────

def clean_transcript(raw: str, audio_duration_s: float = 0.0) -> str:
    """
    Full cleaning pipeline for a raw ASR transcript segment.

    Steps:
      0. Hallucination loop check → return '' immediately if detected
      1. Remove noise tags and HTML
      2. Strip hallucination phrases
      3. Remove filler words
      4. Remove word repetitions (stutter: "the the")
      5. Deduplicate sentences
      6. Remove sentences shorter than 4 words
      7. Remove partial repeated phrases (≥ 3 occurrences)
      8. Normalize whitespace and punctuation

    Returns cleaned text string (empty string if hallucination detected).
    """
    if not raw or not raw.strip():
        return ''

    text = raw.strip()

    # Step 0: Fast hallucination loop check
    if is_hallucination_loop(text, audio_duration_s):
        return ''

    # Step 1: Remove noise tags
    for pattern in NOISE_TAGS:
        text = re.sub(pattern, ' ', text, flags=re.IGNORECASE)

    # Step 2: Strip hallucination sentences
    lower = text.lower()
    for phrase in HALLUCINATION_PHRASES:
        if phrase in lower:
            sentences = re.split(r'(?<=[.!?])\s+', text)
            text  = ' '.join(s for s in sentences if phrase not in s.lower())
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
    text = ' '.join(s for s in sentences if len(s.split()) >= 4)

    # Step 7: Remove partial repeated phrases
    text = _remove_partial_repeats(text)

    # Step 8: Normalize punctuation and whitespace
    text = re.sub(r'\.{2,}', '.', text)
    text = re.sub(r',{2,}', ',', text)
    text = re.sub(r'\s{2,}', ' ', text)
    text = re.sub(r'\s([.,!?;:])', r'\1', text)
    text = text.strip()

    return text
