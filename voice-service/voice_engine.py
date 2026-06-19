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

_model = None  # lazily loaded real model handle


def mode() -> str:
    return "vibevoice" if MODEL_ID else "sandbox"


def _load_vibevoice():
    """Load the real VibeVoice model once. Only called when VIBEVOICE_MODEL is set."""
    global _model
    if _model is not None:
        return _model
    # Imports are inside the function so the sandbox has zero heavy deps.
    import torch  # noqa: F401
    from vibevoice import VibeVoiceForConditionalGeneration, VibeVoiceProcessor  # type: ignore

    processor = VibeVoiceProcessor.from_pretrained(MODEL_ID)
    model = VibeVoiceForConditionalGeneration.from_pretrained(
        MODEL_ID, torch_dtype="auto", device_map="auto"
    )
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


def synthesize(text: str, speaker: str = "agent") -> bytes:
    """Return WAV bytes for `text`. Uses VibeVoice when configured, else the sandbox tone."""
    if not MODEL_ID:
        return _sandbox_wav(text, speaker)

    processor, model = _load_vibevoice()
    # NOTE: exact call shape follows the VibeVoice API; adjust to the installed version.
    inputs = processor(text=[text], return_tensors="pt").to(model.device)
    output = model.generate(**inputs)  # produces audio tensor(s)
    audio = output.audios[0] if hasattr(output, "audios") else output[0]

    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for s in audio.detach().cpu().numpy().tolist():
            frames += struct.pack("<h", max(-32768, min(32767, int(s * 32767))))
        w.writeframes(bytes(frames))
    return buf.getvalue()
