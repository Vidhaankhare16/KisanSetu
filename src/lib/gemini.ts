// Gemini via Vertex AI + ADC (no API key to manage). Server-side only.
import "server-only";
import { GoogleGenAI, Type } from "@google/genai";

const project = process.env.GOOGLE_CLOUD_PROJECT || "causal-galaxy-415009";
const location = process.env.VERTEX_LOCATION || "us-central1";
export const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export const ai = new GoogleGenAI({ vertexai: true, project, location });
export { Type };

/** Plain-text generation with a system instruction. */
export async function genText(
  prompt: string,
  system?: string,
): Promise<string> {
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: system ? { systemInstruction: system } : undefined,
  });
  return res.text?.trim() ?? "";
}

/** Structured JSON generation against a response schema.
 *  opts.thinkingBudget: 0 disables Gemini 2.5 "thinking" — much faster for
 *  well-specified structured tasks (crop plans), at no visible quality cost. */
export async function genJson<T>(
  prompt: string,
  schema: object,
  system?: string,
  opts?: { thinkingBudget?: number },
): Promise<T> {
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
      ...(system ? { systemInstruction: system } : {}),
      ...(opts?.thinkingBudget != null
        ? { thinkingConfig: { thinkingBudget: opts.thinkingBudget } }
        : {}),
    },
  });
  return JSON.parse(res.text ?? "{}") as T;
}

/** Multimodal: image (base64) + prompt, returns structured JSON. */
export async function genJsonWithImage<T>(
  imageBase64: string,
  mimeType: string,
  prompt: string,
  schema: object,
  system?: string,
): Promise<T> {
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { inlineData: { data: imageBase64, mimeType } },
      { text: prompt },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
      ...(system ? { systemInstruction: system } : {}),
    },
  });
  return JSON.parse(res.text ?? "{}") as T;
}
