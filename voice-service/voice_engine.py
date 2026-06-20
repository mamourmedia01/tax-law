"""Voice synthesis engine for Fable+ (FW32).

This is the *seam* where Microsoft VibeVoice plugs in.

- Sandbox mode (default): no GPU, no weights — synthesises a short placeholder tone
  using only the stdlib so the receptionist pipeline runs end-to-end and is testable.
- Real mode: set VIBEVOICE_MODEL (a local path or HF id like "microsoft/VibeVoice-1.5B")
  and install the deps in requirements.txt; `_load_vibevoice()` loads it once and
  `synthesize()` returns real long-form, multi-speaker audio.

VibeVoice: https://github.com/microsoft/VibeVoice
"""

from __future__ import annotations

import io
import math
import os
import struct
import wave

SAMPLE_RATE = 24_000
MODEL_ID = os.environ.get("VIBEVOICE_MODEL", "").strip()
# Reference voice sample (wav) that VibeVoice clones the timbre from. One per speaker
# role; falls back to a single sample for both. Without a sample VibeVoice uses a
# default voice. CFG scale controls adherence to the reference (1.3 is the documented
# default for the 1.5B model).
VOICE_SAMPLE_AGENT = os.environ.get("VIBEVOICE_VOICE_AGENT", os.environ.get("VIBEVOICE_VOICE_SAMPLE", "")).strip()
VOICE_SAMPLE_CALLER = os.environ.get("VIBEVOICE_VOICE_CALLER", VOICE_SAMPLE_AGENT).strip()
CFG_SCALE = float(os.environ.get("VIBEVOICE_CFG_SCALE", "1.3"))

_model = None  # lazily loaded real model handle


def mode() -> str:
    return "vibevoice" if MODEL_ID else "sandbox"


def _load_vibevoice():
    """Load the real VibeVoice model once. Only called when VIBEVOICE_MODEL is set."""
    global _model
    if _model is not None:
        return _model
    # Imports are inside the function so the sandbox has zero heavy deps.
    import torch
    from vibevoice.modular.modeling_vibevoice_inference import (  # type: ignore
        VibeVoiceForConditionalGenerationInference,
    )
    from vibevoice.processor.vibevoice_processor import VibeVoiceProcessor  # type: ignore

    processor = VibeVoiceProcessor.from_pretrained(MODEL_ID)
    model = VibeVoiceForConditionalGenerationInference.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.bfloat16,
        device_map="cuda" if torch.cuda.is_available() else "cpu",
    )
    model.eval()
    model.set_ddpm_inference_steps(num_steps=int(os.environ.get("VIBEVOICE_DDPM_STEPS", "10")))
    _model = (processor, model)
    return _model


def _sandbox_wav(text: str, speaker: str) -> bytes:
    """A short, deterministic placeholder tone — proves the pipeline without a GPU.

    Pitch varies by speaker; duration scales with text length (capped) so it
    behaves like real synthesis for timing/integration tests.
    """
    base = 196.0 if speaker == "agent" else 247.0  # G3 vs B3
    seconds = max(0.4, min(4.0, len(text) / 25.0))
    n = int(SAMPLE_RATE * seconds)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for i in range(n):
            # gentle fade in/out so it isn't a harsh beep
            env = min(1.0, i / 1200.0, (n - i) / 1200.0)
            sample = 0.18 * env * math.sin(2 * math.pi * base * (i / SAMPLE_RATE))
            frames += struct.pack("<h", int(sample * 32767))
        w.writeframes(bytes(frames))
    return buf.getvalue()


def _pcm16_wav(samples, sample_rate: int = SAMPLE_RATE) -> bytes:
    """Pack a float32 [-1,1] mono waveform into a 16-bit PCM WAV."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        frames = bytearray()
        for s in samples:
            frames += struct.pack("<h", max(-32768, min(32767, int(float(s) * 32767))))
        w.writeframes(bytes(frames))
    return buf.getvalue()


def synthesize(text: str, speaker: str = "agent") -> bytes:
    """Return WAV bytes for `text`. Uses VibeVoice when configured, else the sandbox tone."""
    if not MODEL_ID:
        return _sandbox_wav(text, speaker)

    processor, model = _load_vibevoice()

    # VibeVoice consumes a *script* with explicit speaker turns ("Speaker N: ...") and,
    # optionally, a reference voice sample per speaker to clone the timbre. We render a
    # single-turn script for the receptionist's line.
    script = f"Speaker 0: {text}"
    sample = VOICE_SAMPLE_AGENT if speaker == "agent" else VOICE_SAMPLE_CALLER
    voice_samples = [[sample]] if sample else None

    inputs = processor(
        text=[script],
        voice_samples=voice_samples,
        padding=True,
        return_tensors="pt",
    )
    inputs = {k: (v.to(model.device) if hasattr(v, "to") else v) for k, v in inputs.items()}

    outputs = model.generate(
        **inputs,
        tokenizer=processor.tokenizer,
        cfg_scale=CFG_SCALE,
        generation_config={"do_sample": False},
    )

    # Inference model returns generated audio in `speech_outputs` (list of tensors);
    # tolerate a couple of shapes across versions.
    audio_t = None
    for attr in ("speech_outputs", "audios"):
        val = getattr(outputs, attr, None)
        if val:
            audio_t = val[0]
            break
    if audio_t is None:
        audio_t = outputs[0]

    samples = audio_t.detach().to("cpu").float().numpy().reshape(-1).tolist()
    out_rate = getattr(getattr(processor, "audio_processor", None), "sampling_rate", SAMPLE_RATE)
    return _pcm16_wav(samples, int(out_rate))
