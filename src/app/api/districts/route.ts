import { NextResponse } from "next/server";
import { getDistricts } from "@/lib/data";

export async function GET() {
  return NextResponse.json({ districts: await getDistricts() });
}
