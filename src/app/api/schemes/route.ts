import { NextResponse } from "next/server";
import { SCHEMES } from "@/lib/schemes";

// Scheme catalog now lives in code (src/lib/schemes.ts) so eligibility rules
// are deterministic and identical everywhere; the check functions are dropped
// from the JSON payload (clients import the module directly instead).
export async function GET() {
  // Scheme catalog is immutable (lives in code) — cache it hard.
  return NextResponse.json(
    { schemes: SCHEMES.map(({ check: _check, ...rest }) => rest) },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } },
  );
}
