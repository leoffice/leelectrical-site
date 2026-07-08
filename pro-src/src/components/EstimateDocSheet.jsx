// Existing estimate — view in QBO, PDF, or convert to invoice.
import React from "react";
import Sheet, { Opt } from "./Sheet.jsx";
import { PdfViewer } from "./JobSheets.jsx";
import { fmt$ } from "../lib/format.js";

export default function EstimateDocSheet({ job, onClose, onConvert }) {
  const no = job.estimateNo || "";
  return (
    <Sheet title={"Estimate " + (no || "")} onClose={onClose}>
      <div className="text-sm space-y-1 mb-3">
        <div>
          <b className="font-semibold">Customer</b> <span className="text-slate-600">{job.customer || ""}</span>
        </div>
        <div>
          <b className="font-semibold">Amount</b> <span className="text-slate-600">{fmt$(job.amount) || "—"}</span>
        </div>
      </div>
      {no ? <PdfViewer job={job} kind="estimate" no={no} /> : null}
      <Opt
        icon="🔗"
        title="View in QuickBooks"
        onClick={() => window.open("https://qbo.intuit.com/app/estimates")}
      />
      {!job.invoiceNo ? (
        <Opt icon="🧾" title="Convert to invoice" note="Bill all or part of this estimate" onClick={onConvert} />
      ) : null}
    </Sheet>
  );
}