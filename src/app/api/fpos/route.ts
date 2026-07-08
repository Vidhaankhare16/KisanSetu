import { NextResponse } from "next/server";
import { db } from "@/lib/firestore";

export async function GET() {
  const snap = await db.collection("fpos").get();
  const fpos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json(
    { fpos },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" } },
  );
}
