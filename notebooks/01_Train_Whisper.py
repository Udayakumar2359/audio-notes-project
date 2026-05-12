# train_whisper_local.py — complete local training script
import os, gc, shutil, torch
from dataclasses import dataclass
from typing import Any, Dict, List
from datasets import load_from_disk, concatenate_datasets
from transformers import (
    WhisperForConditionalGeneration,
    WhisperProcessor,
    Seq2SeqTrainingArguments,
    Seq2SeqTrainer,
)
import evaluate
from huggingface_hub import login
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

# ── CONFIG ────────────────────────────────────────────
DRIVE_BASE   = r"G:\My Drive\classroom_project"        # Google Drive source (slow)
DRIVE_DATA   = os.path.join(DRIVE_BASE, "datasets")

LOCAL_BASE   = r"D:\audio_notes_project\local_cache"  # Fast local SSD cache
LOCAL_DATA   = os.path.join(LOCAL_BASE, "datasets")
CKPT_DIR     = os.path.join(LOCAL_BASE, "whisper_checkpoint")  # checkpoints on local SSD

HUB_MODEL = "udayakumar8214/whisper-classroom-kn-hi-en"
HF_TOKEN  = os.environ.get("HF_TOKEN", "")           # loaded from .env
MODEL     = "openai/whisper-small"

os.makedirs(CKPT_DIR, exist_ok=True)

# ── VERIFY GPU ────────────────────────────────────────
print(f"CUDA available : {torch.cuda.is_available()}")
print(f"GPU            : {torch.cuda.get_device_name(0)}")
print(f"VRAM           : {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

# ── LOGIN TO HUGGINGFACE ──────────────────────────────
login(token=HF_TOKEN)

# ── LOAD ALL 5 SPLITS (with local SSD cache) ─────────
# On first run: copies from slow Google Drive → fast local SSD (~one-time cost)
# On subsequent runs: loads instantly from local SSD via memory-mapped Arrow files
SPLIT_NAMES = ["processed_kn_1", "processed_kn_2", "processed_hi_1", "processed_hi_2", "processed_en"]
os.makedirs(LOCAL_DATA, exist_ok=True)

def get_local_path(name):
    local = os.path.join(LOCAL_DATA, name)
    drive = os.path.join(DRIVE_DATA, name)
    if not os.path.exists(local):
        print(f"  [{name}] Not in local cache — copying from Drive (one-time)...")
        shutil.copytree(drive, local)
        print(f"  [{name}] Copied ✓")
    return local

print("Loading splits (from local SSD cache)...")
datasets_list = []
for name in SPLIT_NAMES:
    path = get_local_path(name)
    ds = load_from_disk(path)
    print(f"  {name}: {len(ds)} rows")
    datasets_list.append(ds)

processed = concatenate_datasets(datasets_list).shuffle(seed=42)
del datasets_list; gc.collect()
print(f"Total: {len(processed)} rows | Columns: {processed.column_names}")

split = processed.train_test_split(test_size=0.05, seed=42)
print(f"Train: {len(split['train'])}  Eval: {len(split['test'])}")

# ── PROCESSOR + MODEL ────────────────────────────────
processor = WhisperProcessor.from_pretrained(MODEL, language=None, task="transcribe")
model     = WhisperForConditionalGeneration.from_pretrained(MODEL)
model.generation_config.language           = None
model.generation_config.task              = "transcribe"
model.generation_config.forced_decoder_ids = None

# ── DATA COLLATOR ─────────────────────────────────────
@dataclass
class SpeechCollator:
    processor: Any
    decoder_start_token_id: int

    def __call__(self, features: List[Dict]) -> Dict[str, torch.Tensor]:
        inp   = [{"input_features": f["input_features"]} for f in features]
        batch = self.processor.feature_extractor.pad(inp, return_tensors="pt")
        lbl   = [{"input_ids": f["labels"]} for f in features]
        lb    = self.processor.tokenizer.pad(lbl, return_tensors="pt")
        labels = lb["input_ids"].masked_fill(lb.attention_mask.ne(1), -100)
        if (labels[:, 0] == self.decoder_start_token_id).all().cpu().item():
            labels = labels[:, 1:]
        batch["labels"] = labels
        return batch

collator = SpeechCollator(
    processor=processor,
    decoder_start_token_id=model.config.decoder_start_token_id,
)

# ── METRICS ───────────────────────────────────────────
wer_metric = evaluate.load("wer")

def compute_metrics(pred):
    pred_ids  = pred.predictions
    label_ids = pred.label_ids
    label_ids[label_ids == -100] = processor.tokenizer.pad_token_id
    pred_str  = processor.tokenizer.batch_decode(pred_ids,  skip_special_tokens=True)
    label_str = processor.tokenizer.batch_decode(label_ids, skip_special_tokens=True)
    return {"wer": round(100 * wer_metric.compute(
        predictions=pred_str, references=label_str), 2)}

# ── TRAINING ARGS ─────────────────────────────────────
# RTX 3040 has 8 GB VRAM — these settings fit comfortably
import transformers
from packaging import version
use_new = version.parse(transformers.__version__) >= version.parse("4.41.0")
strategy_key = "eval_strategy" if use_new else "evaluation_strategy"

args = Seq2SeqTrainingArguments(
    output_dir=CKPT_DIR,
    per_device_train_batch_size=8,       # safe for RTX 3040 8GB
    gradient_accumulation_steps=2,
    per_device_eval_batch_size=8,
    learning_rate=1e-5,
    warmup_steps=100,
    max_steps=2000,
    gradient_checkpointing=True,
    fp16=True,                           # VRAM-efficient half precision
    **{strategy_key: "steps"},
    save_strategy="steps",
    eval_steps=500,
    save_steps=500,
    predict_with_generate=True,
    generation_max_length=225,
    logging_steps=50,
    report_to=["tensorboard"],
    load_best_model_at_end=True,
    metric_for_best_model="wer",
    greater_is_better=False,
    push_to_hub=True,
    hub_model_id=HUB_MODEL,
)

# ── TRAINER ───────────────────────────────────────────
trainer = Seq2SeqTrainer(
    args=args,
    model=model,
    train_dataset=split["train"],
    eval_dataset=split["test"],
    data_collator=collator,
    compute_metrics=compute_metrics,
    processing_class=processor,             # works transformers 4.40 → 5.x
)

# ── TRAIN ─────────────────────────────────────────────
print("\nStarting training on RTX 3040...")
print(f"Checkpoints → {CKPT_DIR}")
trainer.train()

trainer.push_to_hub()
print(f"\nDone! Model at: https://huggingface.co/{HUB_MODEL}")