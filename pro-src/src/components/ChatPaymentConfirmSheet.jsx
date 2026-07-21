// Confirm / edit payment fields read from a chat image before staging or sending.
import React, { useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import PaymentImageZoom from "./PaymentImageZoom.jsx";
import { fmt$, todayStr } from "../lib/format.js";
import { getDepositBanks } from "../lib/chatPayment.js";

export default function ChatPaymentConfirmSheet({ draft, job, onConfirm, onCancel }) {
  if (!draft) return null;
  const banks = getDepositBanks();
  const [kind, setKind] = useState(draft.kind || "Zelle");
  const [amt, setAmt] = useState(String(draft.amount || ""));
  const [ref, setRef] = useState(draft.ref || "");
  const [memo, setMemo] = useState(draft.memo || "");
  const [dt, setDt] = useState(draft.date || todayStr());
  const [invoiceNo, setInvoiceNo] = useState(draft.invoiceNo || job?.invoiceNo || "");
  const [deposit, setDeposit] = useState(draft.deposit || banks[0]);
  const [depositOther, setDepositOther] = useState("");
  const locked = Boolean(draft.methodLocked);
  const depositVal = deposit === "Other" ? depositOther.trim() : deposit;

  return (
    <Sheet title="Payment from image" onClose={onCancel} wide>
      <p className="text-sm text-slate-700 mb-3">
        {invoiceNo || job?.invoiceNo
          ? `Payment for invoice #${invoiceNo || job.invoiceNo}. Edit if needed, then confirm or cancel.`
          : "Payment from your photo. Edit if needed, then confirm or cancel."}
      </p>
      {draft.previewUrl ? <PaymentImageZoom src={draft.previewUrl} /> : null}
      {locked ? (
        <Fld label="Payment type">
          <p className="input bg-slate-50 text-slate-800 font-medium" data-testid="payment-kind-locked">
            {kind}
          </p>
        </Fld>
      ) : (
        <Fld label="Payment type">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Payment type">
            <option>Zelle</option>
            <option>Check</option>
          </select>
        </Fld>
      )}
      <Fld label="Invoice #">
        <input
          className="input"
          inputMode="numeric"
          value={invoiceNo}
          onChange={(e) => setInvoiceNo(e.target.value)}
          placeholder="From memo if found"
          aria-label="Invoice number"
          data-testid="chat-payment-invoice"
        />
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
      <Fld label="Deposit to">
        <select
          className="input"
          value={deposit}
          onChange={(e) => setDeposit(e.target.value)}
          aria-label="Deposit to"
          data-testid="chat-payment-deposit"
        >
          {banks.map((b) => (
            <option key={b}>{b}</option>
          ))}
          <option>Other</option>
        </select>
        {deposit === "Other" ? (
          <input
            className="input mt-2"
            value={depositOther}
            onChange={(e) => setDepositOther(e.target.value)}
            placeholder="Bank name"
            aria-label="Other bank"
          />
        ) : null}
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
            invoiceNo: String(invoiceNo || "").replace(/^#/, "").trim(),
            deposit: depositVal,
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