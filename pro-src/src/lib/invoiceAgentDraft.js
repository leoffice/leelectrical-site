// Agent-applied invoice / estimate drafts — review gate, diff, approve, deny, learning.
// Remote (agent) amount/line edits stay PENDING until Levi approves.
// Live amount + lines are never overwritten until approve (Levi 2026-08-03 guardrail).
import { fmt$, parseAmount } from "./format.js";
import { emptyLine, initialLines, lineAmount, linesTotal } from "./qboDoc.js";
import { findLineIndex } from "./invoiceEditIntent.js";
import { reconcileBalanceOnAmountChange } from "./payments.js";

const DOC_DRAFT_KEY = {
  invoice: "invoiceAgentDraft",
  estimate: "estimateAgentDraft",
};

export function draftKeyForKind(kind) {
  return DOC_DRAFT_KEY[kind === "estimate" ? "estimate" : "invoice"];
}

export function getDocAgentDraft(job, kind = "invoice") {
  if (!job) return null;
  const key = draftKeyForKind(kind);
  return job[key] || null;
}

export function hasPendingInvoiceReview(job) {
  return !!(job && job.invoiceAgentDraft && job.invoiceAgentDraft.pendingReview);
}

export function hasPendingEstimateReview(job) {
  return !!(job && job.estimateAgentDraft && job.estimateAgentDraft.pendingReview);
}

/** Any remote/agent doc change waiting for Levi. */
export function hasPendingDocReview(job) {
  return hasPendingInvoiceReview(job) || hasPendingEstimateReview(job);
}

export function effectiveInvoiceLines(job) {
  if (hasPendingInvoiceReview(job)) return job.invoiceAgentDraft.lines || [];
  return job.invoiceLines || [];
}

export function effectiveEstimateLines(job) {
  if (hasPendingEstimateReview(job)) return job.estimateAgentDraft.lines || [];
  return job.estimateLines || [];
}

function cloneLines(lines) {
  return (lines || []).map((ln) => ({ ...emptyLine(), ...ln }));
}

function baselineForJob(job, kind = "invoice") {
  const draft = getDocAgentDraft(job, kind);
  if (draft?.baselineLines?.length) return cloneLines(draft.baselineLines);
  if (kind === "estimate") {
    if (job.estimateLines?.length) return cloneLines(job.estimateLines);
    return initialLines(job, { kind: "estimate", mode: "edit" });
  }
  if (job.invoiceLines?.length) return cloneLines(job.invoiceLines);
  return initialLines(job, { kind: "invoice", mode: "edit" });
}

function liveAmount(job, kind = "invoice") {
  if (kind === "estimate") {
    return parseAmount(job.amount) || linesTotal(job.estimateLines || []);
  }
  return parseAmount(job.amount) || linesTotal(job.invoiceLines || []);
}

function lineSnippet(lines, max = 2) {
  return (lines || [])
    .slice(0, max)
    .map((ln) => {
      const desc = String(ln.description || ln.itemName || ln.item || "").trim();
      const amt = lineAmount(ln);
      return desc ? `${desc}${amt ? ` (${fmt$(amt)})` : ""}` : amt ? fmt$(amt) : "";
    })
    .filter(Boolean)
    .join(" · ");
}

/**
 * Condensed card copy for login approval (Levi 2026-08-03).
 * Customer · address · doc # · old → new · description snippets.
 */
export function buildDocChangeSummary(job, draft, kind = "invoice") {
  const d = draft || getDocAgentDraft(job, kind) || {};
  const baseline = d.baselineLines?.length
    ? cloneLines(d.baselineLines)
    : baselineForJob(job, kind);
  const proposed = d.lines?.length ? cloneLines(d.lines) : baseline;
  const beforeAmt = d.baselineAmount != null ? parseAmount(d.baselineAmount) : linesTotal(baseline);
  const afterAmt = d.proposedAmount != null ? parseAmount(d.proposedAmount) : linesTotal(proposed);
  const docNo =
    kind === "estimate"
      ? job.estimateNo || d.docNo || ""
      : job.invoiceNo || d.docNo || "";
  const customer =
    job.customer || job.customerName || job.businessName || job.personName || "Customer";
  const address =
    job.serviceAddress || job.address || job.billingAddress || "";
  const phone = job.phone || "";
  const email = job.email || "";
  return {
    kind: kind === "estimate" ? "estimate" : "invoice",
    jobId: job.id,
    customer,
    person: job.personName || "",
    address,
    phone,
    email,
    docNo,
    docLabel: kind === "estimate" ? (docNo ? `Est #${docNo}` : "Estimate") : docNo ? `Inv #${docNo}` : "Invoice",
    beforeAmount: beforeAmt,
    afterAmount: afterAmt,
    beforeFmt: fmt$(beforeAmt) || "$0",
    afterFmt: fmt$(afterAmt) || "$0",
    beforeDesc: lineSnippet(baseline),
    afterDesc: lineSnippet(proposed),
    sourceText: String(d.sourceText || "").trim(),
    agent: String(d.agent || "agent").trim() || "agent",
    summary: String(d.summary || "").trim(),
    appliedAt: d.appliedAt || 0,
    dangerous: beforeAmt > 0 && afterAmt <= 0.009,
  };
}

/**
 * Build a remote/agent pending draft WITHOUT touching live amount or lines.
 * Used by chat bubble + host/Israel remote edits.
 */
export function buildRemoteDocDraftPatch(job, opts = {}) {
  const kind = opts.kind === "estimate" ? "estimate" : "invoice";
  const draftKey = draftKeyForKind(kind);
  const hasDoc =
    kind === "estimate"
      ? !!(job?.estimateNo || (job?.estimateLines || []).length)
      : !!(job?.invoiceNo || (job?.invoiceLines || []).length);
  if (!job || !hasDoc) return null;

  const baseline = baselineForJob(job, kind);
  let lines;
  if (Array.isArray(opts.lines) && opts.lines.length) {
    lines = cloneLines(opts.lines);
  } else if (opts.intent?.actions?.length) {
    lines = hasPendingDocReviewForKind(job, kind)
      ? cloneLines(getDocAgentDraft(job, kind).lines)
      : cloneLines(baseline);
    const edits = applyIntentActions(lines, opts.intent);
    if (!edits.length && !opts.force) return null;
  } else {
    return null;
  }
  if (!lines.length) lines.push(emptyLine());

  const baselineAmount = liveAmount(job, kind);
  const proposedAmount = linesTotal(lines);
  const edits = opts.edits || summarizeLineEdits(baseline, lines);
  const draft = {
    pendingReview: true,
    kind,
    baselineLines: baseline,
    lines,
    edits,
    baselineAmount,
    proposedAmount,
    sourceText: String(opts.sourceText || "").trim(),
    agent: String(opts.agent || "agent").trim() || "agent",
    appliedAt: Date.now(),
    summary: String(opts.summary || opts.intent?.summary || "").trim(),
    docNo: kind === "estimate" ? job.estimateNo || "" : job.invoiceNo || "",
  };

  // CRITICAL: do not patch live amount / lines — only the pending draft.
  return {
    [draftKey]: draft,
  };
}

function hasPendingDocReviewForKind(job, kind) {
  return kind === "estimate" ? hasPendingEstimateReview(job) : hasPendingInvoiceReview(job);
}

function applyIntentActions(lines, intent) {
  const edits = [];
  for (const action of intent.actions || []) {
    if (action.type === "set_amount") {
      const idx = findLineIndex(lines, action.match);
      if (idx < 0) continue;
      const before = lineAmount(lines[idx]);
      lines[idx] = { ...lines[idx], unitPrice: action.amount, qty: lines[idx].qty || 1 };
      edits.push({
        type: "changed",
        index: idx,
        field: "unitPrice",
        before,
        after: action.amount,
        label: action.match,
      });
      continue;
    }
    if (action.type === "add_line") {
      const row = {
        ...emptyLine(),
        itemName: action.itemName,
        description: action.itemName,
        qty: 1,
        unitPrice: action.amount,
      };
      lines.push(row);
      edits.push({
        type: "added",
        index: lines.length - 1,
        after: row,
        label: action.itemName,
      });
      continue;
    }
    if (action.type === "remove_line") {
      const idx = findLineIndex(lines, action.match);
      if (idx < 0) continue;
      const removed = lines[idx];
      lines.splice(idx, 1);
      edits.push({ type: "removed", index: idx, before: removed, label: action.match });
    }
  }
  return edits;
}

function summarizeLineEdits(baseline, current) {
  const edits = [];
  const max = Math.max((baseline || []).length, (current || []).length);
  for (let i = 0; i < max; i++) {
    const b = baseline[i];
    const c = current[i];
    if (!b && c) {
      edits.push({ type: "added", index: i, after: c, label: c.itemName || c.description });
      continue;
    }
    if (b && !c) {
      edits.push({ type: "removed", index: i, before: b, label: b.itemName || b.description });
      continue;
    }
    if (!b || !c) continue;
    for (const field of ["itemName", "description", "qty", "unitPrice"]) {
      const bv = field === "unitPrice" || field === "qty" ? parseAmount(b[field]) : String(b[field] || "");
      const cv = field === "unitPrice" || field === "qty" ? parseAmount(c[field]) : String(c[field] || "");
      if (bv !== cv) {
        edits.push({ type: "changed", index: i, field, before: b[field], after: c[field], label: c.itemName || b.itemName });
      }
    }
  }
  return edits;
}

/** Apply parsed chat actions → draft patch (no live amount/line overwrite). */
export function buildAgentDraftPatch(job, intent, sourceText) {
  if (!job?.invoiceNo && !(job?.invoiceLines || []).length) return null;
  return buildRemoteDocDraftPatch(job, {
    kind: "invoice",
    intent,
    sourceText,
    agent: "chat",
    summary: intent?.summary || "",
  });
}

/**
 * Remote agent (Israel / host) proposing full line replace or amount rewrite.
 * Never writes live amount/lines; always pendingReview.
 */
export function proposeRemoteDocChange(job, opts = {}) {
  const kind = opts.kind === "estimate" ? "estimate" : "invoice";
  let lines = opts.lines;
  if (!lines && opts.amount != null) {
    const baseline = baselineForJob(job, kind);
    const amt = parseAmount(opts.amount);
    if (baseline.length === 1) {
      lines = [{ ...baseline[0], unitPrice: amt, qty: baseline[0].qty || 1, amount: amt }];
    } else if (baseline.length) {
      // Keep descriptions; put whole total on first line (agent should prefer full lines).
      lines = baseline.map((ln, i) =>
        i === 0
          ? { ...ln, unitPrice: amt, qty: 1, amount: amt }
          : { ...ln, unitPrice: 0, amount: 0 }
      );
    } else {
      lines = [
        {
          ...emptyLine(),
          itemName: opts.itemName || "Installation:Installation",
          description: opts.description || opts.summary || "Agent update",
          qty: 1,
          unitPrice: amt,
          amount: amt,
        },
      ];
    }
  }
  if (!lines) return null;
  return buildRemoteDocDraftPatch(job, {
    kind,
    lines,
    sourceText: opts.sourceText || opts.reason || "",
    agent: opts.agent || "israel",
    summary: opts.summary || "",
    force: true,
  });
}

/** Per-line diff markers for the review sheet. */
export function invoiceLineDiff(baseline, current) {
  const base = baseline || [];
  const cur = current || [];
  const marks = cur.map(() => ({}));
  const max = Math.max(base.length, cur.length);

  for (let i = 0; i < max; i++) {
    const b = base[i];
    const c = cur[i];
    if (!b && c) {
      marks[i] = { added: true };
      continue;
    }
    if (b && !c) continue;
    if (!b || !c) continue;
    const changed = {};
    for (const field of ["itemName", "description", "qty", "unitPrice"]) {
      const bv = field === "unitPrice" || field === "qty" ? parseAmount(b[field]) : String(b[field] || "");
      const cv = field === "unitPrice" || field === "qty" ? parseAmount(c[field]) : String(c[field] || "");
      if (bv !== cv) changed[field] = true;
    }
    if (Object.keys(changed).length) marks[i] = { changed };
  }
  return marks;
}

/** Compare agent-applied lines vs Levi's approved version for learning. */
export function computeLearningDelta(agentLines, approvedLines, sourceText) {
  const deltas = [];
  const max = Math.max((agentLines || []).length, (approvedLines || []).length);
  for (let i = 0; i < max; i++) {
    const a = agentLines[i];
    const f = approvedLines[i];
    if (!a && !f) continue;
    if (!a && f) {
      deltas.push({ kind: "agent_missed_line", index: i, approved: f, sourceText });
      continue;
    }
    if (a && !f) {
      deltas.push({ kind: "agent_extra_line", index: i, agent: a, sourceText });
      continue;
    }
    for (const field of ["itemName", "description", "qty", "unitPrice"]) {
      const av = field === "unitPrice" || field === "qty" ? parseAmount(a[field]) : String(a[field] || "");
      const fv = field === "unitPrice" || field === "qty" ? parseAmount(f[field]) : String(f[field] || "");
      if (av !== fv) {
        deltas.push({
          kind: "field_correction",
          index: i,
          field,
          agent: a[field],
          approved: f[field],
          sourceText,
        });
      }
    }
  }
  return deltas;
}

/** Commit approved lines — clears pending review; QBO sync stays on Save & sync. */
export function approveAgentDraftPatch(job, approvedLines, kind = "invoice") {
  const draftKey = draftKeyForKind(kind);
  const draft = getDocAgentDraft(job, kind) || {};
  const agentLines = draft.lines || [];
  const total = linesTotal(approvedLines);
  const learningDelta = computeLearningDelta(agentLines, approvedLines, draft.sourceText);
  const bal = kind === "invoice" ? reconcileBalanceOnAmountChange(job, total) : {};
  const linesField = kind === "estimate" ? "estimateLines" : "invoiceLines";
  return {
    [linesField]: approvedLines,
    amount: fmt$(total),
    ...bal,
    [draftKey]: {
      ...draft,
      pendingReview: false,
      approvedAt: Date.now(),
      approvedLines,
      learningDelta,
    },
  };
}

/** Deny remote/agent draft — drop pending changes; live amount/lines untouched. */
export function denyAgentDraftPatch(job, kind = "invoice") {
  const draftKey = draftKeyForKind(kind);
  const draft = getDocAgentDraft(job, kind);
  if (!draft?.pendingReview) return null;
  return {
    [draftKey]: {
      ...draft,
      pendingReview: false,
      deniedAt: Date.now(),
      lines: draft.baselineLines || draft.lines,
    },
  };
}

/** Jobs with open pending doc reviews (for login cards). */
export function collectPendingDocReviews(jobs) {
  const out = [];
  for (const job of jobs || []) {
    if (hasPendingInvoiceReview(job)) {
      out.push({
        job,
        kind: "invoice",
        draft: job.invoiceAgentDraft,
        summary: buildDocChangeSummary(job, job.invoiceAgentDraft, "invoice"),
        key: `doc-change:invoice:${job.id}:${job.invoiceAgentDraft.appliedAt || 0}`,
      });
    }
    if (hasPendingEstimateReview(job)) {
      out.push({
        job,
        kind: "estimate",
        draft: job.estimateAgentDraft,
        summary: buildDocChangeSummary(job, job.estimateAgentDraft, "estimate"),
        key: `doc-change:estimate:${job.id}:${job.estimateAgentDraft.appliedAt || 0}`,
      });
    }
  }
  out.sort((a, b) => (b.draft?.appliedAt || 0) - (a.draft?.appliedAt || 0));
  return out;
}

/** Default snooze when Levi hits ✕ on a doc-change card (Levi 2026-08-03). */
export const DOC_CHANGE_SNOOZE_MINUTES = 15;
