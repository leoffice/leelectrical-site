// Adaptive payment reconciliation modal for Zelle screenshot mismatches.
import React from "react";
import Sheet from "./Sheet.jsx";
import { fmt$ } from "../lib/format.js";

function FieldRow({ label, extracted, entered, mismatch }) {
  return (
    <div className={`grid grid-cols-2 gap-2 text-[12px] py-1.5 border-b border-slate-100 ${mismatch ? "bg-amber-50/80 -mx-2 px-2 rounded-lg" : ""}`}>
      <div>
        <span className="text-[10px] font-bold uppercase text-slate-400 block">{label}</span>
        <span className={`font-semibold ${mismatch ? "text-amber-900" : "text-slate-700"}`}>
          {extracted || "—"}
        </span>
        <span className="text-[10px] text-slate-400 block">Screenshot</span>
      </div>
      <div>
        <span className="text-[10px] font-bold uppercase text-slate-400 block">&nbsp;</span>
        <span className={`font-semibold ${mismatch ? "text-amber-900" : "text-slate-700"}`}>
          {entered || "—"}
        </span>
        <span className="text-[10px] text-slate-400 block">You entered</span>
      </div>
    </div>
  );
}

export default function ZelleReconcileSheet({ reconcile, onAction, onClose }) {
  if (!reconcile) return null;
  const { kind, extracted, entered, fields, targetJob } = reconcile;
  const title = kind === "unreadable" ? "Screenshot unreadable" : "Payment reconciliation";

  const headline = () => {
    if (kind === "amount_mismatch") {
      return `Amount mismatch — screenshot ${fmt$(fields.amount.extracted)} vs entered ${fmt$(fields.amount.entered)}`;
    }
    if (kind === "invoice_mismatch") {
      return `Invoice mismatch — memo #${fields.invoice.extracted} vs applied #${fields.invoice.entered}`;
    }
    if (kind === "address_mismatch") {
      const who = targetJob?.customer || "another customer";
      return `Memo address matches ${who}${targetJob?.invoiceNo ? " (#" + targetJob.invoiceNo + ")" : ""}`;
    }
    return "Could not read confirmation number from screenshot";
  };

  const btn = (label, action, primary) => (
    <button
      key={label}
      className={`btn w-full mb-2 ${primary ? "bg-brand text-white" : "bg-slate-100 text-slate-800"}`}
      onClick={() => onAction(action)}
      data-testid={`zelle-action-${action}`}
    >
      {label}
    </button>
  );

  let actions = [];
  if (kind === "amount_mismatch") {
    actions = [
      btn(`Use screenshot ${fmt$(fields.amount.extracted)}`, "use_screenshot_amount", true),
      btn(`Keep ${fmt$(fields.amount.entered)}`, "keep_amount", false),
      btn("Replace photo (wrong screenshot)", "replace_photo", false),
      btn("Cancel", "cancel", false),
    ];
  } else if (kind === "invoice_mismatch") {
    const dest = fields.invoice.extracted;
    actions = [
      btn(`Move payment to #${dest}`, "move_invoice", true),
      btn(`Keep on #${fields.invoice.entered}`, "keep_invoice", false),
      btn("Replace photo (wrong screenshot)", "replace_photo", false),
      btn("Cancel", "cancel", false),
    ];
  } else if (kind === "address_mismatch") {
    const label = targetJob?.invoiceNo
      ? `Move to ${targetJob.customer} (#${targetJob.invoiceNo})`
      : `Move to ${targetJob?.customer || "matched job"}`;
    actions = [
      btn(label, "move_address", true),
      btn("Keep on current invoice", "keep_here", false),
      btn("Replace photo (wrong screenshot)", "replace_photo", false),
      btn("Cancel", "cancel", false),
    ];
  } else {
    actions = [
      btn("Re-attach photo", "replace_photo", true),
      btn("Enter manually", "manual", false),
      btn("Cancel", "cancel", false),
    ];
  }

  return (
    <Sheet title={title} onClose={onClose} wide>
      <p className="text-sm text-slate-700 mb-3 font-medium">{headline()}</p>
      {kind !== "unreadable" ? (
        <div className="rounded-xl border border-slate-200 px-3 py-2 mb-4">
          <FieldRow
            label="Amount"
            extracted={fields.amount.extracted > 0 ? fmt$(fields.amount.extracted) : ""}
            entered={fields.amount.entered > 0 ? fmt$(fields.amount.entered) : ""}
            mismatch={kind === "amount_mismatch"}
          />
          <FieldRow
            label="Confirmation #"
            extracted={fields.confirmation.extracted}
            entered={fields.confirmation.entered}
            mismatch={false}
          />
          <FieldRow
            label="Invoice #"
            extracted={fields.invoice.extracted ? "#" + fields.invoice.extracted : ""}
            entered={fields.invoice.entered ? "#" + fields.invoice.entered : ""}
            mismatch={kind === "invoice_mismatch"}
          />
          {fields.memo.extracted ? (
            <FieldRow label="Memo" extracted={fields.memo.extracted} entered="" mismatch={false} />
          ) : null}
          {fields.address.extracted ? (
            <FieldRow
              label="Address in memo"
              extracted={fields.address.extracted}
              entered={fields.address.entered}
              mismatch={kind === "address_mismatch"}
            />
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-slate-500 mb-4">
          {extracted?.memo
            ? `Partial read: memo "${extracted.memo}"`
            : "Try a clearer screenshot of the Zelle confirmation email or bank app."}
        </p>
      )}
      <div className="mt-2">{actions}</div>
    </Sheet>
  );
}