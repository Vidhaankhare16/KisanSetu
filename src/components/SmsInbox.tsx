"use client";
// Browser-simulated SMS inbox, rendered like a phone. Polls /api/sms so a
// message "sent" from the FPO or Government dashboard shows up here within a
// few seconds — the demo's stand-in for a real SMS gateway.
import { useCallback, useEffect, useRef, useState } from "react";
import { getJSON } from "@/lib/client";
import type { Farmer, SmsMessage } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

const SEEN_KEY = "kisansetu.smsSeen"; // last-seen timestamp per farmer

export function SmsInbox({ farmer }: { farmer: Farmer }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [seenAt, setSeenAt] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    getJSON<{ messages: SmsMessage[] }>(`/api/sms?farmerId=${farmer.id}`)
      .then(({ messages }) => setMessages(messages))
      .catch(() => {});
  }, [farmer.id]);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, number>;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeenAt(saved[farmer.id] ?? 0);
    refresh();
    timer.current = setInterval(refresh, 5000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [farmer.id, refresh]);

  function markSeen() {
    const now = Date.now();
    setSeenAt(now);
    const saved = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, number>;
    saved[farmer.id] = now;
    localStorage.setItem(SEEN_KEY, JSON.stringify(saved));
  }

  const unread = messages.filter((m) => m.createdAt > seenAt).length;

  return (
    <>
      <button
        onClick={() => { setOpen(true); markSeen(); }}
        className="relative flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted hover:text-foreground"
        title={t("sms.inboxTitle")}
      >
        <span>📱</span>
        <span className="hidden sm:inline">{t("sms.label")}</span>
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          {/* Phone frame */}
          <div
            className="flex h-[min(560px,85dvh)] w-full max-w-[320px] flex-col overflow-hidden rounded-[2rem] border-8 border-neutral-800 bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 bg-neutral-800 px-4 py-2 text-white">
              <span>📱</span>
              <div className="text-sm font-semibold">{t("sms.messages")}</div>
              <div className="ml-auto text-[10px] opacity-70">{farmer.phone}</div>
              <button onClick={() => setOpen(false)} className="ml-2 text-white/80 hover:text-white">✕</button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {messages.length === 0 && (
                <div className="mt-16 text-center text-sm text-muted">
                  {t("sms.empty")}<br />
                  <span className="text-xs">{t("sms.emptyHint")}</span>
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className="rounded-2xl rounded-tl-sm bg-surface p-3 shadow-sm ring-1 ring-border">
                  <div className="flex items-center gap-2 text-[11px] font-bold text-primary-dark">
                    {m.from}
                    <span className="ml-auto font-normal text-muted">
                      {new Date(m.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-border bg-surface px-3 py-2 text-center text-[10px] text-muted">
              {t("sms.foot")}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
