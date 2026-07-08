import { NextResponse } from "next/server";
import { getFarmer, getQueriesForFarmer } from "@/lib/data";
import { evaluateSchemes, profileFromFarmer } from "@/lib/schemes";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const farmer = await getFarmer(id);
  if (!farmer) return NextResponse.json({ error: "not found" }, { status: 404 });
  const queries = await getQueriesForFarmer(id);
  const eligibleSchemes = evaluateSchemes(profileFromFarmer(farmer))
    .filter((m) => m.result.eligible)
    .map(({ scheme, result }) => ({ id: scheme.id, name: scheme.name, benefit: scheme.benefit, reason: result.reason }));
  return NextResponse.json({ farmer, queries, eligibleSchemes });
}
