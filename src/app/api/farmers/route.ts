import { NextRequest, NextResponse } from "next/server";
import { getFarmers } from "@/lib/data";

export async function GET(req: NextRequest) {
  const district = req.nextUrl.searchParams.get("district");
  const fpoId = req.nextUrl.searchParams.get("fpoId");
  let farmers = await getFarmers();
  if (district) farmers = farmers.filter((f) => f.district === district);
  if (fpoId) farmers = farmers.filter((f) => f.fpoId === fpoId);
  farmers.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ farmers });
}
