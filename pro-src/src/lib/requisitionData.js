// Project requisition seed data + helpers.

import { customerKeyForName, customerContact, normalizeCustomer } from "./customers.js";
import { BAEZ_SOV_ITEMS } from "../data/baezSovItems.js";
import { baseContractItems, sumItemValues } from "./requisitionCalc.js";

export const JOY_CONSTRUCTION_NAME = "Joy Construction";
export const JOY_GC_LABEL = "JOY CONSTRUCTION CORP.";
export const BAEZ_PROJECT_ID = "proj-baez-place";
export const BAEZ_ADDRESS = "334 East 176th Street, Bronx NY";

/** Route key for the Joy Construction customer hub. */
export function joyCustomerKey() {
  return customerKeyForName(JOY_CONSTRUCTION_NAME);
}

/** Match the Baez Place job from the jobs list (address, title, or GC name). */
export function findBaezJob(jobs) {
  const active = (jobs || []).filter((j) => j && !j._archived && !j._deleted);
  const addrNeedle = "176";
  for (const j of active) {
    const hay = [j.title, j.customer, j.businessName, j.serviceAddress, j.address]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (hay.includes("bae") || hay.includes(addrNeedle)) return j;
  }
  for (const j of active) {
    const gc = normalizeCustomer(j.gc || j.generalContractor || "");
    if (gc.includes("joy")) return j;
  }
  return null;
}

/** Contact card fields for Joy — prefer linked job, else project seed. */
export function projectCustomerContact(project, linkedJob) {
  if (linkedJob) return customerContact([linkedJob]);
  return {
    name: JOY_CONSTRUCTION_NAME,
    businessName: project?.gc || JOY_GC_LABEL,
    personName: "",
    phone: "",
    email: "",
    billingAddress: "",
    apartment: "",
    address: project?.address || BAEZ_ADDRESS,
    qboCustomerId: "",
  };
}

/** Ensure pilot project has requisition + drive fields. */
export function ensureProjectDefaults(project) {
  if (!project) return project;
  const enabled =
    project.requisitionEnabled ??
    (project.id === BAEZ_PROJECT_ID && (project.items?.length > 0));
  return {
    driveLinks: [],
    jobId: "",
    customerKey: joyCustomerKey(),
    ...project,
    requisitionEnabled: !!enabled,
    driveLinks: project.driveLinks || [],
  };
}

export function seedBaezProject() {
  // Progress SOV = base contract lines only. CO1–CO8 on the raw Drive sheet are
  // mistakes — not on the schedule and never calculated (Levi 2026-07-16).
  // Electric Service Equipment (item-1) is the only retainage-exempt line.
  const baseItems = baseContractItems(BAEZ_SOV_ITEMS);
  const baseContract = sumItemValues(baseItems);
  return ensureProjectDefaults({
    id: BAEZ_PROJECT_ID,
    name: "Baez Place",
    address: BAEZ_ADDRESS,
    contractor: "Martin Dorkin",
    gc: JOY_GC_LABEL,
    customerKey: joyCustomerKey(),
    contractSum: baseContract,
    retainagePct: 10,
    changeOrders: 0,
    changeOrderList: [],
    items: baseItems.map((it) => ({
      ...it,
      retainageExempt: it.id === "item-1" || it.retainageExempt === true,
    })),
    requisitions: [],
    requisitionEnabled: true,
    driveLinks: [],
    jobId: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export function normalizeProjects(raw) {
  if (!raw || typeof raw !== "object") return { list: [] };
  const list = Array.isArray(raw.list) ? raw.list : [];
  return { list };
}

export function findProject(projects, id) {
  return (projects?.list || []).find((p) => p.id === id) || null;
}

export function upsertProject(projects, project) {
  const list = [...(projects?.list || [])];
  const idx = list.findIndex((p) => p.id === project.id);
  const next = { ...project, updatedAt: Date.now() };
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  return { list };
}

export function fmtUsd(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}