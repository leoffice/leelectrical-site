// Requisition history, payments, email, and SOV snapshot helpers.

import {
  baseContractItems,
  buildG702,
  buildG703Rows,
  changeOrderItems,
  isChangeOrderItem,
  requisitionItems,
  roundMoney,
  sumItemValues,
} from "./requisitionCalc.js";
import { fmtUsd } from "./requisitionData.js";

export const REQUISITION_EMAIL_SIGNATURE = [
  "Thank you,",
  "Martin Dorkin / LE Electrical",
  "Office@LeElectrical.us",
].join("\n");

const ACTIVE_REQ_STATUSES = new Set(["submitted", "generated"]);

/** Requisitions that count toward billing history (newest first). */
export function activeRequisitions(project) {
  return [...(project?.requisitions || [])]
    .filter((r) => r.status !== "void" && r.status !== "draft")
    .sort((a, b) => (b.num || 0) - (a.num || 0) || (b.createdAt || 0) - (a.createdAt || 0));
}

/** Active requisitions sorted by num ascending (for prev/next navigation). */
export function requisitionsAscending(project) {
  return [...(project?.requisitions || [])]
    .filter((r) => r.status !== "void" && r.status !== "draft")
    .sort((a, b) => (a.num || 0) - (b.num || 0) || (a.createdAt || 0) - (b.createdAt || 0));
}

/** CO $ earned at end of the latest submitted requisition (for draft G703 CO row). */
function priorChangeOrdersEarned(project) {
  const latest = activeRequisitions(project)[0];
  const coRow = latest?.g703?.find((r) => /change orders/i.test(r.description || ""));
  if (coRow) return roundMoney(coRow.totalCompleted);
  return roundMoney(Number(project?.changeOrdersCompletedToDate) || 0);
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

/**
 * Off-requisition payments — money received that isn't a certified draw (e.g. a
 * retainage release or a supplier joint check). Each: {id, label, amount, date,
 * reconciled}. Kept SEPARATE from the G702 certified math on purpose.
 */
export function otherPaymentsTotal(project) {
  return roundMoney((project?.otherPayments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0));
}

/** Off-requisition payments not yet tied to a certified draw. */
export function unreconciledPayments(project) {
  return (project?.otherPayments || []).filter((p) => !p.reconciled);
}

/** Certified draws received (from requisitions) — excludes off-req payments. */
export function certifiedPaidToDate(project) {
  const reqs = project?.requisitions || [];
  const fromPayments = roundMoney(
    reqs.reduce(
      (s, r) => s + (r.payments || []).reduce((ps, p) => ps + (Number(p.amount) || 0), 0),
      0
    )
  );
  return fromPayments > 0 ? fromPayments : sumPriorPayments(reqs);
}

/** Cash received = certified draws + off-requisition payments (Imperial etc.). */
export function totalPaidToDate(project) {
  return roundMoney(certifiedPaidToDate(project) + otherPaymentsTotal(project));
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

/**
 * Recompute every requisition's G702 lines from the SOV snapshot chain so the
 * whole ledger reconciles (line 6 = line 7 + line 8) and "previously paid" =
 * the running cumulative of prior draws.
 *
 * Change orders are an aggregate: `project.changeOrders` is the net CO total
 * (AIA line 2). A requisition may carry an authoritative G702 block read from
 * the real submitted paperwork (`req.g702.authoritative` with any of
 * earnedLessRetainage / totalCompleted / previousCertificates /
 * currentPaymentDue / netChangeOrders); those values win and pin the ledger to
 * the actual certificate. The CO amount earned-to-date for such a period is
 * inferred (totalCompleted - base completed) and carried forward.
 *
 * Also stamps `project.changeOrdersCompletedToDate` = the latest period's CO
 * earned, so a fresh draft starts from the right cumulative.
 */
export function reconcileRequisitionFinancials(project) {
  if (!project) return project;
  const items = project.items || [];
  const retPct = Number(project.retainagePct) || 10;
  const retMul = 1 - retPct / 100;
  const coTotal = roundMoney(Number(project.changeOrders) || 0);
  const baseContract = roundMoney(Number(project.contractSum) || 0);
  const contractToDate = roundMoney(baseContract + coTotal);
  const sorted = [...(project.requisitions || [])].sort(
    (a, b) => (a.num || 0) - (b.num || 0) || (a.createdAt || 0) - (b.createdAt || 0)
  );
  const rebuilt = [];
  let priorElr = 0;
  let priorCoEarned = 0;
  for (const r of sorted) {
    if (r.status === "void") {
      rebuilt.push(r);
      continue;
    }
    const snapMap = Object.fromEntries(
      (r.itemsSnapshot || []).map((s) => [s.key || sovItemKey(s), s.completedPct])
    );
    const draftItems = requisitionItems(items).map((it) => ({
      ...it,
      completedPct: snapMap[sovItemKey(it)] ?? carriedPctForItem(it, previousItemSnapshot({ requisitions: rebuilt })) ?? 0,
    }));
    const prevItemsById = prevItemsByIdForG702({ ...project, requisitions: rebuilt });
    const g703base = buildG703Rows(draftItems, prevItemsById, retPct);
    const baseCompleted = roundMoney(g703base.reduce((s, row) => s + row.totalCompleted, 0));
    const baseRetainage = roundMoney(g703base.reduce((s, row) => s + row.retainage, 0)); // per-line
    const coRetPct = Number(project.changeOrdersRetainagePct != null ? project.changeOrdersRetainagePct : retPct) || 0;

    const auth = r.g702 && r.g702.authoritative ? r.g702 : null;
    let elr, totalCompleted, coEarned, prevCerts, due;
    if (auth && (auth.earnedLessRetainage != null || auth.totalCompleted != null)) {
      // Real submitted certificate — pin to the paperwork.
      elr =
        auth.earnedLessRetainage != null
          ? roundMoney(auth.earnedLessRetainage)
          : roundMoney(auth.totalCompleted * retMul);
      totalCompleted = auth.totalCompleted != null ? roundMoney(auth.totalCompleted) : roundMoney(elr / retMul);
      coEarned = roundMoney(Math.min(Math.max(0, totalCompleted - baseCompleted), coTotal));
      prevCerts = auth.previousCertificates != null ? roundMoney(auth.previousCertificates) : roundMoney(priorElr);
      due = auth.currentPaymentDue != null ? roundMoney(auth.currentPaymentDue) : roundMoney(elr - prevCerts);
    } else {
      // No paperwork override — carry prior CO earned (SOV chain drives base),
      // retainage summed per line so 0%-retainage lines aren't withheld.
      coEarned = roundMoney(Math.min(priorCoEarned, coTotal));
      totalCompleted = roundMoney(Math.min(baseCompleted + coEarned, contractToDate));
      const periodRetainage = roundMoney(baseRetainage + (coEarned * coRetPct) / 100);
      elr = roundMoney(totalCompleted - periodRetainage);
      prevCerts = roundMoney(priorElr);
      due = roundMoney(Math.max(0, elr - prevCerts));
    }
    const totalRetainage = roundMoney(totalCompleted - elr);
    const balanceToFinish = roundMoney(contractToDate - elr);

    const g703 = [...g703base];
    if (coTotal > 0) {
      g703.push({
        itemNo: g703.length + 1,
        description: "Change Orders (net) - completed to date",
        scheduledValue: coTotal,
        prevCompleted: roundMoney(Math.min(priorCoEarned, coEarned)),
        thisPeriod: roundMoney(coEarned - Math.min(priorCoEarned, coEarned)),
        storedMaterial: 0,
        totalCompleted: coEarned,
        pctComplete: coTotal ? roundMoney((coEarned / coTotal) * 100) : 0,
        balance: roundMoney(coTotal - coEarned),
        retainage: roundMoney((coEarned * retPct) / 100),
      });
    }

    rebuilt.push({
      ...r,
      previousCertificates: prevCerts,
      totalCompleted,
      currentPaymentDue: due,
      amountCertified: due,
      earnedLessRetainage: elr,
      totalRetainage,
      retainagePct: retPct,
      netChangeOrders: coTotal,
      balanceToFinish,
      contractSumToDate: contractToDate,
      g703,
    });
    priorElr = elr;
    priorCoEarned = coEarned;
  }
  return { ...project, requisitions: rebuilt, changeOrdersCompletedToDate: roundMoney(priorCoEarned) };
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

/** Set every base-contract SOV line to 100% — for the final / retainage-closeout requisition. */
export function setAllRequisitionItemsComplete(draft) {
  if (!draft) return draft;
  return {
    ...draft,
    items: (draft.items || []).map((it) =>
      isChangeOrderItem(it) ? it : { ...it, completedPct: 100 }
    ),
  };
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
  for (const it of requisitionItems(project?.items)) {
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

/** Build G702 for a draft using prior requisition snapshot + the aggregate change-order totals. */
export function buildDraftG702(project, opts = {}) {
  const prevItemsById = prevItemsByIdForG702(project);
  const scoped = { ...project, items: requisitionItems(project.items) };
  const coCompleted = Number(project.changeOrdersCompletedToDate) || 0;
  const coPrev = priorChangeOrdersEarned(project);
  return buildG702(scoped, {
    ...opts, // opts.previousCertificates (manual "previously paid") passes through
    prevItemsById,
    changeOrders: Number(project.changeOrders) || 0,
    changeOrdersCompleted: coCompleted,
    changeOrdersPrevCompleted: coPrev,
  });
}

/** Create a requisition record from current draft. */
export function createRequisitionRecord(project, draft, opts = {}) {
  const g702 = buildDraftG702(draft, {
    periodTo: opts.periodTo,
    previousCertificates: opts.previousCertificates,
  });
  const snap = requisitionItems(draft.items).map((it) => ({
    id: it.id,
    key: sovItemKey(it),
    section: it.section,
    description: it.description,
    completedPct: it.completedPct,
  }));
  const num = opts.num ?? nextRequisitionNum(project);
  const applicationNumber = opts.applicationNumber || `REQ-${num}`;
  // When Levi manually sets "previously paid", pin this period to the generated
  // figures (authoritative) so reconcileRequisitionFinancials honors the entered
  // value instead of recomputing line 7 from the SOV cascade.
  const g702Pin = g702.previousCertificatesOverridden
    ? {
        authoritative: true,
        source: "Manual entry (Phase 3 requisition form)",
        previousCertificates: g702.previousCertificates,
        earnedLessRetainage: g702.earnedLessRetainage,
        totalCompleted: g702.totalCompleted,
        currentPaymentDue: g702.currentPaymentDue,
        periodTo: opts.periodTo || g702.periodTo,
      }
    : undefined;
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
    ...(g702Pin ? { g702: g702Pin } : {}),
    payments: [],
    attachments: [],
    emailSentAt: null,
    createdAt: Date.now(),
    submittedAt: null,
  };
}

/** Email summary for GC — mirrors prior requisition email style. */
export function buildRequisitionEmail({ project, requisition, contact, to: toOverride, subject: subjectOverride, attachments = [] }) {
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

  const subject = subjectOverride?.trim() || `${app} — ${proj} — Progress Payment Application`;

  const attachLines = [
    "• G702 Application and Certificate for Payment (PDF)",
    "• G703 Continuation Sheet (PDF)",
    ...attachments.map((a) => `• ${a.name}`),
  ];

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
    "Attach to your email:",
    ...attachLines,
    "",
    REQUISITION_EMAIL_SIGNATURE,
  ]
    .filter(Boolean)
    .join("\n");

  const to = (toOverride ?? contact?.email ?? "").trim();
  return { subject, body, to, signature: REQUISITION_EMAIL_SIGNATURE };
}

export function mailtoRequisitionUrl(email) {
  const params = new URLSearchParams();
  if (email.subject) params.set("subject", email.subject);
  if (email.body) params.set("body", email.body);
  const to = email.to || "";
  return `mailto:${encodeURIComponent(to)}?${params.toString()}`;
}