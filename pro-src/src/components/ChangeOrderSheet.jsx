// Pick change order type — invoice or estimate.
import React from "react";
import Sheet, { Opt } from "./Sheet.jsx";

export default function ChangeOrderSheet({ sourceLabel, onPick, onClose }) {
  return (
    <Sheet title="Add change order" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">
        {sourceLabel
          ? "Extra work at the same address as " + sourceLabel + ". Invoice number = original # + -CO- + next number (e.g. 251100-CO-1)."
          : "Extra invoice or estimate at this service address. Number is original invoice + -CO- + sequence."}
      </p>
      <Opt
        icon="🧾"
        title="Change order invoice"
        note="Same address · number like 251100-CO-1"
        onClick={() => onPick("invoice")}
        data-testid="co-pick-invoice"
      />
      <Opt
        icon="📝"
        title="Change order estimate"
        note="Same address · number like 25400-CO-1"
        onClick={() => onPick("estimate")}
        data-testid="co-pick-estimate"
      />
    </Sheet>
  );
}