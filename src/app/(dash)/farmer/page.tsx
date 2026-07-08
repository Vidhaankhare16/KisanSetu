"use client";
// Farmer dashboard — three clean tabs, nothing else:
//   AI Assistant (Gemini-style chat) · Crop Recommendation · Govt Schemes
// Plus the simulated SMS inbox, where FPO/Government messages arrive.
import { useEffect, useState } from "react";
import { getJSON } from "@/lib/client";
import type { Farmer, Application } from "@/lib/types";
import { ChatPanel } from "@/components/farmer/ChatPanel";
import { CropPlanner } from "@/components/CropPlanner";
import { SchemeChecker } from "@/components/SchemeChecker";
import { SmsInbox } from "@/components/SmsInbox";
import { useI18n } from "@/lib/i18n";

const LS_KEY = "kisansetu.activeFarmer";

type Tab = "assistant" | "crops" | "schemes";
const TABS: { id: Tab; labelKey: string; icon: string }[] = [
  { id: "assistant", labelKey: "tab.assistant", icon: "💬" },
  { id: "crops", labelKey: "tab.crops", icon: "🌱" },
  { id: "schemes", labelKey: "tab.schemes", icon: "🏛️" },
];

export default function FarmerPage() {
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [tab, setTab] = useState<Tab>("assistant");
  const [apps, setApps] = useState<Application[]>([]);
  // Chat language follows the global header language switcher.
  const { lang, t } = useI18n();

  useEffect(() => {
    getJSON<{ farmers: Farmer[] }>("/api/farmers").then(({ farmers }) => {
      setFarmers(farmers);
      const saved = localStorage.getItem(LS_KEY);
      const initial = farmers.find((f) => f.id === saved) ?? farmers[0];
      if (initial) setActiveId(initial.id);
    });
  }, []);

  // Applications, so the schemes tab shows applied/approved states set by FPO/Gov.
  useEffect(() => {
    if (!activeId) return;
    getJSON<{ applications: Application[] }>(`/api/applications?farmerId=${activeId}`)
      .then((d) => setApps(d.applications))
      .catch(() => setApps([]));
  }, [activeId, tab]);

  const farmer = farmers.find((f) => f.id === activeId) ?? null;

  function pick(id: string) {
    setActiveId(id);
    localStorage.setItem(LS_KEY, id);
  }

  if (!farmer) {
    return <div className="py-20 text-center text-muted">{t("common.loading")}</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar: tabs + identity + SMS inbox */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <nav className="flex w-full items-center gap-1 overflow-x-auto rounded-xl bg-surface p-1 ring-1 ring-border sm:w-auto">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              title={t(tb.labelKey)}
              className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition sm:flex-none sm:justify-start sm:py-1.5 ${
                tab === tb.id ? "bg-primary text-white shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              <span>{tb.icon}</span>
              <span className={tab === tb.id ? "" : "hidden sm:inline"}>{t(tb.labelKey)}</span>
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:ml-auto">
          <SmsInbox farmer={farmer} />
          <select
            value={activeId}
            onChange={(e) => pick(e.target.value)}
            title={t("farmer.switcher")}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-2 text-sm font-medium text-foreground sm:flex-none sm:py-1.5"
          >
            {farmers.map((f) => (
              <option key={f.id} value={f.id}>🌾 {f.name} · {f.village}</option>
            ))}
          </select>
        </div>
      </div>

      {tab === "assistant" && <ChatPanel key={farmer.id} farmer={farmer} lang={lang} />}
      {tab === "crops" && <CropPlanner key={farmer.id} farmer={farmer} createdBy="farmer" showWeather />}
      {tab === "schemes" && <SchemeChecker key={farmer.id} farmer={farmer} applications={apps} />}
    </div>
  );
}
