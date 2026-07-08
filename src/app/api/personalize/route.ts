import { NextRequest, NextResponse } from "next/server";
import { getFarmerByPhone, getQueriesByPhone } from "@/lib/data";
import { LANG_LABELS } from "@/lib/types";

// PHONE = IDENTITY. The voice agent calls this with the caller's +91 number to
// get personalized context before speaking. Known farmer → full profile + history;
// unknown → generic. This endpoint is what makes "same number, remembered context" work.
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone")?.trim();
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });

  const farmer = await getFarmerByPhone(phone);
  const history = await getQueriesByPhone(phone);

  if (!farmer) {
    return NextResponse.json({
      known: false,
      phone,
      // Hindi-first: an English greeting primes the voice model to stay in English
      // even when the caller replies in another language. Hindi is the safest
      // default for unknown callers; the agent switches on their first words.
      greeting: "नमस्ते! किसानसेतु हेल्पलाइन में आपका स्वागत है। बताइए, मैं आपकी क्या मदद कर सकता हूँ?",
      recentQueries: history.slice(0, 3).map((q) => q.text),
      context: history.length
        ? "This number has called before but is not registered."
        : "First-time caller, not registered.",
    });
  }

  const last = history[0];
  return NextResponse.json({
    known: true,
    phone,
    farmer: {
      name: farmer.name, village: farmer.village, district: farmer.district,
      crops: farmer.crops, soilType: farmer.soilType, waterSource: farmer.waterSource,
      lang: farmer.lang, langLabel: LANG_LABELS[farmer.lang],
    },
    greeting: `Namaste ${farmer.name}! KisanSetu here. How are your ${farmer.crops.join(" and ")} doing in ${farmer.village}?`,
    lastQuery: last?.text ?? null,
    recentQueries: history.slice(0, 3).map((q) => q.text),
    context:
      `Registered farmer. Answer in ${LANG_LABELS[farmer.lang]}. Farm: ${farmer.landAcres} acres, ` +
      `${farmer.soilType} soil, ${farmer.waterSource}, growing ${farmer.crops.join(", ")} in ${farmer.district}.`,
  });
}
