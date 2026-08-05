// Shared estimate/invoice/calendar sheets for JobDetail and CustomerView.
import React, { useCallback } from "react";
import DocBuilderSheet from "./DocBuilderSheet.jsx";
import InvoiceCreateSheet, { ProgressPctSheet } from "./InvoiceCreateSheet.jsx";
import EstimateDocSheet from "./EstimateDocSheet.jsx";
import InvoiceDocSheet from "./InvoiceDocSheet.jsx";
import InvoiceReviewSheet from "./InvoiceReviewSheet.jsx";
import { hasEstimateOnJob, hasInvoiceOnJob } from "../lib/docDraft.js";
import { hasPendingEstimateReview, hasPendingInvoiceReview } from "../lib/invoiceAgentDraft.js";
import { planDocSaveSync } from "../lib/docSync.js";
import { isQuickbooksDocsEnabled } from "../lib/qboEnabled.js";
import { useStore } from "../state/store.jsx";
import { CalSheet, DocSheet } from "./JobSheets.jsx";

/**
 * Push a local draft invoice/estimate to QuickBooks without reopening the create form.
 * Closes the sheet immediately; command bus finishes in the background.
 */
export function useSyncDocToQbo() {
  const { patchAndSave, enqueue, showToast, effectiveJob } = useStore();
  return useCallback(
    async (job, kind, { onDone, onClose } = {}) => {
      if (!job?.id) return;
      if (!isQuickbooksDocsEnabled()) {
        showToast("QuickBooks document send is off — turn it on in Settings, or keep using local save");
        return;
      }
      const live = (effectiveJob && effectiveJob(job.id)) || job;
      const lines = kind === "estimate" ? live.estimateLines : live.invoiceLines;
      const hasLines = (lines || []).some((ln) => String(ln?.itemName || "").trim());
      if (!hasLines) {
        showToast("Add line items before syncing to QuickBooks");
        return;
      }
      const mode =
        kind === "estimate"
          ? live.estimateNo || live._estimateConfirmed
            ? "edit"
            : "create"
          : live.invoiceNo || live._invoiceConfirmed
            ? "edit"
            : "create";
      try {
        const { jobPatch, commands } = planDocSaveSync(live, {
          kind,
          mode,
          lines: lines || [],
          serviceAddress: live.serviceAddress || live.address || "",
          apartment: live.apartment || "",
          send: false,
        });
        // Instant UI — local patch + queue, then close (no wait for QBO confirm).
        void patchAndSave(job.id, jobPatch);
        for (const cmd of commands || []) {
          void enqueue(cmd.type, job.id, cmd.payload, "judgment", cmd.idk);
        }
        showToast(
          kind === "estimate"
            ? "Syncing estimate to QuickBooks…"
            : "Syncing invoice to QuickBooks…"
        );
        onDone && onDone(live);
        onClose && onClose();
      } catch (err) {
        showToast(String(err?.message || err || "Could not sync to QuickBooks"));
      }
    },
    [patchAndSave, enqueue, showToast, effectiveJob]
  );
}

export default function JobDocSheets({ sheet, setSheet, job, onDocDone }) {
  const syncDoc = useSyncDocToQbo();
  if (!sheet || !job) return null;

  // Prefer just-saved fields (Inv # / lines) so Save never lands on a blank
  // "assigning a number…" card while the store re-render catches up (Levi 2026-08-05).
  const viewJob = sheet.optimisticJob ? { ...job, ...sheet.optimisticJob } : job;

  const returnTo = sheet.returnTo || null;
  const finishDoc = (doneJob) => {
    if (returnTo) {
      setSheet({ ...returnTo, optimisticJob: doneJob || undefined });
      onDocDone && onDocDone(doneJob, { returnTo });
      return;
    }
    // After Save: stay on this job under the customer — open the estimate/invoice
    // card immediately (no navigation, no wait). Snappy close of the builder.
    const kind = sheet.docKind || (doneJob?.invoiceNo ? "invoice" : doneJob?.estimateNo ? "estimate" : "");
    if (kind === "invoice" && (doneJob?.invoiceNo || doneJob?.invoiceLines?.length)) {
      setSheet({ kind: "invoiceDoc", optimisticJob: doneJob || null });
      onDocDone && onDocDone(doneJob);
      return;
    }
    if (kind === "estimate" && (doneJob?.estimateNo || doneJob?.estimateLines?.length)) {
      setSheet({ kind: "estimateDoc", optimisticJob: doneJob || null });
      onDocDone && onDocDone(doneJob);
      return;
    }
    setSheet(null);
    onDocDone && onDocDone(doneJob);
  };

  if (sheet.kind === "cal") return <CalSheet job={viewJob} onClose={() => setSheet(null)} />;

  if (sheet.kind === "doc") {
    return (
      <DocSheet
        job={viewJob}
        kind={sheet.doc}
        onClose={() => setSheet(null)}
        onEdit={() => setSheet({ kind: "docBuild", docKind: sheet.doc, mode: "edit" })}
      />
    );
  }

  if (sheet.kind === "estimateDoc") {
    const estMode = viewJob.estimateNo ? "edit" : "create";
    return (
      <EstimateDocSheet
        job={viewJob}
        onClose={() => setSheet(null)}
        onEdit={() => setSheet({ kind: "docBuild", docKind: "estimate", mode: estMode })}
        onSync={() =>
          syncDoc(viewJob, "estimate", {
            onClose: () => setSheet(null),
            onDone: onDocDone,
          })
        }
        onConvert={() =>
          setSheet({
            kind: "progressPct",
            title: "Convert estimate to invoice",
            hint: "What percentage of the estimate should this invoice bill?",
            next: { kind: "docBuild", docKind: "invoice", mode: "turn_from_estimate" },
            returnTo,
          })
        }
      />
    );
  }

  if (sheet.kind === "invoiceDoc") {
    const invMode = viewJob.invoiceNo ? "edit" : "create";
    return (
      <InvoiceDocSheet
        job={viewJob}
        onClose={() => setSheet(null)}
        onEdit={() => setSheet({ kind: "docBuild", docKind: "invoice", mode: invMode })}
        onSync={() =>
          syncDoc(viewJob, "invoice", {
            onClose: () => setSheet(null),
            onDone: onDocDone,
          })
        }
      />
    );
  }

  if (sheet.kind === "invoiceCreate") {
    return (
      <InvoiceCreateSheet
        job={viewJob}
        onClose={() => setSheet(null)}
        onPick={({ mode }) => {
          if (mode === "from_estimate") {
            setSheet({
              kind: "progressPct",
              title: "Invoice from estimate",
              hint: "What percentage of the estimate should this invoice bill?",
              next: { kind: "docBuild", docKind: "invoice", mode: "from_estimate" },
              returnTo,
            });
          } else {
            setSheet({ kind: "docBuild", docKind: "invoice", mode: "new", returnTo });
          }
        }}
      />
    );
  }

  if (sheet.kind === "progressPct") {
    return (
      <ProgressPctSheet
        title={sheet.title}
        hint={sheet.hint}
        onClose={() => setSheet(null)}
        onConfirm={(pct) =>
          setSheet({
            ...(sheet.next || {}),
            progressPct: pct,
            returnTo: sheet.returnTo || sheet.next?.returnTo || null,
          })
        }
      />
    );
  }

  if (sheet.kind === "docBuild") {
    return (
      <DocBuilderSheet
        job={viewJob}
        kind={sheet.docKind}
        mode={sheet.mode || "create"}
        progressPct={sheet.progressPct}
        onClose={() => {
          // Back/X: if we came from payment convert, return there instead of dumping out.
          if (returnTo) setSheet(returnTo);
          else setSheet(null);
        }}
        onDone={finishDoc}
      />
    );
  }

  if (sheet.kind === "invoiceReview" || sheet.kind === "estimateReview") {
    return (
      <InvoiceReviewSheet
        job={viewJob}
        kind={sheet.kind === "estimateReview" ? "estimate" : "invoice"}
        onClose={() => setSheet(null)}
      />
    );
  }

  return null;
}

export function openDocTab(job, kind, setSheet) {
  if (kind === "estimate") {
    if (hasPendingEstimateReview(job)) {
      setSheet({ kind: "estimateReview" });
      return;
    }
    if (hasEstimateOnJob(job)) setSheet({ kind: "estimateDoc" });
    else setSheet({ kind: "docBuild", docKind: "estimate", mode: "create" });
    return;
  }
  if (kind === "invoice") {
    if (hasPendingInvoiceReview(job)) {
      setSheet({ kind: "invoiceReview" });
      return;
    }
    if (hasInvoiceOnJob(job)) setSheet({ kind: "invoiceDoc" });
    else setSheet({ kind: "docBuild", docKind: "invoice", mode: "create" });
    return;
  }
  if (kind === "calendar") setSheet({ kind: "cal" });
}
