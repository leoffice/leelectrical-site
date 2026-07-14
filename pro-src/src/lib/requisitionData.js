// Project requisition seed data + helpers.

import { customerKeyForName, customerContact, normalizeCustomer } from "./customers.js";
import { parseSovCsv } from "./sovParser.js";

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

const BAEZ_SOV_CSV = `Martin Dorkin - Baez Place SOV,"$1,700,000.00",,,
,,,,
Description,, Value ,Percentage
Electric Service Equipment,," $ 466,800.00 ",27%
Electric Service Installation,," $ 230,000.00 ",14%
Temp Electric & Lighting,," $ 52,800.00 ",3%
Subcellar Floor,,,
,Roughing Lighting," $ 12,240.00 ",0.72%
,Rouphing for Equipments," $ 12,750.00 ",0.75%
,Low Voltage/ Data Wiring/ Intercom," $ 2,550.00 ",0.15%
,Finish & Lighting," $ 3,400.00 ",0.20%
,Lighting Contorls, $ 950.00 ,0.06%
,Testing & Inspections, $ 850.00 ,0.05%
Cellar Floor,,,
,Feeders & Subfeeders," $ 12,410.00 ",0.73%
,Roughing," $ 14,620.00 ",0.86%
,Low Voltage/ Data Wiring/ Intercom," $ 7,650.00 ",0.45%
,Finish & Lighting," $ 3,060.00 ",0.18%
,Lighting controls, $ 850.00 ,0.05%
,Testing & Inspections, $ 850.00 ,0.05%
Basement Floor,,,
,Feeders & Subfeeders," $ 14,110.00 ",0.83%
,Roughing," $ 16,830.00 ",0.99%
,Low Voltage/ Data Wiring/ Intercom," $ 8,840.00 ",0.52%
,Finish & Lighting," $ 3,570.00 ",0.21%
,Lighting controls, $ 850.00 ,0.05%
,Testing & Inspections, $ 850.00 ,0.05%
Exterior,,,
,Feeders & Subfeeders," $ 5,100.00 ",0.30%
,Roughing," $ 5,100.00 ",0.30%
,Finish & Lighting," $ 2,550.00 ",0.15%
,Lighting controls, $ 850.00 ,0.05%
,Testing & Inspections, $ 850.00 ,0.05%
1st Floor,,,
,Feeders & Subfeeders," $ 21,250.00 ",1.25%
,Roughing," $ 25,160.00 ",1.48%
,Low Voltage/ Data Wiring/ Intercom," $ 13,260.00 ",0.78%
,Finish & Lighting," $ 5,270.00 ",0.31%
,Lighting controls," $ 1,360.00 ",0.08%
,Testing & Inspections," $ 1,360.00 ",0.08%
2nd Floor,,,
,Feeders & Subfeeders," $ 35,360.00 ",2.08%
,Roughing," $ 41,990.00 ",2.47%
,Low Voltage/ Data Wiring/ Intercom," $ 22,100.00 ",1.30%
,Finish & Lighting," $ 8,840.00 ",0.52%
,Lighting controls," $ 2,210.00 ",0.13%
,Testing & Inspections," $ 2,210.00 ",0.13%
3rd Floor,,,
,Feeders & Subfeeders," $ 35,360.00 ",2.08%
,Roughing," $ 41,990.00 ",2.47%
,Low Voltage/ Data Wiring/ Intercom," $ 22,100.00 ",1.30%
,Finish & Lighting," $ 8,840.00 ",0.52%
,Lighting controls," $ 2,210.00 ",0.13%
,Testing & Inspections," $ 2,210.00 ",0.13%
4th Floor,,,
,Feeders & Subfeeders," $ 35,360.00 ",2.08%
,Roughing," $ 41,990.00 ",2.47%
,Low Voltage/ Data Wiring/ Intercom," $ 22,100.00 ",1.30%
,Finish & Lighting," $ 8,840.00 ",0.52%
,Lighting controls," $ 2,210.00 ",0.13%
,Testing & Inspections," $ 2,210.00 ",0.13%
5th Floor,,,
,Feeders & Subfeeders," $ 33,490.00 ",1.97%
,Roughing," $ 39,780.00 ",2.34%
,Low Voltage/ Data Wiring/ Intercom," $ 20,910.00 ",1.23%
,Finish & Lighting," $ 8,330.00 ",0.49%
,Lighting controls," $ 2,040.00 ",0.12%
,Testing & Inspections," $ 2,040.00 ",0.12%
6th Floor,,,
,Feeders & Subfeeders," $ 33,490.00 ",1.97%
,Roughing," $ 39,780.00 ",2.34%
,Low Voltage/ Data Wiring/ Intercom," $ 20,910.00 ",1.23%
,Finish & Lighting," $ 8,330.00 ",0.49%
,Lighting controls," $ 2,040.00 ",0.12%
,Testing & Inspections," $ 2,040.00 ",0.12%
7th Floor,,,
,Feeders & Subfeeders," $ 24,650.00 ",1.45%
,Roughing," $ 29,410.00 ",1.73%
,Low Voltage/ Data Wiring/ Intercom," $ 15,470.00 ",0.91%
,Finish & Lighting," $ 6,120.00 ",0.36%
,Lighting controls," $ 1,530.00 ",0.09%
,Testing & Inspections," $ 1,530.00 ",0.09%
8th Floor,,,
,Feeders & Subfeeders," $ 26,520.00 ",1.56%
,Roughing," $ 31,450.00 ",1.85%
,Low Voltage/ Data Wiring/ Intercom," $ 16,490.00 ",0.97%
,Finish & Lighting," $ 6,630.00 ",0.39%
,Lighting controls," $ 1,700.00 ",0.10%
,Testing & Inspections," $ 1,700.00 ",0.10%
Roof Floor,,,
,Feeders & Subfeeders," $ 11,900.00 ",0.70%
,Roughing," $ 11,050.00 ",0.65%
,Low Voltage/ Data Wiring/ Intercom," $ 3,400.00 ",0.20%
,Finish & Lighting," $ 3,400.00 ",0.20%
,Lighting Install," $ 3,400.00 ",0.20%
,Lighting controls," $ 1,700.00 ",0.10%
,Testing & Inspections," $ 1,700.00 ",0.10%`;

export function seedBaezProject() {
  const parsed = parseSovCsv(BAEZ_SOV_CSV, { name: "Baez Place" });
  return ensureProjectDefaults({
    id: BAEZ_PROJECT_ID,
    name: "Baez Place",
    address: BAEZ_ADDRESS,
    contractor: "Martin Dorkin",
    gc: JOY_GC_LABEL,
    customerKey: joyCustomerKey(),
    contractSum: parsed.contractSum,
    retainagePct: 10,
    changeOrders: 0,
    items: parsed.items,
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