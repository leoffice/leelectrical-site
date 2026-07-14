// Shared estimate/invoice/calendar sheets for JobDetail and CustomerView.
import React from "react";
import DocBuilderSheet from "./DocBuilderSheet.jsx";
import InvoiceCreateSheet, { ProgressPctSheet } from "./InvoiceCreateSheet.jsx";
import EstimateDocSheet from "./EstimateDocSheet.jsx";
import InvoiceDocSheet from "./InvoiceDocSheet.jsx";
import InvoiceReviewSheet from "./InvoiceReviewSheet.jsx";
import { hasEstimateOnJob, hasInvoiceOnJob } from "../lib/docDraft.js";
import { hasPendingInvoiceReview } from "../lib/invoiceAgentDraft.js";
import { CalSheet, DocSheet } from "./JobSheets.jsx";

export default function JobDocSheets({ sheet, setSheet, job, onDocDone }) {
  if (!sheet || !job) return null;

  if (sheet.kind === "cal") return <CalSheet job={job} onClose={() => setSheet(null)} />;

  if (sheet.kind === "doc") {
    return (
      <DocSheet
        job={job}
        kind={sheet.doc}
        onClose={() => setSheet(null)}
        onEdit={() => setSheet({ kind: "docBuild", docKind: sheet.doc, mode: "edit" })}
      />
    );
  }

  if (sheet.kind === "estimateDoc") {
    const estMode = job.estimateNo ? "edit" : "create";
    return (
      <EstimateDocSheet
        job={job}
        onClose={() => setSheet(null)}
        onEdit={() => setSheet({ kind: "docBuild", docKind: "estimate", mode: estMode })}
        onSync={() => setSheet({ kind: "docBuild", docKind: "estimate", mode: estMode })}
        onConvert={() =>
          setSheet({
            kind: "progressPct",
            title: "Convert estimate to invoice",
            hint: "What percentage of the estimate should this invoice bill?",
            next: { kind: "docBuild", docKind: "invoice", mode: "turn_from_estimate" },
          })
        }
      />
    );
  }

  if (sheet.kind === "invoiceDoc") {
    const invMode = job.invoiceNo ? "edit" : "create";
    return (
      <InvoiceDocSheet
        job={job}
        onClose={() => setSheet(null)}
        onEdit={() => setSheet({ kind: "docBuild", docKind: "invoice", mode: invMode })}
        onSync={() => setSheet({ kind: "docBuild", docKind: "invoice", mode: invMode })}
      />
    );
  }

  if (sheet.kind === "invoiceCreate") {
    return (
      <InvoiceCreateSheet
        job={job}
        onClose={() => setSheet(null)}
        onPick={({ mode }) => {
          if (mode === "from_estimate") {
            setSheet({
              kind: "progressPct",
              title: "Invoice from estimate",
              hint: "What percentage of the estimate should this invoice bill?",
              next: { kind: "docBuild", docKind: "invoice", mode: "from_estimate" },
            });
          } else {
            setSheet({ kind: "docBuild", docKind: "invoice", mode: "new" });
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
        onConfirm={(pct) => setSheet({ ...sheet.next, progressPct: pct })}
      />
    );
  }

  if (sheet.kind === "docBuild") {
    return (
      <DocBuilderSheet
        job={job}
        kind={sheet.docKind}
        mode={sheet.mode || "create"}
        progressPct={sheet.progressPct}
        onClose={() => setSheet(null)}
        onDone={onDocDone}
      />
    );
  }

  if (sheet.kind === "invoiceReview") {
    return <InvoiceReviewSheet job={job} onClose={() => setSheet(null)} />;
  }

  return null;
}

export function openDocTab(job, kind, setSheet) {
  if (kind === "estimate") {
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