import React, { useMemo, useRef, useState } from "react";
import Sheet, { Fld } from "../Sheet.jsx";
import { fmtUsd } from "../../lib/requisitionData.js";
import {
  buildRequisitionEmail,
  mailtoRequisitionUrl,
  paymentNeedsInfo,
  requisitionBalance,
} from "../../lib/requisitionHelpers.js";
import { downloadRequisitionPdf } from "../../lib/requisitionPdf.js";
import { downloadRequisitionExcel } from "../../lib/requisitionExcel.js";
import { buildInvoicePdfFromJob } from "../../lib/invoicePdf.js";
import { openPdfBlob } from "../../lib/pdfOpen.js";
import { clientKey } from "../../lib/customers.js";

function G702View({ req }) {
  return (
    <div className="space-y-2 text-sm" data-testid="g702-view">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-slate-500">Total completed &amp; stored to date</span>
        <span className="text-right font-semibold">{fmtUsd(req.totalCompleted)}</span>
        <span className="text-slate-500">Retainage ({req.retainagePct || 10}%)</span>
        <span className="text-right">{fmtUsd(req.totalRetainage)}</span>
        <span className="text-slate-500 font-semibold">Total earned, less retainage</span>
        <span className="text-right font-bold">{fmtUsd(req.earnedLessRetainage)}</span>
        <span className="text-slate-500">Less previous certified for payment</span>
        <span className="text-right">{fmtUsd(req.previousCertificates)}</span>
        <span className="text-slate-500 font-bold">Current payment due</span>
        <span className="text-right font-extrabold text-brand">{fmtUsd(req.currentPaymentDue)}</span>
      </div>
    </div>
  );
}

function parseG703Section(description) {
  const d = String(description || "");
  const dash = d.indexOf(" - ");
  if (dash > 0) return { section: d.slice(0, dash).trim(), item: d.slice(dash + 3).trim() };
  return { section: "General", item: d };
}

function G703View({ req }) {
  const rows = req.g703 || [];
  const [openSections, setOpenSections] = useState(() => new Set());

  const sections = useMemo(() => {
    const groups = [];
    const map = new Map();
    for (const r of rows) {
      if (/change orders/i.test(r.description || "")) continue;
      const { section, item } = parseG703Section(r.description);
      if (!map.has(section)) {
        const g = { name: section, items: [] };
        map.set(section, g);
        groups.push(g);
      }
      map.get(section).items.push({ ...r, itemLabel: item });
    }
    return groups;
  }, [rows]);

  const toggleSection = (name) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  if (!sections.length) {
    return <p className="text-sm text-slate-400 text-center py-6" data-testid="g703-view">No continuation lines yet.</p>;
  }

  return (
    <div className="space-y-2" data-testid="g703-view">
      <p className="text-xs text-slate-500">From previous application only — % G/C carries forward from the last submitted requisition.</p>
      {sections.map((sec) => {
        const open = openSections.has(sec.name);
        return (
          <div key={sec.name} className="card overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 font-bold text-sm border-b"
              onClick={() => toggleSection(sec.name)}
              data-testid={`g703-floor-${sec.name}`}
            >
              <span>{sec.name}</span>
              <span className="text-brand text-xs font-semibold">{open ? "Hide ▴" : "Show ▾"}</span>
            </button>
            {open ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b">
                    <th className="text-left px-2 py-2">Item</th>
                    <th className="text-right px-2 py-2">From prev</th>
                    <th className="text-right px-2 py-2">Stored to date</th>
                    <th className="text-right px-2 py-2">% G/C</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.items.map((r) => (
                    <tr key={r.itemNo} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-1.5">{r.itemLabel}</td>
                      <td className="text-right px-2 py-1.5 tabular-nums">{fmtUsd(r.prevCompleted)}</td>
                      <td className="text-right px-2 py-1.5 tabular-nums">{fmtUsd(r.totalCompleted)}</td>
                      <td className="text-right px-2 py-1.5 tabular-nums font-semibold">{Math.round(Number(r.pctComplete) || 0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        );
      })}
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

function SubmitReviewSheet({ project, req, contact, jobs = [], onClose, onUpdate, busy, showToast }) {
  const baseEmail = useMemo(() => buildRequisitionEmail({ project, requisition: req, contact }), [project, req, contact]);
  const [includePdf, setIncludePdf] = useState(true);
  const [emailTo, setEmailTo] = useState(() => baseEmail.to);
  const [emailSubject, setEmailSubject] = useState(() => baseEmail.subject);
  const [draftOpened, setDraftOpened] = useState(false);
  // Change orders: separate files (NOT rolled into the requisition), pulled from
  // the customer's change-order jobs (synced from QuickBooks). Levi multi-selects.
  const [addChangeOrders, setAddChangeOrders] = useState(false);
  const [selectedCoIds, setSelectedCoIds] = useState(() => new Set());
  const changeOrderJobs = useMemo(() => {
    const pk = project?.customerKey || "";
    return (jobs || []).filter(
      (j) => j.changeOrder && ((pk && clientKey(j) === pk) || (j.changeOrderSourceId && project?.jobId === j.changeOrderSourceId))
    );
  }, [jobs, project?.customerKey, project?.jobId]);
  const toggleCo = (id) =>
    setSelectedCoIds((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectedAttachments = useMemo(
    () => (req.attachments || []).filter((a) => a.attachToEmail),
    [req.attachments]
  );

  const coFileName = (co) =>
    `${(co.changeOrderLabel || "change-order").replace(/\s+/g, "-")}-${co.invoiceNo || co.id}.pdf`;

  const attachList = useMemo(() => {
    const list = [];
    if (includePdf) {
      list.push({ id: "g702-pdf", name: `${req.applicationNumber || "requisition"}.pdf` });
    }
    for (const a of selectedAttachments) list.push(a);
    if (addChangeOrders) {
      for (const co of changeOrderJobs) {
        if (selectedCoIds.has(co.id)) list.push({ id: "co-" + co.id, name: coFileName(co), isChangeOrder: true });
      }
    }
    return list;
  }, [includePdf, req.applicationNumber, selectedAttachments, addChangeOrders, changeOrderJobs, selectedCoIds]);

  const email = useMemo(
    () =>
      buildRequisitionEmail({
        project,
        requisition: req,
        contact,
        to: emailTo,
        subject: emailSubject,
        attachments: attachList.filter((a) => a.id !== "g702-pdf"),
      }),
    [project, req, contact, emailTo, emailSubject, attachList]
  );

  // Attach files straight from the device (Android/iOS file finder). Reads each
  // as a data URL and appends to req.attachments flagged for the email.
  const addDeviceFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const atts = await Promise.all(
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
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(f);
          })
      )
    );
    const added = atts.filter(Boolean);
    if (!added.length) return;
    await onUpdate({ ...req, attachments: [...(req.attachments || []), ...added] });
    showToast?.(`${added.length} file${added.length > 1 ? "s" : ""} attached`);
  };

  const openDraft = () => {
    if (includePdf) downloadRequisitionPdf(project, req);
    // Change orders ride along as SEPARATE invoice files (never rolled into the
    // requisition math) — generate each selected one client-side to attach.
    if (addChangeOrders) {
      for (const co of changeOrderJobs) {
        if (!selectedCoIds.has(co.id)) continue;
        try {
          openPdfBlob(buildInvoicePdfFromJob(co));
        } catch {
          /* skip a CO that can't render */
        }
      }
    }
    const url = mailtoRequisitionUrl(email);
    window.open(url, "_blank");
    setDraftOpened(true);
    showToast?.("Email draft opened — nothing sends until you press Send in your mail app");
  };

  const markSubmitted = async () => {
    if (!window.confirm("Mark this requisition submitted? Only do this after you've reviewed the numbers and sent the email.")) return;
    await onUpdate({
      ...req,
      status: "submitted",
      submittedAt: Date.now(),
      emailSentAt: Date.now(),
      emailTo: email.to,
      emailSubject: email.subject,
    });
    showToast?.("Requisition marked submitted");
    onClose();
  };

  return (
    <Sheet title="Review before sending" onClose={onClose} tall>
      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3" data-testid="submit-safety-note">
        Nothing goes to the customer until you press Send in your email app. Review everything here first.
      </p>

      <Fld label="Recipients (comma-separated)">
        <input
          className="w-full border rounded px-3 py-2 text-sm"
          value={emailTo}
          onChange={(e) => setEmailTo(e.target.value)}
          placeholder="gc@example.com, pm@example.com"
          data-testid="submit-email-to"
        />
      </Fld>
      <Fld label="Subject">
        <input
          className="w-full border rounded px-3 py-2 text-sm"
          value={emailSubject}
          onChange={(e) => setEmailSubject(e.target.value)}
          data-testid="submit-email-subject"
        />
      </Fld>

      <div className="mt-3 space-y-2" data-testid="submit-attachments">
        <div className="text-xs font-bold text-slate-600 uppercase tracking-wide">Attach to email</div>
        <label className="card px-3 py-2 flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={includePdf} onChange={() => setIncludePdf((v) => !v)} />
          <span className="flex-1">G702 / G703 PDF — {req.applicationNumber || "requisition"}.pdf</span>
        </label>
        {selectedAttachments.map((a) => (
          <div key={a.id} className="card px-3 py-2 text-sm text-slate-600">
            📎 {a.name} <span className="text-xs text-slate-400">(attached)</span>
          </div>
        ))}
        <label className="btn w-full cursor-pointer" data-testid="submit-attach-device-label">
          📎 Attach files from device…
          <input
            type="file"
            multiple
            accept="image/*,.pdf,.csv,.xls,.xlsx"
            className="hidden"
            onChange={(e) => addDeviceFiles(e.target.files)}
            data-testid="submit-attach-device"
          />
        </label>

        <div className="rounded border border-slate-200 p-2" data-testid="submit-change-orders">
          <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={addChangeOrders}
              onChange={() => setAddChangeOrders((v) => !v)}
              data-testid="submit-add-cos-toggle"
            />
            Add change orders (separate files — not rolled into this requisition)
          </label>
          {addChangeOrders ? (
            changeOrderJobs.length ? (
              <div className="mt-2 space-y-1">
                {changeOrderJobs.map((co) => (
                  <label key={co.id} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5">
                    <input
                      type="checkbox"
                      checked={selectedCoIds.has(co.id)}
                      onChange={() => toggleCo(co.id)}
                      data-testid={"submit-co-" + co.id}
                    />
                    <span className="flex-1 truncate">
                      🧾 {co.changeOrderLabel || co.title || "Change order"}
                      {co.invoiceNo ? ` — #${co.invoiceNo}` : ""}
                    </span>
                  </label>
                ))}
                <p className="text-[11px] text-slate-400 mt-1">
                  Each selected change order is generated as its own invoice PDF and attached separately.
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 mt-2">
                No change orders synced for this customer yet. Sync them from QuickBooks on the job (＋ Change order), then reopen this window.
              </p>
            )
          ) : null}
        </div>
        {!includePdf && !selectedAttachments.length ? (
          <p className="text-xs text-red-600">Pick at least the G702 PDF or a file to attach.</p>
        ) : null}
        <p className="text-xs text-slate-400">Download opens the PDF — attach it plus any extra files in your email app.</p>
      </div>

      <div className="mt-3">
        <div className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Email body</div>
        <pre className="text-xs bg-slate-50 p-3 rounded max-h-32 overflow-auto whitespace-pre-wrap" data-testid="submit-email-body">
          {email.body.replace(email.signature, "").trim()}
        </pre>
        <div className="text-xs font-bold text-slate-600 uppercase tracking-wide mt-2 mb-1">Your signature</div>
        <pre className="text-xs bg-slate-100 border border-slate-200 p-3 rounded whitespace-pre-wrap" data-testid="submit-email-signature">
          {email.signature}
        </pre>
      </div>

      <div className="flex flex-col gap-2 mt-4">
        <button
          type="button"
          className="btn w-full"
          onClick={() => downloadRequisitionPdf(project, req)}
          disabled={busy || !includePdf}
          data-testid="submit-download-pdf"
        >
          Download PDF only
        </button>
        <button
          type="button"
          className="btn w-full bg-brand text-white"
          onClick={openDraft}
          disabled={busy || (!includePdf && !selectedAttachments.length && !(addChangeOrders && selectedCoIds.size))}
          data-testid="submit-open-draft"
        >
          Open email draft
        </button>
        <button
          type="button"
          className="btn w-full border-emerald-300 text-emerald-800"
          onClick={markSubmitted}
          disabled={busy}
          data-testid="submit-mark-submitted"
        >
          {draftOpened ? "Mark submitted (after you sent it)" : "Mark submitted"}
        </button>
      </div>
    </Sheet>
  );
}

export default function RequisitionDetail({
  project,
  requisition,
  contact,
  jobs = [],
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

  const tabs = [
    { id: "app", label: "Application & Cert" },
    { id: "cont", label: "Continuation Sheet" },
    { id: "pay", label: "Payments" },
    { id: "files", label: "Files" },
  ];
  // Swipe left/right to move between tabs (no PDF download needed).
  const touchX = useRef(0);
  const idx = tabs.findIndex((t) => t.id === tab);
  const onTouchStart = (e) => (touchX.current = e.touches[0]?.clientX ?? 0);
  const onTouchEnd = (e) => {
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
    if (Math.abs(dx) < 50) return;
    const next = dx < 0 ? Math.min(tabs.length - 1, idx + 1) : Math.max(0, idx - 1);
    setTab(tabs[next].id);
  };

  if (!req) return null;

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

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} data-testid="req-tab-content">
        {tab === "app" ? <G702View req={req} /> : null}
        {tab === "cont" ? <G703View req={req} /> : null}
        {tab === "pay" ? <PaymentsTab req={req} onUpdate={onUpdate} busy={busy} /> : null}
        {tab === "files" ? <FilesTab req={req} onUpdate={onUpdate} busy={busy} /> : null}
        <p className="text-[11px] text-slate-400 text-center mt-2">← swipe to switch views →</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          className="btn flex-1"
          onClick={() => downloadRequisitionPdf(project, req)}
          data-testid="download-req-pdf"
        >
          Download PDF
        </button>
        <button
          type="button"
          className="btn flex-1"
          onClick={() => downloadRequisitionExcel(project, req)}
          data-testid="download-req-excel"
        >
          Download Excel
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
        <SubmitReviewSheet
          project={project}
          req={req}
          contact={contact}
          jobs={jobs}
          onClose={() => setShowEmail(false)}
          onUpdate={onUpdate}
          busy={busy}
          showToast={showToast}
        />
      ) : null}
    </div>
  );
}