// Build a QuickBooks estimate or invoice — line items, service address, attachments.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import DescriptionField, { PolishButton } from "./DescriptionField.jsx";
import { DOC_SOURCE_LOCAL, DOC_SOURCE_QBO } from "../lib/docSource.js";
import CustomerSearch from "./CustomerSearch.jsx";
import { useStore } from "../state/store.jsx";
import { useTenantConfig } from "../state/tenant.jsx";
import { isQuickbooksEnabled, resolveDocSource } from "../lib/qboEnabled.js";
import { useAppSettings } from "../lib/appSettings.js";
import {
  EMAIL_POLICY_KEEP,
  EMAIL_POLICY_ONCE,
  sendEmailDiffersFromCustomer,
} from "../lib/sendDocConfirm.js";
import { defaultQboItems, filterQboItems } from "../data/qboItems.js";
import ServiceAddressField from "./ServiceAddressField.jsx";
import AddressAutocompleteField from "./AddressAutocompleteField.jsx";
import { emptyLine, initialLines, lineAmount, linesTotal } from "../lib/qboDoc.js";
import { planDocSaveLocal, planDocSaveSync } from "../lib/docSync.js";
import { enqueueCustomerQboSync } from "../lib/customerQboEnqueue.js";
import { stashPendingDocSync } from "../lib/docSyncChain.js";
import { fmt$, parseAmount } from "../lib/format.js";
import {
  discountInputFromJob,
  docTotalAfterDiscount,
  resolveDiscountAmount,
} from "../lib/docDiscount.js";
import {
  bestChangeOrderSource,
  canAddChangeOrder,
  changeOrderDocLabel,
  isChangeOrderJob,
  nextChangeOrderSeq,
  preferredChangeOrderDocNo,
  tagChangeOrderPatch,
} from "../lib/changeOrder.js";
import Toggle from "./Toggle.jsx";

import { enrichAndPatchCustomer } from "./NewJobFlow.jsx";
import {
  applyDueAmountToLines,
  applyProgressPctToLines,
  contractTotalForJob,
  contractTotalFromEstimate,
  dueFromContract,
  isProgressBillingContext,
  progressPctFromLines,
  roundQty,
} from "../lib/progressBilling.js";
import { RECUR_INTERVALS, defaultRecurringState } from "../lib/recurringBilling.js";
import { resumeFollowUpPrompts } from "../lib/calendarNavigate.js";

/** Compact line: product chip, one-line description, rate/qty/progress beside it. */
function LineRow({
  line,
  index,
  items,
  onChange,
  onRemove,
  canRemove,
  progressMode,
  adjustMode,
  onAdjustModeChange,
  onLineProgress,
}) {
  const [itemQ, setItemQ] = useState(line.itemName || "");
  const [open, setOpen] = useState(false);
  // After a catalog pick, collapse the name into a small square chip until reopened.
  const [itemPicked, setItemPicked] = useState(() => !!(line.itemName || "").trim());
  const picks = useMemo(() => filterQboItems(items, itemQ), [items, itemQ]);
  const rate = parseAmount(line.unitPrice) || 0;
  const qty = parseAmount(line.qty) || 0;
  const due = lineAmount(line);
  // Progress % from fractional qty (QBO style: full rate × progress qty).
  const linePct = rate > 0 && qty > 0 ? Math.round(qty * 10000) / 100 : qty * 100;
  const progressDisplay = adjustMode === "pct" ? String(linePct || "") : String(due || "");
  const showChip = itemPicked && !!(line.itemName || itemQ || "").trim() && !open;

  const pick = (it) => {
    onChange(index, {
      itemName: it.name,
      itemId: it.id || "",
      unitPrice: it.price != null ? it.price : line.unitPrice,
      description: line.description || it.description || "",
    });
    setItemQ(it.name);
    setItemPicked(true);
    setOpen(false);
  };

  const reOpenItem = () => {
    setOpen(true);
    setItemPicked(false);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-2 py-2 mb-2 space-y-1.5" data-testid="doc-line-row">
      <div className="flex items-start gap-1.5">
        {showChip ? (
          <button
            type="button"
            className="shrink-0 w-11 h-11 rounded-lg border border-slate-200 bg-slate-50 px-1 flex items-center justify-center text-[10px] font-bold leading-tight text-slate-800 text-center break-words overflow-hidden"
            onClick={reOpenItem}
            title={line.itemName || itemQ}
            aria-label={"Product service line " + (index + 1) + " — change"}
            data-testid={"doc-line-item-chip-" + (index + 1)}
          >
            <span className="line-clamp-3">{shortItemLabel(line.itemName || itemQ)}</span>
          </button>
        ) : (
          <div className="relative flex-1 min-w-0">
            <input
              className="input !py-2 text-sm"
              value={itemQ}
              onChange={(e) => {
                setItemQ(e.target.value);
                onChange(index, { itemName: e.target.value });
                setOpen(true);
                setItemPicked(false);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                // Collapse to chip if a name is set; delay so pick click still fires.
                window.setTimeout(() => {
                  if ((line.itemName || itemQ || "").trim()) {
                    setItemPicked(true);
                    setOpen(false);
                  }
                }, 150);
              }}
              placeholder="Search item…"
              aria-label={"Product service line " + (index + 1)}
              data-testid={"doc-line-item-" + (index + 1)}
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
        )}
        {canRemove ? (
          <button
            type="button"
            className="shrink-0 text-xs font-semibold text-red-500 px-1 py-2"
            onClick={() => onRemove(index)}
            data-testid={"doc-line-remove-" + (index + 1)}
            aria-label={"Remove line " + (index + 1)}
          >
            ✕
          </button>
        ) : null}
      </div>

      {/* Description + rate / qty / progress on one parallel row */}
      <div className="flex flex-wrap items-start gap-1.5" data-testid={"doc-line-metrics-" + (index + 1)}>
        <div className="flex-1 min-w-[10rem]">
          <DescriptionField
            value={line.description || ""}
            onChange={(v) => onChange(index, { description: v })}
            testId={"doc-line-desc-" + (index + 1)}
            ariaLabel={"Description line " + (index + 1)}
            showPolish={false}
            compact
            bare
            placeholder="Description…"
          />
        </div>
        {progressMode ? (
          <div className="flex items-center gap-0.5 shrink-0" data-testid={"doc-line-progress-" + (index + 1)}>
            <input
              className="input !w-[3.5rem] !px-1 !py-2 text-center text-sm"
              inputMode="decimal"
              value={progressDisplay}
              onChange={(e) => onLineProgress && onLineProgress(index, e.target.value)}
              aria-label={"Progress line " + (index + 1)}
              data-testid={"progress-line-edit-" + (index + 1)}
              title="Progress"
              placeholder="Prog"
            />
            <button
              type="button"
              className="h-9 min-w-[1.75rem] px-1 rounded-lg border border-slate-200 bg-white text-[11px] font-extrabold text-slate-700"
              onClick={() => onAdjustModeChange && onAdjustModeChange(adjustMode === "pct" ? "amount" : "pct")}
              aria-label={adjustMode === "pct" ? "Switch progress to dollars" : "Switch progress to percent"}
              data-testid={"progress-mode-toggle-" + (index + 1)}
              title={adjustMode === "pct" ? "Showing percent — tap for $" : "Showing dollars — tap for %"}
            >
              {adjustMode === "pct" ? "%" : "$"}
            </button>
          </div>
        ) : null}
        <input
          className="input !w-[4.25rem] !px-1.5 !py-2 text-sm text-right shrink-0"
          inputMode="decimal"
          value={line.unitPrice}
          onChange={(e) => onChange(index, { unitPrice: e.target.value })}
          aria-label={"Rate line " + (index + 1)}
          title={progressMode ? "Rate (full)" : "Rate"}
          placeholder="Rate"
        />
        <input
          className="input !w-[3.25rem] !px-1 !py-2 text-sm text-center shrink-0"
          inputMode="decimal"
          value={line.qty}
          onChange={(e) => onChange(index, { qty: e.target.value })}
          aria-label={"Quantity line " + (index + 1)}
          title="Qty"
          placeholder="Qty"
        />
        {progressMode ? (
          <div
            className="shrink-0 input !w-auto min-w-[3.75rem] !px-1.5 !py-2 bg-slate-50 text-slate-700 font-semibold text-right text-sm"
            aria-label={"Due line " + (index + 1)}
            data-testid={"doc-line-amount-" + (index + 1)}
          >
            {fmt$(due)}
          </div>
        ) : (
          <div
            className="shrink-0 input !w-auto min-w-[3.75rem] !px-1.5 !py-2 bg-slate-50 text-slate-700 font-semibold text-right text-sm"
            data-testid={"doc-line-amount-" + (index + 1)}
          >
            {fmt$(lineAmount(line))}
          </div>
        )}
        <PolishButton
          compact
          value={line.description || ""}
          onChange={(v) => onChange(index, { description: v })}
          testId={"doc-line-desc-" + (index + 1)}
        />
      </div>
    </div>
  );
}

/** Short label for the product chip (first words, max ~18 chars). */
function shortItemLabel(name) {
  const s = String(name || "").trim();
  if (!s) return "?";
  if (s.length <= 18) return s;
  const cut = s.slice(0, 17);
  const sp = cut.lastIndexOf(" ");
  return (sp > 6 ? cut.slice(0, sp) : cut) + "…";
}

function CustomerHeaderPanel({ job, allJobs, events, api, onPatch }) {
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
      <Fld label="Billing address" hint="Your saved addresses first, then real-world matches as you type">
        <AddressAutocompleteField
          label="Billing address"
          value={job.billingAddress || ""}
          onChange={(v) => onPatch({ billingAddress: v })}
          jobs={allJobs}
          events={events}
          suggestAddresses={api.suggestAddresses?.bind(api)}
          testId="doc-billing"
          ariaLabel="Billing address"
        />
      </Fld>
      <Fld label="Job title / scope" hint="What this invoice is for">
        <input className="input" value={job.title || ""} onChange={set("title")} aria-label="Job title" />
      </Fld>
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
  const { patchAndSave, enqueue, logSend, showToast, api, createJob, jobs: storeJobs, events } = useStore();
  // Short trading name for the customer email draft — the legal name lives on
  // the document itself, not in the covering message.
  const tenantConfig = useTenantConfig();
  const tenantShortName = tenantConfig.profile?.shortName || "";
  const appSettings = useAppSettings();
  void appSettings.quickbooks;
  const qboOn = isQuickbooksEnabled(tenantConfig);
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
  const [attUploading, setAttUploading] = useState(false);
  // Starts empty and fills in asynchronously: LE's internal catalogue is a
  // separate chunk (see data/qboItems.js), so it cannot be read synchronously.
  // A non-internal tenant resolves to [] with no fetch at all, and keeps an
  // empty picker until their own QuickBooks items sync in.
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [emailSheet, setEmailSheet] = useState(false);
  const [sendEmails, setSendEmails] = useState(() => job.email || "");
  const [emailPolicy, setEmailPolicy] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [includePayLink, setIncludePayLink] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setSendEmails(job.email || "");
  }, [job.email]);
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
  // Document-level discount: $ off the total, or % of line subtotal.
  const seedDisc = discountInputFromJob(job);
  const [discountType, setDiscountType] = useState(seedDisc.type);
  const [discountValue, setDiscountValue] = useState(
    seedDisc.value > 0 ? String(seedDisc.value) : ""
  );
  // Toggle to mark this invoice/estimate as a change order (CO) — enable or disable anytime.
  const alreadyCo = isChangeOrderJob(job);
  const [asChangeOrder, setAsChangeOrder] = useState(() => isChangeOrderJob(jobProp || job));
  useEffect(() => {
    setAsChangeOrder(isChangeOrderJob(job));
  }, [job.changeOrder, job.changeOrderSeq, job.changeOrderLabel, job.title, job.invoiceNo, job.estimateNo]);
  const coSource = useMemo(
    () => bestChangeOrderSource(boardJobs, job) || job,
    [boardJobs, job]
  );
  // Always allow flip on/off when we have a job context (create or edit).
  const canToggleCo = !!(job?.id || coSource?.invoiceNo || coSource?.estimateNo || coSource?.id || alreadyCo || asChangeOrder);
  const coPreview =
    asChangeOrder || alreadyCo
      ? preferredChangeOrderDocNo(
          alreadyCo
            ? job
            : {
                ...job,
                ...tagChangeOrderPatch(
                  job,
                  coSource,
                  nextChangeOrderSeq(boardJobs, coSource, kind),
                  kind
                ),
              },
          kind
        ) ||
        changeOrderDocLabel(coSource, kind, nextChangeOrderSeq(boardJobs, coSource, kind))
      : "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Seed with the built-in catalogue first. For LE this awaits a lazy
      // chunk; for every other tenant it resolves to [] immediately and
      // fetches nothing. The tenant's own synced QuickBooks items then
      // replace the seed when they arrive — remote always wins.
      try {
        const seed = await defaultQboItems();
        if (!cancelled && seed.length) setItems(seed);
      } catch {}
      try {
        const remote = await api.searchItems("");
        if (!cancelled && remote && remote.length) setItems(remote);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const subtotal = useMemo(() => linesTotal(lines), [lines]);
  const discountDollars = useMemo(
    () =>
      resolveDiscountAmount(subtotal, {
        type: discountType,
        value: discountValue,
      }),
    [subtotal, discountType, discountValue]
  );
  const total = useMemo(
    () =>
      docTotalAfterDiscount(subtotal, {
        type: discountType,
        value: discountValue,
      }),
    [subtotal, discountType, discountValue]
  );
  const title =
    mode === "edit"
      ? "Edit " + (kind === "estimate" ? "estimate" : "invoice")
      : kind === "estimate"
      ? "Generate estimate"
      : mode === "from_estimate" || mode === "turn_from_estimate"
      ? "Invoice from estimate" + (progressPct != null ? " (" + progressPct + "%)" : "")
      : "Create invoice";

  const applyCoToggle = (on) => {
    if (!canToggleCo) return;
    setAsChangeOrder(!!on);
    if (on) {
      // Turning on a brand-new CO: block if another unfinished CO is open.
      // Re-enabling or editing an existing CO always allowed.
      if (!alreadyCo && !canAddChangeOrder(boardJobs, coSource)) {
        showToast("Finish the open change order first — save, email, and confirm in QuickBooks");
        setAsChangeOrder(false);
        return;
      }
      const seq =
        Number(job.changeOrderSeq) > 0
          ? Number(job.changeOrderSeq)
          : nextChangeOrderSeq(boardJobs, coSource, kind);
      const patch = tagChangeOrderPatch(job, coSource, seq, kind);
      patchJobState(patch);
    } else {
      // Explicit false so heuristics (title / CO in doc #) do not re-force it on.
      patchJobState({
        changeOrder: false,
        changeOrderKind: "",
        changeOrderSourceId: "",
        changeOrderSeq: 0,
        changeOrderLabel: "",
      });
    }
  };

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

  /** Per-line progress: % sets fractional qty; $ sets qty = due / full rate. */
  const onLineProgress = useCallback(
    (index, raw) => {
      const val = parseAmount(raw);
      setLines((rows) =>
        rows.map((ln, i) => {
          if (i !== index) return ln;
          const rate = parseAmount(ln.unitPrice) || 0;
          if (adjustMode === "pct") {
            const pct = Math.min(100, Math.max(0, val));
            setProgressPctEdit(String(pct));
            return {
              ...ln,
              qty: roundQty(pct / 100),
              progressBilling: pct < 99.99,
            };
          }
          if (!rate) return { ...ln, unitPrice: val, qty: 1, progressBilling: true };
          const qty = roundQty(val / rate);
          setAmountDueEdit(String(val));
          return { ...ln, qty, progressBilling: qty < 0.9999 };
        })
      );
      if (adjustMode === "pct") {
        setProgressPctEdit(String(val));
      } else {
        setAmountDueEdit(String(raw));
      }
    },
    [adjustMode]
  );

  const onPickDocFile = async (e) => {
    const file = (e.target.files && e.target.files[0]) || null;
    e.target.value = "";
    if (!file) return;
    setAttUploading(true);
    try {
      const { uploadChatAttachment } = await import("../lib/chatAttach.js");
      const fileUrl = await uploadChatAttachment(file);
      const base = String(file.name || "file").replace(/\.[^.]+$/, "") || file.name || "Attachment";
      setAttachments((a) =>
        a.concat([
          {
            id: "att-" + Date.now(),
            name: base,
            url: fileUrl,
            mime: file.type || "",
            attachToEmail: true,
          },
        ])
      );
      showToast("File attached");
    } catch (err) {
      showToast("Couldn't attach file — " + (err?.message || "try again"));
    } finally {
      setAttUploading(false);
    }
  };

  const toggleAttEmail = (key) => {
    setAttachments((rows) =>
      rows.map((a) =>
        a.id === key || a.name === key ? { ...a, attachToEmail: a.attachToEmail === false } : a
      )
    );
  };

  const emailAttachments = () => attachments.filter((a) => a.attachToEmail !== false);

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

  const validate = (send, emailOverride) => {
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
    const to = String(emailOverride != null ? emailOverride : job.email || "")
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (send && !to.length) {
      showToast("Add customer email to send");
      return null;
    }
    return valid;
  };

  const primaryEmail = (raw) =>
    String(raw || "")
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)[0] || "";

  const emailDiffers = (raw) =>
    sendEmailDiffersFromCustomer(primaryEmail(raw != null ? raw : sendEmails), job.email);

  const downloadLocalPdf = async (jobForPdf) => {
    try {
      const { buildInvoicePdfFromJob, buildEstimatePdfFromJob } = await import("../lib/invoicePdf.js");
      const { downloadPdfBlob } = await import("../lib/pdfOpen.js");
      const { docPdfFilename } = await import("../lib/jobToQbDoc.js");
      const blob =
        kind === "estimate"
          ? buildEstimatePdfFromJob(jobForPdf)
          : buildInvoicePdfFromJob(jobForPdf);
      if (!blob) return;
      const no = kind === "invoice" ? jobForPdf.invoiceNo : jobForPdf.estimateNo;
      const filename = docPdfFilename(kind, jobForPdf, no || "DRAFT") || `${kind}-draft.pdf`;
      downloadPdfBlob(blob, filename);
    } catch {
      /* non-fatal — save still succeeded */
    }
  };

  const coTagsFromJob = (j) => {
    // Persist explicit off so save doesn't re-tag from title/doc heuristics.
    if (j?.changeOrder === false) {
      return {
        changeOrder: false,
        changeOrderKind: "",
        changeOrderSourceId: "",
        changeOrderSeq: 0,
        changeOrderLabel: "",
      };
    }
    if (!j?.changeOrder && !isChangeOrderJob(j)) return {};
    return {
      changeOrder: true,
      changeOrderKind: j.changeOrderKind || kind,
      changeOrderSourceId: j.changeOrderSourceId || "",
      changeOrderSeq: j.changeOrderSeq || 0,
      changeOrderLabel: j.changeOrderLabel || preferredChangeOrderDocNo(j, kind) || "",
    };
  };

  const buildPdfJob = (activeJob, jobPatch) => ({
    ...activeJob,
    ...jobPatch,
    invoiceNo:
      jobPatch.invoiceNo ||
      activeJob.invoiceNo ||
      jobPatch._preferredInvoiceNo ||
      preferredChangeOrderDocNo(activeJob, "invoice") ||
      "DRAFT",
    estimateNo:
      jobPatch.estimateNo ||
      activeJob.estimateNo ||
      jobPatch._preferredEstimateNo ||
      preferredChangeOrderDocNo(activeJob, "estimate") ||
      "DRAFT",
  });

  /** @param {{ close?: boolean, printPdf?: boolean, toast?: string }} opts */
  const submitLocal = async (opts = {}) => {
    const close = opts.close !== false;
    const printPdf = !!opts.printPdf;
    const valid = validate(false);
    if (!valid) return null;

    setSaving(true);
    try {
      const jobId = await ensureJobId();
      if (!jobId) return null;
      const activeJob = { ...job, id: jobId };
      const { jobPatch } = planDocSaveLocal(activeJob, {
        kind,
        mode,
        lines: valid,
        serviceAddress,
        apartment,
        progressPct: progressPctEdit,
        contractAmount,
        discountType,
        discountValue,
      });
      Object.assign(jobPatch, coTagsFromJob(activeJob));
      if (attachments.length) {
        jobPatch.attachments = (job.attachments || []).concat(attachments);
      }
      await patchAndSave(jobId, jobPatch);
      const pdfJob = buildPdfJob(activeJob, jobPatch);
      if (printPdf) await downloadLocalPdf(pdfJob);
      showToast(
        opts.toast ||
          (printPdf
            ? "Saved + printed " + (kind === "estimate" ? "estimate" : "invoice") + " PDF"
            : "Saved on job — sync or email when ready")
      );
      resumeFollowUpPrompts();
      onDone && onDone(activeJob);
      if (close) onClose();
      return pdfJob;
    } finally {
      setSaving(false);
    }
  };

  const printPdfOnly = async () => {
    const valid = validate(false);
    if (!valid) return;
    const activeJob = { ...job, id: job.id || "draft" };
    const { jobPatch } = planDocSaveLocal(activeJob, {
      kind,
      mode,
      lines: valid,
      serviceAddress,
      apartment,
      progressPct: progressPctEdit,
      contractAmount,
      discountType,
      discountValue,
    });
    Object.assign(jobPatch, coTagsFromJob(activeJob));
    await downloadLocalPdf(buildPdfJob(activeJob, jobPatch));
    showToast("Opening " + (kind === "estimate" ? "estimate" : "invoice") + " PDF");
  };

  /**
   * @param {boolean} send
   * @param {{ email?: string, message?: string, includePaymentLink?: boolean, docSource?: string, close?: boolean }} opts
   */
  const submitSync = async (send, opts = {}) => {
    const emailTo = primaryEmail(opts.email != null ? opts.email : sendEmails) || job.email || "";
    const valid = validate(send, emailTo);
    if (!valid) return;

    setSaving(true);
    try {
      const jobId = await ensureJobId();
      if (!jobId) {
        setSaving(false);
        return;
      }
      // Keep this email → update customer. Use it once → send only; job/PDF keep saved email.
      const policy = opts.emailPolicy || emailPolicy || "";
      const differs = sendEmailDiffersFromCustomer(emailTo, job.email);
      const keepOnCustomer = !!(emailTo && (!differs || policy === EMAIL_POLICY_KEEP));
      const savedEmail = keepOnCustomer ? emailTo : job.email || "";
      const activeJob = { ...job, id: jobId, email: savedEmail };
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
        discountType,
        discountValue,
      });
      Object.assign(jobPatch, coTagsFromJob(activeJob));
      if (keepOnCustomer) jobPatch.email = emailTo;
      else delete jobPatch.email;

      await patchAndSave(jobId, jobPatch);

      const needsCustomer =
        mode !== "edit" && !String(activeJob.qboCustomerId || "").trim();

      const attsForEmail = send ? emailAttachments() : attachments;
      const attsForQbo = attachments;
      const docSource = resolveDocSource(
        opts.docSource === DOC_SOURCE_LOCAL ? DOC_SOURCE_LOCAL : DOC_SOURCE_QBO
      );
      const withPay = !!(opts.includePaymentLink && kind === "invoice");
      const customMsg = String(opts.message || sendMessage || "").trim();

      if (needsCustomer && docSource === DOC_SOURCE_QBO) {
        stashPendingDocSync(jobId, {
          commands,
          attachments: attsForQbo,
          emailAttachments: attsForEmail,
          send,
          kind,
          email: emailTo,
          message: customMsg,
          includePaymentLink: withPay,
          docSource,
        });
        enqueueCustomerQboSync(enqueue, jobId, activeJob, "");
        showToast(
          send
            ? "Setting up customer in QuickBooks first — then your " +
              (kind === "estimate" ? "estimate" : "invoice") +
              " will go out to " +
              emailTo
            : "Setting up customer in QuickBooks first — then your " +
              (kind === "estimate" ? "estimate" : "invoice") +
              " will sync"
        );
      } else if (docSource === DOC_SOURCE_LOCAL && send) {
        // Local PDF + email now (client generates PDF). No QuickBooks create/update.
        const noKey = kind === "estimate" ? "estimateNo" : "invoiceNo";
        const no =
          jobPatch[noKey] ||
          activeJob[noKey] ||
          jobPatch[kind === "invoice" ? "_preferredInvoiceNo" : "_preferredEstimateNo"] ||
          preferredChangeOrderDocNo(activeJob, kind) ||
          "DRAFT";
        const pdfJob = buildPdfJob(activeJob, {
          ...jobPatch,
          [noKey]: no,
          email: emailTo || activeJob.email || "",
        });
        showToast("Sending local " + (kind === "estimate" ? "estimate" : "invoice") + " to " + emailTo + "…");
        let res = null;
        try {
          if (typeof api.sendDocEmailNow === "function") {
            res = await api.sendDocEmailNow(pdfJob, kind, {
              email: emailTo,
              includePaymentLink: withPay,
              message: customMsg,
            });
          }
        } catch (err) {
          res = { ok: false, error: String(err?.message || err) };
        }
        // Always log + enqueue so Activity shows the attempt (and host can retry if needed).
        const payload =
          kind === "invoice"
            ? {
                email: emailTo,
                invoiceNo: no,
                customer: activeJob.customer || "",
                amount: String(total || "").replace(/[$,]/g, ""),
                includePaymentLink: withPay,
                docSource: DOC_SOURCE_LOCAL,
                message: customMsg,
                attachments: attsForEmail,
                includeAttachmentsInEmail: attsForEmail.length > 0,
                job: pdfJob,
                clientSend: res || undefined,
              }
            : {
                email: emailTo,
                estimateNo: no,
                docSource: DOC_SOURCE_LOCAL,
                message: customMsg,
                attachments: attsForEmail,
                includeAttachmentsInEmail: attsForEmail.length > 0,
                job: pdfJob,
                clientSend: res || undefined,
              };
        if (res?.ok && res.sent) {
          logSend(
            jobId,
            (kind === "estimate" ? "Estimate" : "Invoice") +
              " emailed (local PDF)" +
              (withPay ? " + payment link" : ""),
            emailTo
          );
          await downloadLocalPdf(pdfJob);
          showToast(
            "Emailed " + (kind === "estimate" ? "estimate" : "invoice") + " to " + emailTo
          );
        } else if (res?.dryRun || res?.reason === "no_api_key") {
          showToast(
            "Email not set up on the server yet — nothing was sent. Use Send through QB for now."
          );
          setSaving(false);
          return;
        } else if (res?.skipped || res?.reason === "test_email_unset" || res?.reason === "no_recipient") {
          showToast("Could not send — check the email address and try again.");
          setSaving(false);
          return;
        } else if (res && !res.ok) {
          // Fall back to command bus so host/listener can retry.
          await enqueue(
            "send_" + kind,
            jobId,
            payload,
            "deterministic",
            "send_" + kind + ":local:" + (no || jobId) + ":" + Date.now()
          );
          logSend(
            jobId,
            (kind === "estimate" ? "Estimate" : "Invoice") +
              " local send queued" +
              (withPay ? " + payment link" : ""),
            emailTo
          );
          await downloadLocalPdf(pdfJob);
          showToast(
            "Queued local email to " +
              emailTo +
              (res.error || res.reason ? " (" + String(res.error || res.reason).slice(0, 60) + ")" : "")
          );
        } else {
          // No client API — queue for host listener (legacy).
          await enqueue(
            "send_" + kind,
            jobId,
            payload,
            "deterministic",
            "send_" + kind + ":local:" + (no || jobId)
          );
          logSend(
            jobId,
            (kind === "estimate" ? "Estimate" : "Invoice") +
              " local send queued" +
              (withPay ? " + payment link" : ""),
            emailTo
          );
          await downloadLocalPdf(pdfJob);
          showToast("Sending local " + (kind === "estimate" ? "estimate" : "invoice") + " to " + emailTo + "…");
        }
      } else {
        for (let i = 0; i < commands.length; i++) {
          const cmd = commands[i];
          const payload = {
            ...cmd.payload,
            email: emailTo || cmd.payload.email,
            message: customMsg || undefined,
            includePaymentLink: send ? withPay : undefined,
            attachments: i === 0 ? (send ? attsForEmail : attsForQbo) : [],
            includeAttachmentsInEmail: send ? attsForEmail.length > 0 : undefined,
          };
          await enqueue(cmd.type, jobId, payload, "judgment", cmd.idk);
        }

        for (const att of attsForQbo) {
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
              attachToEmail: att.attachToEmail !== false,
            },
            "deterministic",
            "att:" + kind + ":" + jobId + ":" + att.name + ":" + Date.now()
          );
        }

        if (send && emailTo) {
          const noKey = kind === "estimate" ? "estimateNo" : "invoiceNo";
          const no = activeJob[noKey];
          if (no) {
            await enqueue(
              "send_" + kind,
              jobId,
              {
                email: emailTo,
                [noKey]: no,
                message: customMsg || undefined,
                includePaymentLink: withPay,
                docSource: DOC_SOURCE_QBO,
                attachments: attsForEmail,
                includeAttachmentsInEmail: attsForEmail.length > 0,
              },
              "deterministic",
              "send_" + kind + ":" + no
            );
            logSend(
              jobId,
              (kind === "estimate" ? "Estimate" : "Invoice") +
                " send queued after create" +
                (withPay ? " + payment link" : ""),
              emailTo
            );
          }
        }

        await downloadLocalPdf(buildPdfJob(activeJob, jobPatch));

        const recurNote =
          showRecurring && recurring.enabled ? " + recurring schedule in QuickBooks" : "";
        const attNote =
          send && attachments.length
            ? attsForEmail.length
              ? " · " + attsForEmail.length + " file(s) in email"
              : " · files on job only (not emailed)"
            : "";
        showToast(
          send
            ? "Sending to QuickBooks and emailing " + emailTo + recurNote + attNote + "…"
            : "Sending " + (kind === "estimate" ? "estimate" : "invoice") + " to QuickBooks" + recurNote + "…"
        );
      }
      resumeFollowUpPrompts();
      onDone && onDone(activeJob);
      if (opts.close !== false) {
        setEmailSheet(false);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title={title + (job.customer ? " — " + job.customer : "")} onClose={onClose} wide>
      {editableCustomer ? (
        <CustomerHeaderPanel job={job} allJobs={boardJobs} events={events} api={api} onPatch={patchJobState} />
      ) : (
        <p className="text-[11px] text-slate-400 -mt-1 mb-3">
          Pre-filled from job info. Line items use exact QuickBooks Products &amp; Services names.
        </p>
      )}

      {/* Address + apt + CO on one condensed row */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3" data-testid="doc-address-row">
        <ServiceAddressField
          job={job}
          jobs={boardJobs}
          events={events}
          value={serviceAddress}
          onChange={setServiceAddress}
          onApartmentChange={setApartment}
          suggestAddresses={api.suggestAddresses?.bind(api)}
          testId="doc-service-address"
          partialOk={false}
          sitePicker="dropdown"
          compact
        />
        <input
          className="input !w-[4.5rem] !px-2 !py-2 text-sm shrink-0"
          value={apartment}
          onChange={(e) => setApartment(e.target.value)}
          aria-label="Apartment"
          placeholder="Apt"
          data-testid="doc-apartment"
          title="Apartment / unit"
        />
        {canToggleCo || alreadyCo || asChangeOrder ? (
          <div className="flex items-center gap-1.5 shrink-0 ml-auto" data-testid="doc-co-toggle-row">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">CO</span>
            <Toggle
              on={!!(asChangeOrder || alreadyCo)}
              onChange={applyCoToggle}
              label={
                asChangeOrder || alreadyCo
                  ? coPreview
                    ? "Change order on — " + coPreview
                    : "Change order on"
                  : "Change order off"
              }
              small
            />
          </div>
        ) : null}
      </div>

      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mt-1 mb-1.5">
        Line items
      </p>
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
          adjustMode={adjustMode}
          onAdjustModeChange={setAdjustMode}
          onLineProgress={onLineProgress}
        />
      ))}
      <button
        type="button"
        className="btn-ghost w-full !py-1.5 mb-3 text-sm"
        onClick={() => setLines((rows) => rows.concat([emptyLine()]))}
        data-testid="doc-add-line"
      >
        ＋ Add line
      </button>

      {/* Discount left + total right — one footer line */}
      <div
        className="flex flex-wrap items-center gap-2 px-1 mb-3"
        data-testid="doc-discount-panel"
      >
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs font-bold text-slate-500 shrink-0">Disc</span>
          <button
            type="button"
            className="h-9 min-w-[2rem] px-1.5 rounded-lg border border-slate-200 bg-white text-sm font-extrabold text-slate-700"
            onClick={() => {
              // Keep the typed number; only switch unit so 10% vs $10 is intentional.
              setDiscountType((t) => (t === "percent" ? "amount" : "percent"));
            }}
            aria-label={
              discountType === "percent" ? "Switch discount to dollars" : "Switch discount to percent"
            }
            data-testid="doc-discount-mode-toggle"
            title={discountType === "percent" ? "Percent — tap for $" : "Dollars — tap for %"}
          >
            {discountType === "percent" ? "%" : "$"}
          </button>
          <input
            className="input !w-[4.5rem] !px-1.5 !py-2 text-sm"
            inputMode="decimal"
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            placeholder={discountType === "percent" ? "0" : "0"}
            aria-label="Discount value"
            data-testid="doc-discount-input"
          />
          {discountDollars > 0 ? (
            <span className="text-xs font-semibold text-red-600 shrink-0" data-testid="doc-discount-applied">
              −{fmt$(discountDollars)}
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-baseline gap-1.5" data-testid="doc-total-row">
          {discountDollars > 0 ? (
            <span className="text-[11px] font-semibold text-slate-400" data-testid="doc-subtotal-row">
              Sub {fmt$(subtotal) || "$0"}
            </span>
          ) : null}
          <span className="text-sm font-bold text-slate-600">Total</span>
          <span className="text-lg font-extrabold text-slate-900" data-testid="doc-total">
            {fmt$(total) || "$0"}
          </span>
        </div>
      </div>

      {attachments.length ? (
        <div className="mb-3 space-y-1" data-testid="doc-attachments-list">
          {attachments.map((a, i) => (
            <div
              key={a.id || i}
              className="text-sm flex flex-wrap items-center gap-2 py-1.5 border-b border-dashed border-slate-200"
              data-testid="doc-attachment-row"
            >
              <span className="flex-1 truncate min-w-[6rem]">📎 {a.name}</span>
              <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={a.attachToEmail !== false}
                  onChange={() => toggleAttEmail(a.id || a.name)}
                  data-testid="doc-att-email-toggle"
                  aria-label={"Include " + (a.name || "file") + " in email"}
                />
                Email
              </label>
              <button
                type="button"
                className="text-red-500 text-xs"
                onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))}
                aria-label={"Remove " + a.name}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
        onChange={onPickDocFile}
        disabled={attUploading}
        data-testid="doc-attach-file"
      />

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

      <div className="grid grid-cols-4 gap-1.5 mb-1" data-testid="doc-action-bar">
        <button
          type="button"
          className="btn !py-2 !px-1.5 text-xs sm:text-sm bg-slate-50 text-slate-800 border border-slate-200"
          disabled={saving || attUploading}
          onClick={() => fileInputRef.current?.click()}
          data-testid="doc-attach-btn"
        >
          {attUploading ? "…" : "📎 Attach"}
        </button>
        <button
          type="button"
          className="btn !py-2 !px-1.5 text-xs sm:text-sm bg-slate-50 text-slate-800 border border-slate-200"
          disabled={saving}
          onClick={() => submitLocal({ close: false, toast: "Saved" })}
          data-testid="doc-save"
        >
          Save
        </button>
        <button
          type="button"
          className="btn !py-2 !px-1.5 text-xs sm:text-sm bg-slate-50 text-slate-800 border border-slate-200"
          disabled={saving}
          onClick={printPdfOnly}
          data-testid="doc-print-pdf"
        >
          🖨 Print PDF
        </button>
        <button
          type="button"
          className="btn-brand !py-2 !px-1.5 text-xs sm:text-sm"
          disabled={saving}
          onClick={() => {
            setSendEmails(job.email || sendEmails || "");
            if (!sendMessage) {
              setSendMessage(
                "Please find your " +
                  (kind === "estimate" ? "estimate" : "invoice") +
                  " attached. Thank you for choosing " +
                  tenantShortName +
                  "."
              );
            }
            setEmailSheet(true);
          }}
          data-testid="doc-sync-email"
        >
          Save &amp; Email
        </button>
      </div>

      {emailSheet ? (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 p-3"
          data-testid="doc-email-sheet"
          role="dialog"
          aria-label="Sync and email"
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-extrabold text-slate-900">Sync &amp; Email</h3>
              <button
                type="button"
                className="text-slate-400 text-xl leading-none px-2"
                onClick={() => setEmailSheet(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <Fld label="Send to" hint="Separate multiple emails with a comma">
              <input
                className="input"
                type="email"
                multiple
                value={sendEmails}
                onChange={(e) => {
                  setSendEmails(e.target.value);
                  setEmailPolicy("");
                }}
                placeholder="customer@email.com"
                aria-label="Email recipients"
                data-testid="doc-send-emails"
              />
            </Fld>
            {emailDiffers(sendEmails) ? (
              <div
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 mb-3"
                data-testid="doc-email-policy"
              >
                <p className="text-sm font-semibold text-amber-900 mb-2">
                  Different from the customer&apos;s saved email. Keep it or use once?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`btn !py-2 text-sm ${
                      emailPolicy === EMAIL_POLICY_KEEP
                        ? "bg-brand text-white"
                        : "bg-white border border-amber-200 text-slate-800"
                    }`}
                    onClick={() => setEmailPolicy(EMAIL_POLICY_KEEP)}
                    data-testid="doc-email-keep"
                  >
                    Keep this email
                  </button>
                  <button
                    type="button"
                    className={`btn !py-2 text-sm ${
                      emailPolicy === EMAIL_POLICY_ONCE
                        ? "bg-brand text-white"
                        : "bg-white border border-amber-200 text-slate-800"
                    }`}
                    onClick={() => setEmailPolicy(EMAIL_POLICY_ONCE)}
                    data-testid="doc-email-once"
                  >
                    Use it once
                  </button>
                </div>
              </div>
            ) : null}
            <Fld label="Message">
              <textarea
                className="input min-h-[100px]"
                value={sendMessage}
                onChange={(e) => setSendMessage(e.target.value)}
                aria-label="Email message"
                data-testid="doc-send-message"
              />
            </Fld>
            {kind === "invoice" ? (
              <label className="flex items-center gap-2 mb-3 cursor-pointer" data-testid="doc-pay-link-toggle">
                <input
                  type="checkbox"
                  checked={includePayLink}
                  onChange={(e) => setIncludePayLink(e.target.checked)}
                />
                <span className="text-sm font-semibold text-slate-800">For credit card payment</span>
              </label>
            ) : null}
            {(() => {
              const emailNeedsPolicy =
                emailDiffers(sendEmails) &&
                emailPolicy !== EMAIL_POLICY_KEEP &&
                emailPolicy !== EMAIL_POLICY_ONCE;
              const sendOpts = {
                email: sendEmails,
                message: sendMessage,
                includePaymentLink: includePayLink,
                emailPolicy: emailPolicy || (emailDiffers(sendEmails) ? "" : EMAIL_POLICY_ONCE),
              };
              if (!qboOn) {
                return (
                  <button
                    type="button"
                    className="btn-brand w-full !py-2.5 text-sm"
                    disabled={saving || emailNeedsPolicy}
                    onClick={() =>
                      submitSync(true, { ...sendOpts, docSource: DOC_SOURCE_LOCAL })
                    }
                    data-testid="doc-send-local"
                  >
                    Send locally
                  </button>
                );
              }
              return (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="btn-brand !py-2.5 text-sm"
                    disabled={saving || emailNeedsPolicy}
                    onClick={() =>
                      submitSync(true, { ...sendOpts, docSource: DOC_SOURCE_QBO })
                    }
                    data-testid="doc-save-sync-send"
                  >
                    Send through QB
                  </button>
                  <button
                    type="button"
                    className="btn !py-2.5 text-sm bg-brand-soft text-brand"
                    disabled={saving || emailNeedsPolicy}
                    onClick={() =>
                      submitSync(true, { ...sendOpts, docSource: DOC_SOURCE_LOCAL })
                    }
                    data-testid="doc-send-local"
                  >
                    Send locally
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}