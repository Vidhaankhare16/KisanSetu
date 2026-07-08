"use client";
// FPO dashboard — an officer picks a member farmer and, using the farmer's
// details: (1) checks scheme eligibility and APPLIES on their behalf (the
// application goes to the Government dashboard for approval), and
// (2) generates a crop plan and SENDS it to the farmer by simulated SMS.
import { useCallback, useEffect, useState } from "react";
import { getJSON, postJSON } from "@/lib/client";
import type { Farmer, Application, CropPlan } from "@/lib/types";
import type { SchemeMatch } from "@/lib/schemes";
import { Card, Badge, Button } from "@/components/ui";
import { CropPlanner } from "@/components/CropPlanner";
import { SchemeChecker } from "@/components/SchemeChecker";

interface Fpo { id: string; name: string; district: string; staff: string }

type Tab = "schemes" | "crops";

export default function FpoPage() {
  const [fpos, setFpos] = useState<Fpo[]>([]);
  const [fpoId, setFpoId] = useState("");
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("schemes");
  const [apps, setApps] = useState<Application[]>([]);
  const [applying, setApplying] = useState<string | null>(null);
  const [plan, setPlan] = useState<CropPlan | null>(null);
  const [smsStatus, setSmsStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [toast, setToast] = useState("");

  useEffect(() => {
    getJSON<{ fpos: Fpo[] }>("/api/fpos").then(({ fpos }) => {
      setFpos(fpos);
      if (fpos[0]) setFpoId(fpos[0].id);
    });
  }, []);

  useEffect(() => {
    if (!fpoId) return;
    getJSON<{ farmers: Farmer[] }>(`/api/farmers?fpoId=${fpoId}`).then((d) => {
      setFarmers(d.farmers);
      setSelectedId(d.farmers[0]?.id ?? null);
      setPlan(null);
      setSmsStatus("idle");
    });
  }, [fpoId]);

  const refreshApps = useCallback(() => {
    if (!selectedId) return;
    getJSON<{ applications: Application[] }>(`/api/applications?farmerId=${selectedId}`)
      .then((d) => setApps(d.applications))
      .catch(() => setApps([]));
  }, [selectedId]);

  useEffect(() => {
    refreshApps();
  }, [refreshApps]);

  // Selecting a different farmer clears the previous farmer's plan state.
  function pickFarmer(id: string) {
    setSelectedId(id);
    setPlan(null);
    setSmsStatus("idle");
  }

  const fpo = fpos.find((f) => f.id === fpoId);
  const farmer = farmers.find((f) => f.id === selectedId) ?? null;

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }

  async function apply(match: SchemeMatch) {
    if (!farmer) return;
    setApplying(match.scheme.id);
    try {
      await postJSON("/api/applications", {
        farmerId: farmer.id,
        schemeId: match.scheme.id,
        appliedBy: "fpo",
        fpoId,
        reason: match.result.reason,
      });
      refreshApps();
      flash(`✓ Rythu Seva Kendra / Govt notified that ${farmer.name} should get ${match.scheme.shortName} — awaiting approval on the Government dashboard.`);
    } finally {
      setApplying(null);
    }
  }

  async function sendPlanSms() {
    if (!farmer || !plan) return;
    setSmsStatus("sending");
    // Bilingual (English + Hindi) so every farmer can read it.
    const body =
      `KisanSetu crop plan for this ${plan.inputs.season}: grow ${plan.cropName} (${plan.localName}). ` +
      `${plan.roi}. Duration ${plan.duration}. First step: ${plan.timeline[0]?.task ?? "prepare the field"}. ` +
      `Full plan is in your KisanSetu app.\n\n` +
      `KisanSetu फसल योजना (${plan.inputs.season}): ${plan.cropName} (${plan.localName}) उगाएँ। ` +
      `अवधि ${plan.duration}। पूरी योजना आपके KisanSetu ऐप में है। — ${fpo?.name ?? "Your FPO"}`;
    try {
      await postJSON("/api/sms", { to: farmer.phone, farmerId: farmer.id, from: "KISAN-FPO", body });
      setSmsStatus("sent");
      flash(`✓ Crop plan sent to ${farmer.name} by SMS — open the Farmer dashboard's 📱 inbox to see it.`);
    } catch {
      setSmsStatus("idle");
      flash("Could not send the SMS — try again.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header: FPO picker */}
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent-soft text-2xl">🤝</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">FPO (Farmer Producer Organisation)</div>
          <select
            value={fpoId}
            onChange={(e) => setFpoId(e.target.value)}
            className="mt-0.5 w-full max-w-full rounded-lg border border-border bg-surface px-2 py-1 text-base font-bold sm:text-lg"
          >
            {fpos.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          {fpo && <div className="mt-0.5 text-xs text-muted">{fpo.district} · Officer: {fpo.staff}</div>}
        </div>
        <div className="w-full text-xs text-muted sm:ml-auto sm:max-w-xs sm:text-right">
          Pick a member farmer, apply for schemes on their behalf, and SMS them their crop plan.
        </div>
      </Card>

      {toast && (
        <div className="rounded-xl bg-primary-soft px-4 py-3 text-sm font-medium text-primary-dark ring-1 ring-primary/20">
          {toast}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Member farmers */}
        <Card className="self-start overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Member farmers</div>
          <div className="divide-y divide-border">
            {farmers.map((f) => (
              <button
                key={f.id}
                onClick={() => pickFarmer(f.id)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-background ${
                  selectedId === f.id ? "bg-primary-soft/50" : ""
                }`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-sm font-bold text-primary-dark">
                  {f.name.charAt(0)}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{f.name}</div>
                  <div className="truncate text-xs text-muted">{f.village} · {f.landAcres} acres</div>
                </div>
              </button>
            ))}
            {farmers.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted">No members.</div>}
          </div>
        </Card>

        {/* Farmer work area */}
        {farmer ? (
          <div className="flex min-w-0 flex-col gap-4">
            {/* Farmer summary */}
            <Card className="flex flex-wrap items-center gap-3 p-4">
              <div>
                <div className="text-lg font-bold">{farmer.name}</div>
                <div className="text-xs text-muted">
                  {farmer.village}, {farmer.district} · {farmer.phone} · {farmer.landAcres} acres ·{" "}
                  {farmer.soilType} soil · {farmer.waterSource} · grows {farmer.crops.join(", ")}
                </div>
              </div>
              <nav className="ml-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-background p-1">
                {([
                  { id: "schemes", label: "🏛️ Scheme eligibility & notify" },
                  { id: "crops", label: "🌱 Crop plan → SMS" },
                ] as { id: Tab; label: string }[]).map((tb) => (
                  <button
                    key={tb.id}
                    onClick={() => setTab(tb.id)}
                    className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      tab === tb.id ? "bg-accent text-white shadow-sm" : "text-muted hover:text-foreground"
                    }`}
                  >
                    {tb.label}
                  </button>
                ))}
              </nav>
            </Card>

            {tab === "schemes" && (
              <>
                {apps.length > 0 && (
                  <Card className="p-4">
                    <div className="mb-2 text-sm font-semibold">Applications for {farmer.name}</div>
                    <div className="flex flex-col gap-2">
                      {apps.map((a) => (
                        <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-background px-3 py-2 text-sm">
                          <span className="font-medium">{a.schemeName}</span>
                          <Badge tone={a.status === "approved" ? "green" : "saffron"}>
                            {a.status === "approved" ? "✓ Approved by Government" : "⏳ Awaiting Government approval"}
                          </Badge>
                          {a.notifiedVia && <Badge tone="blue">farmer notified via {a.notifiedVia}</Badge>}
                          <span className="ml-auto text-xs text-muted">
                            {new Date(a.createdAt).toLocaleDateString("en-IN")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
                <SchemeChecker
                  key={farmer.id}
                  farmer={farmer}
                  applications={apps}
                  onApply={apply}
                  applying={applying}
                />
              </>
            )}

            {tab === "crops" && (
              <>
                <CropPlanner key={farmer.id} farmer={farmer} createdBy="fpo" onPlan={setPlan} />
                {plan && (
                  <Card className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">Send this plan to {farmer.name}</div>
                      <div className="text-xs text-muted">
                        A short SMS with the crop, expected profit and first step goes to {farmer.phone} (simulated in the browser).
                      </div>
                    </div>
                    <Button variant="accent" onClick={sendPlanSms} disabled={smsStatus === "sending"}>
                      {smsStatus === "sent" ? "✓ Sent — send again" : smsStatus === "sending" ? "Sending…" : "📱 Send plan via SMS"}
                    </Button>
                  </Card>
                )}
              </>
            )}
          </div>
        ) : (
          <Card className="grid min-h-[300px] place-items-center p-8 text-center text-muted">
            <div><div className="mb-2 text-4xl">👈</div>Select a member farmer.</div>
          </Card>
        )}
      </div>
    </div>
  );
}
