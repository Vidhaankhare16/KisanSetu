import { NextRequest, NextResponse } from "next/server";
import { newId } from "@/lib/data";
import { db, COL } from "@/lib/firestore";
import type { SmsMessage } from "@/lib/types";

// Simulated SMS channel. Messages are stored in Firestore and rendered as a
// phone inbox in the browser — no real gateway. Because it's shared state,
// an SMS "sent" from the FPO or Government dashboard appears instantly in the
// farmer dashboard's inbox.

export async function POST(req: NextRequest) {
  const { to, farmerId, from, body } = (await req.json()) as {
    to: string; farmerId?: string | null; from: string; body: string;
  };
  if (!to || !from || !body?.trim()) {
    return NextResponse.json({ error: "to, from and body are required" }, { status: 400 });
  }
  const sms: SmsMessage = {
    id: newId("sms"),
    to,
    farmerId: farmerId ?? null,
    from,
    body: body.trim(),
    createdAt: Date.now(),
  };
  const { id, ...rest } = sms;
  await db.collection(COL.sms).doc(id).set(rest);
  return NextResponse.json({ ok: true, sms });
}

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone");
  const farmerId = req.nextUrl.searchParams.get("farmerId");
  let q = db.collection(COL.sms) as FirebaseFirestore.Query;
  if (farmerId) q = q.where("farmerId", "==", farmerId);
  else if (phone) q = q.where("to", "==", phone);
  const snap = await q.get();
  const messages = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as SmsMessage)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50);
  return NextResponse.json({ messages });
}
