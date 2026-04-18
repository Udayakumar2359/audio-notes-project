# backend/ml/audio_processor.py
# ─────────────────────────────────────────────────────────────
# Audio Processing Pipeline:
#   1. Convert any format → 16kHz mono WAV
#   2. Remove background noise (spectral subtraction)
#   3. Chunk into ~25-second segments
# ─────────────────────────────────────────────────────────────

import os
import librosa
import soundfile as sf

# noisereduce may not be installed in mock mode — import safely
try:
    import noisereduce as nr
    NR_AVAILABLE = True
except ImportError:
    NR_AVAILABLE = False

# pydub requires ffmpeg — we search multiple locations so it works
# even before a shell restart after winget/choco install.
try:
    from pydub import AudioSegment
    from pydub.silence import split_on_silence
    import shutil as _shutil, os as _os

    def _find_ffmpeg() -> str:
        # 1. Already on PATH (works after shell restart)
        p = _shutil.which("ffmpeg")
        if p:
            return p
        # 2. Winget install location (Gyan.FFmpeg)
        _user = _os.environ.get("USERNAME", "udaya")
        _winget = (
            rf"C:\Users\{_user}\AppData\Local\Microsoft\WinGet\Packages"
            rf"\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe"
            rf"\ffmpeg-8.1-full_build\bin\ffmpeg.exe"
        )
        if _os.path.exists(_winget):
            return _winget
        # 3. Older winget path variants
        _base = rf"C:\Users\{_user}\AppData\Local\Microsoft\WinGet\Packages"
        if _os.path.isdir(_base):
            for pkg in _os.listdir(_base):
                if "FFmpeg" in pkg or "ffmpeg" in pkg:
                    candidate = _os.path.join(_base, pkg, "ffmpeg.exe")
                    for root, dirs, files in _os.walk(_os.path.join(_base, pkg)):
                        for fname in files:
                            if fname == "ffmpeg.exe":
                                return _os.path.join(root, fname)
        # 4. Common manual install paths
        for loc in [
            r"C:\ffmpeg\bin\ffmpeg.exe",
            r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
            r"C:\ProgramData\chocolatey\bin\ffmpeg.exe",
        ]:
            if _os.path.exists(loc):
                return loc
        return ""

    _ffmpeg_path = _find_ffmpeg()
    if _ffmpeg_path:
        AudioSegment.converter = _ffmpeg_path
        print(f"[AudioProcessor] ffmpeg -> {_ffmpeg_path}")
    else:
        print("[AudioProcessor] WARNING: ffmpeg not found — audio conversion will fail!")
        print("  Fix: run  winget install Gyan.FFmpeg  then restart terminal")

    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False



def convert_to_wav(input_path: str, output_path: str) -> str:
    """
    Convert any audio format (.mp3, .m4a, .ogg, etc.) to
    16 000 Hz mono WAV — the format expected by Whisper.

    Returns the output_path on success.
    Raises RuntimeError if pydub / ffmpeg is not installed.
    """
    if not PYDUB_AVAILABLE:
        raise RuntimeError(
            "pydub is not installed. Run: pip install pydub  "
            "Also make sure ffmpeg is on your system PATH."
        )

    audio = AudioSegment.from_file(input_path)
    audio = audio.set_channels(1).set_frame_rate(16_000)
    audio.export(output_path, format="wav")
    print(f"[AudioProcessor] Converted → {output_path}")
    return output_path


def remove_noise(wav_path: str, output_path: str) -> str:
    """
    Apply non-stationary spectral noise reduction using noisereduce.
    Falls back to a simple copy if noisereduce is not available.

    Returns output_path.
    """
    if not NR_AVAILABLE:
        # Graceful fallback: just copy the file
        import shutil
        shutil.copy2(wav_path, output_path)
        print("[AudioProcessor] noisereduce not available — skipping noise reduction.")
        return output_path

    audio, sr = librosa.load(wav_path, sr=16_000)
    reduced   = nr.reduce_noise(y=audio, sr=sr, stationary=False, prop_decrease=0.75)
    sf.write(output_path, reduced, sr)
    print(f"[AudioProcessor] Noise removed → {output_path}")
    return output_path


def chunk_audio(wav_path: str, output_dir: str, chunk_duration_ms: int = 25_000) -> list:
    """
    Split a WAV file into segments of ~25 seconds.

    Strategy:
      1. Try splitting on silence (natural speech pauses).
      2. Fall back to fixed-size chunking if no silence is found.

    Returns a list of dicts:
        [{"index": 0, "path": "...", "start": 0.0, "end": 25.0}, ...]
    """
    if not PYDUB_AVAILABLE:
        raise RuntimeError("pydub is required for audio chunking.")

    os.makedirs(output_dir, exist_ok=True)
    audio  = AudioSegment.from_wav(wav_path)
    chunks = []

    # ── Attempt silence-based splitting ──
    silence_chunks = split_on_silence(
        audio,
        min_silence_len=500,         # silence must be ≥ 500 ms
        silence_thresh=audio.dBFS - 14,
        keep_silence=300,            # keep 300 ms padding
    )

    if silence_chunks:
        # Merge tiny segments so each chunk is ≥ 5 seconds
        merged, current = [], AudioSegment.empty()
        for seg in silence_chunks:
            current += seg
            if len(current) >= chunk_duration_ms:
                merged.append(current)
                current = AudioSegment.empty()
        if len(current) > 1_000:    # keep leftovers > 1 second
            merged.append(current)

        for i, chunk in enumerate(merged):
            path = os.path.join(output_dir, f"chunk_{i:03d}.wav")
            chunk.export(path, format="wav")
            chunks.append({
                "index": i,
                "path":  path,
                "start": 0.0,
                "end":   len(chunk) / 1_000.0,
            })
    else:
        # ── Fixed-size fallback ──
        total_ms = len(audio)
        for i, start_ms in enumerate(range(0, total_ms, chunk_duration_ms)):
            end_ms   = min(start_ms + chunk_duration_ms, total_ms)
            chunk    = audio[start_ms:end_ms]
            path     = os.path.join(output_dir, f"chunk_{i:03d}.wav")
            chunk.export(path, format="wav")
            chunks.append({
                "index": i,
                "path":  path,
                "start": start_ms / 1_000.0,
                "end":   end_ms   / 1_000.0,
            })

    print(f"[AudioProcessor] Created {len(chunks)} chunks in {output_dir}")
    return chunks
