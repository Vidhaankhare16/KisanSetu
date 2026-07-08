"""Kisan Alert voice worker (LiveKit Agents + Gemini Live).

Handles both call modes:
  INBOUND  — a farmer dials the +91 DID. The caller's number is looked up via the
             app's /api/personalize endpoint (phone = identity), so known farmers
             are greeted by name and answered with full farm context. Every
             question is logged back to the app so FPO/Government dashboards see it.
  OUTBOUND — the app POSTs /notify (see notify_server.py); this worker joins the
             room and briefs the farmer (scheme approval / dry-spell alert) in
             their language.

Run locally:  python agent.py dev      (prod: python agent.py start)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from pathlib import Path

import aiohttp
from dotenv import load_dotenv
from google.genai import types as genai_types
from livekit import agents
from livekit.agents import Agent, AgentSession, JobContext, RoomInputOptions, RunContext, function_tool
from livekit.plugins import google, noise_cancellation

load_dotenv()
logger = logging.getLogger("kisan-voice")
logging.basicConfig(level=logging.INFO)

APP_URL = os.environ.get("APP_URL", "http://localhost:3000").rstrip("/")
GEMINI_VOICE = os.environ.get("GEMINI_VOICE", "Puck")

# Strong references to fire-and-forget tasks: asyncio only holds weak refs to
# tasks, so an unreferenced create_task() can be garbage-collected mid-flight
# and its work silently lost. Tasks remove themselves on completion.
_background_tasks: set[asyncio.Task] = set()


def fire_and_forget(coro) -> None:
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

# ---- turn-taking / latency tuning (env-overridable, values in ms) ----------
# How long the caller must be silent before we treat their turn as finished.
# Lower = snappier answers but more risk of jumping in mid-sentence. 800ms:
# telemetry showed 500ms let Gemini commit the caller's turn at a mid-question
# thinking pause and answer half the question OVER the rest of it. The extra
# 300ms is far cheaper than crosstalk — model TTFT dominates perceived delay
# anyway, not this window.
TURN_SILENCE_MS = int(os.environ.get("TURN_SILENCE_MS", "800"))
# Audio kept from just BEFORE speech onset so first syllables aren't clipped.
PREFIX_PADDING_MS = int(os.environ.get("PREFIX_PADDING_MS", "200"))


# ---------------------------------------------------------------- app bridge
async def fetch_personalization(phone: str) -> dict:
    """Look the caller up by phone in Firestore via the app. Never raises.

    Short timeout on purpose: this sits between "call answered" and "greeting
    spoken" — a slow app must degrade to a generic greeting, not dead air.
    """
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=4)) as http:
            async with http.get(f"{APP_URL}/api/personalize", params={"phone": phone}) as resp:
                if resp.status == 200:
                    return await resp.json()
    except Exception:
        logger.exception("personalize lookup failed for %s", phone)
    # Hindi-first fallback: an English greeting primes the model to stay in English
    # even when the caller replies in Telugu/Hindi/etc. Hindi is the safest default
    # for this helpline's audience; the language rule switches on their first words.
    return {"known": False, "phone": phone,
            "greeting": "नमस्ते! किसानसेतु हेल्पलाइन में आपका स्वागत है। बताइए, मैं आपकी क्या मदद कर सकता हूँ?",
            "context": "Lookup unavailable — answer generally."}


async def log_query_to_app(phone: str, question: str, answer: str, lang: str) -> None:
    """Log the phone query so it appears in the FPO/Government dashboards."""
    payload = {"phone": phone, "text": question, "aiAnswer": answer,
               "lang": lang, "channel": "phone", "logOnly": True}
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=8)) as http:
            async with http.post(f"{APP_URL}/api/chat", json=payload) as resp:
                logger.info("logged query for %s → %s", phone, resp.status)
    except Exception:
        logger.exception("failed to log query for %s", phone)


# ----------------------------------------------------------------- telemetry
METRICS_DIR = Path(__file__).parent / "call_metrics"
# After this many silent seconds (user + agent both quiet) the session flips the
# user to "away" and we ask "still there?". After MAX_AWAY_CHECKS unanswered
# checks, say goodbye and hang up instead of burning the line forever.
# 20s, not lower: telemetry showed 12s fired 3x in one normal call — it was
# interrupting a farmer's natural thinking pauses, not catching dead lines.
USER_AWAY_TIMEOUT_S = float(os.environ.get("USER_AWAY_TIMEOUT_S", "20"))
MAX_AWAY_CHECKS = 2


class CallTelemetry:
    """Per-call JSONL metrics so tuning is measured, not guessed.

    One file per call in call_metrics/. Every raw event is appended as it
    happens (so a crashed call still leaves data), and a `summary` line is
    written at shutdown with the numbers that matter:
      greeting_latency_s, per-turn response_latencies_s (caller stopped
      talking -> agent audio started), interruption/false-interruption counts,
      per-response ttft from the model, away checks.
    """

    def __init__(self, room_name: str, mode: str, phone: str) -> None:
        self._t0 = time.monotonic()
        self.room, self.mode, self.phone = room_name, mode, phone
        self.greeting_latency: float | None = None
        self.response_latencies: list[float] = []
        self.ttfts: list[float] = []
        self.interruptions = 0
        self.false_interruptions = 0
        self.false_interruptions_resumed = 0
        self.away_checks = 0
        self._user_state = "listening"
        self._user_stopped_at: float | None = None
        METRICS_DIR.mkdir(exist_ok=True)
        safe = "".join(c if c.isalnum() or c in "+-_" else "_" for c in room_name)
        self._path = METRICS_DIR / f"{time.strftime('%Y%m%d-%H%M%S')}_{safe}.jsonl"
        self._write({"event": "call_started", "room": room_name, "mode": mode, "phone": phone})

    def _write(self, rec: dict) -> None:
        rec.setdefault("t", round(time.monotonic() - self._t0, 3))
        try:
            with self._path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        except OSError:
            logger.exception("telemetry write failed")

    def attach(self, session: AgentSession) -> None:
        @session.on("agent_state_changed")
        def _on_agent_state(ev) -> None:
            now = time.monotonic() - self._t0
            self._write({"event": "agent_state", "from": ev.old_state, "to": ev.new_state})
            if ev.new_state == "speaking":
                if self.greeting_latency is None:
                    self.greeting_latency = now
                    self._write({"event": "greeting_spoken", "greeting_latency_s": round(now, 3)})
                elif self._user_stopped_at is not None:
                    lat = now - self._user_stopped_at
                    self.response_latencies.append(lat)
                    self._user_stopped_at = None
                    self._write({"event": "response_started", "response_latency_s": round(lat, 3)})
            elif ev.old_state == "speaking" and self._user_state == "speaking":
                self.interruptions += 1
                self._write({"event": "interrupted_by_caller"})

        @session.on("user_state_changed")
        def _on_user_state(ev) -> None:
            self._user_state = ev.new_state
            self._write({"event": "user_state", "from": ev.old_state, "to": ev.new_state})
            if ev.old_state == "speaking" and ev.new_state == "listening":
                self._user_stopped_at = time.monotonic() - self._t0

        @session.on("agent_false_interruption")
        def _on_false_interruption(ev) -> None:
            self.false_interruptions += 1
            if getattr(ev, "resumed", False):
                self.false_interruptions_resumed += 1
            self._write({"event": "false_interruption", "resumed": getattr(ev, "resumed", None)})

        @session.on("metrics_collected")
        def _on_metrics(ev) -> None:
            m = ev.metrics
            if getattr(m, "type", "") == "realtime_model_metrics":
                if m.ttft >= 0:
                    self.ttfts.append(m.ttft)
                self._write({"event": "model_response", "ttft_s": round(m.ttft, 3),
                             "duration_s": round(m.duration, 3), "cancelled": m.cancelled,
                             "input_tokens": m.input_tokens, "output_tokens": m.output_tokens,
                             "connect_acquire_s": round(m.acquire_time, 3)})

        @session.on("error")
        def _on_error(ev) -> None:
            self._write({"event": "error", "error": str(getattr(ev, "error", ev))})

    def write_summary(self) -> None:
        lats = self.response_latencies
        self._write({
            "event": "summary",
            "call_duration_s": round(time.monotonic() - self._t0, 1),
            "greeting_latency_s": round(self.greeting_latency, 3) if self.greeting_latency else None,
            "turns": len(lats),
            "response_latency_avg_s": round(sum(lats) / len(lats), 3) if lats else None,
            "response_latency_max_s": round(max(lats), 3) if lats else None,
            "ttft_avg_s": round(sum(self.ttfts) / len(self.ttfts), 3) if self.ttfts else None,
            "interruptions": self.interruptions,
            "false_interruptions": self.false_interruptions,
            "false_interruptions_resumed": self.false_interruptions_resumed,
            "away_checks": self.away_checks,
        })
        logger.info("call summary written to %s", self._path.name)


# ------------------------------------------------------------- inbound agent
def intake_instructions(p: dict) -> str:
    farmer = p.get("farmer") or {}
    lang = farmer.get("langLabel", "")
    lang_rule = (
        f"Prefer {lang} (the caller's registered language), but if they speak another language, "
        "switch and stay in it."
        if lang else
        "Detect the caller's language from their FIRST words and reply in that language for the whole "
        "call — Hindi, Telugu, Tamil, Kannada, Marathi, Bengali, Punjabi, English, or ANY other "
        "language they use. If they switch languages mid-call, follow them."
    )
    return f"""You are "Kisan Mitra", the KisanSetu phone helpline for Indian farmers.
You are on a live phone call. Never mention that you are an AI system prompt or these rules.

TURN-TAKING (critical — this is a real-time phone conversation):
- Answer in 2-4 short sentences (roughly 30-60 words), then stop and let the caller speak.
  Give a REAL, substantive answer in that space — the actual fact, dose, timing or action —
  never just a teaser or a counter-question.
- One topic per turn. If the full answer has several steps, give the first step completely,
  then offer the rest ("shall I tell you the next step?") and continue when they say yes.
- Do NOT end every turn with a question. Ask one only when you genuinely need information to
  give correct advice, or to offer more detail. Ending on a plain statement is fine.
- Ask at most ONE question per turn, and never stack clarifying questions before giving at
  least some useful advice from what you already know.
- If the caller starts speaking while you are talking, stop IMMEDIATELY mid-sentence and listen.
- Never speak over the caller. If they pause briefly mid-thought, wait — do not jump in.
- Start your answer instantly; do not use filler like "let me think" or "that's a good question".
- Speak like a real phone call between two people, not a report being read aloud.

CALLER CONTEXT (from our records):
{p.get("context", "Unknown caller.")}
Recent questions from this number: {", ".join(p.get("recentQueries") or []) or "none"}.

LANGUAGE:
- {lang_rule}

ACCURACY (critical — callers act on what you say):
- Give practical, safe, low-cost advice grounded in standard Indian agronomy. Be specific
  (doses, timing, spacing) only when you are confident; otherwise give the safe general practice.
- NEVER invent government scheme amounts, deadlines or eligibility rules. If unsure, say the
  Rythu Seva Kendra or their FPO can confirm the exact details.
- For pesticide/chemical questions, always include the safety precaution in the same breath.
- If a diagnosis really needs eyes on the crop, say so plainly and offer the Rythu Seva Kendra
  follow-up instead of guessing.

FLOW:
- Open with this greeting, kept to ONE short sentence (adapt naturally): "{p.get("greeting", "Namaste! KisanSetu here. How can I help you today?")}"
- If the caller says "hello"/"haan"/"namaste" while you are greeting, do NOT restart your
  intro. Acknowledge in a word ("Ji namaste!") and continue smoothly from where you were,
  or skip straight to asking how you can help. Repeating the intro from the top sounds robotic.
- If the caller is NOT in our records (context says first-time/unknown): introduce yourself as
  Kisan Mitra from KisanSetu, ask their NAME first, then ask what their question is. Use their
  name for the rest of the call and include it when you call log_query.
- Answer any farming question: crops, pests, irrigation, soil, weather planning, market practice,
  government schemes, animal husbandry. For clearly unrelated topics, gently steer back to farming.
- After answering each substantive question, call the log_query tool ONCE with the question and a
  one-line summary of your answer (both in English), so the farmer's record stays up to date.
- If the caller is not registered, answer anyway and invite them to register through their FPO.
- End politely when the caller is done."""


class IntakeAgent(Agent):
    def __init__(self, personalization: dict):
        super().__init__(instructions=intake_instructions(personalization))
        self._phone = personalization.get("phone", "")
        self._lang = (personalization.get("farmer") or {}).get("lang", "hi")

    @function_tool
    async def log_query(self, context: RunContext, question: str, answer_summary: str) -> str:
        """Log the farmer's question and your answer to the Kisan Alert system.

        Args:
            question: the farmer's question, translated to English.
            answer_summary: one-line English summary of the advice you gave.
        """
        # Fire-and-forget: logging must never add latency to the live conversation.
        fire_and_forget(log_query_to_app(self._phone, question, answer_summary, self._lang))
        return "Logged. Continue the conversation naturally."


# ------------------------------------------------------------ outbound agent
def notify_instructions(meta: dict) -> str:
    name = meta.get("farmerName") or "the farmer"
    lang = meta.get("lang") or "Hindi"
    title = meta.get("title") or "an update from KisanSetu"
    area = meta.get("area") or "your village"
    message = meta.get("message") or ""
    scheme = meta.get("schemeName")
    scheme_line = (
        f'The good news: they have been APPROVED for the government scheme "{scheme}". '
        "Explain the benefit and how to apply, using ONLY the facts below."
        if scheme else
        "Deliver the alert below clearly and tell them exactly what to do."
    )
    return f"""You are "Kisan Mitra" from KisanSetu, making an outbound phone call to {name} in {area}.
Speak ENTIRELY in {lang}. Be warm, clear and brief — this may be a basic phone on a farm.

TURN-TAKING: 1-3 short sentences per turn, one idea at a time, then pause for a response.
If {name} starts speaking while you are talking, stop immediately mid-sentence and listen.
Never talk over them.

Purpose of this call: {title}.
{scheme_line}

FACTS (do not invent anything beyond these):
{message}

FLOW:
1. Greet {name} by name, say you are calling from KisanSetu on behalf of the agriculture department.
2. Deliver the message above in simple words. Repeat the single most important action once.
3. Answer brief follow-up questions using ONLY the facts above; if you don't know, say the
   Rythu Seva Kendra will help them with details.
4. Thank them and end the call politely."""


class NotifyAgent(Agent):
    def __init__(self, meta: dict):
        super().__init__(instructions=notify_instructions(meta))


# ------------------------------------------------------------------ entrypoint
async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    meta: dict = {}
    if ctx.job.metadata:
        try:
            meta = json.loads(ctx.job.metadata)
        except json.JSONDecodeError:
            pass

    mode = meta.get("mode", "inbound")
    phone = meta.get("phone", "")
    if mode == "notify":
        agent: Agent = NotifyAgent(meta)
    elif mode == "callback":
        # Missed-call callback: the farmer dialed our DID; we ring them straight
        # back. Same personalized helpline experience as inbound — phone = identity.
        phone = meta.get("phone", "")
        logger.info("callback call to %r", phone)
        personalization = await fetch_personalization(phone)
        agent = IntakeAgent(personalization)
    else:
        # Inbound: phone = identity. The dispatch rule embeds the caller's number in
        # the room name (call-_+91…_xxxx), so start the personalization lookup
        # IMMEDIATELY — in parallel with waiting for the SIP participant — instead
        # of serializing lookup after join. Shaves the lookup off time-to-greeting.
        phone = next((seg for seg in ctx.room.name.split("_") if seg.startswith("+")), "")
        fetch_task = asyncio.create_task(fetch_personalization(phone)) if phone else None
        participant = await ctx.wait_for_participant()
        if not fetch_task:  # room-name parse failed — fall back to SIP attributes
            phone = participant.attributes.get("sip.phoneNumber", "") or ""
            fetch_task = asyncio.create_task(fetch_personalization(phone))
        logger.info("inbound call from %r", phone)
        personalization = await fetch_task
        agent = IntakeAgent(personalization)

    llm_kwargs: dict = {
        "voice": GEMINI_VOICE,
        "temperature": 0.5,  # lower than default 0.8: more consistent rule-following (short
        # turns, no invented scheme facts) at a small, acceptable cost to spontaneity.
        # CRITICAL: the native-audio model "thinks" before responding unless this is forced
        # to 0. Same lesson as the crop-plan pipeline in src/lib/ai.ts (48s -> ~10s once
        # thinking was disabled there) — undisabled thinking is the likely cause of the
        # 10-13s greeting/response delays. Do not remove.
        "thinking_config": genai_types.ThinkingConfig(thinking_budget=0),
        # NOTE: enable_affective_dialog was tried here but forces the v1alpha API surface,
        # which correlated with the severe latency regression above — reverted until it can
        # be verified safe on a stable, non-preview path.
        # Hard ceiling on a single turn's output. Audio output burns ~25 tokens/sec, so 512
        # ≈ 20s of speech — room for a full 2-4 sentence answer, but a model that ignores the
        # turn-length instructions gets hard-stopped instead of monologuing for a minute.
        "max_output_tokens": 512,
        # Without this, a Gemini Live session's context fills up (audio burns tokens fast)
        # and old turns get silently dropped once the limit hits — this is the mechanism
        # behind the agent "forgetting" earlier parts of a long call and repeating itself.
        # A sliding window compresses old turns instead of truncating them outright.
        "context_window_compression": genai_types.ContextWindowCompressionConfig(
            trigger_tokens=25000,
            sliding_window=genai_types.SlidingWindow(target_tokens=12000),
        ),
        # Explicit server-side VAD instead of Gemini defaults: detect speech
        # onset aggressively (fast barge-in — the caller can cut the agent off
        # instantly) but require TURN_SILENCE_MS of real silence before the
        # agent takes its turn, so it stops talking over callers who pause
        # mid-sentence, while still answering promptly after they finish.
        "realtime_input_config": genai_types.RealtimeInputConfig(
            automatic_activity_detection=genai_types.AutomaticActivityDetection(
                disabled=False,
                start_of_speech_sensitivity=genai_types.StartSensitivity.START_SENSITIVITY_HIGH,
                # LOW (not HIGH): require clearer silence before deciding the caller has
                # stopped, so a mid-sentence pause / breath / phone-line noise doesn't get
                # read as "done speaking" and cut them off. silence_duration_ms below still
                # controls actual response timing.
                end_of_speech_sensitivity=genai_types.EndSensitivity.END_SENSITIVITY_LOW,
                prefix_padding_ms=PREFIX_PADDING_MS,
                silence_duration_ms=TURN_SILENCE_MS,
            ),
        ),
    }
    if os.environ.get("GEMINI_LIVE_MODEL"):  # optional override to try faster Live models
        llm_kwargs["model"] = os.environ["GEMINI_LIVE_MODEL"]
    session = AgentSession(
        llm=google.beta.realtime.RealtimeModel(**llm_kwargs),
        # Flip user state to "away" after this much mutual silence — drives the
        # "still there?" check below instead of waiting on VAD forever when the
        # caller's signal drops or they walk off mid-call.
        user_away_timeout=USER_AWAY_TIMEOUT_S,
        # Turn handling on the LiveKit side: let Gemini's server VAD own turn
        # detection, allow instant interruptions, and recover from FALSE
        # interruptions (a cough / farm noise triggers VAD, no speech follows
        # → resume the answer instead of dying mid-sentence).
        turn_handling={
            "turn_detection": "realtime_llm",
            "interruption": {
                "enabled": True,
                "min_duration": 0.35,
                "resume_false_interruption": True,
                "false_interruption_timeout": 1.5,
            },
        },
    )

    telemetry = CallTelemetry(ctx.room.name, mode, phone)
    telemetry.attach(session)
    ctx.add_shutdown_callback(lambda: asyncio.to_thread(telemetry.write_summary))

    # Crosstalk guard. In realtime_llm mode LiveKit's own VAD interruption is off
    # (Gemini owns turn detection) and Gemini only cancels agent audio on a NEW
    # speech onset — so a reply that starts playing while the caller is ALREADY
    # mid-sentence just talks over them (telemetry showed 6+s of overlap). If
    # agent audio starts while the caller has clearly held the floor for a while,
    # cut it: their speech will produce a fresh turn and a fresh answer anyway.
    user_speaking_since: float | None = None

    @session.on("user_state_changed")
    def _track_user_speech(ev) -> None:
        nonlocal user_speaking_since
        user_speaking_since = time.monotonic() if ev.new_state == "speaking" else None

    @session.on("agent_state_changed")
    def _crosstalk_guard(ev) -> None:
        if (
            ev.new_state == "speaking"
            and user_speaking_since is not None
            and time.monotonic() - user_speaking_since >= 0.8
        ):
            telemetry._write({"event": "crosstalk_guard_interrupt"})
            session.interrupt()

    # "Still there?" flow. The session flips user_state to "away" after
    # USER_AWAY_TIMEOUT_S of mutual silence, but that event fires only ONCE
    # (the internal timer re-arms only when the user returns to "listening"),
    # so escalation is driven by our own loop: check in, wait, check again,
    # then say goodbye and hang up instead of holding a dead line open.
    away_task: asyncio.Task | None = None

    async def _away_flow() -> None:
        for _ in range(MAX_AWAY_CHECKS):
            telemetry.away_checks += 1
            handle = session.generate_reply(
                instructions="The caller has gone quiet. Briefly ask (in the language of the "
                "call so far) if they are still there and can hear you. One short sentence."
            )
            await handle
            await asyncio.sleep(USER_AWAY_TIMEOUT_S)
            if session.user_state != "away":
                return  # caller came back; session re-arms its own away timer
        handle = session.generate_reply(
            instructions="No response from the caller. Say a short polite goodbye in the "
            "language of the call, mentioning they can call back anytime."
        )
        await handle
        ctx.delete_room()

    @session.on("user_state_changed")
    def _on_user_state_away(ev) -> None:
        nonlocal away_task
        if ev.new_state == "away" and (away_task is None or away_task.done()):
            away_task = asyncio.create_task(_away_flow())
        elif ev.new_state == "speaking" and away_task is not None and not away_task.done():
            away_task.cancel()  # caller is back mid-flow — drop the check-in loop
    # session.start() opens the Gemini Live websocket; if it hangs (seen once in testing,
    # likely transient — e.g. a shared API key/project also in use by another local agent
    # process competing for concurrent Live session quota) the call previously just sat in
    # dead air until the caller's phone gave up (SIP "recv_cancel"). Bound it so a stuck
    # connect fails fast and loud instead, with one retry before giving up.
    start_kwargs = dict(
        room=ctx.room,
        agent=agent,
        # BVCTelephony: Krisp-based noise suppression tuned for narrowband phone audio —
        # strips line noise/echo BEFORE it reaches Gemini's VAD, reducing false barge-in
        # triggers at the source instead of only tuning VAD thresholds after the fact.
        room_input_options=RoomInputOptions(noise_cancellation=noise_cancellation.BVCTelephony()),
    )
    # 10s per attempt (not more): worst case is 2 attempts of dead air before the job
    # dies and the caller hears the failure — 20s is already at the edge of what a
    # phone caller will wait through.
    for attempt in (1, 2):
        try:
            await asyncio.wait_for(session.start(**start_kwargs), timeout=10.0)
            break
        except asyncio.TimeoutError:
            logger.warning("session.start() timed out (attempt %d/2)", attempt)
            if attempt == 2:
                raise
    if mode == "notify":
        # Outbound: the room + agent are created and session.start() runs BEFORE the
        # callee's phone is answered (SIP dialed with wait_until_answered=False). If we
        # greet now, the whole message plays into a ringing/empty line and the judge —
        # who picks up a second or two later — hears only silence ("call connects but
        # nothing is heard"). Wait for the SIP participant to join AND for the call to
        # actually be answered, then greet into a live line. Inbound path is untouched.
        participant = await ctx.wait_for_participant()
        # SIP participants appear in the room while still ringing; sip.callStatus flips
        # to "active" only on answer. Poll until active, bounded so an unanswered/rejected
        # call can't hang the job forever (falls through and the room is torn down anyway).
        answer_deadline = time.monotonic() + 60.0
        while time.monotonic() < answer_deadline:
            status = participant.attributes.get("sip.callStatus")
            if status in ("active", None):  # active = answered; None = non-SIP/local peer
                break
            await asyncio.sleep(0.2)
        # Tiny beat so the audio path is fully up before the first syllable, mirroring the
        # inbound grace window — avoids clipping "Namaste" on some carriers.
        await asyncio.sleep(0.3)
        await session.generate_reply()
    else:
        # Callers reflexively say "hello?" the instant they hear the line open. If the
        # greeting starts into that, barge-in cuts the intro mid-sentence and the call
        # opens feeling broken (observed in telemetry: a ~4ms "hello" blip right as the
        # greeting played). Give that hello a beat to land: a short grace window, and if
        # they're mid-word, wait until they finish — then greet into actual silence.
        await asyncio.sleep(0.4)
        grace_deadline = time.monotonic() + 2.5
        while session.user_state == "speaking" and time.monotonic() < grace_deadline:
            await asyncio.sleep(0.1)
        await session.generate_reply(instructions="Greet the caller now, per your instructions.")


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(
        entrypoint_fnc=entrypoint,
        agent_name=os.environ.get("AGENT_NAME", "kisan-voice"),
        # Keep a job process prewarmed so a call never waits for process spin-up
        # ("no warmed process available" adds seconds to answer time otherwise).
        num_idle_processes=1,
    ))
