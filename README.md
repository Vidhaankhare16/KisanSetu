# KisanSetu — Smart Water, Crop & Advisory System

Voice + SMS agricultural intelligence for small and marginal farmers, with a
government-grade dashboard and three demo roles: **Farmer · FPO · Government**.
Built for the GCP Hackathon (Track 4) on Gemini, Firestore and Cloud Run.

## What it does

1. **Call-in helpline** — a farmer dials the +91 number; Gemini Live answers in
   their language, recognizes them by phone number, and logs the query.
2. **In-app multimodal chat** — voice, text, and crop-photo disease diagnosis
   (Gemini), personalized to the farmer's profile.
3. **Government scheme workflow** — AI-matched schemes per farmer; **Approve &
   Call** rings the farmer and explains the scheme, with an RSK follow-up ticket.
4. **Proactive dry-spell alerts** — forecast + crop/soil → localized SMS (and
   voice calls for critical events) to every farmer in a district.
5. **My Kisan Report** — Gemini writes a plain-language advisory (crops, water
   plan, risks) plus matched schemes; surfaced in the Government view.

No auth — a role switcher lets judges jump between Farmer / FPO / Government;
all roles share the same Firestore data live.

## Stack

- **Next.js (App Router) + Tailwind** on Cloud Run (`min=0`)
- **Firestore** (Admin SDK, server-side only) — farmers, queries, reports, tickets, alerts, schemes, districts
- **Gemini via Vertex AI** (ADC — no API key) — diagnosis, advisories, reports, alert copy
- **Voice service** (`voice-agent/`) — LiveKit + Gemini Live + Vobiz +91 SIP; optional,
  gated behind `VOICE_AGENT_URL` (log-only fallback when unset)

## Run locally

```bash
# Prereqs: Node 20+, gcloud CLI authenticated to the GCP project
gcloud auth application-default login
gcloud config set project causal-galaxy-415009

npm install
npx tsx scripts/seed.ts     # seed districts, schemes, FPOs, farmers, sample activity
npm run dev                 # http://localhost:3000
```

`.env.local` (already present; no secrets needed for the app itself):

```
GOOGLE_CLOUD_PROJECT=causal-galaxy-415009
VERTEX_LOCATION=us-central1
GEMINI_MODEL=gemini-2.5-flash
# Optional — only when the voice service is deployed:
# VOICE_AGENT_URL=https://kisan-voice-….run.app
# NOTIFY_SECRET=<same secret as the voice service>
```

## Deploy (Cloud Run)

```bash
gcloud run deploy kisan-alert \
  --source . --region us-central1 --project causal-galaxy-415009 \
  --allow-unauthenticated --min-instances 0 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=causal-galaxy-415009,VERTEX_LOCATION=us-central1,GEMINI_MODEL=gemini-2.5-flash"
```

## Phone calls (optional, kept ready)

Everything phone-related lives in [voice-agent/](voice-agent/) with its own
README: rotate credentials, fill `.env`, run `setup_trunks.py`, deploy, then set
`VOICE_AGENT_URL` + `NOTIFY_SECRET` on this app. Until then, every "call" action
works in log-only demo mode.

## Demo script (~5 min)

1. Land on the home page → starter guide auto-opens.
2. **Government** → open a farmer → AI-matched scheme → **Approve & Call**
   (rings live once voice is wired; logs otherwise).
3. Judge dials the +91 helpline → asks a crop question (inbound; warm up first).
4. **Farmer** → upload a diseased-leaf photo → diagnosis; low confidence
   auto-creates an RSK ticket visible in the Government queue.
5. **Farmer** → generate **My Kisan Report** → crop plan + matched schemes.
6. **Government** → trigger a dry-spell alert for Anantapur → SMS/calls queue.
