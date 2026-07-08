"use client";
// Crop recommendation planner — input form ported from the SIH-2025 advisory
// (district / soil type / water source / optional soil health card), but the
// recommendation covers ALL crops, not just oilseeds. Shared by the Farmer and
// FPO dashboards; generated plans are saved per farmer so both stay in sync.
import { useEffect, useState } from "react";
import { getJSON, postJSON } from "@/lib/client";
import type { CropPlan, District, Farmer, SoilCard } from "@/lib/types";
import { Card, Button, Spinner, Badge } from "@/components/ui";
import { WeatherWidget } from "@/components/WeatherWidget";

const SOILS = ["Sandy Loam", "Clay Loam", "Red Soil", "Black Soil"];
const WATER = ["Rainfed", "Irrigated", "Mixed"];

// Map the farmer record's enum values onto the SIH form's options.
const SOIL_FROM_FARMER: Record<string, string> = {
  red: "Red Soil", black: "Black Soil", alluvial: "Sandy Loam",
  sandy: "Sandy Loam", loamy: "Clay Loam", clay: "Clay Loam",
};
const WATER_FROM_FARMER: Record<string, string> = {
  borewell: "Irrigated", canal: "Irrigated", tank: "Irrigated",
  river: "Irrigated", rainfed: "Rainfed",
};

const EMPTY_CARD: SoilCard = {
  landType: "midland", nitrogen: 0, phosphorus: 0, potassium: 0,
  organicCarbon: 0, electricalConductivity: 0, pH: 0, boron: 0, sulphur: 0,
};

// Typical mid-range Indian soil-test values — shown as placeholders in the
// soil card inputs and used for any field the user leaves blank.
const DEFAULT_CARD: SoilCard = {
  landType: "midland", nitrogen: 280, phosphorus: 23, potassium: 220,
  organicCarbon: 0.6, electricalConductivity: 0.4, pH: 6.8, boron: 0.5, sulphur: 12,
};

// Fill blank (0) numeric fields with the sensible defaults before submitting.
function withDefaults(card: SoilCard): SoilCard {
  const filled = { ...card };
  (Object.keys(DEFAULT_CARD) as (keyof SoilCard)[]).forEach((k) => {
    if (k !== "landType" && !filled[k]) (filled[k] as number) = DEFAULT_CARD[k] as number;
  });
  return filled;
}

export function CropPlanner({
  farmer,
  createdBy,
  showWeather = false,
  onPlan,
}: {
  farmer: Farmer | null;
  createdBy: "farmer" | "fpo";
  showWeather?: boolean;
  onPlan?: (plan: CropPlan) => void;
}) {
  const [districts, setDistricts] = useState<District[]>([]);
  const [district, setDistrict] = useState(farmer?.district ?? "");
  const [soil, setSoil] = useState(SOIL_FROM_FARMER[farmer?.soilType ?? ""] ?? SOILS[0]);
  const [water, setWater] = useState(WATER_FROM_FARMER[farmer?.waterSource ?? ""] ?? WATER[0]);
  const [hasCard, setHasCard] = useState<boolean | null>(null);
  const [card, setCard] = useState<SoilCard>(EMPTY_CARD);
  const [plan, setPlan] = useState<CropPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getJSON<{ districts: District[] }>("/api/districts").then(({ districts }) => {
      setDistricts(districts);
      if (!farmer?.district && districts[0]) setDistrict((d) => d || districts[0].name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the farmer's latest saved plan (may have been generated on the other dashboard).
  useEffect(() => {
    if (!farmer) return;
    getJSON<{ plan: CropPlan | null }>(`/api/recommend?farmerId=${farmer.id}`).then(({ plan }) => {
      if (plan) { setPlan(plan); onPlan?.(plan); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmer?.id]);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const { plan } = await postJSON<{ plan: CropPlan }>("/api/recommend", {
        farmerId: farmer?.id ?? null,
        district, soil, water,
        landAcres: farmer?.landAcres ?? 1,
        soilCard: hasCard ? withDefaults(card) : null,
        createdBy,
      });
      setPlan(plan);
      onPlan?.(plan);
    } catch {
      setError("Could not generate a recommendation. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const districtInfo = districts.find((d) => d.name === district);

  return (
    <div className="flex flex-col gap-4">
      {showWeather && district && (
        <WeatherWidget district={district} lat={districtInfo?.lat} lon={districtInfo?.lon} />
      )}

      {/* Input form — fields mirror the SIH advisory form */}
      <Card className="p-4">
        <div className="mb-3 text-sm font-semibold">Farm details</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            District
            <select value={district} onChange={(e) => setDistrict(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-2 text-sm font-medium text-foreground">
              {districts.map((d) => <option key={d.id} value={d.name}>{d.name} ({d.state})</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Soil type
            <select value={soil} onChange={(e) => setSoil(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-2 text-sm font-medium text-foreground">
              {SOILS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Water source
            <select value={water} onChange={(e) => setWater(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-2 text-sm font-medium text-foreground">
              {WATER.map((w) => <option key={w}>{w}</option>)}
            </select>
          </label>
        </div>

        {/* Soil health card (optional, improves fertilizer accuracy) */}
        <div className="mt-4 rounded-xl bg-background p-3">
          <div className="text-xs font-medium text-muted">
            Do you have a Soil Health Card? <span className="text-muted/70">(more accurate fertilizer advice)</span>
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant={hasCard === true ? "primary" : "ghost"} onClick={() => setHasCard(true)}>Yes</Button>
            <Button size="sm" variant={hasCard === false || hasCard === null ? "primary" : "ghost"} onClick={() => setHasCard(false)}>
              No — use district averages
            </Button>
          </div>
          {hasCard && (
            <p className="mt-2 text-[11px] text-muted">
              Typical values are shown in grey — type your card&apos;s numbers over them; any field left blank uses the typical value.
            </p>
          )}
          {hasCard && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                Land type
                <select value={card.landType}
                  onChange={(e) => setCard({ ...card, landType: e.target.value as SoilCard["landType"] })}
                  className="rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground">
                  <option value="upland">Upland</option>
                  <option value="midland">Midland</option>
                  <option value="lowland">Lowland</option>
                </select>
              </label>
              {(
                [
                  ["nitrogen", "Nitrogen (kg/ha)"],
                  ["phosphorus", "Phosphorus (kg/ha)"],
                  ["potassium", "Potassium (kg/ha)"],
                  ["organicCarbon", "Organic carbon (%)"],
                  ["electricalConductivity", "Electrical conductivity (dS/m)"],
                  ["pH", "Soil pH"],
                  ["boron", "Boron (ppm)"],
                  ["sulphur", "Sulphur (ppm)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex flex-col gap-1 text-xs font-medium text-muted">
                  {label}
                  <input
                    type="number"
                    value={card[key] || ""}
                    placeholder={String(DEFAULT_CARD[key])}
                    onChange={(e) => setCard({ ...card, [key]: Number(e.target.value) })}
                    className="rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground placeholder:text-muted/60"
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={generate} disabled={busy || !district}>
            {busy ? "Analysing soil, weather & markets…" : plan ? "Regenerate recommendation" : "Get crop recommendation"}
          </Button>
          {busy && <Spinner />}
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>
      </Card>

      {plan && <PlanView plan={plan} />}
    </div>
  );
}

export function PlanView({ plan }: { plan: CropPlan }) {
  const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  return (
    <Card className="overflow-hidden">
      {/* Recommendation header */}
      <div className="border-b border-border bg-primary-soft/50 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-3xl">🌱</span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-primary-dark">
              Best crop for your farm · {plan.inputs.season} season
            </div>
            <div className="text-2xl font-bold">
              {plan.cropName} <span className="text-base font-medium text-muted">({plan.localName})</span>
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <Badge tone="green">⏱ {plan.duration}</Badge>
            <Badge tone="saffron">📈 {plan.roi}</Badge>
          </div>
        </div>
        <p className="mt-2 text-sm text-foreground/90">{plan.suitabilityReason}</p>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        {/* Economics */}
        <div>
          <div className="mb-2 text-sm font-semibold">Economics (per acre)</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-danger-soft p-3">
              <div className="text-xs text-muted">Input cost</div>
              <div className="text-lg font-bold text-danger">{fmt(plan.economics.cost)}</div>
            </div>
            <div className="rounded-xl bg-info-soft p-3">
              <div className="text-xs text-muted">Revenue</div>
              <div className="text-lg font-bold text-info">{fmt(plan.economics.revenue)}</div>
            </div>
            <div className="rounded-xl bg-primary-soft p-3">
              <div className="text-xs text-muted">Net profit</div>
              <div className="text-lg font-bold text-primary-dark">{fmt(plan.economics.netProfit)}</div>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">{plan.economics.comparisonText}</p>

          <div className="mb-2 mt-4 text-sm font-semibold">Shopping list</div>
          <ul className="space-y-1.5">
            {plan.shoppingList.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm"><span>🛒</span>{s}</li>
            ))}
          </ul>

          <div className="mb-2 mt-4 text-sm font-semibold">Also worth considering</div>
          <div className="space-y-1.5">
            {plan.alternatives.map((a, i) => (
              <div key={i} className="rounded-lg bg-background px-3 py-2 text-sm">
                <span className="font-semibold">{a.crop}</span> — <span className="text-muted">{a.reason}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div>
          <div className="mb-2 text-sm font-semibold">Cultivation timeline</div>
          <ol className="relative space-y-3 border-l-2 border-primary/30 pl-4">
            {plan.timeline.map((tItem, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[23px] top-1 h-3 w-3 rounded-full bg-primary" />
                <div className="text-xs font-bold uppercase tracking-wide text-primary-dark">{tItem.day}</div>
                <div className="text-sm">{tItem.task}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="border-t border-border px-5 py-2 text-[11px] text-muted">
        Generated {new Date(plan.createdAt).toLocaleString("en-IN")} by {plan.createdBy === "fpo" ? "FPO officer" : "farmer"} ·
        inputs: {plan.inputs.district}, {plan.inputs.soil}, {plan.inputs.water}
        {plan.inputs.soilCard ? ", soil health card" : ""}
      </div>
    </Card>
  );
}
