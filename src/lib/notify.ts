// Outbound call dispatcher. Telephony is gated behind VOICE_AGENT_URL: if unset,
// we LOG instead of dialing so the whole app works with zero phone stack and $0.
// When the voice service is wired, set VOICE_AGENT_URL + NOTIFY_SECRET and calls go live.
import "server-only";

export interface CallRequest {
  phone: string;
  title?: string;
  area?: string;
  message?: string;
  // extra context the voice agent can personalize on:
  farmerName?: string;
  lang?: string;
  schemeName?: string;
  shortId?: string;
}

export interface CallResult {
  status: "sent" | "logged";
  room?: string;
  reason?: string;
}

export async function dispatchCall(reqData: CallRequest): Promise<CallResult> {
  const url = process.env.VOICE_AGENT_URL;
  if (!url) {
    console.log("[notify] VOICE_AGENT_URL unset — would call", reqData.phone, "-", reqData.title);
    return { status: "logged", reason: "telephony disabled (VOICE_AGENT_URL unset)" };
  }
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/notify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-notify-secret": process.env.NOTIFY_SECRET ?? "",
      },
      body: JSON.stringify(reqData),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { status: "logged", reason: `voice service ${res.status}` };
    return { status: "sent", room: data.room };
  } catch (e) {
    console.error("[notify] dispatch failed:", e);
    return { status: "logged", reason: "voice service unreachable" };
  }
}
