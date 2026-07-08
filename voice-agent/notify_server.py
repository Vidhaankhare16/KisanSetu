"""Outbound-call trigger for Kisan Alert.

The web app POSTs /notify (see src/lib/notify.ts — same payload shape). This
server creates a LiveKit room, dispatches the voice worker into it in "notify"
mode, then dials the farmer through the Vobiz outbound SIP trunk.

Run locally:  uvicorn notify_server:app --host 0.0.0.0 --port 8080
"""
from __future__ import annotations

import json
import logging
import os
import re
import secrets
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from livekit import api
from pydantic import BaseModel

logger = logging.getLogger("kisan-notify")

E164_IN = re.compile(r"^\+91[6-9]\d{9}$")


def validate_phone(phone: str) -> str:
    """Normalize to +91 E.164; raise 400 on garbage so we never burn a SIP dial on it."""
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    normalized = f"+91{digits}"
    if not E164_IN.match(normalized):
        raise HTTPException(status_code=400, detail=f"not a valid Indian mobile: {phone!r}")
    return normalized


async def dispatch_and_dial(room: str, meta: dict, phone: str, identity: str) -> None:
    """Dispatch the agent and dial via SIP, with one retry on transient LiveKit errors."""
    last_err: Exception | None = None
    dispatched = False  # never re-dispatch: two dispatches = two agents in the room
    for attempt in (1, 2):
        lkapi = api.LiveKitAPI()
        try:
            if not dispatched:
                await lkapi.agent_dispatch.create_dispatch(api.CreateAgentDispatchRequest(
                    agent_name=AGENT_NAME, room=room, metadata=json.dumps(meta),
                ))
                dispatched = True
            await lkapi.sip.create_sip_participant(api.CreateSIPParticipantRequest(
                sip_trunk_id=SIP_OUTBOUND_TRUNK_ID,
                sip_call_to=phone,
                room_name=room,
                participant_identity=identity,
                wait_until_answered=False,
            ))
            return
        except Exception as e:  # noqa: BLE001 — surfaced as 502 below
            last_err = e
            logger.warning("dispatch attempt %d for %s failed: %s", attempt, room, e)
        finally:
            await lkapi.aclose()
    raise HTTPException(status_code=502, detail=f"LiveKit dispatch failed: {last_err}")

load_dotenv()

SIP_OUTBOUND_TRUNK_ID = os.environ.get("SIP_OUTBOUND_TRUNK_ID", "")
AGENT_NAME = os.environ.get("AGENT_NAME", "kisan-voice")
NOTIFY_SECRET = os.environ.get("NOTIFY_SECRET", "")

app = FastAPI(title="Kisan Alert voice notify")


class NotifyRequest(BaseModel):
    """Mirror of CallRequest in the web app's src/lib/notify.ts."""
    phone: str
    title: str = "an update from KisanSetu"
    area: str = ""
    message: str = ""
    farmerName: str = ""
    lang: str = "Hindi"
    schemeName: str = ""
    shortId: str = ""


@app.get("/healthz")
async def healthz():
    return {"ok": True, "agent": AGENT_NAME, "trunk_configured": bool(SIP_OUTBOUND_TRUNK_ID)}


@app.post("/notify")
async def notify(req: NotifyRequest, x_notify_secret: str = Header(default="")):
    if NOTIFY_SECRET and not secrets.compare_digest(x_notify_secret, NOTIFY_SECRET):
        raise HTTPException(status_code=401, detail="bad secret")
    if not SIP_OUTBOUND_TRUNK_ID:
        raise HTTPException(status_code=503, detail="SIP_OUTBOUND_TRUNK_ID unset — run setup_trunks.py")

    phone = validate_phone(req.phone)
    room = f"notify-{req.shortId or uuid.uuid4().hex[:8]}"
    meta = req.model_dump()
    meta["phone"] = phone
    meta["mode"] = "notify"

    await dispatch_and_dial(room, meta, phone, f"callee-{req.shortId or 'x'}")
    return {"ok": True, "room": room, "dialed": phone}


async def _dial_callback(phone: str) -> dict:
    """Ring the farmer back and join the personalized helpline agent (missed-call UX)."""
    phone = validate_phone(phone)
    room = f"callback-{uuid.uuid4().hex[:8]}"
    await dispatch_and_dial(room, {"mode": "callback", "phone": phone}, phone, "farmer")
    return {"ok": True, "room": room, "dialed": phone}


class CallbackRequest(BaseModel):
    phone: str


@app.post("/callback")
async def callback(req: CallbackRequest, x_notify_secret: str = Header(default="")):
    """Explicit callback trigger (secret-protected), e.g. from the web app."""
    if NOTIFY_SECRET and not secrets.compare_digest(x_notify_secret, NOTIFY_SECRET):
        raise HTTPException(status_code=401, detail="bad secret")
    if not SIP_OUTBOUND_TRUNK_ID:
        raise HTTPException(status_code=503, detail="SIP_OUTBOUND_TRUNK_ID unset")
    return await _dial_callback(req.phone)


@app.post("/vobiz-inbound")
async def vobiz_inbound(request: Request):
    """Vobiz call-event webhook: farmer dialed the DID -> ring them back.

    Vobiz posts call events (JSON or form). We only need the caller's number;
    accept the common field spellings and normalize to +91 E.164.
    """
    if request.headers.get("content-type", "").startswith("application/json"):
        payload = await request.json()
    else:
        payload = dict(await request.form())
    logger.info("vobiz-inbound payload: %s", payload)

    raw = ""
    for key in ("from", "From", "from_number", "caller_id", "caller", "cli", "ani"):
        if payload.get(key):
            raw = str(payload[key])
            break
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 12 and digits.startswith("91"):
        phone = f"+{digits}"
    elif len(digits) == 11 and digits.startswith("0"):
        phone = f"+91{digits[1:]}"
    elif len(digits) == 10:
        phone = f"+91{digits}"
    else:
        logger.warning("vobiz-inbound: no usable caller number in %s", payload)
        return {"ok": False, "reason": "no caller number"}
    return await _dial_callback(phone)
