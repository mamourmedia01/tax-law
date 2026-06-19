"""Fable+ Voice service (FW32) — HTTP wrapper around the VibeVoice TTS engine.

Run:  uvicorn app:app --host 0.0.0.0 --port 8900
The Node backend talks to this over HTTP (VOICE_SERVICE_URL); if it's absent, the
backend falls back to its own sandbox stub, so nothing breaks.
"""

from __future__ import annotations

import base64

from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel

import voice_engine

app = FastAPI(title="Fable+ Voice", version="0.1.0")


class SynthRequest(BaseModel):
    text: str
    speaker: str = "agent"
    # base64=True returns JSON {audioBase64, mode}; otherwise raw audio/wav bytes
    base64: bool = True


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True, "mode": voice_engine.mode(), "sampleRate": voice_engine.SAMPLE_RATE}


@app.post("/synthesize")
def synthesize(req: SynthRequest):
    wav = voice_engine.synthesize(req.text, req.speaker)
    if req.base64:
        return {"audioBase64": base64.b64encode(wav).decode("ascii"), "mode": voice_engine.mode()}
    return Response(content=wav, media_type="audio/wav")
