// Requisition history, payments, email, and SOV snapshot helpers.

import { buildG702 } from "./requisitionCalc.js";
import { fmtUsd } from "./requisitionData.js";

/** Seed SOV line % from the last saved requisition (new req starts where the last one left off). */
export function applyCarriedPercentages(project) {
  if (!project) return project;
  const prev = previousItemSnapshot(project);
  const hasPrev = Object.keys(prev).length > 0;
  if (!hasPrev) return project;
  return {
    ...project,
    items: (project.items || []).map((it) => ({
      ...it,
      completedPct: prev[it.id] ?? it.completedPct ?? 0,
    })),
  };
}

/** Map of item id → completedPct from the last submitted requisition. */
export function previousItemSnapshot(project, beforeReqId) {
  const reqs = (project?.requisitions || []).filter((r) => r.status !== "draft");
  const sorted = [...reqs].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  let prev = null;
  for (const r of sorted) {
    if (beforeReqId && r.id === beforeReqId) break;
    prev = r;
  }
  const snap = prev?.itemsSnapshot || [];
  const map = {};
  for (const it of snap) map[it.id] = it.completedPct ?? 0;
  return map;
}

/** 'unchanged' = matches last submitted %, 'changed' = user edited, 'new' = no prior. */
export function pctChangeStatus(currentPct, prevPct, hasPrev) {
  if (!hasPrev) return "new";
  const cur = Number(currentPct) || 0;
  const prev = Number(prevPct) || 0;
  return cur === prev ? "unchanged" : "changed";
}

export function requisitionBalance(req) {
  const due = Number(req?.currentPaymentDue) || 0;
  const paid = (req?.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return Math.max(0, due - paid);
}

export function paymentNeedsInfo(p) {
  if (!p) return true;
  const amt = Number(p.amount) || 0;
  if (!amt) return true;
  return !p.date || !p.checkNumber;
}

export function paymentStatusLabel(req) {
  const payments = req?.payments || [];
  if (!payments.length) return "No payment";
  const bal = requisitionBalance(req);
  if (bal <= 0) return "Paid";
  const partial = payments.some((p) => (Number(p.amount) || 0) > 0);
  return partial ? "Partial" : "No payment";
}

export function changeOrdersTotal(project) {
  const list = project?.changeOrderList || [];
  if (list.length) return list.reduce((s, co) => s + (Number(co.amount) || 0), 0);
  return Number(project?.changeOrders) || 0;
}

/** Build G702 for a draft using prior requisition snapshot. */
export function buildDraftG702(project, opts = {}) {
  const prevItemsById = previousItemSnapshot(project);
  const withCo = { ...project, changeOrders: changeOrdersTotal(project) };
  return buildG702(withCo, { ...opts, prevItemsById });
}

/** Create a requisition record from current draft. */
export function createRequisitionRecord(project, draft, opts = {}) {
  const g702 = buildDraftG702(draft, { periodTo: opts.periodTo });
  const snap = (draft.items || []).map((it) => ({ id: it.id, completedPct: it.completedPct }));
  const num = opts.num ?? (project.requisitions?.length || 0) + 1;
  const applicationNumber = opts.applicationNumber || `REQ-${num}`;
  return {
    id: `req-${Date.now()}`,
    num,
    applicationNumber,
    periodTo: opts.periodTo || g702.periodTo,
    status: "generated",
    amountCertified: g702.currentPaymentDue,
    currentPaymentDue: g702.currentPaymentDue,
    previousCertificates: g702.previousCertificates,
    totalCompleted: g702.totalCompleted,
    balanceToFinish: g702.balanceToFinish,
    earnedLessRetainage: g702.earnedLessRetainage,
    totalRetainage: g702.totalRetainage,
    retainagePct: g702.retainagePct,
    contractSumToDate: g702.contractSumToDate,
    itemsSnapshot: snap,
    g703: g702.g703,
    payments: [],
    attachments: [],
    emailSentAt: null,
    createdAt: Date.now(),
    submittedAt: null,
  };
}

/** Email summary for GC — mirrors prior requisition email style. */
export function buildRequisitionEmail({ project, requisition, contact }) {
  const req = requisition;
  const gc = project?.gc || "General Contractor";
  const proj = project?.name || "Project";
  const addr = project?.address || "";
  const app = req.applicationNumber || `REQ-${req.num}`;
  const period = req.periodTo || "";
  const due = fmtUsd(req.currentPaymentDue);
  const prev = fmtUsd(req.previousCertificates);
  const total = fmtUsd(req.totalCompleted);
  const bal = fmtUsd(requisitionBalance(req));

  const subject = `${app} — ${proj} — Progress Payment Application`;

  const body = [
    `Please find attached the progress payment application for ${proj}.`,
    "",
    `Project: ${proj}`,
    addr ? `Address: ${addr}` : "",
    `General Contractor: ${gc}`,
    `Application: ${app}`,
    period ? `Period ending: ${period}` : "",
    "",
    `Total completed to date: ${total}`,
    `Previously certified: ${prev}`,
    `Current payment due: ${due}`,
    `Balance remaining on this application: ${bal}`,
    "",
    "Attached:",
    "• G702 Application and Certificate for Payment",
    "• G703 Continuation Sheet",
    "",
    "Supporting invoices and photos are included as noted.",
    "",
    "Thank you,",
    "Martin Dorkin / LE Electrical",
    "Office@LeElectrical.us",
  ]
    .filter(Boolean)
    .join("\n");

  const to = (contact?.email || "").trim();
  return { subject, body, to };
}

export function mailtoRequisitionUrl(email) {
  const params = new URLSearchParams();
  if (email.subject) params.set("subject", email.subject);
  if (email.body) params.set("body", email.body);
  const to = email.to || "";
  return `mailto:${encodeURIComponent(to)}?${params.toString()}`;
}