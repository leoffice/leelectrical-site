// Requisition history, payments, email, and SOV snapshot helpers.

import {
  baseContractItems,
  buildG702,
  changeOrderItems,
  roundMoney,
  sumItemValues,
} from "./requisitionCalc.js";
import { fmtUsd } from "./requisitionData.js";

const ACTIVE_REQ_STATUSES = new Set(["submitted", "generated"]);

/** Requisitions that count toward billing history (newest first). */
export function activeRequisitions(project) {
  return [...(project?.requisitions || [])]
    .filter((r) => r.status !== "void" && r.status !== "draft")
    .sort((a, b) => (b.num || 0) - (a.num || 0) || (b.createdAt || 0) - (a.createdAt || 0));
}

/** Sum certified / due amounts from requisitions before a given number. */
export function sumPriorPayments(requisitions, beforeNum) {
  return roundMoney(
    (requisitions || [])
      .filter(
        (r) =>
          r.status !== "void" &&
          r.status !== "draft" &&
          (!beforeNum || (Number(r.num) || 0) < beforeNum)
      )
      .reduce((s, r) => s + (Number(r.amountCertified) || Number(r.currentPaymentDue) || 0), 0)
  );
}

/** Cash received — payments recorded, else certified amounts on closed reqs. */
export function totalPaidToDate(project) {
  const reqs = project?.requisitions || [];
  const fromPayments = roundMoney(
    reqs.reduce(
      (s, r) => s + (r.payments || []).reduce((ps, p) => ps + (Number(p.amount) || 0), 0),
      0
    )
  );
  if (fromPayments > 0) return fromPayments;
  return sumPriorPayments(reqs);
}

/** G702 completion breakdown for preview (base contract vs change orders). */
export function completionBreakdown(items) {
  const base = baseContractItems(items);
  const cos = changeOrderItems(items);
  const baseCompleted = roundMoney(base.reduce((s, it) => s + (it.value * (it.completedPct || 0)) / 100, 0));
  const coCompleted = roundMoney(cos.reduce((s, it) => s + (it.value * (it.completedPct || 0)) / 100, 0));
  return {
    baseScheduled: sumItemValues(base),
    coScheduled: sumItemValues(cos),
    baseCompleted,
    coCompleted,
    totalCompleted: roundMoney(baseCompleted + coCompleted),
  };
}

/** Whether a requisition can be removed (only last in sequence, or void if later exist). */
export function requisitionDeleteMode(project, req) {
  if (!req || req.status === "void") return "none";
  const active = activeRequisitions(project).filter((r) => ACTIVE_REQ_STATUSES.has(r.status));
  const latest = active[0];
  if (latest?.id === req.id) return "delete";
  return "blocked";
}

export function canHardDeleteRequisition(project, req) {
  return requisitionDeleteMode(project, req) === "delete";
}

/** Remove or void a requisition; hard-delete only when it is the latest. */
export function removeRequisition(project, reqId, { forceVoid = false } = {}) {
  const reqs = project?.requisitions || [];
  const target = reqs.find((r) => r.id === reqId);
  if (!target) return project;
  const mode = requisitionDeleteMode(project, target);
  if (mode === "delete") {
    return { ...project, requisitions: reqs.filter((r) => r.id !== reqId) };
  }
  if (mode === "blocked" || forceVoid) {
    return {
      ...project,
      requisitions: reqs.map((r) =>
        r.id === reqId ? { ...r, status: "void", voidedAt: Date.now() } : r
      ),
    };
  }
  return project;
}

/** Recalculate stored G702 fields from itemsSnapshot chain (fixes prev-cert drift). */
export function reconcileRequisitionFinancials(project) {
  if (!project) return project;
  const items = project.items || [];
  const sorted = [...(project.requisitions || [])].sort(
    (a, b) => (a.num || 0) - (b.num || 0) || (a.createdAt || 0) - (b.createdAt || 0)
  );
  const rebuilt = [];
  for (const r of sorted) {
    if (r.status === "void") {
      rebuilt.push(r);
      continue;
    }
    const snapMap = Object.fromEntries(
      (r.itemsSnapshot || []).map((s) => [s.key || sovItemKey(s), s.completedPct])
    );
    const draftItems = items.map((it) => ({
      ...it,
      completedPct: snapMap[sovItemKey(it)] ?? carriedPctForItem(it, previousItemSnapshot({ requisitions: rebuilt })) ?? 0,
    }));
    const prevItemsById = prevItemsByIdForG702({ ...project, requisitions: rebuilt });
    const g702 = buildG702(
      { ...project, items: draftItems, requisitions: rebuilt.filter((x) => x.status !== "void") },
      { periodTo: r.periodTo, prevItemsById }
    );
    const prevCerts = sumPriorPayments(rebuilt.filter((x) => x.status !== "void"), r.num);
    const storedDue = roundMoney(Number(r.currentPaymentDue) || Number(r.amountCertified) || 0);
    const due = storedDue > 0 ? storedDue : g702.currentPaymentDue;
    rebuilt.push({
      ...r,
      previousCertificates: prevCerts,
      totalCompleted: g702.totalCompleted,
      currentPaymentDue: due,
      amountCertified: due,
      earnedLessRetainage: g702.earnedLessRetainage,
      totalRetainage: g702.totalRetainage,
      balanceToFinish: g702.balanceToFinish,
      contractSumToDate: g702.contractSumToDate,
      g703: g702.g703,
    });
  }
  return { ...project, requisitions: rebuilt };
}

/** Stable key for matching SOV lines across imports / CSV re-uploads. */
export function sovItemKey(it) {
  const sec = String(it?.section || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  const desc = String(it?.description || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return `${sec}|${desc}`;
}

/** Next requisition sequence number (max existing + 1, not array length). */
export function nextRequisitionNum(project) {
  const nums = (project?.requisitions || []).map((r) => Number(r.num) || 0);
  const max = nums.length ? Math.max(...nums) : 0;
  return max + 1;
}

function lastRequisition(project, beforeReqId) {
  const reqs = (project?.requisitions || []).filter((r) => r.status !== "draft");
  const sorted = [...reqs].sort(
    (a, b) => (a.num || 0) - (b.num || 0) || (a.createdAt || 0) - (b.createdAt || 0)
  );
  let prev = null;
  for (const r of sorted) {
    if (beforeReqId && r.id === beforeReqId) break;
    prev = r;
  }
  return prev;
}

/** % for one SOV line from a snapshot (id first, then section|description). */
export function carriedPctForItem(it, snap) {
  if (!it || !snap) return null;
  if (snap.byId[it.id] != null) return snap.byId[it.id];
  const key = sovItemKey(it);
  if (snap.byKey[key] != null) return snap.byKey[key];
  return null;
}

/** Seed SOV line % from the last saved requisition (new req starts where the last one left off). */
export function applyCarriedPercentages(project) {
  if (!project) return project;
  const snap = previousItemSnapshot(project);
  const hasSnap = Object.keys(snap.byId).length > 0 || Object.keys(snap.byKey).length > 0;
  if (!hasSnap) return project;
  return {
    ...project,
    items: (project.items || []).map((it) => ({
      ...it,
      completedPct: carriedPctForItem(it, snap) ?? it.completedPct ?? 0,
    })),
  };
}

/**
 * Snapshot from the last submitted requisition.
 * Returns { byId, byKey } maps for matching current SOV lines.
 */
export function previousItemSnapshot(project, beforeReqId) {
  const prev = lastRequisition(project, beforeReqId);
  const snap = prev?.itemsSnapshot || [];
  const byId = {};
  const byKey = {};
  for (const it of snap) {
    const pct = it.completedPct ?? 0;
    if (it.id) byId[it.id] = pct;
    const key = it.key || sovItemKey(it);
    if (key) byKey[key] = pct;
  }
  return { byId, byKey };
}

/** Flat id → pct map (for red/green UI). */
export function previousPctByItemId(project, beforeReqId) {
  const snap = previousItemSnapshot(project, beforeReqId);
  const out = { ...snap.byId };
  for (const it of project?.items || []) {
    const pct = carriedPctForItem(it, snap);
    if (pct != null) out[it.id] = pct;
  }
  return out;
}

function prevItemsByIdForG702(project, beforeReqId) {
  const snap = previousItemSnapshot(project, beforeReqId);
  const out = {};
  for (const it of project?.items || []) {
    const pct = carriedPctForItem(it, snap);
    if (pct != null) out[it.id] = { completedPct: pct };
  }
  return out;
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
  const prevItemsById = prevItemsByIdForG702(project);
  const withCo = { ...project, changeOrders: changeOrdersTotal(project) };
  return buildG702(withCo, { ...opts, prevItemsById });
}

/** Create a requisition record from current draft. */
export function createRequisitionRecord(project, draft, opts = {}) {
  const g702 = buildDraftG702(draft, { periodTo: opts.periodTo });
  const snap = (draft.items || []).map((it) => ({ id: it.id, completedPct: it.completedPct }));
  const num = opts.num ?? nextRequisitionNum(project);
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