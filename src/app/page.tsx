"use client";
import Link from "next/link";
import { StarterGuide } from "@/components/StarterGuide";
import { useAutoGuide } from "@/lib/useAutoGuide";
import { useI18n, LangSwitcher } from "@/lib/i18n";

// National format with leading 0 STD prefix — the Vobiz DID only rings when dialed
// with the 0 (not as +91…). Keep in sync with HELPLINE_DISPLAY in StarterGuide.tsx.
const DEMO_NUMBER = "0 79714 42493"; // KisanSetu helpline (Vobiz DID)

const ROLES = [
  { href: "/farmer", icon: "🌾", labelKey: "nav.farmer", descKey: "home.farmerDesc", tone: "bg-primary-soft" },
  { href: "/fpo", icon: "🤝", labelKey: "nav.fpo", descKey: "home.fpoDesc", tone: "bg-accent-soft" },
  { href: "/gov", icon: "🏛️", labelKey: "home.govRole", descKey: "home.govDesc", tone: "bg-info-soft" },
];

export default function Home() {
  const [guide, setGuide] = useAutoGuide();
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen flex-col">
      <div className="gov-stripe h-1.5 w-full" />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:py-16">
        {/* Hero */}
        <div className="flex flex-col items-start gap-6">
          <div className="flex w-full items-center gap-2">
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" /> <span className="truncate">{t("home.badge")}</span>
            </div>
            <div className="ml-auto shrink-0"><LangSwitcher /></div>
          </div>
          <h1 className="max-w-3xl text-3xl font-bold leading-tight text-foreground sm:text-5xl">
            {t("home.heroA")}{" "}
            <span className="text-primary">{t("home.heroB")}</span> {t("home.heroC")}
          </h1>
          <p className="max-w-2xl text-lg text-muted">{t("home.sub")}</p>

          {/* Call-in highlight */}
          <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary-soft/60 p-4 sm:flex-row sm:items-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary text-2xl text-white">📞</span>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-primary-dark">
                {t("home.noPhone")}
              </div>
              <div className="text-xl font-bold text-foreground">{DEMO_NUMBER}</div>
              <div className="text-xs text-muted">{t("home.callNote")}</div>
            </div>
            <button
              onClick={() => setGuide(true)}
              className="rounded-xl bg-surface px-4 py-2 text-sm font-medium text-primary-dark shadow-sm ring-1 ring-primary/20 sm:ml-auto"
            >
              {t("home.seeFeatures")}
            </button>
          </div>
        </div>

        {/* Role entry */}
        <div className="mt-12">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">
            {t("home.enterAs")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {ROLES.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className="card group flex flex-col gap-3 p-6 transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <span className={`grid h-14 w-14 place-items-center rounded-2xl ${r.tone} text-3xl`}>
                  {r.icon}
                </span>
                <div className="text-lg font-bold text-foreground">{t(r.labelKey)}</div>
                <p className="text-sm text-muted">{t(r.descKey)}</p>
                <span className="mt-auto pt-2 text-sm font-medium text-primary group-hover:underline">
                  {t("home.open")}
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">{t("home.demoNote")}</p>
        </div>

        <footer className="mt-16 border-t border-border pt-6 text-xs text-muted">
          {t("home.footer")}
        </footer>
      </div>

      {guide && <StarterGuide onClose={() => setGuide(false)} />}
    </div>
  );
}
