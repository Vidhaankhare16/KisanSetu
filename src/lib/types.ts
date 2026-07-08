// Shared domain types for KisanSetu.
// Roles are demo-switchable (no auth); everything keys off phone number as identity.

export type Role = "farmer" | "fpo" | "government";

export type Lang = "en" | "hi" | "te" | "ta" | "kn" | "mr";

export const LANG_LABELS: Record<Lang, string> = {
  en: "English",
  hi: "हिन्दी (Hindi)",
  te: "తెలుగు (Telugu)",
  ta: "தமிழ் (Tamil)",
  kn: "ಕನ್ನಡ (Kannada)",
  mr: "मराठी (Marathi)",
};

export type SoilType = "black" | "red" | "alluvial" | "sandy" | "loamy" | "clay";
export type WaterSource = "borewell" | "canal" | "rainfed" | "tank" | "river";

export interface Farmer {
  id: string;
  name: string;
  phone: string; // +91XXXXXXXXXX — the identity key
  village: string;
  district: string;
  landAcres: number;
  soilType: SoilType;
  waterSource: WaterSource;
  groundwaterDepthM: number;
  crops: string[];
  lang: Lang;
  fpoId: string;
  registeredBy: "fpo" | "self" | "phone";
  createdAt: number;
  // Used by the scheme-eligibility checker (optional — defaults applied).
  category?: "general" | "sc" | "st";
  gender?: "male" | "female";
}

export type QueryChannel = "voice" | "photo" | "chat" | "phone";

export interface Query {
  id: string;
  farmerId: string | null; // null if an unknown caller
  phone: string;
  channel: QueryChannel;
  text: string;
  lang: Lang;
  aiAnswer?: string;
  photoUrl?: string; // data URL for demo
  diagnosis?: string;
  confidence?: number; // 0..1
  createdAt: number;
}

export interface KisanReport {
  id: string;
  farmerId: string;
  inputs: {
    landAcres: number;
    soilType: SoilType;
    waterSource: WaterSource;
    groundwaterDepthM: number;
    district: string;
    season: string;
  };
  summary: string;
  recommendedCrops: { crop: string; reason: string; waterNeed: string }[];
  waterPlan: string;
  riskNotes: string[];
  matchedSchemeIds: string[];
  lang: Lang;
  generatedAt: number;
}

export type TicketStatus = "open" | "assigned" | "resolved";

export interface Ticket {
  id: string;
  farmerId: string;
  source: "low-confidence-diagnosis" | "farmer-request" | "gov-dispatch";
  title: string;
  status: TicketStatus;
  assignedRSK: string; // Rythu Seva Kendra name
  notes: string[];
  createdAt: number;
}

export type AlertType = "dry-spell" | "irrigation" | "scheme" | "fertilizer";
export type AlertChannel = "sms" | "call";
export type AlertStatus = "queued" | "sent" | "logged";

export interface Alert {
  id: string;
  farmerId: string | null;
  district?: string;
  type: AlertType;
  channel: AlertChannel;
  message: string;
  status: AlertStatus;
  createdAt: number;
  sentAt?: number;
}

export interface Scheme {
  id: string;
  name: string;
  dept: string;
  eligibility: {
    landMaxAcres?: number;
    crops?: string[];
    category?: string;
    waterSource?: WaterSource[];
  };
  benefit: string;
  howToApply: string;
}

export interface District {
  id: string;
  name: string;
  state: string;
  soilProfile: string;
  ndviIndex: number; // 0..1 pre-computed "satellite" vegetation index
  rainfallForecast: { day: string; mm: number }[]; // 7-day IMD-style forecast
  groundwaterTrend: "falling" | "stable" | "rising";
  lat?: number; // for the live weather widget (Open-Meteo)
  lon?: number;
}

// ---------------------------------------------------------------------------
// Crop recommendation (SIH-style advisory plan, generalized to ALL crops)
// ---------------------------------------------------------------------------

// Fields mirror the SIH-2025 Soil Health Card form exactly.
export interface SoilCard {
  landType: "upland" | "midland" | "lowland";
  nitrogen: number; // kg/ha
  phosphorus: number; // kg/ha
  potassium: number; // kg/ha
  organicCarbon: number; // %
  electricalConductivity: number; // dS/m
  pH: number;
  boron: number; // ppm
  sulphur: number; // ppm
}

export interface CropPlanInputs {
  district: string;
  soil: string;
  water: string;
  landAcres: number;
  season: string;
  soilCard?: SoilCard | null;
}

export interface CropPlan {
  id: string;
  farmerId: string | null;
  inputs: CropPlanInputs;
  cropName: string;
  localName: string;
  suitabilityReason: string;
  duration: string;
  roi: string;
  economics: { netProfit: number; revenue: number; cost: number; comparisonText: string };
  timeline: { day: string; task: string }[];
  shoppingList: string[];
  alternatives: { crop: string; reason: string }[];
  createdBy: "farmer" | "fpo";
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Scheme applications (FPO applies → Government approves → farmer notified)
// ---------------------------------------------------------------------------

export type ApplicationStatus = "applied" | "approved";

export interface Application {
  id: string;
  farmerId: string;
  fpoId: string | null; // null when the government approves directly
  schemeId: string;
  schemeName: string;
  status: ApplicationStatus;
  appliedBy: "fpo" | "gov";
  reason: string; // why this scheme fits this farmer (shown on all dashboards)
  createdAt: number;
  approvedAt?: number;
  notifiedVia?: "sms" | "call";
}

// ---------------------------------------------------------------------------
// Simulated SMS (browser-rendered inbox — no real gateway in the demo)
// ---------------------------------------------------------------------------

export interface SmsMessage {
  id: string;
  to: string; // phone, +91…
  farmerId: string | null;
  from: string; // sender label, e.g. "KisanSetu FPO" / "Govt of India"
  body: string;
  createdAt: number;
}
