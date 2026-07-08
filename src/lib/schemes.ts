// Government scheme catalog + deterministic eligibility checker.
// Pure module (no server-only): runs identically in API routes and in the
// browser, so farmer / FPO / government dashboards always agree on who is
// eligible and WHY. Facts kept conservative and sourced from official scheme
// guidelines (amounts/premiums as notified; verify at enrolment).
//
// Profile fields mirror the SIH-2025 eligibility checker.

export interface EligibilityProfile {
  farmerType: "marginal" | "small" | "large" | "sharecropper" | "landless";
  landAcres: number;
  isFPOMember: boolean;
  isInCluster: boolean; // inside an NMEO value-chain cluster
  hasRiceFallow: boolean; // land left fallow after Kharif paddy
  isRegistered: boolean; // land records / state farmer portal registration
  category: "general" | "sc" | "st";
  gender: "male" | "female" | "";
  district: string;
  hasBankLoan: boolean; // existing crop loan (KCC) — auto-enrols in PMFBY
}

export interface EligibilityResult {
  eligible: boolean;
  reason: string; // why eligible / why not — always populated
}

export interface GovScheme {
  id: string;
  name: string;
  shortName: string;
  level: "Central" | "Central + State";
  dept: string;
  icon: string;
  benefit: string; // one-line benefit (used in SMS/call scripts)
  details: string[]; // factual bullet points
  howToApply: string;
  check: (p: EligibilityProfile) => EligibilityResult;
}

const ok = (reason: string): EligibilityResult => ({ eligible: true, reason });
const no = (reason: string): EligibilityResult => ({ eligible: false, reason });

export const SCHEMES: GovScheme[] = [
  {
    id: "pm-kisan",
    name: "PM-KISAN Samman Nidhi",
    shortName: "PM-KISAN",
    level: "Central",
    dept: "Ministry of Agriculture & Farmers Welfare",
    icon: "💰",
    benefit: "₹6,000 per year as direct income support, paid in three instalments of ₹2,000.",
    details: [
      "₹2,000 every four months, straight to the Aadhaar-linked bank account (DBT).",
      "For all landholding farmer families (husband, wife, minor children counted as one family).",
      "Excluded: income-tax payers, serving/retired government employees, institutional landholders.",
    ],
    howToApply: "Register at pmkisan.gov.in or the nearest Common Service Centre with Aadhaar, bank passbook and land records.",
    check: (p) => {
      if (p.farmerType === "landless" || p.farmerType === "sharecropper")
        return no("Requires cultivable land in the family's name — landless/sharecropper households are not covered.");
      if (!p.isRegistered) return no("Land records must be registered with the state agriculture portal first.");
      return ok("Landholding farmer family with registered land records.");
    },
  },
  {
    id: "pmfby",
    name: "Pradhan Mantri Fasal Bima Yojana",
    shortName: "PMFBY (Crop Insurance)",
    level: "Central + State",
    dept: "Ministry of Agriculture & Farmers Welfare",
    icon: "🛡️",
    benefit: "Crop insurance against drought, flood, pests and disease at a very low premium.",
    details: [
      "Farmer pays only 2% of sum insured for Kharif, 1.5% for Rabi, 5% for commercial/horticultural crops — government pays the rest.",
      "Covers prevented sowing, standing-crop loss, and post-harvest losses (cyclone/unseasonal rain).",
      "Open to ALL farmers including tenants and sharecroppers; loanee (KCC) farmers are enrolled by their bank unless they opt out.",
    ],
    howToApply: "Enrol through your bank, CSC, or pmfby.gov.in before the seasonal cut-off date with land/tenancy proof and sowing declaration.",
    check: (p) => {
      if (p.hasBankLoan) return ok("Has a crop loan — the bank enrols the crop automatically each season (opt-out possible).");
      return ok("Open to all farmers including tenants and sharecroppers — voluntary enrolment before the seasonal cut-off.");
    },
  },
  {
    id: "kcc",
    name: "Kisan Credit Card (with interest subvention)",
    shortName: "Kisan Credit Card",
    level: "Central",
    dept: "Dept. of Financial Services / NABARD",
    icon: "💳",
    benefit: "Crop loan up to ₹3 lakh at ~4% effective interest with prompt repayment.",
    details: [
      "Short-term credit for seeds, fertilizer, labour; interest subvention brings the effective rate to ~4% on prompt repayment.",
      "Collateral-free up to ₹2 lakh (RBI limit raised from ₹1.6 lakh, effective 2025).",
      "Also covers allied activities: dairy, fisheries, animal husbandry.",
    ],
    howToApply: "Apply at any bank branch or through PM-KISAN-linked KCC saturation drive with land records and Aadhaar.",
    check: (p) => {
      if (p.farmerType === "landless") return no("Needs cultivable land or documented tenancy/allied activity (dairy, fisheries).");
      return ok("Cultivating farmer — eligible for a collateral-free crop loan up to ₹2 lakh.");
    },
  },
  {
    id: "pm-kusum",
    name: "PM-KUSUM (Solar Pump Subsidy)",
    shortName: "PM-KUSUM",
    level: "Central + State",
    dept: "Ministry of New & Renewable Energy",
    icon: "☀️",
    benefit: "About 60% subsidy on a standalone solar irrigation pump; ~30% more available as a bank loan.",
    details: [
      "30% central + ~30% state subsidy on standalone solar pumps (higher in NE/hill states); farmer's own share can be ~10% upfront.",
      "Replaces diesel pumps — saves ₹40,000–₹50,000/year in fuel for a typical 5HP pump.",
      "Component C also lets grid-connected farmers solarise pumps and sell surplus power to the DISCOM.",
    ],
    howToApply: "Apply on the state renewable-energy agency / DISCOM portal with land papers and existing pump details.",
    check: (p) => {
      if (p.farmerType === "landless") return no("Requires owned/leased farmland where the pump will be installed.");
      return ok("Farmer with land and irrigation need — eligible for the standalone solar pump subsidy.");
    },
  },
  {
    id: "pmksy",
    name: "PMKSY — Per Drop More Crop (Micro-irrigation)",
    shortName: "PMKSY Drip/Sprinkler",
    level: "Central + State",
    dept: "Ministry of Agriculture (Micro Irrigation)",
    icon: "💧",
    benefit: "55% subsidy on drip/sprinkler systems for small & marginal farmers (45% for others).",
    details: [
      "Drip irrigation cuts water use 30–50% and typically raises yield 20–30%.",
      "Small/marginal farmers get 55% of system cost; other farmers 45% (states often top this up).",
      "Priority in water-stressed districts with falling groundwater.",
    ],
    howToApply: "Apply at the horticulture/agriculture department or state portal with a supplier quotation and land papers.",
    check: (p) => {
      if (p.farmerType === "landless") return no("Requires farmland on which the micro-irrigation system is installed.");
      const rate = p.farmerType === "marginal" || p.farmerType === "small" ? "55%" : "45%";
      return ok(`Eligible at the ${rate} subsidy rate (${p.farmerType} farmer).`);
    },
  },
  {
    id: "soil-health-card",
    name: "Soil Health Card Scheme",
    shortName: "Soil Health Card",
    level: "Central",
    dept: "Department of Agriculture & Farmers Welfare",
    icon: "🧪",
    benefit: "Free soil testing with crop-wise fertilizer recommendations, renewed every 2–3 years.",
    details: [
      "Lab report of 12 soil parameters: N, P, K, pH, EC, organic carbon and micronutrients.",
      "Cuts fertilizer cost by recommending only the nutrients your soil actually needs.",
      "Feeds directly into better crop recommendations (used by this app's crop planner).",
    ],
    howToApply: "Request sampling at the nearest Krishi Vigyan Kendra / agriculture office — free of cost.",
    check: () => ok("Available free to every farmer — no conditions."),
  },
  {
    id: "nmeo",
    name: "National Mission on Edible Oils — Oilseeds",
    shortName: "NMEO-Oilseeds",
    level: "Central",
    dept: "Ministry of Agriculture & Farmers Welfare",
    icon: "🌻",
    benefit: "Free high-yield oilseed seed varieties, training, and an assured buyer through your cluster.",
    details: [
      "Runs 2024-25 to 2030-31 for groundnut, mustard, soybean, sunflower and sesamum.",
      "Works through FPO/cooperative-managed 'value-chain clusters' with direct processor linkage.",
      "Includes soil testing and training in good agricultural practices.",
    ],
    howToApply: "Enrol through the FPO or cooperative managing your area's oilseed value-chain cluster.",
    check: (p) => {
      if (!p.isInCluster) return no("Farm is not inside a designated oilseed value-chain cluster.");
      if (!p.isFPOMember) return no("Must be a member of the FPO/cooperative that manages the cluster.");
      return ok("Registered FPO member inside an oilseed value-chain cluster.");
    },
  },
  {
    id: "trfa",
    name: "Targeting Rice Fallow Areas (TRFA)",
    shortName: "Rice-Fallow (TRFA)",
    level: "Central + State",
    dept: "Dept. of Agriculture — NFSM",
    icon: "🌾",
    benefit: "Free/subsidised pulse & oilseed seed minikits to grow a second crop on land left fallow after paddy.",
    details: [
      "Turns post-Kharif fallow land into a paying Rabi crop (mustard, sesame, lentil, gram).",
      "Free seed minikits plus demonstrations of zero-till and residual-moisture sowing.",
      "Available in identified rice-fallow districts.",
    ],
    howToApply: "Contact the block agriculture office or your FPO when Rabi minikits are announced.",
    check: (p) => {
      if (!p.hasRiceFallow) return no("Only for farmers whose land lies fallow after the Kharif paddy harvest.");
      return ok("Has rice-fallow land — eligible for free Rabi seed minikits.");
    },
  },
  {
    id: "aif",
    name: "Agriculture Infrastructure Fund (AIF)",
    shortName: "Agri Infra Fund",
    level: "Central",
    dept: "Ministry of Agriculture & Farmers Welfare",
    icon: "🏗️",
    benefit: "3% interest subvention on loans up to ₹2 crore for storage & post-harvest infrastructure.",
    details: [
      "Funds godowns, cold storage, sorting/grading units, oil mills and primary processing.",
      "3% interest subvention for up to 7 years + credit-guarantee cover (CGTMSE) on the loan.",
      "Best used by FPOs or farmer groups; individual farmers also eligible.",
    ],
    howToApply: "Apply on agriinfra.dac.gov.in with a project report; the loan is sanctioned by any scheduled bank.",
    check: (p) => {
      if (p.farmerType === "landless" && !p.isFPOMember)
        return no("Needs a farm/FPO project to finance — join an FPO to apply as a group.");
      if (!p.hasBankLoan && !p.isFPOMember)
        return ok("Eligible as an individual farmer, but a bank must sanction the project loan — an FPO application is usually stronger.");
      return ok("Eligible — farmers, FPOs, PACS and agri-entrepreneurs can all apply.");
    },
  },
];

/** Derive a sensible default eligibility profile from a farmer record. */
export function profileFromFarmer(f: {
  landAcres: number;
  fpoId?: string | null;
  crops?: string[];
  category?: "general" | "sc" | "st";
  gender?: "male" | "female";
  district?: string;
}): EligibilityProfile {
  const landAcres = f.landAcres ?? 0;
  const farmerType = landAcres <= 0 ? "landless" : landAcres <= 2.5 ? "marginal" : landAcres <= 5 ? "small" : "large";
  const oilseedGrower = (f.crops ?? []).some((c) =>
    ["groundnut", "mustard", "soybean", "sunflower", "sesame"].includes(c.toLowerCase()),
  );
  return {
    farmerType,
    landAcres,
    isFPOMember: !!f.fpoId,
    isInCluster: !!f.fpoId && oilseedGrower, // FPO cluster ≈ oilseed value chain in our demo
    hasRiceFallow: (f.crops ?? []).map((c) => c.toLowerCase()).includes("paddy"),
    isRegistered: true, // all demo farmers are registered via FPO/app
    category: f.category ?? "general",
    gender: f.gender ?? "",
    district: f.district ?? "",
    hasBankLoan: false,
  };
}

export interface SchemeMatch {
  scheme: GovScheme;
  result: EligibilityResult;
}

/** Evaluate the whole catalog for a profile, eligible schemes first. */
export function evaluateSchemes(p: EligibilityProfile): SchemeMatch[] {
  return SCHEMES.map((scheme) => ({ scheme, result: scheme.check(p) })).sort(
    (a, b) => Number(b.result.eligible) - Number(a.result.eligible),
  );
}

export function getScheme(id: string): GovScheme | undefined {
  return SCHEMES.find((s) => s.id === id);
}
