import { NextRequest, NextResponse } from "next/server";
import { getFarmer } from "@/lib/data";
import { diagnosePhoto } from "@/lib/ai";
import { db, COL } from "@/lib/firestore";
import { newId } from "@/lib/data";
import type { Lang } from "@/lib/types";

// Photo crop-disease diagnosis. Logs a query and, when confidence is low or an
// expert is needed, auto-creates a Rythu Seva Kendra ticket (the RSK escalation).
export async function POST(req: NextRequest) {
  const { farmerId, imageBase64, mimeType = "image/jpeg", lang = "hi" } = (await req.json()) as {
    farmerId?: string; imageBase64: string; mimeType?: string; lang?: Lang;
  };
  if (!imageBase64) return NextResponse.json({ error: "imageBase64 required" }, { status: 400 });

  const farmer = farmerId ? await getFarmer(farmerId) : null;
  const dx = await diagnosePhoto(imageBase64, mimeType, farmer, lang);

  const queryId = newId("q");
  await db.collection(COL.queries).doc(queryId).set({
    farmerId: farmer?.id ?? null,
    phone: farmer?.phone ?? "",
    channel: "photo",
    text: `Photo diagnosis: ${dx.crop} — ${dx.disease}`,
    lang,
    diagnosis: `${dx.crop}: ${dx.disease}`,
    confidence: dx.confidence,
    aiAnswer: dx.treatment,
    createdAt: Date.now(),
  });

  let ticketId: string | null = null;
  if (farmer && (dx.needsExpert || dx.confidence < 0.7)) {
    ticketId = newId("t");
    await db.collection(COL.tickets).doc(ticketId).set({
      farmerId: farmer.id,
      source: "low-confidence-diagnosis",
      title: `${dx.crop} — ${dx.disease} needs expert confirmation`,
      status: "open",
      assignedRSK: `RSK ${farmer.village}`,
      notes: [`Auto-created from photo diagnosis (confidence ${dx.confidence.toFixed(2)}).`],
      createdAt: Date.now(),
    });
  }

  return NextResponse.json({ diagnosis: dx, queryId, ticketId });
}
