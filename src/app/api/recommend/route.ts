import { NextRequest, NextResponse } from "next/server";
import { getDistrictByName, newId } from "@/lib/data";
import { generateCropPlan } from "@/lib/ai";
import { db, COL } from "@/lib/firestore";
import type { CropPlan, CropPlanInputs, SoilCard } from "@/lib/types";

// Crop recommendation (SIH-style advisory): same inputs as the SIH form
// (district / soil / water / optional soil health card) but for ALL crops.
// Persisted per farmer so a plan generated on one dashboard (farmer or FPO)
// is visible on the others.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    farmerId?: string | null;
    district: string;
    soil: string;
    water: string;
    landAcres?: number;
    soilCard?: SoilCard | null;
    createdBy?: "farmer" | "fpo";
  };
  if (!body.district || !body.soil || !body.water) {
    return NextResponse.json({ error: "district, soil and water are required" }, { status: 400 });
  }

  const month = new Date().getMonth() + 1;
  const season = month >= 6 && month <= 9 ? "Kharif" : month >= 10 || month <= 2 ? "Rabi" : "Zaid (summer)";
  const inputs: CropPlanInputs = {
    district: body.district,
    soil: body.soil,
    water: body.water,
    landAcres: body.landAcres ?? 1,
    season,
    soilCard: body.soilCard ?? null,
  };

  const district = await getDistrictByName(body.district);
  const gen = await generateCropPlan(inputs, district);

  const plan: CropPlan = {
    id: newId("plan"),
    farmerId: body.farmerId ?? null,
    inputs,
    ...gen,
    createdBy: body.createdBy ?? "farmer",
    createdAt: Date.now(),
  };
  if (plan.farmerId) {
    const { id, ...rest } = plan;
    await db.collection(COL.plans).doc(id).set(rest);
  }
  return NextResponse.json({ plan });
}

// Latest saved plan for a farmer (FPO/farmer dashboards stay in sync).
export async function GET(req: NextRequest) {
  const farmerId = req.nextUrl.searchParams.get("farmerId");
  if (!farmerId) return NextResponse.json({ error: "farmerId required" }, { status: 400 });
  const snap = await db.collection(COL.plans).where("farmerId", "==", farmerId).get();
  const plans = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as CropPlan)
    .sort((a, b) => b.createdAt - a.createdAt);
  return NextResponse.json({ plan: plans[0] ?? null });
}
