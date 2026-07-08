"use client";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "./types";

// Browser Web Speech API for in-app voice: speech-to-text + text-to-speech.
// $0, works offline-ish in Chrome, supports Indic locales (hi-IN, te-IN, …).

const LOCALE: Record<Lang, string> = {
  hi: "hi-IN", te: "te-IN", ta: "ta-IN", kn: "kn-IN", mr: "mr-IN", en: "en-IN",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export function useSpeech(lang: Lang) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recRef = useRef<any>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    // Feature detection is client-only; syncing it in an effect keeps SSR/hydration
    // consistent (server renders the optimistic "supported" state).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!SR) { setSupported(false); return; }
    const rec = new SR();
    rec.lang = LOCALE[lang];
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    recRef.current = rec;
  }, [lang]);

  function listen(onResult: (text: string) => void) {
    const rec = recRef.current;
    if (!rec) return;
    rec.lang = LOCALE[lang];
    rec.onresult = (e: any) => onResult(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }

  function stop() {
    recRef.current?.stop();
    setListening(false);
  }

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LOCALE[lang];
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang === LOCALE[lang]);
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  }

  return { listening, supported, listen, stop, speak };
}
