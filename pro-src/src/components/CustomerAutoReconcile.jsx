// Silent auto customer reconcile — runs once after jobs load.
// Strong 3-of-4 matches combine without a popup; orange customers link to unique QBO hits.
import React, { useEffect, useRef } from "react";
import { useStore } from "../state/store.jsx";
import api from "../data/adapter.js";
import { persistDismissed } from "../lib/customers.js";
import {
  autoReconcileDayKey,
  runCustomerAutoReconcile,
} from "../lib/customerAutoMatch.js";

const TOAST_KEY = "lepro_auto_customer_reconcile_toast";

export default function CustomerAutoReconcile() {
  const { jobs, loading, patchAndSave, showToast } = useStore();
  const ran = useRef(false);

  useEffect(() => {
    if (loading || ran.current) return;
    if (!jobs || !jobs.length) return;
    ran.current = true;
    let cancelled = false;

    (async () => {
      let qboIndex = [];
      try {
        qboIndex = await api.searchCustomers("");
        if (!Array.isArray(qboIndex)) qboIndex = [];
      } catch {
        qboIndex = [];
      }
      if (cancelled) return;

      const result = await runCustomerAutoReconcile(jobs, qboIndex, {
        patchAndSave,
        persistDismiss: () => persistDismissed(api),
      });
      if (cancelled || !result.total) return;

      try {
        const day = autoReconcileDayKey();
        const last = localStorage.getItem(TOAST_KEY);
        if (last !== day) {
          localStorage.setItem(TOAST_KEY, day);
          const bits = [];
          if (result.merged) bits.push(result.merged + " same-customer pair" + (result.merged === 1 ? "" : "s") + " combined");
          if (result.linked) bits.push(result.linked + " linked to QuickBooks");
          showToast("Auto-matched customers — " + bits.join(", "));
        }
      } catch {
        /* ignore toast storage */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobs, loading, patchAndSave, showToast]);

  return null;
}
