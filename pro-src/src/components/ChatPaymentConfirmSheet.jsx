// Confirm / edit payment fields read from a chat image before staging or sending.
import React, { useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import { fmt$, todayStr } from "../lib/format.js";

export default function ChatPaymentConfirmSheet({ draft, job, onConfirm, onCancel }) {
  if (!draft) return null;
  const [kind, setKind] = useState(draft.kind || "Zelle");
  const [amt, setAmt] = useState(String(draft.amount || ""));
  const [ref, setRef] = useState(draft.ref || "");
  const [memo, setMemo] = useState(draft.memo || "");
  const [dt, setDt] = useState(draft.date || todayStr());

  return (
    <Sheet title="Payment from image" onClose={onCancel} wide>
      <p className="text-sm text-slate-700 mb-3">
        {job?.invoiceNo
          ? `Looks like a payment for invoice #${job.invoiceNo}. Edit if needed, then confirm or cancel.`
          : "Looks like a payment image. Edit if needed, then confirm or cancel."}
      </p>
      {draft.previewUrl ? (
        <img
          src={draft.previewUrl}
          alt="Payment attachment"
          className="rounded-xl border border-slate-200 max-h-32 object-contain mb-3 w-full bg-slate-50"
        />
      ) : null}
      <Fld label="Payment type">
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Payment type">
          <option>Zelle</option>
          <option>Check</option>
        </select>
      </Fld>
      <Fld label="Amount">
        <input className="input" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} aria-label="Amount" />
      </Fld>
      <Fld label={kind === "Check" ? "Check number" : "Reference #"}>
        <input className="input" value={ref} onChange={(e) => setRef(e.target.value)} />
      </Fld>
      <Fld label="Memo">
        <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} />
      </Fld>
      <Fld label="Date">
        <input className="input" type="date" value={dt} onChange={(e) => setDt(e.target.value)} />
      </Fld>
      {amt ? (
        <p className="text-xs text-slate-500 mb-2">
          Total: <b>{fmt$(parseFloat(String(amt).replace(/[$,]/g, "")) || 0)}</b>
        </p>
      ) : null}
      <button
        className="btn bg-brand text-white w-full mb-2"
        onClick={() =>
          onConfirm({
            kind,
            amount: parseFloat(String(amt).replace(/[$,]/g, "")) || 0,
            ref,
            memo,
            date: dt,
            extracted: draft.extracted,
            proofName: draft.proofName,
          })
        }
        data-testid="chat-payment-confirm"
      >
        Confirm & stage payment
      </button>
      <button className="btn bg-slate-100 text-slate-800 w-full" onClick={onCancel} data-testid="chat-payment-cancel">
        Cancel
      </button>
    </Sheet>
  );
}