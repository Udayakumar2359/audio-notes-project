# backend/ml/__init__.py
# ML pipeline modules:
#   audio_processor  — convert, denoise, chunk
#   cleaner          — remove fillers & duplicates
#   transcriber      — Whisper ASR + lang detect + translate
#   note_structurer  — T5 note generation
#   pipeline         — central orchestration
#   exporter         — TXT, DOCX, PDF export
