// Silently remove 100% duplicate invoices (same #, date, amount) — no prompt.
import { useEffect, useRef } from "react";
import { useStoreData } from "../state/store.jsx";
import { dismissInvoicePair, planExactInvoiceAutoDedup } from "../lib/invoiceDedup.js";

export default function InvoiceDedupAutoResolver() {
  const { jobs, loading, patchAndSave } = useStoreData();
  const resolved = useRef(new Set());

  useEffect(() => {
    if (loading) return;
    const actions = planExactInvoiceAutoDedup(jobs);
    for (const act of actions) {
      const key = act.invoiceNo + "|" + act.dropId;
      if (resolved.current.has(key)) continue;
      resolved.current.add(key);
      dismissInvoicePair(act.invoiceNo, act.keepId, act.dropId);
      patchAndSave(act.dropId, { _deleted: true }).catch(() => {});
    }
  }, [jobs, loading, patchAndSave]);

  return null;
}