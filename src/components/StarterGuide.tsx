"use client";
import Link from "next/link";
import { useState } from "react";
import { postJSON } from "@/lib/client";
import { useI18n, type Translate } from "@/lib/i18n";

const HELPLINE_DISPLAY = "+91 79714 42493";
const HELPLINE_TEL = "+917971442493";

type Cta =
  | { kind: "tel"; label: string; note?: string }
  | { kind: "link"; label: string; href: string; note?: string }
  | { kind: "democall"; note?: string }
  | { kind: "none"; note?: string };

interface Feature {
  overline: string;   // e.g. "SPEAK IT"
  icon: string;
  title: string;
  body: string;
  cta: Cta;
}

function buildFeatures(t: Translate): Feature[] {
  return [
    {
      overline: t("guide.f1.over"),
      icon: "📞",
      title: t("guide.f1.title"),
      body: t("guide.f1.body"),
      cta: { kind: "tel", label: t("guide.f1.cta", { num: HELPLINE_DISPLAY }), note: t("guide.f1.note") },
    },
    {
      overline: t("guide.f2.over"),
      icon: "🏛️",
      title: t("guide.f2.title"),
      body: t("guide.f2.body"),
      cta: { kind: "democall", note: t("guide.f2.note") },
    },
    {
      overline: "ASK IT",
      icon: "💬",
      title: "One clean AI assistant for every farm question",
      body: "The Farmer dashboard is a single chat — text, voice or a crop photo, in any language. Two more tabs give an AI crop recommendation (with live weather) and a government scheme eligibility check.",
      cta: { kind: "link", label: "Open the Farmer dashboard", href: "/farmer" },
    },
    {
      overline: "APPLY IT",
      icon: "🤝",
      title: "FPOs apply for schemes and SMS crop plans",
      body: "An FPO officer opens a member farmer, sees which schemes they qualify for and applies in one click — then generates a crop plan and sends it to the farmer's phone by SMS (simulated in the browser).",
      cta: { kind: "link", label: "Open the FPO dashboard", href: "/fpo" },
    },
    {
      overline: "APPROVE IT",
      icon: "✅",
      title: "Government approves, farmer hears about it instantly",
      body: "Officials see AI-recommended schemes and FPO applications for every farmer. One click approves and notifies the farmer — by SMS in their inbox, or a real AI voice call in their language.",
      cta: { kind: "link", label: "Open the Government dashboard", href: "/gov" },
    },
  ];
}

/** "Try it" widget: judge enters their number → outbound RSK-style advisory demo call. */
function DemoCallBox() {
  const { t } = useI18n();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const valid = /^(\+91)?[6-9]\d{9}$/.test(phone.replace(/[\s-]/g, ""));

  async function requestCall() {
    if (!valid || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await postJSON<{ delivery: string; reason?: string }>("/api/demo-call", { phone });
      setStatus(
        res.delivery === "sent"
          ? { ok: true, text: t("guide.callingYou") }
          : { ok: true, text: t("guide.received", { reason: res.reason ?? t("guide.reasonFallback") }) },
      );
    } catch {
      setStatus({ ok: false, text: t("guide.failed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="text-sm font-semibold text-primary-dark">{t("guide.try")}</div>
      <input
        value={phone}
        onChange={(e) => { setPhone(e.target.value); setStatus(null); }}
        onKeyDown={(e) => { if (e.key === "Enter") requestCall(); }}
        inputMode="tel"
        placeholder={t("guide.phone")}
        className="mt-2 w-full rounded-xl border border-[color:var(--color-cream-border)] bg-white/80 px-4 py-3 text-center text-base outline-none focus:border-primary"
      />
      <button
        onClick={requestCall}
        disabled={!valid || busy}
        className="mt-2 w-full rounded-xl bg-primary px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-primary-dark disabled:opacity-45"
      >
        {busy ? t("guide.dialing") : t("guide.getCall")}
      </button>
      {status && (
        <p className={`mt-2 text-xs ${status.ok ? "text-primary-dark" : "text-danger"}`}>{status.text}</p>
      )}
    </div>
  );
}

export function StarterGuide({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  const [i, setI] = useState(0);
  const FEATURES = buildFeatures(t);
  const f = FEATURES[i];
  const n = FEATURES.length;
  const last = i === n - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-t-3xl border border-[color:var(--color-cream-border)] bg-[color:var(--color-cream)] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Body */}
        <div className="px-7 pb-6 pt-8 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            {t("guide.welcome")}
          </div>
          <div className="mt-1 font-serif text-2xl font-medium text-foreground">
            <span className="mr-1">{t("app.name")}</span>
            {lang !== "en" && <span className="text-muted">KisanSetu</span>}
          </div>

          {/* Icon medallion */}
          <div className="mx-auto mt-6 grid h-20 w-20 place-items-center rounded-full bg-white/70 text-4xl shadow-inner ring-1 ring-[color:var(--color-cream-border)]">
            {f.icon}
          </div>

          <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            {t("guide.step", { i: i + 1, n })} · {f.overline}
          </div>
          <h2 className="mt-2 font-serif text-3xl font-medium leading-tight text-foreground">
            {f.title}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted">{f.body}</p>

          {/* CTA */}
          <div className="mt-6">
            {f.cta.kind === "tel" && (
              <a
                href={`tel:${HELPLINE_TEL}`}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-primary-dark"
              >
                📞 {f.cta.label}
              </a>
            )}
            {f.cta.kind === "link" && (
              <Link
                href={f.cta.href}
                onClick={onClose}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-primary-dark"
              >
                {f.cta.label}
              </Link>
            )}
            {f.cta.kind === "democall" && <DemoCallBox />}
            {f.cta.note && <p className="mt-3 text-xs text-muted">{f.cta.note}</p>}
          </div>
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between border-t border-[color:var(--color-cream-border)] px-6 py-4">
          <button
            onClick={onClose}
            className="text-sm font-medium uppercase tracking-wide text-muted hover:text-foreground"
          >
            {t("guide.skip")}
          </button>

          <div className="flex items-center gap-1.5">
            {FEATURES.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setI(idx)}
                aria-label={t("guide.step", { i: idx + 1, n })}
                className={`h-1.5 rounded-full transition-all ${
                  idx === i ? "w-6 bg-primary" : "w-1.5 bg-[color:var(--color-cream-border)]"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {i > 0 && (
              <button
                onClick={() => setI(i - 1)}
                className="rounded-full px-3 py-2 text-sm font-medium text-muted hover:text-foreground"
              >
                {t("guide.back")}
              </button>
            )}
            <button
              onClick={() => (last ? onClose() : setI(i + 1))}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark"
            >
              {last ? t("guide.start") : t("guide.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
