"use client";
// Live current-weather widget (Open-Meteo, free, no API key).
// Prefers the browser's real location (with permission); falls back to the
// selected district's coordinates when geolocation is denied/unavailable.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

// Fallback coordinates for the demo districts (used if the district record
// has no lat/lon of its own).
const DISTRICT_COORDS: Record<string, { lat: number; lon: number }> = {
  Anantapur: { lat: 14.68, lon: 77.6 },
  Warangal: { lat: 17.97, lon: 79.59 },
  Nashik: { lat: 19.99, lon: 73.79 },
};

const WMO: Record<number, { label: string; icon: string }> = {
  0: { label: "Clear sky", icon: "☀️" },
  1: { label: "Mostly clear", icon: "🌤️" },
  2: { label: "Partly cloudy", icon: "⛅" },
  3: { label: "Overcast", icon: "☁️" },
  45: { label: "Fog", icon: "🌫️" },
  48: { label: "Fog", icon: "🌫️" },
  51: { label: "Light drizzle", icon: "🌦️" },
  53: { label: "Drizzle", icon: "🌦️" },
  55: { label: "Heavy drizzle", icon: "🌧️" },
  61: { label: "Light rain", icon: "🌦️" },
  63: { label: "Rain", icon: "🌧️" },
  65: { label: "Heavy rain", icon: "🌧️" },
  80: { label: "Rain showers", icon: "🌧️" },
  81: { label: "Rain showers", icon: "🌧️" },
  82: { label: "Violent showers", icon: "⛈️" },
  95: { label: "Thunderstorm", icon: "⛈️" },
  96: { label: "Thunderstorm + hail", icon: "⛈️" },
  99: { label: "Thunderstorm + hail", icon: "⛈️" },
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
  const place = geo ? `${geo.label} (your location)` : district;

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

  const wx = cur ? WMO[cur.weather_code] ?? { label: "—", icon: "🌡️" } : null;
  return (
    <Card className="flex items-center gap-4 p-4">
      <span className="text-4xl">{wx?.icon ?? "🌡️"}</span>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">
          Current weather · {geoDone ? place : "detecting location…"}
        </div>
        {cur ? (
          <>
            <div className="text-xl font-bold">
              {Math.round(cur.temperature_2m)}°C <span className="text-sm font-medium text-muted">{wx?.label}</span>
            </div>
            <div className="text-xs text-muted">
              💧 {cur.relative_humidity_2m}% humidity · 🌬️ {Math.round(cur.wind_speed_10m)} km/h
              {cur.precipitation > 0 && <> · ☔ {cur.precipitation} mm rain now</>}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted">Loading live weather…</div>
        )}
      </div>
      <span className="ml-auto shrink-0 self-start text-[10px] text-muted/70">
        {geo ? "📍 GPS · " : ""}Open-Meteo live
      </span>
    </Card>
  );
}
