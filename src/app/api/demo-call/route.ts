import { NextRequest, NextResponse } from "next/server";
import { dispatchCall } from "@/lib/notify";

// Judge-facing demo: enter your own number and hear exactly the advisory call a
// farmer receives when a government official approves a scheme — including the
// Rythu Seva Kendra follow-up. No Firestore writes: this is a sandboxed preview,
// and like all telephony it degrades to log-only until VOICE_AGENT_URL is set.
export async function POST(req: NextRequest) {
  const { phone } = (await req.json()) as { phone?: string };
  const cleaned = (phone ?? "").replace(/[\s-]/g, "");
  if (!/^(\+91)?[6-9]\d{9}$/.test(cleaned)) {
    return NextResponse.json({ error: "valid Indian mobile number required" }, { status: 400 });
  }
  const e164 = cleaned.startsWith("+91") ? cleaned : `+91${cleaned}`;

  const result = await dispatchCall({
    phone: e164,
    title: "Government scheme advisory call",
    area: "your village",
    farmerName: "there",
    lang: "Hindi first, then repeat the key facts once in English",
    schemeName: "PMKSY micro-irrigation (Per Drop More Crop)",
    message:
      "The agriculture department has approved your application for the drip irrigation subsidy " +
      "under PMKSY Per Drop More Crop — the government covers most of the cost of installing a " +
      "drip system on your field, which saves water and typically raises yield. " +
      "Next step: the Village Agriculture Assistant at your Rythu Seva Kendra will contact you " +
      "to schedule the field verification — just keep your pattadar passbook and Aadhaar ready. " +
      "Important: this is a free government service. Never pay any agent or middleman for this " +
      "subsidy, and never share your OTP or bank details with anyone who calls about it.",
  });

  return NextResponse.json({ delivery: result.status, reason: result.reason, dialed: e164 });
}
