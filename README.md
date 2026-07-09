# 🌾 KisanSetu — Smart Water, Crop & Advisory System

**An AI advisory bridge for India's small and marginal farmers — reachable by a plain phone call, an SMS, or an app.**

Built for the **Google Cloud Hackathon · Track 4** on Gemini, Vertex AI, Firestore and Cloud Run.
Persona: *Kisan Mitra* ("the farmer's friend").
Video walkthrough - https://drive.google.com/file/d/1Ze1ZlS-lzKgXnJ6CLV6_YBOYZZSDWEby/view?usp=drive_link

<p>
<a href="https://kisan-setu-822987556610.us-central1.run.app"><img alt="Live app" src="https://img.shields.io/badge/Live_App-kisan--setu.run.app-2e7d32?style=for-the-badge"></a>
&nbsp;<img alt="Call the helpline" src="https://img.shields.io/badge/📞_Call_the_helpline-0_79714_42493-1565c0?style=for-the-badge">
</p>

> **Judges — try it in 60 seconds:** open the [live app](https://kisan-setu-822987556610.us-central1.run.app), then **call `0 79714 42493`** (dial the leading **0** from within India) and ask *Kisan Mitra* a crop question in any language. No login, no smartphone required.

---

## The problem

> Farmers face crop failure from unpredictable monsoons and a lack of data-driven guidance. Crop choices are made on habit or hearsay rather than soil health, groundwater depth, or rainfall — leading to financial loss and wasted water.

The people who need this advice most are exactly the ones who **can't reach a dashboard**: low literacy, no smartphone, patchy connectivity, and a language that isn't English. So we didn't start with an app. **We started with a phone number.**

---

## What we built — the three mandated components, end-to-end

| Track-4 requirement | What KisanSetu does | Where |
|---|---|---|
| **1 · Smart crop recommendation engine** | A **3-agent Gemini pipeline** turns a farmer's Soil Health Card (extensive 9 parameters), district agro-climatic profile and **live weather** into a full crop plan: what to sow, water schedule, input economics and risks. | `src/lib/ai.ts`, `/api/recommend` |
| **2 · Real-time advisory & dry-spell alerts** | Live **Open-Meteo** forecast per district (lat/lon seeded) drives irrigation guidance; **dry-spell / erratic-monsoon warnings are pushed over SMS** — the channel every farmer can receive, even offline. | `WeatherWidget`, `/api/sms`, `SmsInbox` |
| **3 · Crop-health logging via photo/voice → RSK follow-up** | Upload a leaf photo or ask by voice → **Gemini multimodal** diagnosis in the farmer's language. Cases and scheme applications route to officials at the **Rythu Seva Kendra / agricultural body** for expert approval and callback. | `ChatPanel`, `/api/diagnose`, Government dashboard |

Everything is **Firestore-backed and shared live** across three roles, so an action by one instantly reflects for the others.

---

## Reach every farmer — three channels, one brain

```
        ┌──────────────────────────────────────────────────────────────┐
        │                     KisanSetu (Gemini brain)                  │
        └──────────────────────────────────────────────────────────────┘
              ▲                        ▲                        ▲
     ☎️  PHONE CALL            💬  SMS  /  APP            🏛️  OFFICIAL
   (no smartphone / no        (low connectivity,        (Rythu Seva Kendra
    internet / low literacy)   feature phones)           approves & notifies)
```

- **📞 Call-in helpline** — dial the DID; **Gemini Live** answers, detects the caller's language from their first words, recognizes returning farmers **by phone number** (phone = identity), gives grounded agronomy advice, and logs the query. Answer time ≈ 4.7 s.
- **📲 Outbound advisory calls & SMS** — when an official approves a scheme, *Kisan Mitra* **calls the farmer back** in their language ("your drip-irrigation subsidy is approved… never pay any agent, never share an OTP") and/or **texts** them. Weather warnings go out the same SMS pipe.
- **🖥️ Web app** — a Gemini-style multilingual chat, the crop-recommendation engine, and a government-scheme eligibility checker for farmers/FPOs who *do* have a phone.

---

## The three roles (what a judge clicks through)

A no-auth **role switcher** lets you jump between all three; they share the same live data.

- **🌾 Farmer** (`/farmer`) — AI chat (text + crop-photo diagnosis), Crop Recommendation (district / soil / water + full Soil Health Card, live weather widget), Government-scheme eligibility checker, and a simulated **SMS inbox** with unread badges.
- **🤝 FPO** (`/fpo`) — a Farmer Producer Organisation officer picks a member, checks scheme eligibility and **applies on the farmer's behalf**, or generates a crop plan and **sends it to the farmer via SMS**.
- **🏛️ Government / RSK** (`/gov`) — one focused job: a queue of pending FPO applications, each with the **AI-recommended schemes** for that farmer, and one click to **Approve & SMS** or **Approve & Call**.

---

## How the AI actually does real work (not decorative)

- **3-agent crop planner** — a **CROP SELECTOR** runs first, then a **FARM ECONOMIST** and **FIELD AGRONOMIST** run *in parallel*. Thinking is explicitly disabled (`thinkingBudget: 0`), which cut generation from **~48 s to ~10 s** with no quality loss.
- **Deterministic scheme matching** — 8 real national schemes live in code (`src/lib/schemes.ts`) with rule-based `check()` eligibility from the farmer's profile, so scheme facts are **never hallucinated**; Gemini only writes the explanation.
- **Multimodal diagnosis** — Gemini reads an uploaded crop photo and answers in the farmer's language; low-confidence cases escalate to a human at the RSK instead of guessing.
- **Real-time voice** — Gemini Live over LiveKit + Vobiz SIP, tuned for phone conversations: server-side VAD for instant barge-in, false-interruption resume, and strict short-turn instructions so it feels like a person, not a bot.
- **6-language UI** (English, Hindi, Telugu, Tamil, Kannada, Marathi); the **voice line handles any language** the caller speaks and follows mid-call language switches.

---

## Google Cloud & AI stack

| Layer | Technology |
|---|---|
| Reasoning / generation | **Gemini 2.5 Flash via Vertex AI** (ADC — no API keys in the app) |
| Real-time voice | **Gemini Live** (Google AI Studio) + LiveKit Agents + Vobiz SIP |
| Vision | **Gemini multimodal** for crop-photo diagnosis |
| Data / backend | **Firestore** (Firebase Admin SDK, server-side only) — `farmers`, `plans`, `applications`, `sms`, `districts`, `fpos` |
| Hosting | **Cloud Run** — web (`min=1/max=3`, CPU-boost) + voice worker (`min=1`, always-registered for inbound SIP) |
| Weather | Open-Meteo forecast API (per-district lat/lon) |
| Frontend | Next.js 16 (App Router) · React 19 · Tailwind v4 · TypeScript |

**Deployed and running now:**
- Web → https://kisan-setu-822987556610.us-central1.run.app
- Voice service → `kisan-voice` on Cloud Run (LiveKit worker + `/notify` API)

---

## Why it scores against the rubric

- **Problem–Solution Fit** — starts from the real constraint (no smartphone, low literacy, non-English) and solves it with a phone call, not another dashboard.
- **AI/Technical Execution** — Gemini does the reasoning, vision *and* voice; measurable engineering (48 s→10 s, ~4.7 s answer time); functions end-to-end today.
- **Deployability & Scalability** — stateless containers on Cloud Run, managed Firestore, ADC auth. It can run for one district or a whole state by changing seed data — no code change.
- **Inclusivity & Accessibility** — voice + SMS + 6 UI languages; every advisory reaches a feature phone.
- **Impact** — the RSK/FPO/farmer loop mirrors how Indian agri-extension actually works, so real approvals and callbacks flow to the farmer's hand.

---

## Repository layout

```
kisan-alert/                 Next.js web app (App Router, TS, Tailwind) — Cloud Run
├─ src/app/                  routes: /farmer /fpo /gov + /api/*
├─ src/lib/ai.ts             3-agent Gemini crop-plan pipeline
├─ src/lib/schemes.ts        8 national schemes + deterministic eligibility
├─ scripts/seed.ts           reset the demo (3 districts, 2 FPOs, 4 farmers)
└─ voice-agent/              Python phone stack — Cloud Run
   ├─ agent.py               LiveKit worker (inbound helpline + outbound notify)
   ├─ notify_server.py       /notify → dial the farmer via Vobiz SIP
   └─ setup_trunks.py        idempotent LiveKit SIP wiring
```

---

## Run locally

```bash
# Prereqs: Node 20+, gcloud CLI authenticated to the GCP project
gcloud auth application-default login
gcloud config set project causal-galaxy-415009

cd kisan-alert
npm install
npx tsx scripts/seed.ts        # seed districts, FPOs, farmers
npm run dev                    # http://localhost:3000
```

`.env.local` (no secrets needed for the app itself):

```
GOOGLE_CLOUD_PROJECT=causal-galaxy-415009
VERTEX_LOCATION=us-central1
GEMINI_MODEL=gemini-2.5-flash
# Optional — only when the voice service is deployed:
# VOICE_AGENT_URL=https://kisan-voice-….run.app
# NOTIFY_SECRET=<same secret as the voice service>
```

The web app runs **fully without the phone stack** — every "call" degrades to a logged action when `VOICE_AGENT_URL` is unset. The Python voice service has its own [voice-agent/README.md](voice-agent/README.md).

## Deploy (Cloud Run)

```bash
# Web
gcloud run deploy kisan-setu --source . --region us-central1 \
  --allow-unauthenticated --min-instances 1 --max-instances 3 --cpu-boost

# Voice worker (from voice-agent/, Dockerfile-based)
gcloud run deploy kisan-voice --source . --region us-central1 \
  --allow-unauthenticated --min-instances 1 --max-instances 1 \
  --no-cpu-throttling --port 8080 --memory 1Gi --cpu 1 \
  --env-vars-file voice-env.yaml
```

---

## Demo script (~3 min)

1. **Call `0 79714 42493`** — hear *Kisan Mitra* answer in your language. *(This is the whole pitch: advice for a farmer with no smartphone.)*
2. Enter your number in **Step 2** of the in-app starter guide → receive an **incoming advisory call** exactly as a farmer would when a scheme is approved.
3. **Farmer** → upload a diseased-leaf photo, ask a question, then **switch languages** to show multilingual answers.
4. **Farmer / FPO** → generate a **crop plan** → FPO **sends it via SMS**.
5. **Government** → **Approve** a pending scheme application → watch the **SMS land in the farmer's inbox**. Loop closed.

---

## Roadmap / honest gaps

- **Satellite ingestion** — the crop engine is built to accept extra signals; wiring **Earth Engine** imagery (soil moisture / NDVI) is the next data source.
- **Scheduled weather alerts** — dry-spell warnings send over the live SMS channel today; a cron to auto-fan-out per district is a small addition.
- **Auth & real telephony billing** — no-auth role switching is intentional for judging; production would add OTP login and a per-tenant SIP number.

> ⚠️ All demo credentials used during the hackathon are burned and will be rotated/torn down after judging. No secrets are committed to this repository.
