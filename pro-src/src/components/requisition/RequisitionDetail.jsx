import React, { useState } from "react";
import Sheet, { Fld } from "../Sheet.jsx";
import { fmtUsd } from "../../lib/requisitionData.js";
import {
  buildRequisitionEmail,
  mailtoRequisitionUrl,
  paymentNeedsInfo,
  requisitionBalance,
} from "../../lib/requisitionHelpers.js";
import { downloadRequisitionPdf } from "../../lib/requisitionPdf.js";

function G702View({ req }) {
  return (
    <div className="space-y-2 text-sm" data-testid="g702-view">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-slate-500">Total completed</span>
        <span className="text-right font-semibold">{fmtUsd(req.totalCompleted)}</span>
        <span className="text-slate-500">Retainage ({req.retainagePct || 10}%)</span>
        <span className="text-right">{fmtUsd(req.totalRetainage)}</span>
        <span className="text-slate-500">Previously paid</span>
        <span className="text-right">{fmtUsd(req.previousCertificates)}</span>
        <span className="text-slate-500 font-bold">Current payment due</span>
        <span className="text-right font-extrabold text-brand">{fmtUsd(req.currentPaymentDue)}</span>
        <span className="text-slate-500">Balance to finish</span>
        <span className="text-right">{fmtUsd(req.balanceToFinish)}</span>
      </div>
    </div>
  );
}

function G703View({ req }) {
  const rows = req.g703 || [];
  return (
    <div className="card overflow-hidden" data-testid="g703-view">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 border-b bg-slate-50">
            <th className="text-left px-2 py-2">#</th>
            <th className="text-left px-2 py-2">Description</th>
            <th className="text-right px-2 py-2">Scheduled</th>
            <th className="text-right px-2 py-2">Prev</th>
            <th className="text-right px-2 py-2">This</th>
            <th className="text-right px-2 py-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.itemNo} className="border-b border-slate-100">
              <td className="px-2 py-1.5">{r.itemNo}</td>
              <td className="px-2 py-1.5">{r.description}</td>
              <td className="text-right px-2 py-1.5 tabular-nums">{fmtUsd(r.scheduledValue)}</td>
              <td className="text-right px-2 py-1.5 tabular-nums">{fmtUsd(r.prevCompleted)}</td>
              <td className="text-right px-2 py-1.5 tabular-nums">{fmtUsd(r.thisPeriod)}</td>
              <td className="text-right px-2 py-1.5 tabular-nums">{fmtUsd(r.totalCompleted)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentsTab({ req, onUpdate, busy }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [checkNumber, setCheckNumber] = useState("");

  const addPayment = async () => {
    const amt = parseFloat(String(amount).replace(/[$,]/g, "")) || 0;
    if (!amt) return;
    const p = { id: `pay-${Date.now()}`, amount: amt, date: date.trim(), checkNumber: checkNumber.trim() };
    await onUpdate({ ...req, payments: [...(req.payments || []), p] });
    setAmount("");
    setDate("");
    setCheckNumber("");
  };

  return (
    <div className="space-y-3" data-testid="req-payments">
      <p className="text-xs text-slate-500">Record payments received for this requisition. Missing date or check # shows in amber.</p>
      {(req.payments || []).map((p) => {
        const incomplete = paymentNeedsInfo(p);
        return (
          <div
            key={p.id}
            className={`card px-3 py-2 text-sm flex justify-between ${incomplete ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}
          >
            <div>
              <div className="font-bold">{fmtUsd(p.amount)}</div>
              <div className="text-xs text-slate-500">
                {p.date || "Date missing"} · {p.checkNumber || "Check # missing"}
              </div>
            </div>
            <span className="text-xs font-semibold self-center">{incomplete ? "Needs info" : "Complete"}</span>
          </div>
        );
      })}
      <div className="card px-3 py-3 space-y-2">
        <Fld label="Amount" value={amount} onChange={setAmount} placeholder="108000" />
        <Fld label="Date" value={date} onChange={setDate} placeholder="MM/DD/YYYY" />
        <Fld label="Check #" value={checkNumber} onChange={setCheckNumber} placeholder="1234" />
        <button type="button" className="btn w-full" onClick={addPayment} disabled={busy}>
          Add payment
        </button>
      </div>
      <div className="text-sm font-bold text-right">
        Balance: <span className="text-brand">{fmtUsd(requisitionBalance(req))}</span>
      </div>
    </div>
  );
}

function FilesTab({ req, onUpdate, busy }) {
  const onFile = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    Promise.all(
      files.map(
        (f) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: f.name,
                url: reader.result,
                mime: f.type,
                attachToEmail: true,
                addedAt: Date.now(),
              });
            reader.readAsDataURL(f);
          })
      )
    ).then(async (atts) => {
      await onUpdate({ ...req, attachments: [...(req.attachments || []), ...atts] });
    });
  };

  const toggle = async (attId) => {
    const attachments = (req.attachments || []).map((a) =>
      a.id === attId ? { ...a, attachToEmail: !a.attachToEmail } : a
    );
    await onUpdate({ ...req, attachments });
  };

  return (
    <div className="space-y-3" data-testid="req-files">
      <input type="file" multiple accept="image/*,.pdf,.csv" onChange={onFile} className="text-sm" />
      {(req.attachments || []).map((a) => (
        <label key={a.id} className="card px-3 py-2 flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={!!a.attachToEmail} onChange={() => toggle(a.id)} />
          <span className="truncate flex-1">📎 {a.name}</span>
        </label>
      ))}
      {!req.attachments?.length ? <p className="text-xs text-slate-400">Add invoices, photos, or supporting docs.</p> : null}
    </div>
  );
}

export default function RequisitionDetail({
  project,
  requisition,
  contact,
  onUpdate,
  onDelete,
  canDelete,
  deleteBlocked,
  onClose,
  busy,
  showToast,
}) {
  const [tab, setTab] = useState("app");
  const [showEmail, setShowEmail] = useState(false);
  const req = requisition;
  if (!req) return null;

  const tabs = [
    { id: "app", label: "Application & Cert" },
    { id: "cont", label: "Continuation Sheet" },
    { id: "pay", label: "Payments" },
    { id: "files", label: "Files" },
  ];

  const submit = async () => {
    downloadRequisitionPdf(project, req);
    const email = buildRequisitionEmail({ project, requisition: req, contact });
    const url = mailtoRequisitionUrl(email);
    window.open(url, "_blank");
    await onUpdate({
      ...req,
      status: "submitted",
      submittedAt: Date.now(),
      emailSentAt: Date.now(),
    });
    showToast?.("Requisition submitted — PDF downloaded, email opened");
    setShowEmail(false);
  };

  return (
    <div className="space-y-4" data-testid="requisition-detail">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="text-sm font-semibold text-brand" onClick={onClose}>
          ← Back
        </button>
        <h2 className="text-base font-extrabold">{req.applicationNumber}</h2>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1" data-testid="req-detail-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              tab === t.id ? "bg-brand text-white border-brand" : "bg-white text-slate-600 border-slate-200"
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "app" ? <G702View req={req} /> : null}
      {tab === "cont" ? <G703View req={req} /> : null}
      {tab === "pay" ? <PaymentsTab req={req} onUpdate={onUpdate} busy={busy} /> : null}
      {tab === "files" ? <FilesTab req={req} onUpdate={onUpdate} busy={busy} /> : null}

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          className="btn flex-1"
          onClick={() => downloadRequisitionPdf(project, req)}
          data-testid="download-req-pdf"
        >
          Download PDF
        </button>
        <button type="button" className="btn flex-1 bg-brand text-white" onClick={() => setShowEmail(true)} data-testid="submit-requisition">
          Submit requisition
        </button>
        {onDelete ? (
          <button
            type="button"
            className="btn w-full text-red-700 border-red-200"
            onClick={onDelete}
            disabled={busy}
            data-testid="delete-requisition"
          >
            {canDelete ? "Delete requisition" : deleteBlocked ? "Void requisition" : "Remove requisition"}
          </button>
        ) : null}
      </div>

      {showEmail ? (
        <Sheet title="Submit requisition" onClose={() => setShowEmail(false)} testId="submit-req-sheet">
          <p className="text-sm text-slate-500 mb-3">
            Downloads the G702/G703 PDF and opens your email with a summary. Attach the PDF plus any checked files from the Files tab.
          </p>
          <pre className="text-xs bg-slate-50 p-3 rounded max-h-40 overflow-auto whitespace-pre-wrap">
            {buildRequisitionEmail({ project, requisition: req, contact }).body}
          </pre>
          <button type="button" className="btn w-full mt-3 bg-brand text-white" onClick={submit} disabled={busy}>
            Send email & mark submitted
          </button>
        </Sheet>
      ) : null}
    </div>
  );
}