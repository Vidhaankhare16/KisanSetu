"use client";
import Link from "next/link";
import { useState } from "react";
import { postJSON } from "@/lib/client";
import { useI18n, type Translate } from "@/lib/i18n";

// Dialed in Indian national format (leading 0 STD trunk prefix, no +91): without
// the 0 the Vobiz DID does not ring from a mobile dialer. Verified working.
const HELPLINE_DISPLAY = "0 79714 42493";
const HELPLINE_TEL = "07971442493";

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
      overline: t("guide.ask.over"),
      icon: "💬",
      title: t("guide.ask.title"),
      body: t("guide.ask.body"),
      cta: { kind: "link", label: t("guide.ask.cta"), href: "/farmer" },
    },
    {
      overline: t("guide.apply.over"),
      icon: "🤝",
      title: t("guide.apply.title"),
      body: t("guide.apply.body"),
      cta: { kind: "link", label: t("guide.apply.cta"), href: "/fpo" },
    },
    {
      // Dry-spell / unpredictable-monsoon SMS alerts (guide.f4.* keys).
      overline: t("guide.f4.over"),
      icon: "🌧️",
      title: t("guide.f4.title"),
      body: t("guide.f4.body"),
      cta: { kind: "none", note: t("guide.f4.note") },
    },
    {
      overline: t("guide.approve.over"),
      icon: "✅",
      title: t("guide.approve.title"),
      body: t("guide.approve.body"),
      cta: { kind: "link", label: t("guide.approve.cta"), href: "/gov" },
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[color:var(--color-cream-border)] bg-[color:var(--color-cream)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Body */}
        <div className="px-5 pb-5 pt-6 text-center sm:px-8 sm:pb-6 sm:pt-7">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            {t("guide.welcome")}
          </div>
          <div className="mt-1 font-serif text-2xl font-medium text-foreground">
            <span className="mr-1">{t("app.name")}</span>
            {lang !== "en" && <span className="text-muted">KisanSetu</span>}
          </div>

          {/* Icon medallion */}
          <div className="mx-auto mt-4 grid h-16 w-16 place-items-center rounded-full bg-white/70 text-3xl shadow-inner ring-1 ring-[color:var(--color-cream-border)] sm:mt-5 sm:h-20 sm:w-20 sm:text-4xl">
            {f.icon}
          </div>

          <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            {t("guide.step", { i: i + 1, n })} · {f.overline}
          </div>
          <h2 className="mt-1.5 font-serif text-[1.6rem] font-medium leading-tight text-foreground sm:text-3xl">
            {f.title}
          </h2>
          <p className="mx-auto mt-2.5 max-w-md text-sm leading-relaxed text-muted sm:text-[15px]">{f.body}</p>

          {/* CTA */}
          <div className="mt-5">
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
            {f.cta.note && <p className="mx-auto mt-2.5 max-w-md text-xs text-muted">{f.cta.note}</p>}
          </div>
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between border-t border-[color:var(--color-cream-border)] px-5 py-3.5 sm:px-6">
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
