// Silent auto customer reconcile — runs once after jobs load (deferred).
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
const RUN_KEY = "lepro_auto_customer_reconcile_ran";

export default function CustomerAutoReconcile() {
  const { jobs, loading, patchAndSave, showToast } = useStore();
  const ran = useRef(false);

  useEffect(() => {
    if (loading || ran.current) return;
    if (!jobs || !jobs.length) return;
    // At most once per calendar day — saves thrashing thousands of jobs on every open.
    try {
      const day = autoReconcileDayKey();
      if (localStorage.getItem(RUN_KEY) === day) {
        ran.current = true;
        return;
      }
    } catch {
      /* storage unavailable — still run once this mount */
    }
    ran.current = true;
    let cancelled = false;
    let idleId = 0;
    let t = 0;

    const start = () => {
      if (cancelled) return;
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
        if (cancelled) return;

        try {
          const day = autoReconcileDayKey();
          localStorage.setItem(RUN_KEY, day);
          if (!result.total) return;
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
    };

    // After first paint — never block the jobs list on this scan.
    if (typeof requestIdleCallback === "function") {
      idleId = requestIdleCallback(start, { timeout: 2500 });
    } else {
      t = setTimeout(start, 200);
    }

    return () => {
      cancelled = true;
      if (idleId && typeof cancelIdleCallback === "function") cancelIdleCallback(idleId);
      if (t) clearTimeout(t);
    };
  }, [jobs, loading, patchAndSave, showToast]);

  return null;
}
