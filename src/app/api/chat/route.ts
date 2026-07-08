import { NextRequest, NextResponse } from "next/server";
import { getFarmer, getFarmerByPhone } from "@/lib/data";
import { chatReply } from "@/lib/ai";
import { db, COL } from "@/lib/firestore";
import { newId } from "@/lib/data";
import type { Lang, QueryChannel } from "@/lib/types";

// Unified farmer chat turn: text, photo, or both together (ChatGPT-style).
// Logs the query so FPO/Government dashboards see it, and so the caller's
// history builds up. When a photo diagnosis is low-confidence or needs an
// expert, auto-creates a Rythu Seva Kendra ticket (the RSK escalation).
//
// Identity: pass farmerId (in-app) OR phone (voice agent — phone = identity;
// unknown numbers are still logged so the NEXT call is personalized).
// logOnly: the voice agent already answered via Gemini Live and only needs the
// query recorded — pass logOnly:true with aiAnswer to skip a second Gemini call.
export async function POST(req: NextRequest) {
  const {
    farmerId, phone, text, imageBase64, mimeType = "image/jpeg",
    lang = "en", channel = "chat", aiAnswer, logOnly = false,
  } = (await req.json()) as {
    farmerId?: string; phone?: string; text?: string;
    imageBase64?: string; mimeType?: string; lang?: Lang;
    channel?: QueryChannel; aiAnswer?: string; logOnly?: boolean;
  };
  if (!text?.trim() && !imageBase64) {
    return NextResponse.json({ error: "text or imageBase64 required" }, { status: 400 });
  }

  const farmer = farmerId
    ? await getFarmer(farmerId)
    : phone
      ? await getFarmerByPhone(phone)
      : null;

  const { answer, diagnosis } =
    logOnly && aiAnswer != null
      ? { answer: aiAnswer, diagnosis: null }
      : await chatReply({ question: text, imageBase64, mimeType, farmer, lang });

  const id = newId("q");
  await db.collection(COL.queries).doc(id).set({
    farmerId: farmer?.id ?? null,
    phone: farmer?.phone ?? phone ?? "",
    channel: imageBase64 ? "photo" : channel,
    text: text?.trim() || (diagnosis ? `Photo diagnosis: ${diagnosis.crop} — ${diagnosis.disease}` : ""),
    lang,
    ...(diagnosis
      ? { diagnosis: `${diagnosis.crop}: ${diagnosis.disease}`, confidence: diagnosis.confidence }
      : {}),
    aiAnswer: answer,
    createdAt: Date.now(),
  });

  let ticketId: string | null = null;
  if (farmer && diagnosis && (diagnosis.needsExpert || diagnosis.confidence < 0.7)) {
    ticketId = newId("t");
    await db.collection(COL.tickets).doc(ticketId).set({
      farmerId: farmer.id,
      source: "low-confidence-diagnosis",
      title: `${diagnosis.crop} — ${diagnosis.disease} needs expert confirmation`,
      status: "open",
      assignedRSK: `RSK ${farmer.village}`,
      notes: [`Auto-created from photo diagnosis (confidence ${diagnosis.confidence.toFixed(2)}).`],
      createdAt: Date.now(),
    });
  }

  return NextResponse.json({ answer, diagnosis, queryId: id, ticketId });
}
