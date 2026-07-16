import React, { useEffect, useMemo, useState } from "react";
import Sheet, { Fld } from "../Sheet.jsx";
import { fmtUsd } from "../../lib/requisitionData.js";
import {
  buildRequisitionEmail,
  mailtoRequisitionUrl,
  paymentNeedsInfo,
  pctChangeStatus,
  requisitionBalance,
  requisitionsAscending,
  sovItemKey,
  updateRequisitionPercentages,
} from "../../lib/requisitionHelpers.js";
import { downloadRequisitionPdf } from "../../lib/requisitionPdf.js";
import { downloadRequisitionExcel } from "../../lib/requisitionExcel.js";
import { buildInvoicePdfFromJob } from "../../lib/invoicePdf.js";
import { openPdfBlob } from "../../lib/pdfOpen.js";
import { clientKey } from "../../lib/customers.js";
import { requisitionItems } from "../../lib/requisitionCalc.js";
import {
  G702View,
  G703DraftContinuation,
  G703View,
  ReqNavArrows,
  ReqTabBar,
  useReqTabSwipe,
} from "./RequisitionViews.jsx";

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

function roundPct(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Edit SOV % on a saved requisition — green when changed, red when same as original. */
function RequisitionEditTab({ project, req, onSaveProject, busy, showToast }) {
  const baseItems = useMemo(() => {
    const snap = req?.itemsSnapshot || [];
    const byId = Object.fromEntries(snap.map((s) => [s.id, s]));
    const byKey = Object.fromEntries(snap.map((s) => [s.key || sovItemKey(s), s]));
    const items = requisitionItems(project?.items || []);
    if (!items.length && snap.length) {
      return snap.map((s) => ({
        id: s.id || s.key,
        section: s.section || "",
        description: s.description || "",
        value: Number(s.value) || 0,
        completedPct: Number(s.completedPct) || 0,
      }));
    }
    return items.map((it) => {
      const s = byId[it.id] || byKey[sovItemKey(it)];
      return {
        ...it,
        completedPct: s != null ? Number(s.completedPct) || 0 : Number(it.completedPct) || 0,
      };
    });
  }, [project?.items, req?.id, req?.itemsSnapshot]);

  const originalPct = useMemo(() => {
    const m = {};
    for (const s of req?.itemsSnapshot || []) {
      if (s.id) m[s.id] = Number(s.completedPct) || 0;
      const k = s.key || sovItemKey(s);
      if (k) m[k] = Number(s.completedPct) || 0;
    }
    return m;
  }, [req?.itemsSnapshot]);

  const [pctById, setPctById] = useState(() =>
    Object.fromEntries(baseItems.map((it) => [it.id, Number(it.completedPct) || 0]))
  );

  useEffect(() => {
    setPctById(Object.fromEntries(baseItems.map((it) => [it.id, Number(it.completedPct) || 0])));
  }, [req?.id, baseItems]);

  const draftItems = useMemo(
    () => baseItems.map((it) => ({ ...it, completedPct: pctById[it.id] ?? it.completedPct ?? 0 })),
    [baseItems, pctById]
  );

  const dirty = useMemo(() => {
    return baseItems.some((it) => {
      const cur = roundPct(pctById[it.id]);
      const orig = roundPct(originalPct[it.id] ?? originalPct[sovItemKey(it)] ?? it.completedPct);
      return cur !== orig;
    });
  }, [baseItems, pctById, originalPct]);

  const setPct = (id, v) => setPctById((m) => ({ ...m, [id]: roundPct(v) }));

  const saveLocal = async () => {
    if (!onSaveProject) return;
    const next = updateRequisitionPercentages(project, req.id, pctById);
    await onSaveProject(next);
    showToast?.("Requisition saved locally");
  };

  return (
    <div className="space-y-3" data-testid="req-edit-tab">
      <p className="text-xs text-slate-500">
        Edit percentages on this requisition. Green = you changed it · Red = same as saved. Connected dollars update when you save.
      </p>
      <button
        type="button"
        className="btn w-full bg-brand text-white"
        onClick={saveLocal}
        disabled={busy || !dirty}
        data-testid="req-edit-save-local"
      >
        {dirty ? "Save locally" : "Saved"}
      </button>
      <G703DraftContinuation
        items={draftItems}
        prevPctById={Object.fromEntries(
          baseItems.map((it) => [it.id, originalPct[it.id] ?? originalPct[sovItemKey(it)] ?? it.completedPct])
        )}
        retainagePct={req.retainagePct || project?.retainagePct || 10}
        defaultExpandAll
        renderPct={(it) => {
          const status = pctChangeStatus(
            pctById[it.id],
            originalPct[it.id] ?? originalPct[sovItemKey(it)],
            true
          );
          const cls =
            status === "changed"
              ? "bg-emerald-100 text-emerald-800 border-emerald-300"
              : "bg-red-50 text-red-700 border-red-200";
          return (
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              inputMode="decimal"
              className={`w-11 max-w-full text-right border rounded px-0.5 py-0 text-[10px] sm:text-[11px] ${cls}`}
              value={roundPct(pctById[it.id] ?? 0)}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setPct(it.id, e.target.value)}
              data-testid="req-edit-pct"
            />
          );
        }}
      />
      <button
        type="button"
        className="btn w-full bg-brand text-white"
        onClick={saveLocal}
        disabled={busy || !dirty}
        data-testid="req-edit-save-local-bottom"
      >
        {dirty ? "Save locally" : "Saved"}
      </button>
    </div>
  );
}

export default function RequisitionDetail({
  project,
  requisition,
  contact,
  jobs = [],
  onUpdate,
  onSaveProject,
  onDelete,
  canDelete,
  deleteBlocked,
  onClose,
  onSelect,
  busy,
  showToast,
}) {
  const [tab, setTab] = useState("app");
  const [showEmail, setShowEmail] = useState(false);
  const [expandAllToken, setExpandAllToken] = useState(0);
  const [collapseAllToken, setCollapseAllToken] = useState(0);
  const [contExpanded, setContExpanded] = useState(true);
  const req = requisition;

  const tabs = [
    { id: "app", label: "Application & Cert" },
    { id: "cont", label: "Continuation Sheet" },
    { id: "pay", label: "Payments" },
    { id: "files", label: "Files" },
    { id: "edit", label: "Edit" },
  ];
  const { onTouchStart, onTouchEnd } = useReqTabSwipe(tabs, tab, setTab);
  const navList = useMemo(() => requisitionsAscending(project), [project]);
  const navIdx = navList.findIndex((r) => r.id === req?.id);

  const onTabPress = (id, wasActive) => {
    if (id !== "cont") return;
    // First open of Continuation → expand all; re-press toggles expand/collapse all.
    if (!wasActive) {
      setExpandAllToken((n) => n + 1);
      setContExpanded(true);
      return;
    }
    if (contExpanded) {
      setCollapseAllToken((n) => n + 1);
      setContExpanded(false);
    } else {
      setExpandAllToken((n) => n + 1);
      setContExpanded(true);
    }
  };

  if (!req) return null;

  return (
    <div className="space-y-4" data-testid="requisition-detail">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="text-sm font-semibold text-brand" onClick={onClose}>
          ← Back
        </button>
      </div>

      <ReqNavArrows
        label={req.applicationNumber || `REQ-${req.num}`}
        onPrev={() => navIdx > 0 && onSelect?.(navList[navIdx - 1].id)}
        onNext={() => navIdx >= 0 && navIdx < navList.length - 1 && onSelect?.(navList[navIdx + 1].id)}
        prevDisabled={navIdx <= 0}
        nextDisabled={navIdx < 0 || navIdx >= navList.length - 1}
      />

      <ReqTabBar tabs={tabs} tab={tab} setTab={setTab} onTabPress={onTabPress} />

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} data-testid="req-tab-content">
        {tab === "app" ? <G702View req={req} /> : null}
        {tab === "cont" ? (
          <G703View
            req={req}
            defaultExpandAll
            expandAllToken={expandAllToken}
            collapseAllToken={collapseAllToken}
          />
        ) : null}
        {tab === "pay" ? <PaymentsTab req={req} onUpdate={onUpdate} busy={busy} /> : null}
        {tab === "files" ? <FilesTab req={req} onUpdate={onUpdate} busy={busy} /> : null}
        {tab === "edit" ? (
          <RequisitionEditTab
            project={project}
            req={req}
            onSaveProject={onSaveProject}
            busy={busy}
            showToast={showToast}
          />
        ) : null}
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