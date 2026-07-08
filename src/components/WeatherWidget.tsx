"use client";
// Live current-weather widget (Open-Meteo, free, no API key).
// Prefers the browser's real location (with permission); falls back to the
// selected district's coordinates when geolocation is denied/unavailable.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

// Fallback coordinates for the demo districts (used if the district record
// has no lat/lon of its own).
const DISTRICT_COORDS: Record<string, { lat: number; lon: number }> = {
  Anantapur: { lat: 14.68, lon: 77.6 },
  Warangal: { lat: 17.97, lon: 79.59 },
  Nashik: { lat: 19.99, lon: 73.79 },
};

// WMO code → { icon, translation-key }. Several codes share a key (48→45, etc.).
const WMO: Record<number, { key: string; icon: string }> = {
  0: { key: "wx.0", icon: "☀️" },
  1: { key: "wx.1", icon: "🌤️" },
  2: { key: "wx.2", icon: "⛅" },
  3: { key: "wx.3", icon: "☁️" },
  45: { key: "wx.45", icon: "🌫️" },
  48: { key: "wx.45", icon: "🌫️" },
  51: { key: "wx.51", icon: "🌦️" },
  53: { key: "wx.53", icon: "🌦️" },
  55: { key: "wx.55", icon: "🌧️" },
  61: { key: "wx.61", icon: "🌦️" },
  63: { key: "wx.63", icon: "🌧️" },
  65: { key: "wx.65", icon: "🌧️" },
  80: { key: "wx.80", icon: "🌧️" },
  81: { key: "wx.80", icon: "🌧️" },
  82: { key: "wx.82", icon: "⛈️" },
  95: { key: "wx.95", icon: "⛈️" },
  96: { key: "wx.96", icon: "⛈️" },
  99: { key: "wx.96", icon: "⛈️" },
};

interface Current {
  temperature_2m: number;
  relative_humidity_2m: number;
  precipitation: number;
  weather_code: number;
  wind_speed_10m: number;
}

interface Geo { lat: number; lon: number; label: string }

// One geolocation prompt per page load, shared by every widget instance.
let geoPromise: Promise<Geo | null> | null = null;
function detectLocation(): Promise<Geo | null> {
  if (geoPromise) return geoPromise;
  geoPromise = new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        // Reverse-geocode to a friendly place name (free, no key); the name is
        // cosmetic — weather still works if this fails.
        let label = "Your location";
        try {
          const r = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
          );
          const d = await r.json();
          label = d.city || d.locality || d.principalSubdivision || label;
        } catch { /* keep generic label */ }
        resolve({ lat, lon, label });
      },
      () => resolve(null), // denied/unavailable → fall back to district
      { timeout: 8000, maximumAge: 10 * 60 * 1000 },
    );
  });
  return geoPromise;
}

export function WeatherWidget({ district, lat, lon }: { district: string; lat?: number; lon?: number }) {
  const { t } = useI18n();
  const [cur, setCur] = useState<Current | null>(null);
  const [err, setErr] = useState(false);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [geoDone, setGeoDone] = useState(false);

  useEffect(() => {
    let alive = true;
    detectLocation().then((g) => {
      if (!alive) return;
      setGeo(g);
      setGeoDone(true);
    });
    return () => { alive = false; };
  }, []);

  // Detected location wins; district coordinates are the fallback.
  const fallback = lat != null && lon != null ? { lat, lon } : DISTRICT_COORDS[district];
  const coords = geo ?? fallback;
  const geoLabel = geo && geo.label === "Your location" ? t("wx.yourLocation") : geo?.label;
  const place = geo ? `${geoLabel} (${t("wx.yourLocationSuffix")})` : district;

  useEffect(() => {
    if (!geoDone) return; // wait for the geolocation answer to avoid a double fetch
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCur(null);
    setErr(false);
    if (!coords) { setErr(true); return; }
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
      `&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => setCur(d.current as Current))
      .catch(() => setErr(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoDone, coords?.lat, coords?.lon]);

  if (err) return null; // weather is a bonus — never block the page on it

  const wx = cur ? WMO[cur.weather_code] ?? { key: "", icon: "🌡️" } : null;
  const wxLabel = wx?.key ? t(wx.key) : "—";
  return (
    <Card className="flex items-center gap-3 p-4 sm:gap-4">
      <span className="text-3xl sm:text-4xl">{wx?.icon ?? "🌡️"}</span>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">
          {t("wx.current")} · {geoDone ? place : t("wx.detecting")}
        </div>
        {cur ? (
          <>
            <div className="text-lg font-bold sm:text-xl">
              {Math.round(cur.temperature_2m)}°C <span className="text-sm font-medium text-muted">{wxLabel}</span>
            </div>
            <div className="text-xs text-muted">
              💧 {cur.relative_humidity_2m}% {t("wx.humidity")} · 🌬️ {Math.round(cur.wind_speed_10m)} km/h {t("wx.wind")}
              {cur.precipitation > 0 && <> · ☔ {t("wx.rainNow", { mm: cur.precipitation })}</>}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted">{t("wx.loading")}</div>
        )}
      </div>
      <span className="ml-auto shrink-0 self-start text-[10px] text-muted/70">
        {geo ? "📍 GPS · " : ""}{t("wx.live")}
      </span>
    </Card>
  );
}
