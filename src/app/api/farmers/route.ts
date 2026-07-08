import { NextRequest, NextResponse } from "next/server";
import { getFarmers } from "@/lib/data";

export async function GET(req: NextRequest) {
  const district = req.nextUrl.searchParams.get("district");
  const fpoId = req.nextUrl.searchParams.get("fpoId");
  let farmers = await getFarmers();
  if (district) farmers = farmers.filter((f) => f.district === district);
  if (fpoId) farmers = farmers.filter((f) => f.fpoId === fpoId);
  farmers.sort((a, b) => a.name.localeCompare(b.name));
  // Farmer roster is static during a demo — let the browser reuse it across
  // page navigations instead of re-hitting Firestore on every mount.
  return NextResponse.json(
    { farmers },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=300" } },
  );
}
