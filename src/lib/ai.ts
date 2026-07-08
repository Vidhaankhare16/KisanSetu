// Domain AI logic: crop advisory chat, photo diagnosis, Kisan Report, scheme matching.
import "server-only";
import { genText, genJson, genJsonWithImage, Type } from "./gemini";
import type { Farmer, District, Lang } from "./types";
import { LANG_LABELS } from "./types";

const ADVISOR_SYSTEM = `You are "Kisan Mitra", an agricultural advisor for small and marginal Indian farmers.
Give practical, safe, low-cost advice. Be concise (2-4 short sentences). Never invent government
scheme details. If the issue needs an expert, say the farmer will be connected to their Rythu Seva
Kendra.

LANGUAGE RULE (critical): reply in EXACTLY the language AND script the farmer used.
- Hindi in Devanagari → reply in Hindi (Devanagari).
- Romanized Hindi/Telugu/etc. ("Hinglish", e.g. "meri fasal kharab ho rahi hai") → reply romanized
  in the same style.
- English → English. A mix of languages → mirror the same mix naturally.
- Only when the farmer's message language cannot be determined (no text, or just a photo), use the
  fallback language given in the prompt.`;

function langLine(lang: Lang) {
  return `Fallback language if the farmer's message language is unclear: ${LANG_LABELS[lang]}.`;
}

function farmerContext(f: Farmer | null): string {
  if (!f) return "The caller is not yet registered. Answer generally and encourage registration.";
  return `Farmer profile — name: ${f.name}, village: ${f.village}, district: ${f.district}, ` +
    `land: ${f.landAcres} acres, soil: ${f.soilType}, water: ${f.waterSource}, ` +
    `groundwater depth: ${f.groundwaterDepthM}m, crops: ${f.crops.join(", ")}.`;
}

/** Conversational advisory answer, personalized to the farmer. */
export async function advisoryAnswer(
  question: string,
  farmer: Farmer | null,
  lang: Lang,
): Promise<string> {
  const prompt = `${farmerContext(farmer)}\n\nFarmer asks: "${question}"\n\n${langLine(lang)}`;
  return genText(prompt, ADVISOR_SYSTEM);
}

export interface Diagnosis {
  crop: string;
  disease: string;
  confidence: number; // 0..1
  severity: "low" | "medium" | "high";
  treatment: string; // in farmer's language
  needsExpert: boolean;
}

/** Crop-disease diagnosis from a leaf/plant photo. */
export async function diagnosePhoto(
  imageBase64: string,
  mimeType: string,
  farmer: Farmer | null,
  lang: Lang,
): Promise<Diagnosis> {
  const schema = {
    type: Type.OBJECT,
    properties: {
      crop: { type: Type.STRING },
      disease: { type: Type.STRING },
      confidence: { type: Type.NUMBER },
      severity: { type: Type.STRING, enum: ["low", "medium", "high"] },
      treatment: { type: Type.STRING },
      needsExpert: { type: Type.BOOLEAN },
    },
    required: ["crop", "disease", "confidence", "severity", "treatment", "needsExpert"],
  };
  const prompt = `${farmerContext(farmer)}\n\nAnalyze this crop photo. Identify the crop and any ` +
    `disease/pest/deficiency. Give confidence 0-1. Provide a low-cost treatment the farmer can act ` +
    `on. Set needsExpert=true if confidence < 0.7 or severity is high. Write the "treatment" field ` +
    `in ${LANG_LABELS[lang]}; keep "crop" and "disease" in English.`;
  return genJsonWithImage<Diagnosis>(imageBase64, mimeType, prompt, schema);
}

export interface ChatReply {
  answer: string; // conversational reply, mirroring the farmer's language
  diagnosis: Diagnosis | null; // present only when a photo was analyzed
}

/**
 * Unified chat turn (ChatGPT-style): text, photo, or both together.
 * - Text only → conversational advisory.
 * - Photo (± caption) → structured diagnosis PLUS a conversational answer that
 *   addresses the caption directly. Reply language mirrors the caption
 *   (Hinglish → Hinglish); photo-only falls back to the UI language.
 */
export async function chatReply(opts: {
  question?: string;
  imageBase64?: string;
  mimeType?: string;
  farmer: Farmer | null;
  lang: Lang;
}): Promise<ChatReply> {
  const { question, imageBase64, mimeType = "image/jpeg", farmer, lang } = opts;
  const q = question?.trim();

  if (!imageBase64) {
    const answer = await advisoryAnswer(q ?? "", farmer, lang);
    return { answer, diagnosis: null };
  }

  const schema = {
    type: Type.OBJECT,
    properties: {
      crop: { type: Type.STRING },
      disease: { type: Type.STRING },
      confidence: { type: Type.NUMBER },
      severity: { type: Type.STRING, enum: ["low", "medium", "high"] },
      treatment: { type: Type.STRING },
      needsExpert: { type: Type.BOOLEAN },
      answer: { type: Type.STRING },
    },
    required: ["crop", "disease", "confidence", "severity", "treatment", "needsExpert", "answer"],
  };
  const prompt =
    `${farmerContext(farmer)}\n\n` +
    (q ? `The farmer sent this photo with the message: "${q}"\n\n` : "The farmer sent this photo with no message.\n\n") +
    `Analyze the crop photo. Identify the crop and any disease/pest/deficiency. Give confidence 0-1. ` +
    `Set needsExpert=true if confidence < 0.7 or severity is high.\n` +
    `"treatment": one low-cost, actionable treatment.\n` +
    `"answer": a short conversational reply to the farmer (2-4 sentences) that ` +
    (q ? `directly answers their message using what the photo shows, and ` : "") +
    `includes the practical treatment advice.\n` +
    `Write "treatment" and "answer" following the LANGUAGE RULE` +
    (q ? ` (mirror the language and script of the farmer's message above)` : "") +
    `. ${langLine(lang)} Keep "crop" and "disease" in English.`;
  const { answer, ...dx } = await genJsonWithImage<Diagnosis & { answer: string }>(
    imageBase64, mimeType, prompt, schema, ADVISOR_SYSTEM,
  );
  return { answer, diagnosis: dx };
}

/**
 * SIH-style crop recommendation plan, generalized to ALL crops (cereals,
 * pulses, oilseeds, vegetables, horticulture, fodder — whatever fits best).
 * Inputs mirror the SIH advisory form: district, soil, water (+ optional soil
 * health card values).
 *
 * Split across three specialized Gemini "agents" instead of one monolithic
 * call: a small CROP SELECTOR runs first, then the FARM ECONOMIST and the
 * FIELD AGRONOMIST run IN PARALLEL on the selected crop. Each prompt/schema is
 * small and focused, so the slowest stage is much shorter than the old single
 * mega-generation — faster wall-clock time and fewer malformed outputs.
 */
export async function generateCropPlan(
  inputs: import("./types").CropPlanInputs,
  district: District | null,
): Promise<Omit<import("./types").CropPlan, "id" | "farmerId" | "inputs" | "createdBy" | "createdAt">> {
  const c = inputs.soilCard;
  const soilCardLine = c
    ? `Soil health card — land type: ${c.landType}, N: ${c.nitrogen} kg/ha, P: ${c.phosphorus} kg/ha, ` +
      `K: ${c.potassium} kg/ha, organic carbon: ${c.organicCarbon}%, EC: ${c.electricalConductivity} dS/m, ` +
      `pH: ${c.pH}, boron: ${c.boron} ppm, sulphur: ${c.sulphur} ppm. ` +
      `Use these exact values for nutrient and fertilizer guidance.`
    : `No soil health card — use typical ${inputs.soil} soil values for ${inputs.district}.`;
  const districtLine = district
    ? `District data — soil profile: ${district.soilProfile}, NDVI: ${district.ndviIndex}, ` +
      `groundwater: ${district.groundwaterTrend}, 7-day rain (mm): ` +
      `${district.rainfallForecast.map((r) => r.mm).join(", ")}.`
    : "";
  const farmCtx =
    `Farm — district: ${inputs.district} (India), soil: ${inputs.soil}, water: ${inputs.water}, ` +
    `land: ${inputs.landAcres} acres, season: ${inputs.season}.\n${soilCardLine}\n${districtLine}`;

  // ---- Agent 1: CROP SELECTOR (small output → fast; everything else depends on it)
  const selection = await genJson<{
    cropName: string;
    localName: string;
    suitabilityReason: string;
    duration: string;
    alternatives: { crop: string; reason: string }[];
  }>(
    `${farmCtx}\n\n` +
      `Recommend the SINGLE best crop to sow now, chosen from ALL crop types — cereals, pulses, ` +
      `oilseeds, vegetables, fruits, spices, fodder — not any single category.\n` +
      `- localName: common Hindi/regional name.\n` +
      `- suitabilityReason: 2 sentences tied to THIS soil/water/season.\n` +
      `- duration: e.g. "110–120 days".\n` +
      `- alternatives: 2 other good crops with one-line reasons.\n` +
      `All text in English, specific to Indian smallholder farming.`,
    {
      type: Type.OBJECT,
      properties: {
        cropName: { type: Type.STRING },
        localName: { type: Type.STRING },
        suitabilityReason: { type: Type.STRING },
        duration: { type: Type.STRING },
        alternatives: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { crop: { type: Type.STRING }, reason: { type: Type.STRING } },
            required: ["crop", "reason"],
          },
        },
      },
      required: ["cropName", "localName", "suitabilityReason", "duration", "alternatives"],
    },
    "You are an expert crop-selection agronomist for Indian smallholder farms. Decide quickly and concretely.",
    { thinkingBudget: 0 },
  );

  const cropCtx = `${farmCtx}\nSelected crop: ${selection.cropName} (${selection.localName}), duration ${selection.duration}.`;

  // ---- Agents 2 & 3 run in PARALLEL on the selected crop
  const [econ, field] = await Promise.all([
    // FARM ECONOMIST: per-acre money picture
    genJson<{ economics: { netProfit: number; revenue: number; cost: number; comparisonText: string }; roi: string }>(
      `${cropCtx}\n\n` +
        `Give realistic per-acre economics in ₹ for this crop in this district this season:\n` +
        `- economics: cost (all inputs+labour), revenue (yield × realistic mandi price), netProfit, ` +
        `and comparisonText (1 sentence vs the usual local crop).\n` +
        `- roi: one line like "₹38,000 net profit per acre (≈1.8x on input cost)".`,
      {
        type: Type.OBJECT,
        properties: {
          economics: {
            type: Type.OBJECT,
            properties: {
              netProfit: { type: Type.NUMBER },
              revenue: { type: Type.NUMBER },
              cost: { type: Type.NUMBER },
              comparisonText: { type: Type.STRING },
            },
            required: ["netProfit", "revenue", "cost", "comparisonText"],
          },
          roi: { type: Type.STRING },
        },
        required: ["economics", "roi"],
      },
      "You are a farm economist who knows Indian mandi prices, MSPs and cultivation costs.",
      { thinkingBudget: 0 },
    ),
    // FIELD AGRONOMIST: what to do and what to buy
    genJson<{ timeline: { day: string; task: string }[]; shoppingList: string[] }>(
      `${cropCtx}\n\n` +
        `Produce the field plan:\n` +
        `- timeline: 6-9 milestones from Pre-Sowing to Harvest ("day" like "Pre-Sowing", "Day 20", "Harvest").\n` +
        `- shoppingList: 4-7 concrete inputs with quantities per acre` +
        (c ? ` (fertilizer doses tuned to the soil health card values above)` : "") +
        `.`,
      {
        type: Type.OBJECT,
        properties: {
          timeline: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { day: { type: Type.STRING }, task: { type: Type.STRING } },
              required: ["day", "task"],
            },
          },
          shoppingList: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["timeline", "shoppingList"],
      },
      "You are a field agronomist writing simple, actionable steps for Indian smallholder farmers.",
      { thinkingBudget: 0 },
    ),
  ]);

  return {
    ...selection,
    roi: econ.roi,
    economics: econ.economics,
    timeline: field.timeline,
    shoppingList: field.shoppingList,
  };
}

