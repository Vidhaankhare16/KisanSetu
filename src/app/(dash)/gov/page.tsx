"use client";
// Government dashboard — one job only: see FPOs and their farmers, review the
// AI-recommended schemes for each farmer (plus applications submitted by
// FPOs), and APPROVE them. Approval notifies the farmer by simulated SMS or a
// real AI voice call.
import { useCallback, useEffect, useMemo, useState } from "react";
import { getJSON, postJSON, patchJSON } from "@/lib/client";
import { LANG_LABELS, type Farmer, type Application } from "@/lib/types";
import { evaluateSchemes, profileFromFarmer } from "@/lib/schemes";
import { Card, Badge, Button, Stat } from "@/components/ui";

interface Fpo { id: string; name: string; district: string; staff: string }
type AppWithFarmer = Application & { farmer: Farmer | null };

export default function GovPage() {
  const [fpos, setFpos] = useState<Fpo[]>([]);
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [apps, setApps] = useState<AppWithFarmer[]>([]);
  const [fpoFilter, setFpoFilter] = useState("all");
  const [busy, setBusy] = useState<string | null>(null); // key of the action in flight
  const [toast, setToast] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null); // farmer row open in the directory

  const refresh = useCallback(() => {
    getJSON<{ farmers: Farmer[] }>("/api/farmers").then((d) => setFarmers(d.farmers));
    getJSON<{ applications: AppWithFarmer[] }>("/api/applications").then((d) => setApps(d.applications));
  }, []);

  useEffect(() => {
    refresh();
    getJSON<{ fpos: Fpo[] }>("/api/fpos").then((d) => setFpos(d.fpos));
  }, [refresh]);

  const visibleFarmers = useMemo(
    () => (fpoFilter === "all" ? farmers : farmers.filter((f) => f.fpoId === fpoFilter)),
    [farmers, fpoFilter],
  );
  const pending = apps.filter(
    (a) => a.status === "applied" && (fpoFilter === "all" || a.fpoId === fpoFilter),
  );
  const approved = apps.filter((a) => a.status === "approved");

  // AI recommendations per farmer: eligible schemes with no application yet
  // (deterministic rules from the shared catalog — the same logic the farmer
  // and FPO dashboards use, so all three always agree).
  const directory = useMemo(() => {
    return visibleFarmers.map((farmer) => {
      const farmerApps = apps.filter((a) => a.farmerId === farmer.id);
      const existing = new Set(farmerApps.map((a) => a.schemeId));
      const recs = evaluateSchemes(profileFromFarmer(farmer))
        .filter((m) => m.result.eligible && !existing.has(m.scheme.id))
        .slice(0, 3);
      return { farmer, recs, farmerApps };
    });
  }, [visibleFarmers, apps]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 5000);
  }

  async function approveApplication(app: AppWithFarmer, notify: "sms" | "call") {
    setBusy(`${app.id}-${notify}`);
    try {
      const res = await patchJSON<{ ok: boolean; delivery: string }>("/api/applications", { id: app.id, notify });
      flash(
        notify === "sms"
          ? `✓ ${app.schemeName} approved for ${app.farmer?.name}. SMS delivered — check the 📱 inbox on the Farmer dashboard.`
          : `✓ ${app.schemeName} approved for ${app.farmer?.name}. Voice call: ${res.delivery}.`,
      );
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function approveRecommendation(farmer: Farmer, schemeId: string, reason: string, notify: "sms" | "call") {
    setBusy(`${farmer.id}-${schemeId}-${notify}`);
    try {
      const { application } = await postJSON<{ application: Application }>("/api/applications", {
        farmerId: farmer.id, schemeId, appliedBy: "gov", fpoId: farmer.fpoId, reason,
      });
      const res = await patchJSON<{ ok: boolean; delivery: string }>("/api/applications", {
        id: application.id, notify,
      });
      flash(
        notify === "sms"
          ? `✓ Approved for ${farmer.name}. SMS delivered — visible in the Farmer dashboard's 📱 inbox.`
          : `✓ Approved for ${farmer.name}. Voice call: ${res.delivery}.`,
      );
      refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-info-soft text-2xl">🏛️</span>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Department of Agriculture</div>
          <div className="text-lg font-bold">Scheme Approvals</div>
          <div className="text-xs text-muted">Review AI-recommended schemes and FPO applications; approving notifies the farmer by SMS or AI voice call.</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs font-medium text-muted">FPO</label>
          <select
            value={fpoFilter}
            onChange={(e) => setFpoFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm font-medium"
          >
            <option value="all">All FPOs</option>
            {fpos.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="FPOs" value={fpos.length} tone="blue" />
        <Stat label="Farmers" value={visibleFarmers.length} />
        <Stat label="Pending applications" value={pending.length} tone="saffron" />
        <Stat label="Approved" value={approved.length} tone="green" />
      </div>

      {toast && (
        <div className="rounded-xl bg-primary-soft px-4 py-3 text-sm font-medium text-primary-dark ring-1 ring-primary/20">
          {toast}
        </div>
      )}

      {/* Pending FPO applications — the queue to act on first */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">⏳ Applications from FPOs awaiting approval</span>
        </div>
        <div className="divide-y divide-border">
          {pending.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  {a.farmer?.name ?? "Farmer"} · <span className="text-primary-dark">{a.schemeName}</span>
                </div>
                <div className="text-xs text-muted">
                  {a.farmer && <>{a.farmer.village}, {a.farmer.district} · {a.farmer.landAcres} acres · </>}
                  applied by {fpos.find((f) => f.id === a.fpoId)?.name ?? "FPO"} · why: {a.reason}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => approveApplication(a, "sms")} disabled={busy === `${a.id}-sms`}>
                  {busy === `${a.id}-sms` ? "Approving…" : "✓ Approve & SMS"}
                </Button>
                <Button size="sm" variant="accent" onClick={() => approveApplication(a, "call")} disabled={busy === `${a.id}-call`}>
                  {busy === `${a.id}-call` ? "Calling…" : "📞 Approve & Call"}
                </Button>
              </div>
            </div>
          ))}
          {pending.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted">
              No pending applications — FPO submissions appear here.
            </div>
          )}
        </div>
      </Card>

      {/* Farmer directory — click a name to expand full details + AI-recommended schemes */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">👨‍🌾 Farmers</span>
          <span className="ml-2 text-xs text-muted">tap a farmer to see their details and AI-recommended schemes</span>
        </div>
        <div className="divide-y divide-border">
          {directory.map(({ farmer, recs, farmerApps }) => {
            const fpoName = fpos.find((f) => f.id === farmer.fpoId)?.name ?? "No FPO";
            const expanded = expandedId === farmer.id;
            return (
              <div key={farmer.id}>
                <button
                  onClick={() => setExpandedId(expanded ? null : farmer.id)}
                  className={`flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition hover:bg-background ${
                    expanded ? "bg-info-soft/30" : ""
                  }`}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-info-soft text-sm font-bold text-info">
                    {farmer.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{farmer.name}</div>
                    <div className="truncate text-xs text-muted">{farmer.village}, {farmer.district} · {fpoName}</div>
                  </div>
                  {recs.length > 0 && <Badge tone="saffron">{recs.length} recommended</Badge>}
                  <span className={`text-muted transition-transform ${expanded ? "rotate-180" : ""}`}>▾</span>
                </button>

                {expanded && (
                  <div className="flex flex-col gap-3 bg-background/60 px-4 pb-4 pt-1">
                    {/* Full profile */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-surface p-3 text-sm ring-1 ring-border sm:grid-cols-3">
                      {([
                        ["📍 Location", `${farmer.village}, ${farmer.district}`],
                        ["🤝 FPO organisation", fpoName],
                        ["📞 Phone", farmer.phone],
                        ["🌾 Land", `${farmer.landAcres} acres`],
                        ["🪨 Soil · water", `${farmer.soilType} · ${farmer.waterSource}`],
                        ["🌱 Crops", farmer.crops.join(", ")],
                        ["🗣️ Language", LANG_LABELS[farmer.lang]],
                        ["🏷️ Category", (farmer.category ?? "general").toUpperCase()],
                        ["💧 Groundwater depth", `${farmer.groundwaterDepthM} m`],
                      ] as const).map(([label, value]) => (
                        <div key={label}>
                          <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
                          <div className="font-medium">{value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Existing applications */}
                    {farmerApps.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {farmerApps.map((a) => (
                          <Badge key={a.id} tone={a.status === "approved" ? "green" : "saffron"}>
                            {a.schemeName}: {a.status === "approved" ? "✓ approved" : "⏳ pending"}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* AI-recommended schemes with approve actions */}
                    <div className="text-xs font-semibold text-muted">🤖 AI-recommended schemes (not yet applied)</div>
                    {recs.map(({ scheme, result }) => {
                      const kSms = `${farmer.id}-${scheme.id}-sms`;
                      const kCall = `${farmer.id}-${scheme.id}-call`;
                      return (
                        <div key={scheme.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2 ring-1 ring-border">
                          <span className="text-lg">{scheme.icon}</span>
                          <div className="min-w-0 flex-1 basis-48">
                            <span className="text-sm font-medium">{scheme.shortName}</span>
                            <Badge tone="blue">{scheme.level}</Badge>
                            <div className="text-xs text-muted">{result.reason}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => approveRecommendation(farmer, scheme.id, result.reason, "sms")}
                              disabled={busy === kSms}>
                              {busy === kSms ? "Approving…" : "✓ Approve & SMS"}
                            </Button>
                            <Button size="sm" variant="accent" onClick={() => approveRecommendation(farmer, scheme.id, result.reason, "call")}
                              disabled={busy === kCall}>
                              {busy === kCall ? "Calling…" : "📞 Approve & Call"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {recs.length === 0 && (
                      <div className="text-xs text-muted">All eligible schemes for this farmer already have applications.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {directory.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted">No farmers under this FPO.</div>
          )}
        </div>
      </Card>

      {/* Approved history */}
      {approved.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">✅ Approved</div>
          <div className="divide-y divide-border">
            {approved.slice(0, 10).map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                <span className="font-medium">{a.farmer?.name}</span>
                <span className="text-muted">·</span>
                <span>{a.schemeName}</span>
                {a.notifiedVia && <Badge tone="blue">notified via {a.notifiedVia}</Badge>}
                <span className="ml-auto text-xs text-muted">
                  {a.approvedAt ? new Date(a.approvedAt).toLocaleString("en-IN") : ""}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
