// Firestore Admin SDK, server-side only. Uses Application Default Credentials
// (gcloud auth application-default login) locally, and the Cloud Run service
// account in production. No client-side Firebase, no auth — this is a demo.
import "server-only";
import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.GOOGLE_CLOUD_PROJECT || "causal-galaxy-415009";

if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), projectId });
}

export const db = getFirestore();

// Collection name constants keep string typos out of the codebase.
export const COL = {
  farmers: "farmers",
  queries: "queries",
  reports: "reports",
  tickets: "tickets",
  alerts: "alerts",
  schemes: "schemes",
  districts: "districts",
  fpos: "fpos",
  plans: "plans",
  applications: "applications",
  sms: "sms",
} as const;
