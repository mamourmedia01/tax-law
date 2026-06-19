# Fable Plus — Licenses & Acknowledgements

**Open-source components, fonts, and third-party services · Attribution and license reference · Confirm exact licenses at build time**

> This lists the categories of third-party software and services the platform is expected to use, and their license/attribution requirements. **Confirm the exact license of each dependency at the version you actually ship** (licenses change between versions). Include the relevant notices in-app (an "Open-source licenses" screen in Settings) where required.

---

## 1. Why this file exists

Most open-source licenses (MIT, Apache 2.0, BSD) permit commercial use but **require attribution** — keeping the copyright notice and license text. Some (copyleft, e.g. GPL/AGPL) impose stronger conditions and should be **avoided in proprietary components** unless deliberately chosen. This file is the checklist so the build stays compliant and an in-app acknowledgements screen ships with it.

---

## 2. Voice AI stack (if/when built — FW32)

| Component | Role | Typical license | Note |
|---|---|---|---|
| Pipecat | Voice orchestration | [BSD/Apache — confirm] | Attribution |
| LiveKit / LiveKit Agents | Realtime media + agent framework | Apache 2.0 [confirm] | Attribution |
| Whisper / Parakeet | Speech-to-text (if self-hosted) | [MIT / model license — confirm] | Check model license terms |
| Kokoro / XTTS / Piper | Text-to-speech (if self-hosted) | [varies — confirm per model] | Some TTS models have usage restrictions — verify |
| Silero VAD | Voice activity detection | [MIT — confirm] | Attribution |

If using **API models** instead (Deepgram, AssemblyAI, ElevenLabs, OpenAI, Anthropic, Google), these are **commercial services** under their own terms of service, not open-source licenses — comply with each provider's ToS and data terms.

## 3. AI orchestration & data (FW31)

| Component | Role | Typical license |
|---|---|---|
| LangChain / LlamaIndex | LLM orchestration / RAG | [MIT — confirm] |
| vLLM | LLM serving (if self-hosted) | Apache 2.0 [confirm] |
| Ollama | Local model running (dev) | [MIT — confirm] |

Production LLMs are accessed under the **model provider's commercial terms** (Anthropic Claude, OpenAI GPT, Google Gemini). Note the build-time vs run-time distinction (FW32 §2).

## 4. Fonts (The Gleam design system)

| Font | Use | License |
|---|---|---|
| Sora | Display | SIL Open Font License (OFL) — free for commercial use, attribution per OFL |
| Inter | Body | SIL Open Font License (OFL) — free for commercial use |

OFL fonts may be bundled and used commercially; keep the OFL notice. Storefront theming uses a **curated, licensed font library** only — never unlicensed fonts (FW29).

## 5. Frontend & app libraries (typical stack)

React / React Native, and common libraries (state, charts, mapping, UI) — predominantly **MIT/Apache/BSD**. Maintain a generated dependency manifest (e.g. from the package manager) and an in-app licenses screen listing them. Avoid GPL/AGPL libraries in the proprietary codebase unless explicitly approved.

## 6. Third-party services (commercial — under their ToS, not OSS licenses)

| Service | Role |
|---|---|
| Stripe (Connect, Identity, Radar, Invoicing) | Payments, payouts, KYC, fraud, invoicing |
| [Onfido] (if used) | Identity verification |
| Twilio / Telnyx / Vonage | Telephony for Voice AI + masked calling |
| DVLA Vehicle Enquiry Service | Number-plate → vehicle details |
| [Weather provider] | Weather-aware scheduling/nudges |
| Maps/geocoding provider | Addresses, routing, "near me" |
| Cloud provider | Hosting, database, storage, security primitives |

Each has its own commercial terms, data-processing terms, and attribution/branding requirements (e.g. "Powered by Stripe", map attribution) — comply with each.

## 7. Build-time tooling

Tools used to *build* the platform (incl. the Emergent AI build environment and any frontier-model access it provides) operate under their own terms; the **code they generate is yours**, but verify the environment's terms regarding ownership and the high-stakes human-review areas (FW34 §8).

## 8. The in-app acknowledgements screen

Ship an **"Open-source licenses"** entry in Settings listing each bundled open-source component and its license text, generated from the dependency manifest. Include required service attributions ("Powered by Stripe", map data attribution, font OFL notice) where mandated.

---

*Licenses in one line: the platform stands on open-source (mostly MIT/Apache/OFL — free to use commercially, with attribution) plus commercial services (Stripe, telephony, DVLA, weather, cloud, AI APIs) under their own terms — keep the notices, ship an acknowledgements screen, avoid copyleft in proprietary code, and confirm every dependency's exact license at the version you ship.*
