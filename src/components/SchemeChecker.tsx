"use client";
// Government scheme eligibility checker — profile fields ported from the
// SIH-2025 "About Schemes" page, with a factual national scheme catalog
// (src/lib/schemes.ts) and deterministic, explainable eligibility rules.
// Used on the Farmer dashboard (self-check) and the FPO dashboard (check &
// apply on a member's behalf).
import { useMemo, useState } from "react";
import type { Farmer, Application } from "@/lib/types";
import {
  evaluateSchemes, profileFromFarmer, type EligibilityProfile, type SchemeMatch,
} from "@/lib/schemes";
import { Card, Badge, Button } from "@/components/ui";

const FARMER_TYPES: { v: EligibilityProfile["farmerType"]; label: string }[] = [
  { v: "marginal", label: "Marginal (≤ 2.5 acres)" },
  { v: "small", label: "Small (2.5–5 acres)" },
  { v: "large", label: "Large (> 5 acres)" },
  { v: "sharecropper", label: "Sharecropper / tenant" },
  { v: "landless", label: "Landless labourer" },
];

export function SchemeChecker({
  farmer,
  applications = [],
  onApply,
  applying,
}: {
  farmer: Farmer | null;
  /** Existing applications for this farmer, to show applied/approved status. */
  applications?: Application[];
  /** FPO mode: render an Apply button on eligible schemes. */
  onApply?: (match: SchemeMatch) => void;
  applying?: string | null; // schemeId currently being applied
}) {
  const [profile, setProfile] = useState<EligibilityProfile>(() =>
    farmer ? profileFromFarmer(farmer) : profileFromFarmer({ landAcres: 2 }),
  );
  const [onlyEligible, setOnlyEligible] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const matches = useMemo(() => evaluateSchemes(profile), [profile]);
  const eligibleCount = matches.filter((m) => m.result.eligible).length;
  const shown = onlyEligible ? matches.filter((m) => m.result.eligible) : matches;
  const appFor = (schemeId: string) => applications.find((a) => a.schemeId === schemeId);

  const set = <K extends keyof EligibilityProfile>(k: K, v: EligibilityProfile[K]) =>
    setProfile((p) => ({ ...p, [k]: v }));

  return (
    <div className="flex flex-col gap-4">
      {/* Profile */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-sm font-semibold">Farmer profile</span>
          {farmer && <span className="text-xs text-muted">pre-filled from {farmer.name}&apos;s record — adjust if needed</span>}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Farmer type
            <select value={profile.farmerType}
              onChange={(e) => set("farmerType", e.target.value as EligibilityProfile["farmerType"])}
              className="rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground">
              {FARMER_TYPES.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Land size (acres)
            <input type="number" min={0} step={0.1} value={profile.landAcres || ""}
              onChange={(e) => set("landAcres", Number(e.target.value))}
              className="rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Category
            <select value={profile.category}
              onChange={(e) => set("category", e.target.value as EligibilityProfile["category"])}
              className="rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground">
              <option value="general">General</option>
              <option value="sc">SC</option>
              <option value="st">ST</option>
            </select>
          </label>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(
            [
              ["isFPOMember", "Member of an FPO / cooperative"],
              ["isInCluster", "Farm is in a value-chain cluster (e.g. oilseed cluster)"],
              ["hasRiceFallow", "Land lies fallow after Kharif paddy"],
              ["isRegistered", "Registered on the state farmer portal (land records)"],
              ["hasBankLoan", "Has a crop loan / Kisan Credit Card"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-sm">
              <input type="checkbox" checked={profile[key]} onChange={(e) => set(key, e.target.checked)}
                className="h-4 w-4 accent-[var(--color-primary,#15803d)]" />
              {label}
            </label>
          ))}
        </div>
      </Card>

      {/* Results */}
      <div className="flex items-center gap-3">
        <Badge tone="green">✓ Eligible for {eligibleCount} of {matches.length} schemes</Badge>
        <label className="ml-auto flex items-center gap-2 text-xs font-medium text-muted">
          <input type="checkbox" checked={onlyEligible} onChange={(e) => setOnlyEligible(e.target.checked)}
            className="h-4 w-4" />
          Show eligible only
        </label>
      </div>

      <div className="flex flex-col gap-3">
        {shown.map(({ scheme, result }) => {
          const app = appFor(scheme.id);
          const expanded = open === scheme.id;
          return (
            <Card key={scheme.id} className={`p-4 ${result.eligible ? "" : "opacity-70"}`}>
              <div className="flex flex-wrap items-start gap-3">
                <span className="text-2xl">{scheme.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold">{scheme.name}</span>
                    <Badge tone="blue">{scheme.level}</Badge>
                    {result.eligible ? <Badge tone="green">✓ Eligible</Badge> : <Badge tone="red">Not eligible</Badge>}
                    {app && (
                      <Badge tone={app.status === "approved" ? "green" : "saffron"}>
                        {app.status === "approved" ? "✓ Approved" : "⏳ RSK/Govt notified — awaiting approval"}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-foreground/90">{scheme.benefit}</p>
                  <p className={`mt-1 text-xs ${result.eligible ? "text-primary-dark" : "text-danger"}`}>
                    {result.eligible ? "Why: " : "Why not: "}{result.reason}
                  </p>
                  {expanded && (
                    <div className="mt-2 rounded-xl bg-background p-3 text-sm">
                      <ul className="list-disc space-y-1 pl-4 text-foreground/90">
                        {scheme.details.map((d, i) => <li key={i}>{d}</li>)}
                      </ul>
                      <p className="mt-2 text-xs text-muted"><b>How to apply:</b> {scheme.howToApply}</p>
                      <p className="text-xs text-muted"><b>Department:</b> {scheme.dept}</p>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <button onClick={() => setOpen(expanded ? null : scheme.id)}
                    className="text-xs font-medium text-primary hover:underline">
                    {expanded ? "Hide details" : "Details"}
                  </button>
                  {onApply && result.eligible && !app && (
                    <Button size="sm" disabled={applying === scheme.id}
                      onClick={() => onApply({ scheme, result })}>
                      {applying === scheme.id ? "Notifying…" : "🔔 Notify Rythu Seva Kendra / Govt"}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <p className="text-[11px] text-muted">
        Amounts and premiums are as per official scheme guidelines; final eligibility is confirmed at enrolment.
        All schemes are free government services — never pay an agent.
      </p>
    </div>
  );
}
