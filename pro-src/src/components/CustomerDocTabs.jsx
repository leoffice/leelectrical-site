// Invoices / Estimates / Service addresses — create docs, open + closed sections.
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  invoiceJobs,
  estimateJobs,
  estimateButtonLabel,
  invoiceRowDetail,
  addressJobRowDetail,
  addressJobToneClass,
} from "../lib/customerDocLists.js";
import {
  cloneJobAtAddressPatch,
  jobsAtSameAddress,
  serviceAddressesForJobs,
  serviceAddressKey,
} from "../lib/customerHierarchy.js";
import {
  canAddChangeOrder,
  changeOrderJobPatch,
  changeOrderTabRowsAll,
  isChangeOrderJob,
} from "../lib/changeOrder.js";
import { useStore } from "../state/store.jsx";
import { useLongPress } from "../lib/useLongPress.js";
import ConnectDocSheet from "./ConnectDocSheet.jsx";
import ChangeOrdersTabPanel from "./ChangeOrdersTabPanel.jsx";
import AddJobAtAddressSheet from "./AddJobAtAddressSheet.jsx";

const TAB_BTN =
  "flex-1 rounded-xl border px-2 py-2 text-center text-[10px] font-bold leading-tight transition-colors";
const DOC_BTN =
  "w-full flex items-start justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold mb-1.5 active:opacity-80";
const SECTION_HDR =
  "text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-0.5 mb-1.5 mt-2 first:mt-0";
const CREATE_BTN =
  "w-full rounded-xl border border-dashed border-brand/40 bg-brand-soft/50 px-3 py-2.5 text-sm font-semibold text-brand mb-2 active:opacity-80";

function toneClass(tone) {
  if (tone === "paid") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (tone === "open") return "bg-red-50 text-red-800 border-red-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function isOpenEstimate(job) {
  return !!(job?.estimateNo && !job.invoiceNo && !job._estimateConfirmed);
}

function DocSection({ title, empty, children }) {
  return (
    <div data-testid={"cust-section-" + title.toLowerCase().replace(/\s+/g, "-")}>
      <p className={SECTION_HDR}>{title}</p>
      {children}
      {empty ? <p className="text-xs text-slate-400 text-center py-2">None on file.</p> : null}
    </div>
  );
}

function DocRowButton({ className, onOpen, onLongPress, testId, children }) {
  const press = useLongPress(onLongPress, { onClick: onOpen });
  return (
    <button type="button" className={className} data-testid={testId} {...press}>
      {children}
    </button>
  );
}

function InvoiceRows({ list, activeJobId, fromCust, onOpen, onConnectRequest }) {
  if (!list.length) return null;
  return list.map((j) => {
    const { no, address, amountLine, tone } = invoiceRowDetail(j);
    const active = j.id === activeJobId;
    return (
      <DocRowButton
        key={j.id}
        className={`${DOC_BTN} ${toneClass(tone)} ${active ? "ring-2 ring-brand/40" : ""}`}
        onOpen={() => onOpen(j)}
        onLongPress={() => onConnectRequest?.(j, "invoice")}
        testId={"cust-inv-" + no}
      >
        <span className="min-w-0 flex-1">
          <span className="block">Invoice #{no}</span>
          {address ? (
            <span className="block text-[11px] font-normal opacity-85 truncate mt-0.5">{address}</span>
          ) : null}
        </span>
        <span className="text-xs tabular-nums shrink-0 text-right leading-snug">{amountLine}</span>
      </DocRowButton>
    );
  });
}

function EstimateRows({ list, activeJobId, onOpen, onConnectRequest }) {
  if (!list.length) return null;
  return list.map((j) => {
    const { no, linked } = estimateButtonLabel(j);
    const active = j.id === activeJobId;
    const open = isOpenEstimate(j);
    return (
      <DocRowButton
        key={j.id}
        className={`${DOC_BTN} ${
          open ? "bg-slate-50 text-slate-700 border-slate-200" : "bg-emerald-50 text-emerald-800 border-emerald-200"
        } ${active ? "ring-2 ring-brand/40" : ""}`}
        onOpen={() => onOpen(j)}
        onLongPress={() => onConnectRequest?.(j, "estimate")}
        testId={"cust-est-" + no}
      >
        <span>
          Estimate #{no}
          {linked ? <span className="text-xs text-slate-400 font-normal">{linked}</span> : null}
        </span>
      </DocRowButton>
    );
  });
}

function AddressJobRows({ list, activeJobId, onOpen }) {
  if (!list.length) return null;
  return list.map((j) => {
    const active = j.id === activeJobId;
    const { quickDesc, invoiceNo, estimateNo, amountLine, actionLabel, tone, address } = addressJobRowDetail(j);
    return (
      <button
        key={j.id}
        type="button"
        className={`${DOC_BTN} ${addressJobToneClass(tone)} ${active ? "ring-2 ring-brand/40" : ""}`}
        data-testid={"cust-addr-job-" + j.id}
        onClick={() => onOpen(j)}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate">{quickDesc}</span>
          {address ? (
            <span className="block text-[11px] font-normal opacity-85 truncate mt-0.5">{address}</span>
          ) : null}
          {invoiceNo ? (
            <span className="block text-[11px] font-normal opacity-85 mt-0.5">Invoice #{invoiceNo}</span>
          ) : estimateNo ? (
            <span className="block text-[11px] font-normal opacity-85 mt-0.5">Estimate #{estimateNo}</span>
          ) : null}
        </span>
        <span className="text-xs tabular-nums shrink-0 text-right leading-snug">
          {amountLine ? <span className="block font-bold">{amountLine}</span> : null}
          {actionLabel ? (
            <span className="block text-[10px] font-extrabold uppercase tracking-wide mt-0.5 opacity-90">
              {actionLabel}
            </span>
          ) : null}
        </span>
      </button>
    );
  });
}

export default function CustomerDocTabs({ jobs, activeJobId, fromCust = "" }) {
  const nav = useNavigate();
  const { createJob, showToast, patchAndSave } = useStore();
  const [tab, setTab] = useState(null); // null | invoices | estimates | addresses
  const [addrKey, setAddrKey] = useState(""); // selected service-address key
  const [connect, setConnect] = useState(null); // { job, kind }

  const templateJob = jobs[0] || null;
  const addresses = useMemo(() => serviceAddressesForJobs(jobs), [jobs]);
  const addrJobs = useMemo(() => {
    if (!addrKey || !templateJob) return [];
    const anchor = jobs.find((j) => serviceAddressKey(j) === addrKey) || templateJob;
    return jobsAtSameAddress(jobs, anchor);
  }, [jobs, addrKey, templateJob]);

  // Regular invoices tab excludes pure change-order jobs (those live under Change Orders).
  const allInv = invoiceJobs(jobs).filter((j) => !isChangeOrderJob(j));
  const openInv = allInv.filter((j) => invoiceRowDetail(j).tone === "open");
  const closedInv = allInv.filter((j) => invoiceRowDetail(j).tone === "paid");

  const allEst = estimateJobs(jobs);
  const openEst = allEst.filter(isOpenEstimate);
  const closedEst = allEst.filter((j) => !isOpenEstimate(j));

  const coRows = useMemo(() => changeOrderTabRowsAll(jobs), [jobs]);

  const counts = {
    invoices: allInv.length,
    estimates: allEst.length,
    changes: coRows.length,
    addresses: addresses.length,
  };

  const openJob = (j) => {
    const parts = [];
    if (fromCust) parts.push("from=" + encodeURIComponent(fromCust));
    parts.push("fold=1");
    const q = parts.length ? "?" + parts.join("&") : "";
    nav("/job/" + j.id + q);
  };

  const navNewDoc = (newId, kind) => {
    const parts = [];
    if (fromCust) parts.push("from=" + encodeURIComponent(fromCust));
    parts.push("doc=" + kind);
    parts.push("create=1");
    nav("/job/" + newId + "?" + parts.join("&"));
  };

  const jobPatchFor = (atAddressKey = "") => {
    if (!templateJob) return null;
    if (!atAddressKey) return cloneJobAtAddressPatch(templateJob);
    const anchor = jobs.find((j) => serviceAddressKey(j) === atAddressKey);
    return cloneJobAtAddressPatch(anchor || templateJob);
  };

  const [addJobSheet, setAddJobSheet] = useState(null); // { atAddressKey, sourceJob }

  const openAddJobSheet = ({ atAddressKey = "" } = {}) => {
    if (!templateJob) return showToast("No customer info yet");
    let source = templateJob;
    if (atAddressKey) {
      const anchor = jobs.find((j) => serviceAddressKey(j) === atAddressKey);
      if (anchor) source = anchor;
    }
    setAddJobSheet({ atAddressKey, sourceJob: source });
  };

  const confirmAddJobAtAddress = async (patch, meta = {}) => {
    setAddJobSheet(null);
    const newId = await createJob(patch);
    if (!newId) return;
    if (meta.changeOrder) {
      navNewDoc(newId, meta.kind || "invoice");
      return;
    }
    const parts = [];
    if (fromCust) parts.push("from=" + encodeURIComponent(fromCust));
    nav("/job/" + newId + (parts.length ? "?" + parts.join("&") : ""));
  };

  const startNewJob = ({ atAddressKey = "" } = {}) => openAddJobSheet({ atAddressKey });

  const startNewDoc = async (kind, { atAddressKey = "" } = {}) => {
    const patch = jobPatchFor(atAddressKey);
    if (!patch) return showToast("No customer info yet");
    // Creating an invoice/estimate job — open with CO toggle available via add-job sheet
    // only when user explicitly adds a job; direct Create still makes a regular job.
    const newId = await createJob(patch);
    if (newId) navNewDoc(newId, kind);
  };

  const startChangeOrder = async () => {
    if (!templateJob) return showToast("No customer info yet");
    if (!canAddChangeOrder(jobs, templateJob)) {
      return showToast("Finish the open change order first — save, email, and confirm in QuickBooks");
    }
    const patch = changeOrderJobPatch(templateJob, "invoice", jobs);
    const newId = await createJob(patch);
    if (newId) navNewDoc(newId, "invoice");
  };

  const toggle = (t) => {
    setTab((cur) => {
      const next = cur === t ? null : t;
      if (next !== "addresses") setAddrKey("");
      return next;
    });
  };

  return (
    <div className="space-y-2" data-testid="customer-doc-tabs">
      <div className="flex gap-1.5 px-0.5">
        {[
          ["invoices", "🧾 Invoices", counts.invoices],
          ["estimates", "📝 Estimates", counts.estimates],
          ["changes", "📋 Change orders", counts.changes],
          ["addresses", "📍 Addresses", counts.addresses],
        ].map(([id, label, n]) => (
          <button
            key={id}
            type="button"
            className={`${TAB_BTN} ${
              tab === id ? "bg-brand-soft text-brand border-brand/30" : "bg-slate-50 text-slate-500 border-slate-200"
            }`}
            onClick={() => toggle(id)}
            data-testid={"cust-tab-" + id}
          >
            {label}
            {n > 0 ? <span className="block text-[9px] font-semibold opacity-70">{n}</span> : null}
          </button>
        ))}
      </div>

      {tab === "invoices" ? (
        <div className="card px-3 py-2" data-testid="cust-tab-panel-invoices">
          <button
            type="button"
            className={CREATE_BTN}
            data-testid="cust-create-invoice"
            onClick={() => startNewDoc("invoice")}
          >
            ＋ Create invoice
          </button>
          <DocSection title="Open invoices" empty={!openInv.length}>
            <InvoiceRows
              list={openInv}
              activeJobId={activeJobId}
              fromCust={fromCust}
              onOpen={openJob}
              onConnectRequest={(j, kind) => setConnect({ job: j, kind })}
            />
          </DocSection>
          <DocSection title="Closed invoices" empty={!closedInv.length}>
            <InvoiceRows
              list={closedInv}
              activeJobId={activeJobId}
              fromCust={fromCust}
              onOpen={openJob}
              onConnectRequest={(j, kind) => setConnect({ job: j, kind })}
            />
          </DocSection>
        </div>
      ) : null}

      {tab === "estimates" ? (
        <div className="card px-3 py-2" data-testid="cust-tab-panel-estimates">
          <button
            type="button"
            className={CREATE_BTN}
            data-testid="cust-create-estimate"
            onClick={() => startNewDoc("estimate")}
          >
            ＋ Create estimate
          </button>
          <DocSection title="Open estimates" empty={!openEst.length}>
            <EstimateRows
              list={openEst}
              activeJobId={activeJobId}
              onOpen={openJob}
              onConnectRequest={(j, kind) => setConnect({ job: j, kind })}
            />
          </DocSection>
          <DocSection title="Closed estimates" empty={!closedEst.length}>
            <EstimateRows
              list={closedEst}
              activeJobId={activeJobId}
              onOpen={openJob}
              onConnectRequest={(j, kind) => setConnect({ job: j, kind })}
            />
          </DocSection>
        </div>
      ) : null}

      {tab === "changes" ? (
        <div data-testid="cust-tab-panel-changes">
          <ChangeOrdersTabPanel
            jobs={jobs}
            sourceJob={templateJob}
            rows={coRows}
            scope="all"
            canAdd={!!templateJob && canAddChangeOrder(jobs, templateJob)}
            onAdd={startChangeOrder}
            onEdit={(row) => {
              const j = row.job;
              if (!j?.id) return;
              const kind = row.docKind === "estimate" ? "estimate" : "invoice";
              const parts = [];
              if (fromCust) parts.push("from=" + encodeURIComponent(fromCust));
              parts.push("doc=" + kind);
              parts.push(j.invoiceNo || j.estimateNo ? "edit=1" : "create=1");
              parts.push("fold=1");
              nav("/job/" + j.id + "?" + parts.join("&"));
            }}
            onOpenJob={openJob}
            onRemove={(row) => {
              if (!row?.jobId) return;
              if (!window.confirm("Remove this change order from the app? QuickBooks is not changed.")) return;
              patchAndSave(row.jobId, { _deleted: true })
                .then(() => showToast("Change order removed"))
                .catch(() => showToast("Could not remove — try again"));
            }}
          />
        </div>
      ) : null}

      {tab === "addresses" ? (
        <div className="card px-3 py-2" data-testid="cust-tab-panel-addresses">
          {!addrKey ? (
            <>
              <DocSection title="Service addresses" empty={!addresses.length}>
                {addresses.map(({ key, label }) => {
                  const n = jobs.filter((j) => serviceAddressKey(j) === key).length;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`${DOC_BTN} bg-slate-50 text-slate-700 border-slate-200`}
                      data-testid={"cust-addr-" + key.slice(0, 12)}
                      onClick={() => setAddrKey(key)}
                    >
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      <span className="text-xs text-slate-400 shrink-0">
                        {n} job{n === 1 ? "" : "s"}
                      </span>
                    </button>
                  );
                })}
              </DocSection>
            </>
          ) : (
            <>
              <button
                type="button"
                className="text-xs font-semibold text-brand mb-2"
                data-testid="cust-addr-back"
                onClick={() => setAddrKey("")}
              >
                ‹ All addresses
              </button>
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-0.5 mb-1.5">
                Jobs at this address
              </p>
              <button
                type="button"
                className={CREATE_BTN}
                data-testid="cust-addr-add-job"
                onClick={() => startNewJob({ atAddressKey: addrKey })}
              >
                ＋ Add job at this address
              </button>
              <AddressJobRows list={addrJobs} activeJobId={activeJobId} onOpen={openJob} />
              {!addrJobs.length ? <p className="text-xs text-slate-400 text-center py-2">No jobs yet.</p> : null}
            </>
          )}
        </div>
      ) : null}

      {connect ? (
        <ConnectDocSheet job={connect.job} pressedKind={connect.kind} onClose={() => setConnect(null)} />
      ) : null}

      {addJobSheet?.sourceJob ? (
        <AddJobAtAddressSheet
          sourceJob={addJobSheet.sourceJob}
          jobs={jobs}
          onCreate={confirmAddJobAtAddress}
          onClose={() => setAddJobSheet(null)}
        />
      ) : null}
    </div>
  );
}