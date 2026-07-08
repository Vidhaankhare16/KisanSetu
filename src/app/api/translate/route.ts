import { NextRequest, NextResponse } from "next/server";
import { genJson, Type } from "@/lib/gemini";
import type { Lang } from "@/lib/types";
import { LANG_LABELS } from "@/lib/types";

// On-the-fly localization of stored/demo strings (alert messages, ticket
// titles, seeded queries, scheme benefits…) so switching the UI language
// translates dynamic data too — not just the static UI. Clients cache results.
export async function POST(req: NextRequest) {
  const { texts, lang } = (await req.json()) as { texts: string[]; lang: Lang };
  if (!Array.isArray(texts) || texts.length === 0) {
    return NextResponse.json({ translations: [] });
  }
  const clean = texts.map((t) => String(t ?? "")).slice(0, 50);
  if (lang === "en" || !LANG_LABELS[lang]) {
    return NextResponse.json({ translations: clean });
  }

  const schema = {
    type: Type.OBJECT,
    properties: { translations: { type: Type.ARRAY, items: { type: Type.STRING } } },
    required: ["translations"],
  };
  const prompt =
    `Translate each string below into ${LANG_LABELS[lang]} for a farmer-facing agriculture app.\n` +
    `Rules: keep numbers, units, emoji and punctuation; keep proper nouns (people, villages, ` +
    `districts) and official scheme names (e.g. PM-KISAN, Rythu Bharosa) recognizable — ` +
    `transliterate them only if natural. Return exactly ${clean.length} translations, same order.\n\n` +
    clean.map((t, i) => `${i + 1}. ${t}`).join("\n");

  try {
    const { translations } = await genJson<{ translations: string[] }>(prompt, schema);
    // Never let a bad model response shift or drop strings — pad with originals.
    const safe = clean.map((t, i) => translations?.[i]?.trim() || t);
    return NextResponse.json({ translations: safe });
  } catch {
    return NextResponse.json({ translations: clean }); // graceful: fall back to English
  }
}
