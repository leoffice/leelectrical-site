// Pick change order type — invoice or estimate — with explicit confirm (avoids misclicks).
import React, { useState } from "react";
import Sheet, { Opt } from "./Sheet.jsx";

export default function ChangeOrderSheet({ sourceLabel, onPick, onClose }) {
  const [confirmKind, setConfirmKind] = useState(null); // 'invoice' | 'estimate'

  if (confirmKind) {
    const isEst = confirmKind === "estimate";
    return (
      <Sheet title="Confirm change order" onClose={() => setConfirmKind(null)}>
        <p className="text-sm text-slate-600 mb-3" data-testid="co-confirm-note">
          This creates a real change order
          {sourceLabel ? " on " + sourceLabel : ""}
          {isEst ? " (estimate)" : " (invoice)"}
          . Only continue if you meant to.
        </p>
        <button
          type="button"
          className="btn-brand w-full mb-2"
          data-testid="co-confirm-create"
          onClick={() => onPick(confirmKind)}
        >
          ✓ Create change order {isEst ? "estimate" : "invoice"}
        </button>
        <button
          type="button"
          className="btn-ghost w-full"
          data-testid="co-confirm-cancel"
          onClick={() => setConfirmKind(null)}
        >
          Cancel
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet title="Add change order" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">
        {sourceLabel
          ? "Extra work at the same address as " + sourceLabel + ". Invoice number = original # + -CO- + next number (e.g. 251100-CO-01)."
          : "Extra invoice or estimate at this service address. Number is original invoice + -CO- + sequence."}
      </p>
      <Opt
        icon="🧾"
        title="Change order invoice"
        note="Same address · number like 251100-CO-01"
        onClick={() => setConfirmKind("invoice")}
        data-testid="co-pick-invoice"
      />
      <Opt
        icon="📝"
        title="Change order estimate"
        note="Same address · number like 25400-CO-01"
        onClick={() => setConfirmKind("estimate")}
        data-testid="co-pick-estimate"
      />
    </Sheet>
  );
}
