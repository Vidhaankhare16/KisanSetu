# Kisan Alert — Voice Service (LiveKit + Gemini Live + Vobiz)

Phone stack for the demo: **outbound** (Approve & Call / dry-spell calls ring the farmer)
and **inbound** (farmer dials the +91 helpline, is recognized by phone number, and gets
personalized answers). The web app works fully without this service — telephony is gated
behind `VOICE_AGENT_URL` and falls back to log-only.

```
INBOUND:  Phone → Vobiz DID → LiveKit SIP → agent.py (IntakeAgent)
          → GET  {APP_URL}/api/personalize?phone=…   (phone = identity)
          → POST {APP_URL}/api/chat                  (logs the query to dashboards)

OUTBOUND: Web app → POST /notify (notify_server.py) → LiveKit room + agent dispatch
          → Vobiz outbound trunk dials the farmer → NotifyAgent speaks in their language
```

## Go-live checklist (everything else is already wired)

1. **Rotate credentials** — the values in `voice-agent-build-guide.md` are burned:
   - LiveKit: revoke + regenerate API key/secret.
   - Google AI Studio: new `GOOGLE_API_KEY`.
   - Vobiz: rotate the SIP credential password.
   - Generate a fresh `NOTIFY_SECRET` (any long random string).
2. `cp .env.example .env` and fill it in.
3. **Vobiz console** (one-time):
   - Outbound trunk with a Credential (username/password from `.env`); leave the IP ACL empty.
   - Inbound trunk: Primary Origination URI = the project's **SIP URI from the LiveKit
     dashboard** (Telephony → SIP trunks → "SIP URI"; for this project it is
     `1ysl7fk07kq.sip.livekit.cloud:5060`). ⚠️ It is NOT the project subdomain from
     LIVEKIT_URL — using that hostname makes every inbound call fail with
     `404 No trunk found`. No `sip:` prefix, select it as Primary, Link the +91 DID.
   - Trial accounts can't do live PSTN — recharge to convert to full.
4. **LiveKit SIP wiring**: `python setup_trunks.py` → paste the printed
   `SIP_OUTBOUND_TRUNK_ID` into `.env` / `voice-env.yaml`.
   (Re-running duplicates trunks — delete old ones in the LiveKit console first.)
5. **Local test**:
   ```bash
   python -m venv .venv && .venv/Scripts/activate   # Windows
   pip install -r requirements.txt
   python agent.py dev                               # healthy when logs show "registered worker"
   uvicorn notify_server:app --port 8080             # separate terminal
   curl -X POST localhost:8080/notify -H "content-type: application/json" \
        -H "x-notify-secret: $NOTIFY_SECRET" \
        -d '{"phone":"+91YOURMOBILE","farmerName":"Test","lang":"Hindi","message":"Test call from Kisan Alert."}'
   ```
6. **Deploy** (cost-optimized: scale-to-zero, single instance):
   ```bash
   cp voice-env.yaml.example voice-env.yaml   # fill it (gitignored)
   gcloud run deploy kisan-voice \
     --source . --region us-central1 --project causal-galaxy-415009 \
     --allow-unauthenticated \
     --min-instances 0 --max-instances 1 --no-cpu-throttling \
     --port 8080 --memory 1Gi --cpu 1 \
     --env-vars-file voice-env.yaml
   ```
7. **Point the web app at it** (this is the only web-app change needed):
   ```bash
   gcloud run services update kisan-alert --region us-central1 --project causal-galaxy-415009 \
     --update-env-vars "VOICE_AGENT_URL=https://kisan-voice-….run.app,NOTIFY_SECRET=<same secret>"
   ```
   For local dev, set the same two vars in `kisan-alert/.env.local`.

## Demo runbook

- **Outbound is the reliable star.** It's HTTP-triggered, so it wakes the service from zero
  (first call after idle may take 10–30 s while the worker registers).
- **Inbound needs a warm worker** — ~2 min before the demo:
  `gcloud run services update kisan-voice --min-instances 1 …` and revert to `0` after.
- To guarantee $0 between demos: unset `VOICE_AGENT_URL` on the web app (log-only fallback).
- Before the live call, update one seeded farmer's phone to a real mobile in Firestore
  (e.g. `f-ramesh`) so Approve & Call rings a phone in the room.

## Troubleshooting quickies

| Symptom | Fix |
|---|---|
| DID says "invalid number" | Vobiz inbound not provisioned / number not voice-enabled — contact Vobiz support |
| Rings then drops | Reached LiveKit; check worker logs (agent name, dispatch rule, Gemini key) |
| `/notify` → 401 | `NOTIFY_SECRET` mismatch between app and voice service |
| App logs "would call …" | `VOICE_AGENT_URL` unset on the web app |
| `/notify` → 503 | `SIP_OUTBOUND_TRUNK_ID` unset — run `setup_trunks.py` |
