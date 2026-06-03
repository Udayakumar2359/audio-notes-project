# backend/ml/__init__.py
# ML pipeline modules:
#   audio_processor  — convert, denoise, chunk audio
#   cleaner          — remove ASR fillers & duplicates (rule-based)
#   transcriber      — Whisper ASR + lang detect + translate
#   model_registry   — singleton loader for Whisper + Qwen2.5-7B
#   qwen_generator   — centralized generate(prompt) function (Qwen2.5-7B-Instruct)
#   nlp_agent        — 4-stage NLP pipeline: clean → reconstruct → topics → hierarchical notes
#   pipeline         — central orchestration (audio → transcript → Qwen notes)
#   exporter         — TXT, DOCX, PDF export
