"use client";
// Gemini/Claude-style assistant surface: a clean, centered conversation with a
// floating composer. Text, photo (diagnosis) and dictation in one thread.
import { useEffect, useRef, useState } from "react";
import type { Farmer, Lang } from "@/lib/types";
import { postJSON, imageToPayload, type ImagePayload } from "@/lib/client";
import { useSpeech } from "@/lib/useVoice";
import { Badge, Spinner } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import type { Diagnosis } from "@/lib/ai";

// One chat turn can carry text, a photo, or both (ChatGPT-style).
type Msg =
  | { role: "farmer"; text?: string; photoUrl?: string; at: number }
  | { role: "ai"; text: string; dx?: Diagnosis | null; ticket?: boolean; error?: boolean; at: number };

const SUGGESTIONS = [
  "Which fertilizer should I use this month?",
  "My crop leaves are turning yellow — what should I do?",
  "When should I irrigate this week?",
  "मंडी में अच्छा भाव कैसे मिलेगा?",
];

export function ChatPanel({ farmer, lang }: { farmer: Farmer; lang: Lang }) {
  const { t } = useI18n();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<ImagePayload | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { listening, supported, listen, stop, speak } = useSpeech(lang);

  // Keep the newest message (or the thinking spinner) in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  // Auto-grow the textarea like modern chat composers.
  function autosize() {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  async function attach(file: File) {
    if (!file.type.startsWith("image/")) return;
    setAttachment(await imageToPayload(file));
  }

  // Dictation fills the composer (like ChatGPT's mic) so the farmer can review,
  // edit, and combine it with a photo before sending.
  function toggleMic() {
    if (!supported || busy) return;
    if (listening) { stop(); return; }
    listen((transcript) => {
      setInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
      setTimeout(autosize, 0);
      textRef.current?.focus();
    });
  }

  async function send(preset?: string) {
    const text = (preset ?? input).trim();
    if ((!text && !attachment) || busy) return;
    if (listening) stop();
    const photo = attachment;
    setMsgs((m) => [...m, { role: "farmer", text: text || undefined, photoUrl: photo?.dataUrl, at: Date.now() }]);
    setInput("");
    setAttachment(null);
    if (textRef.current) textRef.current.style.height = "auto";
    setBusy(true);
    try {
      const res = await postJSON<{ answer: string; diagnosis: Diagnosis | null; ticketId: string | null }>(
        "/api/chat",
        {
          farmerId: farmer.id,
          text,
          lang,
          channel: "chat",
          ...(photo ? { imageBase64: photo.base64, mimeType: photo.mime } : {}),
        },
      );
      setMsgs((m) => [...m, { role: "ai", text: res.answer, dx: res.diagnosis, ticket: !!res.ticketId, at: Date.now() }]);
      speak(res.answer);
    } catch {
      setMsgs((m) => [...m, { role: "ai", text: photo ? t("chat.errPhoto") : t("chat.err"), error: true, at: Date.now() }]);
      // Restore the draft so the farmer can retry without retyping.
      setInput(text);
      setAttachment(photo);
    } finally {
      setBusy(false);
    }
  }

  const canSend = !busy && (!!input.trim() || !!attachment);
  const firstName = farmer.name.split(" ")[0];

  return (
    <div
      className="flex h-[calc(100vh-13.5rem)] min-h-[480px] flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); e.dataTransfer.files?.[0] && attach(e.dataTransfer.files[0]); }}
    >
      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-2 py-4">
          {msgs.length === 0 && (
            <div className="mt-[12vh] text-center">
              <div className="text-4xl">🌾</div>
              <h1 className="mt-3 text-3xl font-bold">
                Namaste, <span className="text-primary">{firstName}</span>
              </h1>
              <p className="mt-2 text-muted">
                Ask anything about your farm — crops, pests, irrigation, prices. Any language, text, voice or photo.
              </p>
              <div className="mx-auto mt-6 grid max-w-xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}
                    className="rounded-2xl border border-border bg-surface px-4 py-3 text-left text-sm text-foreground/90 transition hover:border-primary/40 hover:bg-primary-soft/40">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => <MessageRow key={i} m={m} onSpeak={speak} />)}
          {busy && (
            <div className="flex items-start gap-3 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm text-white">🌾</span>
              <div className="pt-1.5"><Spinner label={t("chat.thinking")} /></div>
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="mx-auto w-full max-w-3xl px-2 pb-2 pt-1">
        {attachment && (
          <div className="mb-2 flex items-center gap-2">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={attachment.dataUrl} alt="attachment" className="h-16 w-16 rounded-xl object-cover ring-1 ring-border" />
              <button
                onClick={() => setAttachment(null)}
                title={t("chat.removePhoto")}
                aria-label={t("chat.removePhoto")}
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-foreground text-[10px] leading-none text-white shadow hover:bg-danger"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <div className="flex items-end gap-1.5 rounded-3xl border border-border bg-surface px-2.5 py-2 shadow-sm focus-within:border-primary">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { e.target.files?.[0] && attach(e.target.files[0]); e.target.value = ""; }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            title={t("chat.upload")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg text-muted transition hover:bg-border/40 hover:text-foreground disabled:opacity-40"
          >
            📷
          </button>
          <textarea
            ref={textRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autosize(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            onPaste={(e) => {
              const img = Array.from(e.clipboardData.items).find((it) => it.type.startsWith("image/"));
              const f = img?.getAsFile();
              if (f) { e.preventDefault(); attach(f); }
            }}
            rows={1}
            placeholder={
              listening ? t("chat.listening") : attachment ? t("chat.captionPlaceholder") : "Ask Kisan Mitra…"
            }
            className="max-h-32 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted/70"
          />
          <button
            onClick={toggleMic}
            disabled={!supported || busy}
            title={supported ? (listening ? t("chat.listening") : t("chat.speak")) : t("chat.noVoice")}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg transition disabled:opacity-40 ${
              listening
                ? "animate-pulse bg-danger text-white"
                : "text-muted hover:bg-border/40 hover:text-foreground"
            }`}
          >
            {listening ? "●" : "🎤"}
          </button>
          <button
            onClick={() => send()}
            disabled={!canSend}
            title={t("chat.send")}
            aria-label={t("chat.send")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-white transition hover:bg-primary-dark disabled:opacity-35"
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor" aria-hidden>
              <path d="M3.4 20.4 22 12 3.4 3.6 3.4 10l13 2-13 2z" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-muted/70">
          Kisan Mitra can make mistakes — critical doses are confirmed by your Rythu Seva Kendra.
        </p>
      </div>
    </div>
  );
}

function MessageRow({ m, onSpeak }: { m: Msg; onSpeak: (t: string) => void }) {
  const { t } = useI18n();

  if (m.role === "farmer") {
    return (
      <div className="flex justify-end py-2">
        <div className="max-w-[80%] rounded-3xl rounded-br-lg bg-primary px-4 py-2.5 text-sm text-white shadow-sm">
          {m.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.photoUrl} alt="crop" className={`max-h-56 w-full rounded-xl object-cover ${m.text ? "mb-2" : ""}`} />
          )}
          {m.text && <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 py-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm text-white">🌾</span>
      <div className={`min-w-0 flex-1 pt-0.5 text-sm leading-relaxed ${m.error ? "text-danger" : ""}`}>
        {m.dx && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="font-semibold">{m.dx.crop} — {m.dx.disease}</span>
            <Badge tone={m.dx.severity === "high" ? "red" : m.dx.severity === "medium" ? "saffron" : "green"}>
              {t("chat.severity", { level: t(`severity.${m.dx.severity}`) })}
            </Badge>
            <Badge tone="gray">{t("chat.confident", { pct: Math.round(m.dx.confidence * 100) })}</Badge>
          </div>
        )}
        <p className="whitespace-pre-wrap">{m.text}</p>
        {m.dx && (m.dx.needsExpert || m.ticket) && (
          <div className="mt-2 inline-block rounded-lg bg-accent-soft px-2.5 py-1.5 text-xs text-accent">
            {t("chat.forwarded")}
          </div>
        )}
        {!m.error && (
          <button onClick={() => onSpeak(m.text)} className="mt-1.5 block text-[11px] font-medium text-primary hover:underline">
            🔊 {t("chat.readAloud")}
          </button>
        )}
      </div>
    </div>
  );
}
