# Fable+ Voice AI (FW32) — VibeVoice integration

The Voice AI receptionist answers a provider's calls, grounded in their real services and
availability. It can **propose** a booking but never creates one or takes payment — a human
approves every action (governance invariants I25/I28).

## Architecture

```
caller ──▶ telephony (Twilio)         [not yet wired]
        ──▶ ASR / speech-to-text (Whisper)   [not yet wired]
        ──▶ dialog planner (grounded)   ← built: server/src/voice.ts `receptionist()`
        ──▶ TTS (VibeVoice)             ← built: voice-service/ (sandbox stub today)
        ──▶ audio back to caller
```

Today the **dialog planner** and the **TTS service seam** are built and working in sandbox; ASR and
telephony are the remaining external legs.

## Where VibeVoice plugs in

- **`voice-service/`** — a Python FastAPI microservice that wraps
  [Microsoft VibeVoice](https://github.com/microsoft/VibeVoice). `voice_engine.py` is the seam:
  - **Sandbox** (default, no GPU): synthesises a short placeholder tone with the stdlib so the whole
    pipeline runs and is testable here.
  - **Real**: set `VIBEVOICE_MODEL` (a local path or HF id, e.g. `microsoft/VibeVoice-1.5B`), install
    the GPU deps (`torch`, `transformers`, `vibevoice`), and it loads the model once and returns real
    long-form, multi-speaker audio.
- **`server/src/voice.ts`** — the Node `VoiceProvider` adapter. With `VOICE_SERVICE_URL` set it calls
  the microservice over HTTP; without it, a built-in sandbox stub returns a valid silent WAV. Same
  swap-ready pattern as our Stripe/KYC/LLM adapters.

## Run it

```bash
# 1. the voice microservice (sandbox — no GPU needed)
cd voice-service && pip install -r requirements.txt && uvicorn app:app --port 8900

# 2. point the API at it
echo "VOICE_SERVICE_URL=http://localhost:8900" >> server/.env

# 3. (production) deploy voice-service on a GPU box and set:
#    VIBEVOICE_MODEL=microsoft/VibeVoice-1.5B   (or your local checkpoint path)
```

In the app: sign in as a **Fleet** provider (e.g. `gleamworks-detailing@provider.fableplus`) and open
**Voice receptionist** (`/voice`). Below Fleet the endpoint is tier-gated (403).

## Governance (enforced, tested)
- **Tier-gated** to Fleet (`/api/provider/voice/receptionist`).
- **Grounded** — replies built only from the org's own services/availability; no fabrication.
- **Suggest-never-act** — returns a `proposal`, never a created booking; **moves no money**
  (`server/test/voice.test.ts` asserts zero bookings and zero payments after a call).
- **Audited** — each turn logged with intent + `movedMoney: false`, no sensitive payload.

## Remaining to go fully live
Whisper ASR, Twilio (or similar) telephony for real phone numbers + call streaming, a GPU host for
VibeVoice, and barge-in/turn-taking. The seams above are in place for each.
