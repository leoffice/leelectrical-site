// Agent-applied invoice drafts — review gate, diff, approve, learning loop.
import { fmt$, parseAmount } from "./format.js";
import { emptyLine, initialLines, lineAmount, linesTotal } from "./qboDoc.js";
import { findLineIndex } from "./invoiceEditIntent.js";

export function hasPendingInvoiceReview(job) {
  return !!(job && job.invoiceAgentDraft && job.invoiceAgentDraft.pendingReview);
}

export function effectiveInvoiceLines(job) {
  if (hasPendingInvoiceReview(job)) return job.invoiceAgentDraft.lines || [];
  return job.invoiceLines || [];
}

function cloneLines(lines) {
  return (lines || []).map((ln) => ({ ...emptyLine(), ...ln }));
}

function baselineForJob(job) {
  if (job.invoiceAgentDraft?.baselineLines?.length) return cloneLines(job.invoiceAgentDraft.baselineLines);
  if (job.invoiceLines?.length) return cloneLines(job.invoiceLines);
  return initialLines(job, { kind: "invoice", mode: "edit" });
}

/** Apply parsed actions → draft patch for patchAndSave (no QBO). */
export function buildAgentDraftPatch(job, intent, sourceText) {
  if (!job?.invoiceNo && !(job?.invoiceLines || []).length) return null;
  const baseline = baselineForJob(job);
  const lines = hasPendingInvoiceReview(job)
    ? cloneLines(job.invoiceAgentDraft.lines)
    : cloneLines(baseline);
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

  if (!edits.length) return null;
  if (!lines.length) lines.push(emptyLine());

  const total = linesTotal(lines);
  const draft = {
    pendingReview: true,
    baselineLines: baseline,
    lines,
    edits,
    sourceText: String(sourceText || "").trim(),
    appliedAt: Date.now(),
    summary: intent.summary || "",
  };

  return {
    invoiceAgentDraft: draft,
    amount: fmt$(total),
  };
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
export function approveAgentDraftPatch(job, approvedLines) {
  const agentLines = job.invoiceAgentDraft?.lines || [];
  const total = linesTotal(approvedLines);
  const learningDelta = computeLearningDelta(agentLines, approvedLines, job.invoiceAgentDraft?.sourceText);
  return {
    invoiceLines: approvedLines,
    amount: fmt$(total),
    invoiceAgentDraft: {
      ...job.invoiceAgentDraft,
      pendingReview: false,
      approvedAt: Date.now(),
      approvedLines,
      learningDelta,
    },
  };
}