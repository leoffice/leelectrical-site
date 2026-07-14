// Toast when send_invoice / send_estimate commands finish or fail.
import { useEffect, useRef } from "react";
import { useStore } from "../state/store.jsx";

const SEEN_KEY = "le-pro-send-seen";

function loadSeen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function persistSeen(seen) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
  } catch {}
}

function label(c) {
  const no = c.payload?.invoiceNo || c.payload?.estimateNo || "";
  const kind = c.type === "send_estimate" ? "Estimate" : "Invoice";
  return no ? kind + " #" + no : kind;
}

export default function SendInvoiceWatcher() {
  const { commands, showToast, refreshCommands, patchAndSave, logSend } = useStore();
  const seen = useRef(loadSeen());

  useEffect(() => {
    const iv = setInterval(() => refreshCommands(), 3000);
    return () => clearInterval(iv);
  }, [refreshCommands]);

  useEffect(() => {
    for (const c of commands || []) {
      if (!c?.id) continue;
      if (c.type !== "send_invoice" && c.type !== "send_estimate") continue;
      if (c.status !== "done" && c.status !== "failed") continue;
      if (seen.current.has(c.id)) continue;
      seen.current.add(c.id);
      persistSeen(seen.current);
      if (c.status === "done") {
        const pay = c.payload?.includePaymentLink ? " with payment link" : "";
        const via = c.payload?.docSource === "qbo" ? " via QuickBooks" : "";
        showToast(label(c) + " emailed to customer" + pay + via);
        if (c.jobId) {
          const no = c.payload?.invoiceNo || c.payload?.estimateNo || "";
          const kind = c.type === "send_estimate" ? "Estimate" : "Invoice";
          logSend(c.jobId, (no ? kind + " #" + no : kind) + " emailed", c.payload?.email);
          patchAndSave(c.jobId, { _docEmailed: true }).catch(() => {});
        }
      } else {
        const err = String(c.error || "");
        if (err.includes("PaymentSITE")) {
          showToast(label(c) + " did not send — payment page setup issue. Try Send invoice only.");
        } else if (err.includes("5010") || err.toLowerCase().includes("stale")) {
          showToast(label(c) + " did not send — QuickBooks was busy. Tap Retry in Activity.");
        } else {
          showToast(label(c) + " did not send — check Activity and tap Retry");
        }
      }
    }
  }, [commands, showToast, patchAndSave]);

  return null;
}