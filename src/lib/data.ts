// Server-side data access helpers over Firestore.
import "server-only";
import { db, COL } from "./firestore";
import type { Farmer, Query, District } from "./types";

async function all<T>(col: string): Promise<T[]> {
  const snap = await db.collection(col).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

export const getFarmers = () => all<Farmer>(COL.farmers);
export const getDistricts = () => all<District>(COL.districts);

export async function getFarmer(id: string): Promise<Farmer | null> {
  const d = await db.collection(COL.farmers).doc(id).get();
  return d.exists ? ({ id: d.id, ...d.data() } as Farmer) : null;
}

export async function getFarmerByPhone(phone: string): Promise<Farmer | null> {
  const snap = await db.collection(COL.farmers).where("phone", "==", phone).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as Farmer;
}

export async function getDistrictByName(name: string): Promise<District | null> {
  const snap = await db.collection(COL.districts).where("name", "==", name).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as District;
}

export async function getQueriesForFarmer(farmerId: string): Promise<Query[]> {
  const snap = await db.collection(COL.queries).where("farmerId", "==", farmerId).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Query)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getQueriesByPhone(phone: string): Promise<Query[]> {
  const snap = await db.collection(COL.queries).where("phone", "==", phone).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Query)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// Writes ---------------------------------------------------------------
export async function addDoc<T extends object>(col: string, id: string, data: T) {
  await db.collection(col).doc(id).set(data as Record<string, unknown>, { merge: true });
}

export function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
