"use client";
// Small client-side fetch helpers.

export async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
}

export async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${url} → ${res.status}`);
  return res.json();
}

export async function patchJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${url} → ${res.status}`);
  return res.json();
}

export interface ImagePayload { base64: string; mime: string; dataUrl: string }

/**
 * Prepare a photo for multimodal upload the way real chat apps do: downscale
 * to a sane resolution and re-encode as JPEG so a 12MP camera shot doesn't
 * blow the request limit. Falls back to the raw file if canvas work fails.
 */
export async function imageToPayload(file: File, maxDim = 1280): Promise<ImagePayload> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { base64: dataUrl.split(",")[1], mime: "image/jpeg", dataUrl };
  } catch {
    return fileToBase64(file);
  }
}

/** Read a File as base64 (no data: prefix) for multimodal upload. */
export function fileToBase64(file: File): Promise<{ base64: string; mime: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve({ base64: dataUrl.split(",")[1], mime: file.type, dataUrl });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
