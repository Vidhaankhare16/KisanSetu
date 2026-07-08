import { NextResponse } from "next/server";
import { getDistricts } from "@/lib/data";

export async function GET() {
  return NextResponse.json(
    { districts: await getDistricts() },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" } },
  );
}
