"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { StarterGuide } from "./StarterGuide";
import { useAutoGuide } from "@/lib/useAutoGuide";
import { useI18n, LangSwitcher } from "@/lib/i18n";

const ROLES = [
  { href: "/farmer", labelKey: "nav.farmer", icon: "🌾" },
  { href: "/fpo", labelKey: "nav.fpo", icon: "🤝" },
  { href: "/gov", labelKey: "nav.gov", icon: "🏛️" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [guideOpen, setGuideOpen] = useAutoGuide();
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen flex-col">
      <div className="gov-stripe h-1 w-full shrink-0" />
      <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-lg text-white">🌾</span>
            <div className="leading-tight">
              <div className="text-sm font-bold text-foreground">{t("app.name")}</div>
              <div className="hidden text-[11px] text-muted sm:block">{t("app.tagline")}</div>
            </div>
          </Link>

          <nav className="order-last flex w-full items-center gap-1 overflow-x-auto rounded-xl bg-background p-1 sm:order-none sm:ml-2 sm:w-auto sm:overflow-visible">
            {ROLES.map((r) => {
              const active = pathname.startsWith(r.href);
              return (
                <Link
                  key={r.href}
                  href={r.href}
                  className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition sm:flex-none sm:justify-start ${
                    active ? "bg-primary text-white shadow-sm" : "text-muted hover:text-foreground"
                  }`}
                >
                  <span>{r.icon}</span>
                  <span className={active ? "" : "hidden sm:inline"}>{t(r.labelKey)}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <LangSwitcher className="max-w-[7.5rem] truncate sm:max-w-none" />
            <button
              onClick={() => setGuideOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-sm font-medium text-muted hover:text-foreground sm:px-3"
            >
              <span>💡</span>
              <span className="hidden sm:inline">{t("nav.how")}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>

      {guideOpen && <StarterGuide onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
