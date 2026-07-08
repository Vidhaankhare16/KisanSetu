import { NextRequest, NextResponse } from "next/server";
import { getFarmer, getFarmers, newId } from "@/lib/data";
import { db, COL } from "@/lib/firestore";
import { getScheme } from "@/lib/schemes";
import { dispatchCall } from "@/lib/notify";
import { LANG_LABELS, type Application, type Farmer } from "@/lib/types";

// Scheme applications — the thread that ties the three dashboards together:
//   FPO applies on a farmer's behalf  →  Government sees & approves  →
//   farmer is notified by simulated SMS or a real voice call.

export async function GET(req: NextRequest) {
  const fpoId = req.nextUrl.searchParams.get("fpoId");
  const farmerId = req.nextUrl.searchParams.get("farmerId");
  const snap = await db.collection(COL.applications).get();
  let apps = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Application);
  if (fpoId) apps = apps.filter((a) => a.fpoId === fpoId);
  if (farmerId) apps = apps.filter((a) => a.farmerId === farmerId);
  apps.sort((a, b) => b.createdAt - a.createdAt);

  const farmers = await getFarmers();
  const byId = new Map(farmers.map((f) => [f.id, f]));
  const applications = apps.map((a) => ({ ...a, farmer: byId.get(a.farmerId) ?? null }));
  return NextResponse.json({ applications });
}

export async function POST(req: NextRequest) {
  const { farmerId, schemeId, appliedBy = "fpo", fpoId, reason } = (await req.json()) as {
    farmerId: string; schemeId: string; appliedBy?: "fpo" | "gov"; fpoId?: string | null; reason?: string;
  };
  const farmer = await getFarmer(farmerId);
  const scheme = getScheme(schemeId);
  if (!farmer) return NextResponse.json({ error: "farmer not found" }, { status: 404 });
  if (!scheme) return NextResponse.json({ error: "scheme not found" }, { status: 404 });

  // One live application per farmer+scheme — re-applying returns the existing one.
  const existing = await db.collection(COL.applications)
    .where("farmerId", "==", farmerId).where("schemeId", "==", schemeId).get();
  if (!existing.empty) {
    const d = existing.docs[0];
    return NextResponse.json({ application: { id: d.id, ...d.data() }, duplicate: true });
  }

  const app: Application = {
    id: newId("app"),
    farmerId,
    fpoId: fpoId ?? farmer.fpoId ?? null,
    schemeId,
    schemeName: scheme.name,
    status: "applied",
    appliedBy,
    reason: reason ?? scheme.benefit,
    createdAt: Date.now(),
  };
  const { id, ...rest } = app;
  await db.collection(COL.applications).doc(id).set(rest);
  return NextResponse.json({ application: app });
}

// Approve (government action). notify: "sms" writes a simulated SMS the farmer
// sees in the browser inbox; "call" dials the farmer through the voice agent.
export async function PATCH(req: NextRequest) {
  const { id, notify = "sms" } = (await req.json()) as { id: string; notify?: "sms" | "call" | "none" };
  const doc = await db.collection(COL.applications).doc(id).get();
  if (!doc.exists) return NextResponse.json({ error: "application not found" }, { status: 404 });
  const app = { id: doc.id, ...doc.data() } as Application;
  const farmer = (await getFarmer(app.farmerId)) as Farmer | null;
  const scheme = getScheme(app.schemeId);
  if (!farmer || !scheme) return NextResponse.json({ error: "farmer or scheme missing" }, { status: 404 });

  await doc.ref.set(
    { status: "approved", approvedAt: Date.now(), ...(notify !== "none" ? { notifiedVia: notify } : {}) },
    { merge: true },
  );

  let delivery: string = "none";
  if (notify === "sms") {
    const smsId = newId("sms");
    await db.collection(COL.sms).doc(smsId).set({
      to: farmer.phone,
      farmerId: farmer.id,
      from: "GOVT-AGRI",
      // Bilingual (English + Hindi) so every farmer can read it.
      body:
        `Namaste ${farmer.name}! Good news — you are eligible for ${scheme.name} and your application has been APPROVED. ` +
        `${scheme.benefit} To avail the benefits, please visit your nearest Rythu Seva Kendra / block agriculture office ` +
        `with your Aadhaar card, bank passbook and land records. ` +
        `This is a free government service — never pay any agent, never share OTP.\n\n` +
        `नमस्ते ${farmer.name}! खुशखबरी — आप ${scheme.name} योजना के लिए पात्र हैं और आपका आवेदन स्वीकृत हो गया है। ` +
        `लाभ पाने के लिए कृपया अपने नज़दीकी रायथु सेवा केंद्र / ब्लॉक कृषि कार्यालय में आधार कार्ड, बैंक पासबुक और ` +
        `ज़मीन के कागज़ात लेकर जाएँ। यह सरकारी सेवा पूरी तरह निःशुल्क है — किसी एजेंट को पैसे न दें, OTP साझा न करें। — KisanSetu`,
      createdAt: Date.now(),
    });
    delivery = "sms";
  } else if (notify === "call") {
    const result = await dispatchCall({
      phone: farmer.phone,
      title: `Scheme approved: ${scheme.name}`,
      area: farmer.village,
      farmerName: farmer.name,
      lang: LANG_LABELS[farmer.lang],
      schemeName: scheme.name,
      message:
        `${farmer.name}, you are eligible for ${scheme.name} and your application has been approved. ${scheme.benefit} ` +
        `To avail the benefits, visit your nearest Rythu Seva Kendra or block agriculture office with your Aadhaar card, ` +
        `bank passbook and land records. This is a free government service — never pay any agent, ` +
        `and never share OTP or bank details.`,
    });
    delivery = result.status === "sent" ? "call" : `call queued (${result.reason})`;
  }

  return NextResponse.json({ ok: true, delivery });
}
