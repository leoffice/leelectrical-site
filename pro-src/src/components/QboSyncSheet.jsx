// QuickBooks sync menu — pick what to pull (customer, invoices, estimates, payments, history).
import React, { useState } from "react";
import { useStore } from "../state/store.jsx";
import Sheet, { Opt } from "./Sheet.jsx";
import { runQboSync } from "../lib/qboSyncActions.js";

const KINDS = [
  { id: "customer", icon: "👤", title: "Customer info", note: "Name, phone, email, billing address" },
  { id: "invoices", icon: "🧾", title: "Invoices", note: "Pull invoice jobs from QuickBooks", sub: true },
  { id: "estimates", icon: "📝", title: "Estimates", note: "Refresh estimate jobs on file", sub: true },
  { id: "payments", icon: "💳", title: "Payments", note: "Pull payment history per invoice", sub: true },
  { id: "history", icon: "📚", title: "Full history", note: "Customer + all invoices + all payments" },
];

export default function QboSyncSheet({ job, customerJobs, onClose }) {
  const { enqueue, showToast, refreshJobs, api } = useStore();
  const [pick, setPick] = useState(null); // kind awaiting all/open

  const run = async (kind, scope) => {
    onClose();
    await runQboSync({
      kind,
      scope,
      job,
      customerJobs,
      enqueue,
      showToast,
      refreshJobs,
      api,
    });
  };

  if (pick) {
    const meta = KINDS.find((k) => k.id === pick);
    return (
      <Sheet title={(meta?.title || pick) + " — scope"} onClose={() => setPick(null)}>
        <Opt icon="📂" title="All" note="Everything on file for this customer" onClick={() => run(pick, "all")} />
        <Opt icon="📌" title="Open only" note="Unpaid invoices or open estimates" onClick={() => run(pick, "open")} />
        <button type="button" className="btn-ghost w-full mt-1" onClick={() => setPick(null)}>
          ‹ Back
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet title="QuickBooks sync" onClose={onClose}>
      <p className="text-xs text-slate-500 mb-3">Choose what to pull from QuickBooks for this customer.</p>
      {KINDS.map((k) => (
        <Opt
          key={k.id}
          icon={k.icon}
          title={k.title}
          note={k.note}
          onClick={() => (k.sub ? setPick(k.id) : run(k.id, "all"))}
          data-testid={"qbo-sync-" + k.id}
        />
      ))}
    </Sheet>
  );
}