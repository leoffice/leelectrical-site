// Pick change order type — invoice or estimate.
import React from "react";
import Sheet, { Opt } from "./Sheet.jsx";

export default function ChangeOrderSheet({ sourceLabel, onPick, onClose }) {
  return (
    <Sheet title="Add change order" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">
        {sourceLabel
          ? "Extra work at the same address as " + sourceLabel + ". Number gets a CO suffix after the original."
          : "Extra invoice or estimate at this service address."}
      </p>
      <Opt
        icon="🧾"
        title="Change order invoice"
        note="Same address · CO number after the original invoice"
        onClick={() => onPick("invoice")}
        data-testid="co-pick-invoice"
      />
      <Opt
        icon="📝"
        title="Change order estimate"
        note="Same address · CO number after the original estimate"
        onClick={() => onPick("estimate")}
        data-testid="co-pick-estimate"
      />
    </Sheet>
  );
}