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
import { useI18n } from "@/lib/i18n";

const FARMER_TYPES: { v: EligibilityProfile["farmerType"]; labelKey: string }[] = [
  { v: "marginal", labelKey: "sc.type.marginal" },
  { v: "small", labelKey: "sc.type.small" },
  { v: "large", labelKey: "sc.type.large" },
  { v: "sharecropper", labelKey: "sc.type.sharecropper" },
  { v: "landless", labelKey: "sc.type.landless" },
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
  const { t } = useI18n();
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
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{t("sc.profile")}</span>
          {farmer && <span className="text-xs text-muted">{t("sc.prefilled", { name: farmer.name })}</span>}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t("sc.farmerType")}
            <select value={profile.farmerType}
              onChange={(e) => set("farmerType", e.target.value as EligibilityProfile["farmerType"])}
              className="rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground">
              {FARMER_TYPES.map((f) => <option key={f.v} value={f.v}>{t(f.labelKey)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t("sc.landSize")}
            <input type="number" min={0} step={0.1} value={profile.landAcres || ""}
              onChange={(e) => set("landAcres", Number(e.target.value))}
              className="rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t("sc.category")}
            <select value={profile.category}
              onChange={(e) => set("category", e.target.value as EligibilityProfile["category"])}
              className="rounded-lg border border-border bg-surface px-2 py-2 text-sm text-foreground">
              <option value="general">{t("sc.cat.general")}</option>
              <option value="sc">{t("sc.cat.sc")}</option>
              <option value="st">{t("sc.cat.st")}</option>
            </select>
          </label>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(
            [
              ["isFPOMember", "sc.chk.fpo"],
              ["isInCluster", "sc.chk.cluster"],
              ["hasRiceFallow", "sc.chk.fallow"],
              ["isRegistered", "sc.chk.registered"],
              ["hasBankLoan", "sc.chk.loan"],
            ] as const
          ).map(([key, labelKey]) => (
            <label key={key} className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-sm">
              <input type="checkbox" checked={profile[key]} onChange={(e) => set(key, e.target.checked)}
                className="h-4 w-4 accent-[var(--color-primary,#15803d)]" />
              {t(labelKey)}
            </label>
          ))}
        </div>
      </Card>

      {/* Results */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="green">{t("sc.eligibleCount", { n: eligibleCount, total: matches.length })}</Badge>
        <label className="ml-auto flex items-center gap-2 text-xs font-medium text-muted">
          <input type="checkbox" checked={onlyEligible} onChange={(e) => setOnlyEligible(e.target.checked)}
            className="h-4 w-4" />
          {t("sc.showEligible")}
        </label>
      </div>

      <div className="flex flex-col gap-3">
        {shown.map(({ scheme, result }) => {
          const app = appFor(scheme.id);
          const expanded = open === scheme.id;
          return (
            <Card key={scheme.id} className={`p-4 ${result.eligible ? "" : "opacity-70"}`}>
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-2xl leading-none">{scheme.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-bold leading-snug">{scheme.name}</span>
                    <button onClick={() => setOpen(expanded ? null : scheme.id)}
                      className="shrink-0 whitespace-nowrap pt-0.5 text-xs font-medium text-primary hover:underline">
                      {expanded ? t("sc.hide") : t("sc.details")}
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone="blue">{scheme.level}</Badge>
                    {result.eligible ? <Badge tone="green">{t("sc.eligible")}</Badge> : <Badge tone="red">{t("sc.notEligible")}</Badge>}
                    {app && (
                      <Badge tone={app.status === "approved" ? "green" : "saffron"}>
                        {app.status === "approved" ? t("sc.approved") : t("sc.awaiting")}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-foreground/90">{scheme.benefit}</p>
                  <p className={`mt-1 text-xs ${result.eligible ? "text-primary-dark" : "text-danger"}`}>
                    {result.eligible ? t("sc.why") : t("sc.whyNot")}{result.reason}
                  </p>
                  {expanded && (
                    <div className="mt-2 rounded-xl bg-background p-3 text-sm">
                      <ul className="list-disc space-y-1 pl-4 text-foreground/90">
                        {scheme.details.map((d, i) => <li key={i}>{d}</li>)}
                      </ul>
                      <p className="mt-2 text-xs text-muted"><b>{t("sc.howApply")}</b> {scheme.howToApply}</p>
                      <p className="text-xs text-muted"><b>{t("sc.deptLabel")}</b> {scheme.dept}</p>
                    </div>
                  )}
                  {onApply && result.eligible && !app && (
                    <Button size="sm" className="mt-3 w-full sm:w-auto" disabled={applying === scheme.id}
                      onClick={() => onApply({ scheme, result })}>
                      {applying === scheme.id ? t("sc.notifying") : t("sc.notify")}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <p className="text-[11px] text-muted">
        {t("sc.foot")}
      </p>
    </div>
  );
}
