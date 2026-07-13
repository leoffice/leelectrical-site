// Build a QuickBooks estimate or invoice — line items, service address, attachments.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import CustomerSearch from "./CustomerSearch.jsx";
import { useStore } from "../state/store.jsx";
import { DEFAULT_QBO_ITEMS, filterQboItems } from "../data/qboItems.js";
import { serviceAddressHint, serviceAddressLabel } from "../lib/customerSync.js";
import { emptyLine, initialLines, lineAmount, linesTotal } from "../lib/qboDoc.js";
import { planDocSaveLocal, planDocSaveSync } from "../lib/docSync.js";
import { enqueueCustomerQboSync } from "../lib/customerQboEnqueue.js";
import { stashPendingDocSync } from "../lib/docSyncChain.js";
import { fmt$, parseAmount } from "../lib/format.js";
import { customerKeyForName, jobsForCustomerKey } from "../lib/customers.js";
import { serviceAddressesForJobs } from "../lib/customerHierarchy.js";
import { enrichAndPatchCustomer } from "./NewJobFlow.jsx";
import {
  applyDueAmountToLines,
  applyProgressPctToLines,
  contractTotalForJob,
  contractTotalFromEstimate,
  dueFromContract,
  isProgressBillingContext,
  progressPctFromLines,
} from "../lib/progressBilling.js";
import { RECUR_INTERVALS, defaultRecurringState } from "../lib/recurringBilling.js";

function ProgressBillingPanel({ job, lines, contractAmount, adjustMode, progressPct, amountDue, onContractChange, onModeChange, onPctChange, onDueChange }) {
  const contract = parseAmount(contractAmount) || contractTotalForJob(job) || linesTotal(job.estimateLines) || 0;
  const billed = linesTotal(lines);
  const pct = progressPctFromLines(lines, contract) || parseAmount(progressPct);

  return (
    <div className="card px-3 py-3 mb-3 border-amber-200 bg-amber-50/60" data-testid="progress-billing-panel">
      <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 mb-1">Progress invoice</p>
      <p className="text-xs text-slate-600 mb-3">
        {job.estimateNo
          ? "Linked to estimate #" + job.estimateNo + ". "
          : "Partial billing on a project — matches QuickBooks quantity × rate. "}
        {contract > 0 && billed < contract
          ? "Billing " + fmt$(billed) + " of " + fmt$(contract) + " (" + pct + "%)."
          : contract > 0
          ? "Full contract " + fmt$(contract) + "."
          : "Enter the full contract amount below."}
      </p>

      <Fld label="Full contract amount" hint="Total estimate / project value in QuickBooks">
        <input
          className="input"
          inputMode="decimal"
          value={contractAmount}
          onChange={(e) => onContractChange(e.target.value)}
          placeholder={contract > 0 ? String(contract) : "e.g. 46000"}
          aria-label="Full contract amount"
          data-testid="progress-contract-amount"
          disabled={!!job.estimateLines?.length && !job.contractAmount}
        />
      </Fld>

      <div className="flex gap-2 mt-3 mb-2">
        <button
          type="button"
          className={"flex-1 py-2 rounded-xl text-xs font-bold " + (adjustMode === "pct" ? "bg-brand text-white" : "bg-white border border-slate-200 text-slate-600")}
          onClick={() => onModeChange("pct")}
          data-testid="progress-mode-pct"
        >
          % of contract
        </button>
        <button
          type="button"
          className={"flex-1 py-2 rounded-xl text-xs font-bold " + (adjustMode === "amount" ? "bg-brand text-white" : "bg-white border border-slate-200 text-slate-600")}
          onClick={() => onModeChange("amount")}
          data-testid="progress-mode-amount"
        >
          Dollar amount
        </button>
      </div>

      {adjustMode === "pct" ? (
        <div className="space-y-2">
          <Fld label="Progress percent">
            <div className="flex items-center gap-2">
              <input
                className="input flex-1"
                inputMode="decimal"
                value={progressPct}
                onChange={(e) => onPctChange(e.target.value)}
                aria-label="Progress percent"
                data-testid="progress-pct-edit"
              />
              <span className="text-sm font-bold text-slate-600">%</span>
            </div>
          </Fld>
          <input
            type="range"
            min={1}
            max={100}
            value={Math.min(100, Math.max(1, parseAmount(progressPct) || pct || 50))}
            onChange={(e) => onPctChange(e.target.value)}
            className="w-full"
            aria-label="Progress percent slider"
          />
          <p className="text-xs text-slate-500">Due on this invoice: {fmt$(dueFromContract(contract, progressPct || pct))}</p>
        </div>
      ) : (
        <Fld label="Amount due on this invoice" hint="What this progress invoice bills">
          <input
            className="input"
            inputMode="decimal"
            value={amountDue}
            onChange={(e) => onDueChange(e.target.value)}
            aria-label="Amount due on invoice"
            data-testid="progress-amount-due"
          />
        </Fld>
      )}
    </div>
  );
}

function LineRow({ line, index, items, onChange, onRemove, canRemove, progressMode }) {
  const [itemQ, setItemQ] = useState(line.itemName || "");
  const [open, setOpen] = useState(false);
  const picks = useMemo(() => filterQboItems(items, itemQ), [items, itemQ]);

  const pick = (it) => {
    onChange(index, {
      itemName: it.name,
      itemId: it.id || "",
      unitPrice: it.price != null ? it.price : line.unitPrice,
      description: line.description || it.description || "",
    });
    setItemQ(it.name);
    setOpen(false);
  };

  return (
    <div className="card px-3 py-3 mb-2 space-y-2" data-testid="doc-line-row">
      <Fld label={"Line " + (index + 1) + " — Product/Service"}>
        <div className="relative">
          <input
            className="input"
            value={itemQ}
            onChange={(e) => {
              setItemQ(e.target.value);
              onChange(index, { itemName: e.target.value });
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search QuickBooks items…"
            aria-label={"Product service line " + (index + 1)}
          />
          {open && picks.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
              {picks.map((it) => (
                <button
                  key={it.name}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0"
                  onClick={() => pick(it)}
                >
                  <span className="font-semibold text-slate-800 block truncate">{it.name}</span>
                  <span className="text-xs text-slate-500">
                    {it.price ? fmt$(it.price) : "custom price"}
                    {it.description ? " · " + it.description.slice(0, 40) : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Fld>
      <Fld label="Description">
        <input
          className="input"
          value={line.description || ""}
          onChange={(e) => onChange(index, { description: e.target.value })}
          placeholder="Work performed, scope notes…"
          aria-label={"Description line " + (index + 1)}
        />
      </Fld>
      <div className={"flex gap-2 " + (progressMode ? "flex-wrap" : "")}>
        <Fld label={progressMode ? "Rate (full)" : "Rate"}>
          <input
            className="input"
            inputMode="decimal"
            value={line.unitPrice}
            onChange={(e) => onChange(index, { unitPrice: e.target.value })}
            aria-label={"Rate line " + (index + 1)}
          />
        </Fld>
        <Fld label="Qty">
          <input
            className="input"
            inputMode="decimal"
            value={line.qty}
            onChange={(e) => onChange(index, { qty: e.target.value })}
            aria-label={"Quantity line " + (index + 1)}
          />
        </Fld>
        {progressMode ? (
          <Fld label="Due">
            <div className="input bg-slate-50 text-slate-700 font-semibold" aria-label={"Due line " + (index + 1)}>
              {fmt$(lineAmount(line))}
            </div>
          </Fld>
        ) : (
          <div className="shrink-0 pt-6 text-sm font-bold text-slate-700 w-20 text-right">{fmt$(lineAmount(line))}</div>
        )}
      </div>
      {canRemove ? (
        <button type="button" className="text-xs font-semibold text-red-500" onClick={() => onRemove(index)}>
          Remove line
        </button>
      ) : null}
    </div>
  );
}

function CustomerHeaderPanel({ job, allJobs, api, onPatch }) {
  const [addrPick, setAddrPick] = useState("");
  const addressChoices = useMemo(() => {
    const ck =
      (job.qboCustomerId && "q:" + job.qboCustomerId) ||
      customerKeyForName(job.businessName || job.customer);
    if (!ck) return [];
    return serviceAddressesForJobs(jobsForCustomerKey(allJobs, ck));
  }, [allJobs, job.businessName, job.customer, job.qboCustomerId]);

  const applyCustomer = async (c) => {
    if (!c) return;
    if (c._newCustomer) {
      onPatch({
        businessName: c.name || "",
        customer: c.name || "",
        qboCustomerId: "",
      });
      return;
    }
    const patch = await enrichAndPatchCustomer(c, allJobs, api);
    onPatch({
      businessName: patch.businessName || patch.customer || "",
      customer: patch.businessName || patch.customer || "",
      personName: patch.personName || "",
      phone: patch.phone || "",
      email: patch.email || "",
      billingAddress: patch.billingAddress || "",
      qboCustomerId: patch.qboCustomerId || "",
      parentCustomerName: patch.parentCustomerName || "",
      parentQboCustomerId: patch.parentQboCustomerId || "",
    });
  };

  const set = (k) => (e) => onPatch({ [k]: e.target.value });

  return (
    <div className="mb-4 pb-3 border-b border-slate-200" data-testid="doc-customer-header">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Customer</p>
      <Fld label="Customer name" hint="Search app + QuickBooks — orange = not in QuickBooks yet">
        <CustomerSearch
          label="Customer name"
          testId="doc-customer-search"
          value={job.businessName || job.customer || ""}
          onChangeText={(v) => onPatch({ businessName: v, customer: v, qboCustomerId: "" })}
          onPick={applyCustomer}
          jobs={allJobs}
        />
      </Fld>
      <Fld label="Person name">
        <input className="input" value={job.personName || ""} onChange={set("personName")} aria-label="Person name" />
      </Fld>
      <Fld label="Phone">
        <input className="input" value={job.phone || ""} onChange={set("phone")} aria-label="Phone" />
      </Fld>
      <Fld label="Email">
        <input className="input" value={job.email || ""} onChange={set("email")} aria-label="Email" />
      </Fld>
      <Fld label="Billing address">
        <input className="input" value={job.billingAddress || ""} onChange={set("billingAddress")} aria-label="Billing address" />
      </Fld>
      <Fld label="Job title / scope" hint="What this invoice is for">
        <input className="input" value={job.title || ""} onChange={set("title")} aria-label="Job title" />
      </Fld>
      {addressChoices.length > 1 ? (
        <Fld label="Service address" hint="Pick an existing site for this customer or type below">
          <select
            className="input mb-2"
            value={addrPick}
            onChange={(e) => {
              const v = e.target.value;
              setAddrPick(v);
              if (v === "new") return;
              const hit = addressChoices.find((a) => a.key === v);
              if (hit) onPatch({ serviceAddress: hit.label, address: hit.label });
            }}
            aria-label="Service address picker"
            data-testid="doc-address-picker"
          >
            <option value="">Choose address…</option>
            {addressChoices.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
            <option value="new">＋ New address</option>
          </select>
        </Fld>
      ) : null}
    </div>
  );
}

export default function DocBuilderSheet({
  job: jobProp,
  kind,
  mode = "create",
  progressPct,
  onClose,
  onDone,
  editableCustomer = false,
  draftMode = false,
  allJobs,
  onCustomerPatch,
}) {
  const { patchAndSave, enqueue, logSend, showToast, api, createJob, jobs: storeJobs } = useStore();
  const boardJobs = allJobs || storeJobs;
  const [job, setJob] = useState(() => jobProp || {});
  useEffect(() => {
    setJob(jobProp || {});
  }, [jobProp]);

  const patchJobState = useCallback(
    (patch) => {
      setJob((o) => {
        const next = { ...o, ...patch };
        onCustomerPatch && onCustomerPatch(next);
        return next;
      });
    },
    [onCustomerPatch]
  );
  const [serviceAddress, setServiceAddress] = useState(job.serviceAddress || job.address || "");
  const [apartment, setApartment] = useState(job.apartment || "");
  useEffect(() => {
    const addr = job.serviceAddress || job.address || "";
    if (addr) setServiceAddress(addr);
  }, [job.serviceAddress, job.address]);
  const progressMode = kind === "invoice" && isProgressBillingContext(job, { kind, mode });
  const [lines, setLines] = useState(() => initialLines(job, { kind, mode, progressPct }));
  const [attachments, setAttachments] = useState([]);
  const [attName, setAttName] = useState("");
  const [attUrl, setAttUrl] = useState("");
  const [items, setItems] = useState(DEFAULT_QBO_ITEMS);
  const [saving, setSaving] = useState(false);
  const initialContract = contractTotalForJob(job) || contractTotalFromEstimate(job.estimateLines) || 0;
  const [contractAmount, setContractAmount] = useState(initialContract ? String(initialContract) : "");
  const [adjustMode, setAdjustMode] = useState("amount");
  const [progressPctEdit, setProgressPctEdit] = useState(() => {
    if (progressPct != null) return String(progressPct);
    const init = initialLines(job, { kind, mode, progressPct });
    return String(initialContract ? progressPctFromLines(init, initialContract) : 100);
  });
  const [amountDueEdit, setAmountDueEdit] = useState(() => {
    const init = initialLines(job, { kind, mode, progressPct });
    return String(parseAmount(job.amount) || linesTotal(init) || "");
  });
  const showRecurring = kind === "invoice" && mode !== "edit";
  const [recurring, setRecurring] = useState(() => defaultRecurringState(job));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await api.searchItems("");
        if (!cancelled && remote && remote.length) setItems(remote);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const total = useMemo(() => linesTotal(lines), [lines]);
  const title =
    mode === "edit"
      ? "Edit " + (kind === "estimate" ? "estimate" : "invoice")
      : kind === "estimate"
      ? "Generate estimate"
      : mode === "from_estimate" || mode === "turn_from_estimate"
      ? "Invoice from estimate" + (progressPct != null ? " (" + progressPct + "%)" : "")
      : "Create invoice";

  const contractLines = job.estimateLines?.length
    ? job.estimateLines
    : lines.map((ln) => ({ ...ln, unitPrice: parseAmount(contractAmount) || ln.unitPrice, qty: 1 }));

  const changeLine = useCallback((i, patch) => {
    setLines((rows) => rows.map((ln, idx) => (idx === i ? { ...ln, ...patch } : ln)));
  }, []);

  const applyProgressPct = useCallback(
    (pctVal) => {
      const pct = parseAmount(pctVal);
      setProgressPctEdit(String(pct));
      setAmountDueEdit(String(dueFromContract(parseAmount(contractAmount) || contractTotalForJob(job), pct)));
      setLines((rows) => applyProgressPctToLines(rows, contractLines, pct));
    },
    [contractAmount, contractLines, job]
  );

  const applyDueAmount = useCallback(
    (amtVal) => {
      const due = parseAmount(amtVal);
      setAmountDueEdit(String(amtVal));
      const contract = parseAmount(contractAmount) || contractTotalForJob(job);
      if (contract > 0) setProgressPctEdit(String(progressPctFromLines([{ qty: 1, unitPrice: due }], contract)));
      setLines((rows) => applyDueAmountToLines(rows, contractLines, due, contract));
    },
    [contractAmount, contractLines, job]
  );

  const onContractChange = useCallback(
    (val) => {
      setContractAmount(val);
      const contract = parseAmount(val);
      if (!contract) return;
      if (adjustMode === "pct") {
        applyProgressPct(progressPctEdit);
      } else {
        applyDueAmount(amountDueEdit);
      }
    },
    [adjustMode, amountDueEdit, applyDueAmount, applyProgressPct, progressPctEdit]
  );

  const addAtt = () => {
    const n = attName.trim();
    const u = attUrl.trim();
    if (!n) return showToast("Name the attachment");
    setAttachments((a) => a.concat([{ name: n, url: u }]));
    setAttName("");
    setAttUrl("");
  };

  const ensureJobId = async () => {
    if (job.id) return job.id;
    if (!draftMode) return null;
    const biz = (job.businessName || job.customer || "").trim();
    if (!biz) {
      showToast("Pick a customer first");
      return null;
    }
    const id = await createJob({
      businessName: biz,
      customer: biz,
      personName: job.personName || "",
      title: job.title || "Invoice",
      phone: job.phone || "",
      email: job.email || "",
      billingAddress: job.billingAddress || "",
      serviceAddress: serviceAddress.trim(),
      address: serviceAddress.trim(),
      apartment: apartment.trim(),
      qboCustomerId: job.qboCustomerId || "",
      parentCustomerName: job.parentCustomerName || "",
      parentQboCustomerId: job.parentQboCustomerId || "",
    });
    if (id) setJob((o) => ({ ...o, id }));
    return id;
  };

  const validate = (send) => {
    if (editableCustomer && !(job.businessName || job.customer || "").trim()) {
      showToast("Pick a customer first");
      return null;
    }
    const valid = lines.filter((ln) => (ln.itemName || "").trim());
    if (!valid.length) {
      showToast("Add at least one product/service line");
      return null;
    }
    if (!serviceAddress.trim()) {
      showToast("Service address is required");
      return null;
    }
    if (mode === "edit" && kind === "invoice" && !job.invoiceNo) {
      showToast("No invoice number on this job yet — create the invoice first");
      return null;
    }
    if (mode === "edit" && kind === "estimate" && !job.estimateNo) {
      showToast("No estimate number on this job yet — create the estimate first");
      return null;
    }
    if (send && !job.email) {
      showToast("Add customer email to send");
      return null;
    }
    return valid;
  };

  const submitLocal = async () => {
    const valid = validate(false);
    if (!valid) return;

    setSaving(true);
    try {
      const jobId = await ensureJobId();
      if (!jobId) {
        setSaving(false);
        return;
      }
      const activeJob = { ...job, id: jobId };
      const { jobPatch } = planDocSaveLocal(activeJob, {
        kind,
        mode,
        lines: valid,
        serviceAddress,
        apartment,
        progressPct: progressPctEdit,
        contractAmount,
      });
      if (attachments.length) {
        jobPatch.attachments = (job.attachments || []).concat(attachments);
      }
      await patchAndSave(jobId, jobPatch);
      showToast("Saved on this job — tap the Estimate or Invoice tab to review, then sync to QuickBooks when ready");
      onDone && onDone(activeJob);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const submitSync = async (send) => {
    const valid = validate(send);
    if (!valid) return;

    setSaving(true);
    try {
      const jobId = await ensureJobId();
      if (!jobId) {
        setSaving(false);
        return;
      }
      const activeJob = { ...job, id: jobId };
      const { jobPatch, commands } = planDocSaveSync(activeJob, {
        kind,
        mode,
        lines: valid,
        serviceAddress,
        apartment,
        progressPct: progressPctEdit || progressPct,
        contractAmount,
        send,
        recurringState: showRecurring && recurring.enabled ? recurring : null,
      });

      await patchAndSave(jobId, jobPatch);

      const needsCustomer =
        mode !== "edit" && !String(activeJob.qboCustomerId || "").trim();

      if (needsCustomer) {
        stashPendingDocSync(jobId, { commands, attachments, send, kind });
        enqueueCustomerQboSync(enqueue, jobId, activeJob, "");
        showToast(
          send
            ? "Setting up customer in QuickBooks first — then your " +
              (kind === "estimate" ? "estimate" : "invoice") +
              " will go out to " +
              activeJob.email
            : "Setting up customer in QuickBooks first — then your " +
              (kind === "estimate" ? "estimate" : "invoice") +
              " will sync"
        );
      } else {
        for (let i = 0; i < commands.length; i++) {
          const cmd = commands[i];
          const payload = { ...cmd.payload, attachments: i === 0 ? attachments : [] };
          await enqueue(cmd.type, jobId, payload, "judgment", cmd.idk);
        }

        for (const att of attachments) {
          const attachType = kind === "estimate" ? "attach_to_estimate" : "attach_to_invoice";
          await enqueue(
            attachType,
            jobId,
            {
              estimateNo: activeJob.estimateNo || "",
              invoiceNo: activeJob.invoiceNo || "",
              name: att.name,
              url: att.url || "",
              pendingDoc: true,
            },
            "deterministic",
            "att:" + kind + ":" + jobId + ":" + att.name
          );
        }

        if (send && activeJob.email) {
          const noKey = kind === "estimate" ? "estimateNo" : "invoiceNo";
          const no = activeJob[noKey];
          if (no) {
            await enqueue(
              "send_" + kind,
              jobId,
              { email: activeJob.email, [noKey]: no },
              "deterministic",
              "send_" + kind + ":" + no
            );
            logSend(jobId, (kind === "estimate" ? "Estimate" : "Invoice") + " send queued after create", activeJob.email);
          }
        }

        const recurNote =
          showRecurring && recurring.enabled ? " + recurring schedule in QuickBooks" : "";
        showToast(
          send
            ? "Sending to QuickBooks and emailing " + activeJob.email + recurNote + "…"
            : "Sending " + (kind === "estimate" ? "estimate" : "invoice") + " to QuickBooks" + recurNote + "…"
        );
      }
      onDone && onDone(activeJob);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title={title + (job.customer ? " — " + job.customer : "")} onClose={onClose} wide>
      {editableCustomer ? (
        <CustomerHeaderPanel job={job} allJobs={boardJobs} api={api} onPatch={patchJobState} />
      ) : (
        <p className="text-[11px] text-slate-400 -mt-1 mb-3">
          Pre-filled from job info. Line items use exact QuickBooks Products &amp; Services names.
        </p>
      )}

      <Fld label={serviceAddressLabel(job)} hint={serviceAddressHint(job)}>
        <input
          className="input"
          value={serviceAddress}
          onChange={(e) => setServiceAddress(e.target.value)}
          aria-label="Service address"
          data-testid="doc-service-address"
        />
      </Fld>
      <Fld label="Apartment / unit" hint="Optional — appended to ShipAddr in QuickBooks">
        <input className="input" value={apartment} onChange={(e) => setApartment(e.target.value)} aria-label="Apartment" />
      </Fld>

      {progressMode ? (
        <ProgressBillingPanel
          job={job}
          lines={lines}
          contractAmount={contractAmount}
          adjustMode={adjustMode}
          progressPct={progressPctEdit}
          amountDue={amountDueEdit}
          onContractChange={onContractChange}
          onModeChange={setAdjustMode}
          onPctChange={(v) => applyProgressPct(v)}
          onDueChange={(v) => applyDueAmount(v)}
        />
      ) : null}

      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mt-2 mb-2">Line items</p>
      {lines.map((ln, i) => (
        <LineRow
          key={i}
          line={ln}
          index={i}
          items={items}
          onChange={changeLine}
          onRemove={(idx) => setLines((rows) => rows.filter((_, j) => j !== idx))}
          canRemove={lines.length > 1}
          progressMode={progressMode}
        />
      ))}
      <button type="button" className="btn-ghost w-full !py-2 mb-3" onClick={() => setLines((rows) => rows.concat([emptyLine()]))}>
        ＋ Add line
      </button>

      <div className="flex justify-between items-center px-1 mb-3">
        <span className="text-sm font-bold text-slate-600">Total</span>
        <span className="text-lg font-extrabold text-slate-900" data-testid="doc-total">
          {fmt$(total) || "$0"}
        </span>
      </div>

      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Attachments</p>
      {attachments.map((a, i) => (
        <div key={i} className="text-sm flex gap-2 py-1 border-b border-dashed border-slate-200">
          <span className="flex-1 truncate">📎 {a.name}</span>
          <button type="button" className="text-red-500 text-xs" onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <div className="flex gap-2 mb-1">
        <input className="input flex-1" placeholder="Name" value={attName} onChange={(e) => setAttName(e.target.value)} aria-label="Attachment name" />
        <input className="input flex-1" placeholder="Link (optional)" value={attUrl} onChange={(e) => setAttUrl(e.target.value)} aria-label="Attachment URL" />
      </div>
      <button type="button" className="btn-ghost w-full !py-1.5 mb-4" onClick={addAtt}>
        ＋ Add attachment
      </button>

      {showRecurring ? (
        <div className="card px-3 py-3 mb-3 border-slate-200 bg-slate-50/80" data-testid="recurring-billing-panel">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={recurring.enabled}
              onChange={(e) => setRecurring((r) => ({ ...r, enabled: e.target.checked }))}
              data-testid="recurring-toggle"
            />
            <span className="text-sm font-bold text-slate-800">Repeat this invoice</span>
          </label>
          <p className="text-[11px] text-slate-500 mt-1 mb-2">
            Sets up automated recurring billing in QuickBooks on the schedule below.
          </p>
          {recurring.enabled ? (
            <div className="space-y-2 mt-2">
              <Fld label="How often">
                <select
                  className="input"
                  value={recurring.interval}
                  onChange={(e) => setRecurring((r) => ({ ...r, interval: e.target.value }))}
                  aria-label="Recurring interval"
                  data-testid="recurring-interval"
                >
                  {RECUR_INTERVALS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Fld>
              <Fld label="Start date">
                <input
                  type="date"
                  className="input"
                  value={recurring.startDate}
                  onChange={(e) => setRecurring((r) => ({ ...r, startDate: e.target.value }))}
                  aria-label="Recurring start date"
                  data-testid="recurring-start"
                />
              </Fld>
              {recurring.interval === "Monthly" ? (
                <Fld label="Day of month" hint="1–28 recommended">
                  <input
                    className="input"
                    inputMode="numeric"
                    min={1}
                    max={31}
                    value={recurring.dayOfMonth}
                    onChange={(e) => setRecurring((r) => ({ ...r, dayOfMonth: e.target.value }))}
                    aria-label="Day of month"
                    data-testid="recurring-day-month"
                  />
                </Fld>
              ) : (
                <Fld label="Day of week" hint="1 = Monday … 7 = Sunday">
                  <input
                    className="input"
                    inputMode="numeric"
                    min={1}
                    max={7}
                    value={recurring.dayOfWeek}
                    onChange={(e) => setRecurring((r) => ({ ...r, dayOfWeek: e.target.value }))}
                    aria-label="Day of week"
                    data-testid="recurring-day-week"
                  />
                </Fld>
              )}
              <Fld label="Schedule name in QuickBooks" hint="Shows in Recurring Transactions">
                <input
                  className="input"
                  value={recurring.name}
                  onChange={(e) => setRecurring((r) => ({ ...r, name: e.target.value }))}
                  aria-label="Recurring name"
                  data-testid="recurring-name"
                />
              </Fld>
            </div>
          ) : null}
        </div>
      ) : null}

      <button type="button" className="btn-brand w-full mb-2" disabled={saving} onClick={submitLocal} data-testid="doc-save-close">
        Save on job
      </button>
      <button type="button" className="btn bg-brand-soft text-brand w-full mb-2" disabled={saving} onClick={() => submitSync(false)} data-testid="doc-save-sync">
        Save &amp; sync to QuickBooks
      </button>
      <button
        type="button"
        className="btn bg-brand-soft text-brand w-full"
        disabled={saving || !job.email}
        onClick={() => submitSync(true)}
        data-testid="doc-save-sync-send"
      >
        Save &amp; sync &amp; send{job.email ? " to " + job.email : ""}
      </button>
      {!job.email ? <p className="text-[11px] text-slate-400 text-center mt-2">Add email on the customer card to enable send.</p> : null}
    </Sheet>
  );
}