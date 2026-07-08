// Reset Firestore to a minimal, judge-friendly demo dataset.
// Run: npx tsx scripts/seed.ts
// Uses ADC (gcloud auth application-default login) — same creds as the app.
//
// Deliberately small: 3 districts, 2 FPOs, 4 farmers, ZERO pre-seeded
// queries/plans/applications/SMS — every artefact the judges see is created
// live by the demo itself. (Schemes now live in code: src/lib/schemes.ts.)
import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.GOOGLE_CLOUD_PROJECT || "causal-galaxy-415009";
if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const now = Date.now();
const daysFrom = (n: number) =>
  new Date(now + n * 86400000).toLocaleDateString("en-IN", { weekday: "short" });

// ---------- Districts (curated "satellite"/IMD-style data + coords for live weather) ----------
const districts = [
  {
    id: "anantapur",
    name: "Anantapur",
    state: "Andhra Pradesh",
    lat: 14.68, lon: 77.6,
    soilProfile: "Red sandy loam, low organic carbon, drought-prone",
    ndviIndex: 0.28,
    groundwaterTrend: "falling",
    rainfallForecast: [
      { day: daysFrom(1), mm: 0 }, { day: daysFrom(2), mm: 0 },
      { day: daysFrom(3), mm: 0 }, { day: daysFrom(4), mm: 0 },
      { day: daysFrom(5), mm: 2 }, { day: daysFrom(6), mm: 0 },
      { day: daysFrom(7), mm: 0 },
    ],
  },
  {
    id: "warangal",
    name: "Warangal",
    state: "Telangana",
    lat: 17.97, lon: 79.59,
    soilProfile: "Black cotton (regur) soil, high moisture retention",
    ndviIndex: 0.61,
    groundwaterTrend: "stable",
    rainfallForecast: [
      { day: daysFrom(1), mm: 8 }, { day: daysFrom(2), mm: 22 },
      { day: daysFrom(3), mm: 14 }, { day: daysFrom(4), mm: 3 },
      { day: daysFrom(5), mm: 0 }, { day: daysFrom(6), mm: 0 },
      { day: daysFrom(7), mm: 5 },
    ],
  },
  {
    id: "nashik",
    name: "Nashik",
    state: "Maharashtra",
    lat: 19.99, lon: 73.79,
    soilProfile: "Medium-black basaltic soil, good for horticulture",
    ndviIndex: 0.52,
    groundwaterTrend: "falling",
    rainfallForecast: [
      { day: daysFrom(1), mm: 1 }, { day: daysFrom(2), mm: 0 },
      { day: daysFrom(3), mm: 0 }, { day: daysFrom(4), mm: 0 },
      { day: daysFrom(5), mm: 0 }, { day: daysFrom(6), mm: 4 },
      { day: daysFrom(7), mm: 6 },
    ],
  },
];

// ---------- FPOs ----------
const fpos = [
  { id: "fpo-anantapur", name: "Anantapur Groundnut Producers FPO", district: "Anantapur", staff: "K. Sreenivasulu" },
  { id: "fpo-warangal", name: "Warangal Cotton Growers FPO", district: "Warangal", staff: "M. Rajitha" },
];

// ---------- Farmers (phone = identity) ----------
// NOTE: replace one phone with a real +91 mobile before the live call demo.
// Profiles chosen so each farmer gets DIFFERENT scheme recommendations:
//   Ramesh  — marginal groundnut grower in an FPO → NMEO-Oilseeds, PMKSY 55%
//   Lakshmi — marginal rainfed → PM-KISAN, PMFBY
//   Shivaiah — small paddy+cotton, canal → TRFA (rice fallow), PM-KUSUM
//   Anjamma — small paddy grower → TRFA, KCC
const farmers = [
  {
    id: "f-ramesh", name: "Ramesh Naidu", phone: "+919000000001", village: "Kalyandurg",
    district: "Anantapur", landAcres: 2.5, soilType: "red", waterSource: "borewell",
    groundwaterDepthM: 240, crops: ["groundnut"], lang: "te", fpoId: "fpo-anantapur",
    registeredBy: "fpo", category: "general", gender: "male",
  },
  {
    id: "f-lakshmi", name: "Lakshmi Devi", phone: "+919000000002", village: "Rayadurg",
    district: "Anantapur", landAcres: 1.2, soilType: "red", waterSource: "rainfed",
    groundwaterDepthM: 300, crops: ["groundnut", "tur"], lang: "te", fpoId: "fpo-anantapur",
    registeredBy: "fpo", category: "sc", gender: "female",
  },
  {
    id: "f-shivaiah", name: "Shivaiah Goud", phone: "+919000000004", village: "Hanamkonda",
    district: "Warangal", landAcres: 3.0, soilType: "black", waterSource: "canal",
    groundwaterDepthM: 60, crops: ["cotton", "paddy"], lang: "te", fpoId: "fpo-warangal",
    registeredBy: "fpo", category: "general", gender: "male",
  },
  {
    id: "f-anjamma", name: "Anjamma", phone: "+919000000005", village: "Parkal",
    district: "Warangal", landAcres: 1.8, soilType: "black", waterSource: "borewell",
    groundwaterDepthM: 90, crops: ["paddy"], lang: "te", fpoId: "fpo-warangal",
    registeredBy: "phone", category: "st", gender: "female",
  },
];

async function wipe(col: string) {
  const snap = await db.collection(col).get();
  if (snap.empty) { console.log(`  ${col}: already empty`); return; }
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  console.log(`  ${col}: deleted ${snap.size}`);
}

async function replace(col: string, docs: { id: string; [k: string]: unknown }[]) {
  await wipe(col);
  const batch = db.batch();
  for (const d of docs) {
    const { id, ...rest } = d;
    batch.set(db.collection(col).doc(id), rest);
  }
  await batch.commit();
  console.log(`  ${col}: seeded ${docs.length}`);
}

async function main() {
  console.log("Resetting Firestore (project:", projectId, ")…");
  // Kill all demo noise — dashboards start clean and fill up live.
  for (const col of ["queries", "tickets", "alerts", "reports", "plans", "applications", "sms", "schemes"]) {
    await wipe(col);
  }
  await replace("districts", districts);
  await replace("fpos", fpos);
  await replace("farmers", farmers.map((f) => ({ ...f, createdAt: now })));
  console.log("Done. Dashboards are clean — everything else is created live during the demo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
