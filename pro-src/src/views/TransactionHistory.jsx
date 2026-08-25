// Company-wide transaction history (all customers / jobs).
// Levi 2026-08-04: left-nav History — not buried under one customer.
import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStoreData } from "../state/store.jsx";
import CustomerTransactionHistory from "../components/CustomerTransactionHistory.jsx";
import SolaProcessorHistory from "../components/SolaProcessorHistory.jsx";
import { PaymentHistorySheet } from "../components/JobSheets.jsx";

export default function TransactionHistory() {
  const { jobs } = useStoreData();
  const nav = useNavigate();
  const [paySheet, setPaySheet] = useState(null);

  const allJobs = useMemo(() => (Array.isArray(jobs) ? jobs : []), [jobs]);

  const openTxnRow = useCallback(
    (row) => {
      if (!row) return;
      if (row.kind === "payment" && row.jobId) {
        setPaySheet({
          jobId: row.jobId,
          payId: row.payment?.id || "",
        });
        return;
      }
      if (row.jobId) {
        const inv = row.docNo ? "&hlInv=" + encodeURIComponent(String(row.docNo)) : "";
        nav("/job/" + row.jobId + "?fold=1&focus=job" + inv);
      }
    },
    [nav]
  );

  const payJob = useMemo(() => {
    if (!paySheet?.jobId) return null;
    return allJobs.find((j) => String(j.id) === String(paySheet.jobId)) || null;
  }, [allJobs, paySheet]);

  return (
    <div className="space-y-3" data-testid="company-txn-history-page">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">What just happened</h1>
        <p className="text-sm text-slate-500 font-semibold mt-0.5 leading-snug">
          All company activity — newest first. Colored # opens the job. Row opens the payment or invoice.
        </p>
      </div>
      <SolaProcessorHistory jobs={allJobs} />
      <CustomerTransactionHistory
        jobs={allJobs}
        fromCust=""
        onOpenRow={openTxnRow}
        defaultFilter="all"
        hideLegacyWebDefault
      />
      {paySheet && payJob ? (
        <PaymentHistorySheet
          job={payJob}
          initialEditId={paySheet.payId || null}
          onClose={() => setPaySheet(null)}
        />
      ) : null}
    </div>
  );
}
