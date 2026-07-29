// Build a QuickBooks estimate or invoice — line items, service address, attachments.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import DescriptionField, { PolishButton } from "./DescriptionField.jsx";
import { DOC_SOURCE_LOCAL, DOC_SOURCE_QBO } from "../lib/docSource.js";
import CustomerSearch from "./CustomerSearch.jsx";
import { useStore } from "../state/store.jsx";
import { useTenantConfig } from "../state/tenant.jsx";
import { isQuickbooksDocsEnabled, resolveDocSource } from "../lib/qboEnabled.js";
import { useAppSettings } from "../lib/appSettings.js";
import {
  EMAIL_POLICY_KEEP,
  defaultDocEmailBody,
  sendEmailDiffersFromCustomer,
} from "../lib/sendDocConfirm.js";
import DocEmailComposeSheet from "./DocEmailComposeSheet.jsx";
import { defaultQboItems, filterQboItems } from "../data/qboItems.js";
import ServiceAddressField from "./ServiceAddressField.jsx";
import AddressAutocompleteField from "./AddressAutocompleteField.jsx";
import { emptyLine, initialLines, lineAmount, linesTotal } from "../lib/qboDoc.js";
import { planDocSaveLocal, planDocSaveSync } from "../lib/docSync.js";
import { resolveDocNumberOnSave } from "../lib/nextDocNumber.js";
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
import LetterQuestionnaireSheet from "./LetterQuestionnaireSheet.jsx";
import {
  isLetterProduct,
  letterAttachmentFromUpload,
  matchLetterType,
  upsertJobLetterDraft,
} from "../lib/letterDraft.js";
import { buildLetterheadPdfBlob, letterPdfFileName } from "../lib/letterheadPdf.js";

import { enrichAndPatchCustomer } from "./NewJobFlow.jsx";
import {
  applyDueAmountToLines,
  applyProgressPctToLines,
  contractTotalForJob,
  contractTotalFromEstimate,
  dueFromContract,
  progressPctFromLines,
  roundQty,
} from "../lib/progressBilling.js";
import { RECUR_INTERVALS, defaultRecurringState } from "../lib/recurringBilling.js";
import { resumeFollowUpPrompts } from "../lib/calendarNavigate.js";

/** Width that hugs the typed number — grows with digits so rate/amount never clip. */
function numInputStyle(value, { minCh = 8, maxCh = 24, pad = 2 } = {}) {
  const s = String(value ?? "").trim();
  // Count display width (commas/$ count); always leave a little headroom.
  const ch = Math.max(minCh, Math.min(maxCh, (s.length || 1) + pad));
  return {
    width: `calc(${ch}ch + 1.25rem)`,
    minWidth: `calc(${minCh}ch + 1.25rem)`,
    maxWidth: "100%",
  };
}

/** Labeled money field — grows with content; never forces a fixed squeeze. */
function MetricFld({ label, children, testId, minWidth = "7rem", className = "" }) {
  return (
    <div
      className={"flex flex-col gap-0.5 overflow-visible shrink-0 " + className}
      style={{ minWidth, flex: "1 1 auto" }}
      data-testid={testId}
    >
      <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 leading-none px-0.5">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Compact line: product rectangle + polish on row 1; description + metrics below. */
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
  onOpenLetter,
}) {
  const [itemQ, setItemQ] = useState(line.itemName || "");
  const [open, setOpen] = useState(false);
  // After a catalog pick, collapse the name into a fitting rectangle until reopened.
  const [itemPicked, setItemPicked] = useState(() => !!(line.itemName || "").trim());
  const picks = useMemo(() => filterQboItems(items, itemQ), [items, itemQ]);
  const rate = parseAmount(line.unitPrice) || 0;
  const qty = parseAmount(line.qty) || 0;
  const due = lineAmount(line);
  // Progress % from fractional qty (QBO style: full rate × progress qty).
  const linePct = rate > 0 && qty > 0 ? Math.round(qty * 10000) / 100 : qty * 100;
  const progressDisplay = adjustMode === "pct" ? String(linePct || "") : String(due || "");
  const showChip = itemPicked && !!(line.itemName || itemQ || "").trim() && !open;
  const productLabel = String(line.itemName || itemQ || "").trim();

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
    if (isLetterProduct(it.name) && onOpenLetter) {
      onOpenLetter(index, it.name);
    }
  };
  const letterHit = isLetterProduct(line.itemName || productLabel);

  const reOpenItem = () => {
    setOpen(true);
    setItemPicked(false);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-2 py-2 mb-2 space-y-1.5" data-testid="doc-line-row">
      {/* Row 1: product name rectangle (fits the word) + polish + remove */}
      <div className="flex items-start gap-1.5" data-testid={"doc-line-product-row-" + (index + 1)}>
        {showChip ? (
          <button
            type="button"
            className="min-h-[2.5rem] max-w-[min(100%,18rem)] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 flex items-center text-left text-xs font-bold leading-snug text-slate-800 break-words"
            onClick={reOpenItem}
            title={productLabel}
            aria-label={"Product service line " + (index + 1) + " — change"}
            data-testid={"doc-line-item-chip-" + (index + 1)}
          >
            {productLabel || "?"}
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
        <PolishButton
          compact
          value={line.description || ""}
          onChange={(v) => onChange(index, { description: v })}
          testId={"doc-line-desc-" + (index + 1)}
        />
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

      {/* Row 2: description full width */}
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
      {letterHit && onOpenLetter ? (
        <button
          type="button"
          className="w-full text-left text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1.5"
          onClick={() => onOpenLetter(index, line.itemName || productLabel)}
          data-testid={"doc-line-letter-btn-" + (index + 1)}
        >
          ✏ Letter questionnaire — fill / approve letterhead
        </button>
      ) : null}

      {/* Row 3: always rate + qty; progress % only when progress invoice is on */}
      <div
        className="flex flex-wrap w-full gap-2 items-end overflow-visible"
        data-testid={"doc-line-metrics-" + (index + 1)}
      >
        <MetricFld
          label={progressMode ? "Full rate" : "Rate"}
          testId={"doc-line-rate-fld-" + (index + 1)}
          minWidth="6.75rem"
        >
          <input
            className="input !px-2 !py-1.5 text-sm text-right tabular-nums !w-auto max-w-full overflow-visible"
            style={numInputStyle(line.unitPrice, { minCh: 8, maxCh: 22, pad: 3 })}
            inputMode="decimal"
            value={line.unitPrice}
            onChange={(e) => onChange(index, { unitPrice: e.target.value })}
            aria-label={"Rate line " + (index + 1)}
            title={progressMode ? "Full job rate for this line" : "Rate"}
            placeholder="0"
            data-testid={"doc-line-rate-" + (index + 1)}
          />
        </MetricFld>
        <MetricFld label="Qty" testId={"doc-line-qty-fld-" + (index + 1)} minWidth="4.5rem">
          <input
            className="input !px-2 !py-1.5 text-sm text-center tabular-nums !w-auto max-w-full overflow-visible"
            style={numInputStyle(line.qty, { minCh: 3, maxCh: 12, pad: 2 })}
            inputMode="decimal"
            value={line.qty}
            onChange={(e) => onChange(index, { qty: e.target.value })}
            aria-label={"Quantity line " + (index + 1)}
            title={progressMode ? "Quantity (progress fraction × contract qty)" : "Quantity"}
            placeholder="1"
            data-testid={"doc-line-qty-" + (index + 1)}
          />
        </MetricFld>
        {progressMode ? (
          <MetricFld
            label={adjustMode === "pct" ? "Progress %" : "This bill $"}
            testId={"doc-line-progress-" + (index + 1)}
            minWidth="6.5rem"
          >
            <div className="flex items-center gap-1 overflow-visible">
              <input
                className="input !px-1.5 !py-1.5 text-center text-sm tabular-nums !w-auto max-w-full overflow-visible"
                style={numInputStyle(progressDisplay, {
                  minCh: adjustMode === "pct" ? 5 : 8,
                  maxCh: 18,
                  pad: 3,
                })}
                inputMode="decimal"
                value={progressDisplay}
                onChange={(e) => onLineProgress && onLineProgress(index, e.target.value)}
                aria-label={"Progress line " + (index + 1)}
                data-testid={"progress-line-edit-" + (index + 1)}
                title={adjustMode === "pct" ? "Percent of full rate" : "Dollar amount this invoice"}
                placeholder={adjustMode === "pct" ? "%" : "$"}
              />
              <button
                type="button"
                className="h-9 shrink-0 min-w-[2rem] px-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-extrabold text-slate-700"
                onClick={() => onAdjustModeChange && onAdjustModeChange(adjustMode === "pct" ? "amount" : "pct")}
                aria-label={adjustMode === "pct" ? "Switch progress to dollars" : "Switch progress to percent"}
                data-testid={"progress-mode-toggle-" + (index + 1)}
                title={adjustMode === "pct" ? "Showing percent — tap for $" : "Showing dollars — tap for %"}
              >
                {adjustMode === "pct" ? "%" : "$"}
              </button>
            </div>
          </MetricFld>
        ) : null}
        <MetricFld
          label={progressMode ? "Line total" : "Amount"}
          testId={"doc-line-amount-fld-" + (index + 1)}
          minWidth="6.75rem"
        >
          <div
            className="input !px-2 !py-1.5 bg-slate-50 text-slate-700 font-semibold text-right text-sm tabular-nums !w-auto max-w-full overflow-visible whitespace-nowrap"
            style={numInputStyle(fmt$(due) || due, { minCh: 8, maxCh: 22, pad: 3 })}
            aria-label={"Due line " + (index + 1)}
            data-testid={"doc-line-amount-" + (index + 1)}
          >
            {fmt$(due)}
          </div>
        </MetricFld>
      </div>
    </div>
  );
}

const LineRowMemo = React.memo(LineRow);

function CustomerHeaderPanel({ job, allJobs, events, api, onPatch }) {
  // Bill To starts collapsed (one line) — expands on tap so it doesn't waste space (Levi 2026-07-28).
  const [open, setOpen] = useState(false);

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

  const name = String(job.businessName || job.customer || "").trim() || "Customer";
  const billBits = [
    job.personName,
    job.phone,
    job.email,
    job.billingAddress,
  ]
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  const oneLine =
    billBits.length > 0 ? name + " · " + billBits.join(" · ") : name + (job.title ? " · " + job.title : "");

  return (
    <div className="mb-3 pb-2 border-b border-slate-200" data-testid="doc-customer-header">
      <button
        type="button"
        className="w-full flex items-center gap-2 text-left rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 active:bg-slate-100"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="doc-bill-to-toggle"
      >
        <span className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400 shrink-0">
          Bill to
        </span>
        <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800 truncate" data-testid="doc-bill-to-summary">
          {oneLine}
        </span>
        <span className="text-xs text-slate-400 shrink-0" aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open ? (
        <div className="mt-2 space-y-0" data-testid="doc-bill-to-expanded">
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
  /** Always editable — customer info on the document is fair game. */
  editableCustomer = true,
  draftMode = false,
  allJobs,
  onCustomerPatch,
}) {
  const { patchAndSave, enqueue, logSend, showToast, api, createJob, jobs: storeJobs, events } = useStore();
  const tenantConfig = useTenantConfig();
  const appSettings = useAppSettings();
  void appSettings.quickbooks;
  void appSettings.quickbooksDocs;
  // Send/view through QB only — integration can stay on for backend sync.
  const qboOn = isQuickbooksDocsEnabled(tenantConfig);
  const boardJobs = allJobs || storeJobs;
  const [job, setJob] = useState(() => jobProp || {});
  // Re-seed only when a different job is opened — not on every parent re-render
  // (that was wiping keystrokes and making the form lag).
  const jobSeedId = jobProp?.id || "";
  useEffect(() => {
    setJob(jobProp || {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: id-only reseed
  }, [jobSeedId]);

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
  const [serviceAddress, setServiceAddress] = useState(
    () => jobProp?.serviceAddress || jobProp?.address || ""
  );
  const [apartment, setApartment] = useState(() => jobProp?.apartment || "");
  // Seed once per job open — don't fight local typing when store refreshes.
  useEffect(() => {
    setServiceAddress(jobProp?.serviceAddress || jobProp?.address || "");
    setApartment(jobProp?.apartment || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobSeedId]);

  // Progress invoice is intentional: from-estimate path, explicit flag, partial %, or fractional qty.
  // Do NOT auto-enable just because the job once had an estimate / Accepted stage.
  const seed = jobProp || {};
  const autoProgress =
    kind === "invoice" &&
    (progressPct != null ||
      mode === "from_estimate" ||
      mode === "turn_from_estimate" ||
      !!seed.invoiceProgressBilling ||
      (seed.invoiceLines || []).some((ln) => {
        const q = parseAmount(ln?.qty);
        return q > 0 && q < 0.9999;
      }));
  // Manual Progress Invoice toggle (like CO) — only when estimate-linked or already progressive.
  const [progressOn, setProgressOn] = useState(() => !!autoProgress);
  useEffect(() => {
    setProgressOn(!!autoProgress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobSeedId, kind, mode]);
  const progressMode = kind === "invoice" && progressOn;
  // Progress controls only after an estimate (or when already a progress invoice).
  const canShowProgressToggle =
    kind === "invoice" &&
    (!!job.estimateLines?.length ||
      !!job.estimateNo ||
      mode === "from_estimate" ||
      mode === "turn_from_estimate" ||
      !!job.invoiceProgressBilling ||
      !!progressOn ||
      progressPct != null ||
      parseAmount(job.contractAmount) > 0);
  const [lines, setLines] = useState(() => initialLines(jobProp || {}, { kind, mode, progressPct }));
  // Reseed line rows only when opening a different job (not on every store tick).
  useEffect(() => {
    setLines(initialLines(jobProp || {}, { kind, mode, progressPct }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobSeedId, kind, mode]);
  const [attachments, setAttachments] = useState([]);
  const [attUploading, setAttUploading] = useState(false);
  // Letterhead drafts linked to letter product lines (load letter, safety, etc.)
  const [letterDrafts, setLetterDrafts] = useState(() =>
    Array.isArray(jobProp?.letterDrafts) ? jobProp.letterDrafts : []
  );
  const [letterQ, setLetterQ] = useState(null); // { lineIndex, itemName }
  // Starts empty and fills in asynchronously: LE's internal catalogue is a
  // separate chunk (see data/qboItems.js), so it cannot be read synchronously.
  // A non-internal tenant resolves to [] with no fetch at all, and keeps an
  // empty picker until their own QuickBooks items sync in.
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [emailSheet, setEmailSheet] = useState(false);
  // Seed only — the open email sheet owns typing state so keystrokes stay snappy.
  const [sendEmailsSeed, setSendEmailsSeed] = useState(() => job.email || "");
  const [sendMessageSeed, setSendMessageSeed] = useState("");
  const [includePayLinkSeed, setIncludePayLinkSeed] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setSendEmailsSeed(job.email || "");
  }, [job.email]);
  const initialContract = contractTotalForJob(job) || contractTotalFromEstimate(job.estimateLines) || 0;
  const [contractAmount, setContractAmount] = useState(initialContract ? String(initialContract) : "");
  // Default % so progress invoices open showing "80%" not a raw dollar / fraction.
  const [adjustMode, setAdjustMode] = useState("pct");
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

  /** Progress invoice toggle — same idea as CO, next to the doc number. */
  const applyProgressToggle = (on) => {
    if (kind !== "invoice" && kind !== "estimate") return;
    const next = !!on;
    setProgressOn(next);
    // Estimates keep the flag so a later invoice from this estimate opens progressive.
    patchJobState({ invoiceProgressBilling: next });
    if (kind === "invoice" && next) {
      // Ensure lines carry full-rate × fractional qty when turning progress on.
      const contract = parseAmount(contractAmount) || contractTotalForJob(job) || linesTotal(lines);
      if (contract > 0 && !parseAmount(contractAmount)) setContractAmount(String(contract));
      const pct = parseAmount(progressPctEdit) || 100;
      if (pct < 100) {
        setLines((rows) => applyProgressPctToLines(rows, contractLines, pct));
      }
    }
  };

  const docNoKey = kind === "estimate" ? "estimateNo" : "invoiceNo";
  const docNoValue = job[docNoKey] || "";
  const setDocNo = (v) => patchJobState({ [docNoKey]: v });

  const contractLines = useMemo(() => {
    if (job.estimateLines?.length) return job.estimateLines;
    return lines.map((ln) => ({
      ...ln,
      unitPrice: parseAmount(contractAmount) || ln.unitPrice,
      qty: 1,
    }));
  }, [job.estimateLines, lines, contractAmount]);

  const changeLine = useCallback((i, patch) => {
    setLines((rows) => rows.map((ln, idx) => (idx === i ? { ...ln, ...patch } : ln)));
  }, []);

  const openLetterForLine = useCallback((lineIndex, itemName) => {
    setLetterQ({ lineIndex, itemName: itemName || "" });
  }, []);

  const onLetterSaved = useCallback(
    async ({ draft, description }) => {
      setLetterQ(null);
      if (!draft) return;
      setLetterDrafts((prev) => {
        const i = prev.findIndex(
          (d) => d.id === draft.id || (d.lineIndex === draft.lineIndex && d.typeId === draft.typeId)
        );
        if (i >= 0) {
          const next = prev.slice();
          next[i] = draft;
          return next;
        }
        return prev.concat([draft]);
      });
      if (description) {
        setLines((rows) =>
          rows.map((ln, idx) =>
            idx === draft.lineIndex ? { ...ln, description, letterId: draft.id } : ln
          )
        );
      }
      // Generate PDF + attach so send includes invoice + letter
      try {
        setAttUploading(true);
        const blob = buildLetterheadPdfBlob({ draft });
        const fileName = letterPdfFileName(draft);
        const file = new File([blob], fileName, { type: "application/pdf" });
        const { uploadChatAttachment } = await import("../lib/chatAttach.js");
        const url = await uploadChatAttachment(file);
        const att = letterAttachmentFromUpload(draft, { url, name: fileName, mime: "application/pdf" });
        setAttachments((rows) => {
          // Replace prior letter attachment for same letter id
          const filtered = rows.filter((a) => a.letterId !== draft.id);
          return filtered.concat([att]);
        });
        // Also stash photos as attachments (email)
        for (const p of draft.photos || []) {
          if (!p?.url) continue;
          setAttachments((rows) => {
            if (rows.some((a) => a.url === p.url)) return rows;
            return rows.concat([
              {
                id: p.id || "photo-" + Date.now(),
                name: p.name || "Letter photo",
                url: p.url,
                mime: p.mime || "image/jpeg",
                attachToEmail: true,
                letterId: draft.id,
              },
            ]);
          });
        }
        showToast(
          draft.status === "approved"
            ? "Letter approved — will send with the invoice"
            : "Letter draft saved"
        );
      } catch (err) {
        showToast("Letter saved, but PDF attach failed — " + (err?.message || "try preview again"));
      } finally {
        setAttUploading(false);
      }
    },
    [showToast]
  );

  const removeLine = useCallback((idx) => {
    setLines((rows) => rows.filter((_, j) => j !== idx));
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
      const contract = parseAmount(contractAmount) || contractTotalForJob(job) || 0;
      if (adjustMode === "pct") {
        const pct = Math.min(100, Math.max(0, val));
        setProgressPctEdit(String(pct));
        if (contract > 0) setAmountDueEdit(String(dueFromContract(contract, pct)));
        setLines((rows) =>
          rows.map((ln, i) => {
            if (i !== index) return ln;
            return {
              ...ln,
              qty: roundQty(pct / 100),
              progressBilling: pct < 99.99,
            };
          })
        );
        return;
      }
      setAmountDueEdit(String(raw));
      setLines((rows) => {
        const next = rows.map((ln, i) => {
          if (i !== index) return ln;
          const rate = parseAmount(ln.unitPrice) || 0;
          if (!rate) return { ...ln, unitPrice: val, qty: 1, progressBilling: true };
          const q = roundQty(val / rate);
          return { ...ln, qty: q, progressBilling: q < 0.9999 };
        });
        return next;
      });
      // Approximate overall % from this line's $ (single-line progress is the common case).
      if (contract > 0) {
        setProgressPctEdit(String(Math.min(100, Math.max(0, Math.round((val / contract) * 10000) / 100))));
      }
    },
    [adjustMode, contractAmount, job]
  );

  // Live progress summary — full job · % · this invoice (keeps progress billing clear).
  const liveContract = parseAmount(contractAmount) || contractTotalForJob(job) || 0;
  const liveProgressPct =
    liveContract > 0 ? progressPctFromLines(lines, liveContract) : parseAmount(progressPctEdit) || 100;
  const liveInvoiceTotal = subtotal;

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
    // Edit without a number used to hard-block Save — that left jobs stuck as
    // "draft". Stamp a number on save instead (resolveDocNumberOnSave).
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
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes("@"))[0] || "";

  /** Full multi-recipient string for send (preserve all addresses). */
  const allEmails = (raw) =>
    String(raw || "")
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes("@"))
      .join(", ");

  const downloadLocalPdf = async (jobForPdf) => {
    try {
      const { buildInvoicePdfFromJob, buildEstimatePdfFromJob } = await import("../lib/invoicePdf.js");
      const { downloadPdfBlob } = await import("../lib/pdfOpen.js");
      const { docPdfFilename } = await import("../lib/jobToQbDoc.js");
      const blob =
        kind === "estimate"
          ? await buildEstimatePdfFromJob(jobForPdf)
          : await buildInvoicePdfFromJob(jobForPdf);
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

  /** @param {{ close?: boolean, printPdf?: boolean, toast?: string, alsoQbo?: boolean }} opts */
  const submitLocal = async (opts = {}) => {
    const close = opts.close !== false;
    const printPdf = !!opts.printPdf;
    // When QB docs are on, Save also queues QuickBooks (no wait for confirmation).
    const alsoQbo = opts.alsoQbo != null ? !!opts.alsoQbo : qboOn;
    const valid = validate(false);
    if (!valid) return null;

    setSaving(true);
    try {
      const jobId = await ensureJobId();
      if (!jobId) return null;
      const activeJob = {
        ...job,
        id: jobId,
        invoiceProgressBilling: progressOn || job.invoiceProgressBilling,
      };
      let jobPatch;
      let commands = [];
      if (alsoQbo) {
        const planned = planDocSaveSync(activeJob, {
          kind,
          mode,
          lines: valid,
          serviceAddress,
          apartment,
          progressPct: progressPctEdit || progressPct,
          contractAmount,
          send: false,
          recurringState: showRecurring && recurring.enabled ? recurring : null,
          discountType,
          discountValue,
        });
        jobPatch = planned.jobPatch;
        commands = planned.commands || [];
        // Local markDone so the job shows as invoiced/estimated while QBO catches up.
        const local = planDocSaveLocal(activeJob, {
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
        jobPatch = { ...local.jobPatch, ...jobPatch };
      } else {
        ({ jobPatch } = planDocSaveLocal(activeJob, {
          kind,
          mode,
          lines: valid,
          serviceAddress,
          apartment,
          progressPct: progressPctEdit,
          contractAmount,
          discountType,
          discountValue,
        }));
      }
      Object.assign(jobPatch, coTagsFromJob(activeJob));
      // Always stamp a real Inv # / Est # on save (never leave "Inv draft" after Save).
      const preferredNo =
        (kind === "invoice" ? jobPatch._preferredInvoiceNo : jobPatch._preferredEstimateNo) ||
        preferredChangeOrderDocNo(activeJob, kind) ||
        "";
      const stampedNo = resolveDocNumberOnSave({
        kind,
        existing: docNoValue || activeJob[docNoKey] || "",
        preferred: preferredNo,
        jobs: boardJobs,
      });
      if (stampedNo) {
        jobPatch[docNoKey] = stampedNo;
        // Keep the header field in sync so the builder shows the number right away.
        if (!String(docNoValue || "").trim()) patchJobState({ [docNoKey]: stampedNo });
        // Carry the same # into QuickBooks create/update so local + office match.
        commands = (commands || []).map((cmd) => ({
          ...cmd,
          payload: { ...(cmd.payload || {}), [docNoKey]: stampedNo },
        }));
      }
      jobPatch.invoiceProgressBilling = !!progressOn;
      if (editableCustomer) {
        jobPatch.businessName = activeJob.businessName || activeJob.customer || "";
        jobPatch.customer = activeJob.customer || activeJob.businessName || "";
        jobPatch.personName = activeJob.personName || "";
        jobPatch.phone = activeJob.phone || "";
        jobPatch.email = activeJob.email || "";
        jobPatch.billingAddress = activeJob.billingAddress || "";
        jobPatch.title = activeJob.title || "";
        if (activeJob.qboCustomerId) jobPatch.qboCustomerId = activeJob.qboCustomerId;
      }
      if (attachments.length) {
        jobPatch.attachments = (job.attachments || []).concat(attachments);
      }
      if (letterDrafts.length) {
        let drafts = job.letterDrafts || [];
        for (const d of letterDrafts) drafts = upsertJobLetterDraft({ letterDrafts: drafts }, d);
        jobPatch.letterDrafts = drafts;
      }
      // Local store update is sync inside patchAndSave; still await so the
      // overlay write isn't raced by a concurrent jobs refresh (lost Inv #).
      await patchAndSave(jobId, jobPatch);
      for (const cmd of commands) {
        void enqueue(cmd.type, jobId, cmd.payload, "judgment", cmd.idk);
      }
      const pdfJob = buildPdfJob(activeJob, jobPatch);
      if (printPdf) {
        // PDF generation can stay in background after UI continues.
        void downloadLocalPdf(pdfJob);
      }
      const noLabel = stampedNo
        ? (kind === "estimate" ? "Est #" : "Inv #") + stampedNo
        : kind === "estimate"
          ? "estimate"
          : "invoice";
      showToast(
        opts.toast ||
          (printPdf
            ? "Saved + printed " + noLabel + " PDF"
            : alsoQbo
              ? "Saved " + noLabel + " — syncing to QuickBooks in the background"
              : "Saved " + noLabel + " on this job")
      );
      resumeFollowUpPrompts();
      onDone && onDone({ ...activeJob, ...jobPatch });
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
    const emailTo =
      allEmails(opts.email != null ? opts.email : sendEmailsSeed) ||
      primaryEmail(opts.email != null ? opts.email : sendEmailsSeed) ||
      job.email ||
      "";
    const valid = validate(send, emailTo);
    if (!valid) return;

    setSaving(true);
    // Close email sheet immediately so typing/send feels snappy; work continues.
    if (send) setEmailSheet(false);
    try {
      const jobId = await ensureJobId();
      if (!jobId) {
        setSaving(false);
        return;
      }
      // Keep this email → update customer. Use it once → send only; job/PDF keep saved email.
      const policy = opts.emailPolicy || "";
      const differs = sendEmailDiffersFromCustomer(emailTo, job.email);
      const keepOnCustomer = !!(emailTo && (!differs || policy === EMAIL_POLICY_KEEP));
      const savedEmail = keepOnCustomer ? emailTo : job.email || "";
      const activeJob = {
        ...job,
        id: jobId,
        email: savedEmail,
        invoiceProgressBilling: progressOn || job.invoiceProgressBilling,
      };
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
      // Stamp Inv # / Est # on save so the job never stays stuck as "draft".
      const preferredNo =
        (kind === "invoice" ? jobPatch._preferredInvoiceNo : jobPatch._preferredEstimateNo) ||
        preferredChangeOrderDocNo(activeJob, kind) ||
        "";
      const stampedNo = resolveDocNumberOnSave({
        kind,
        existing: docNoValue || activeJob[docNoKey] || "",
        preferred: preferredNo,
        jobs: boardJobs,
      });
      if (stampedNo) {
        jobPatch[docNoKey] = stampedNo;
        if (!String(docNoValue || "").trim()) patchJobState({ [docNoKey]: stampedNo });
        for (const cmd of commands || []) {
          if (cmd.payload) cmd.payload[docNoKey] = stampedNo;
        }
      }
      jobPatch.invoiceProgressBilling = !!progressOn;
      if (editableCustomer) {
        jobPatch.businessName = activeJob.businessName || activeJob.customer || "";
        jobPatch.customer = activeJob.customer || activeJob.businessName || "";
        jobPatch.personName = activeJob.personName || "";
        jobPatch.phone = activeJob.phone || "";
        if (keepOnCustomer) jobPatch.email = emailTo;
        jobPatch.billingAddress = activeJob.billingAddress || "";
        jobPatch.title = activeJob.title || "";
        if (activeJob.qboCustomerId) jobPatch.qboCustomerId = activeJob.qboCustomerId;
      }
      if (keepOnCustomer) jobPatch.email = emailTo;
      else if (!editableCustomer) delete jobPatch.email;

      await patchAndSave(jobId, jobPatch);

      const needsCustomer =
        mode !== "edit" && !String(activeJob.qboCustomerId || "").trim();

      const attsForEmail = send ? emailAttachments() : attachments;
      const attsForQbo = attachments;
      const docSource = resolveDocSource(
        opts.docSource === DOC_SOURCE_LOCAL ? DOC_SOURCE_LOCAL : DOC_SOURCE_QBO
      );
      const withPay = !!(opts.includePaymentLink && kind === "invoice");
      const customMsg = String(opts.message || "").trim();

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
        // Local PDF + email: close UI immediately; PDF + Resend + host retry run in background.
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
        const label = kind === "estimate" ? "estimate" : "invoice";
        const amountStr = String(total || "").replace(/[$,]/g, "");
        showToast("Sending " + label + " to " + emailTo + "…");
        // Close sheet + parent before the slow PDF/network work (same pattern as useDoSend).
        resumeFollowUpPrompts();
        onDone && onDone(activeJob);
        if (opts.close !== false) {
          setEmailSheet(false);
          onClose();
        }
        setSaving(false);

        const runLocalBg = async () => {
          let res = null;
          try {
            if (typeof api.sendDocEmailNow === "function") {
              res = await api.sendDocEmailNow(pdfJob, kind, {
                email: emailTo,
                includePaymentLink: withPay,
                message: customMsg,
                subject: opts.subject || "",
              });
            }
          } catch (err) {
            res = { ok: false, error: String(err?.message || err) };
          }
          const pdfB64 = res?.pdfB64 || "";
          const filename =
            res?.filename ||
            `${kind === "estimate" ? "Estimate" : "Invoice"}-${no || "document"}.pdf`;
          // Strip heavy job history for the command bus — PDF is already attached.
          const slimJob = {
            id: pdfJob.id,
            customer: pdfJob.customer || "",
            businessName: pdfJob.businessName || "",
            personName: pdfJob.personName || "",
            email: emailTo || pdfJob.email || "",
            invoiceNo: pdfJob.invoiceNo || "",
            estimateNo: pdfJob.estimateNo || "",
            amount: pdfJob.amount || amountStr,
            openBalance: pdfJob.openBalance,
            dueDate: pdfJob.dueDate || "",
            address: pdfJob.address || pdfJob.serviceAddress || "",
            billingAddress: pdfJob.billingAddress || "",
            serviceAddress: pdfJob.serviceAddress || pdfJob.address || "",
            title: pdfJob.title || "",
            invoiceLines: pdfJob.invoiceLines,
            estimateLines: pdfJob.estimateLines,
            items: pdfJob.items,
          };
          const payload =
            kind === "invoice"
              ? {
                  email: emailTo,
                  invoiceNo: no,
                  customer: activeJob.customer || "",
                  amount: amountStr,
                  includePaymentLink: withPay,
                  docSource: DOC_SOURCE_LOCAL,
                  message: customMsg,
                  subject: opts.subject || "",
                  attachments: attsForEmail,
                  includeAttachmentsInEmail: attsForEmail.length > 0,
                  job: slimJob,
                  pdfB64: pdfB64 || undefined,
                  filename,
                  viewLink: res?.viewLink || "",
                  html: res?.html || undefined,
                  clientSend: res
                    ? {
                        ok: res.ok,
                        sent: res.sent,
                        error: res.error,
                        reason: res.reason,
                        dryRun: res.dryRun,
                        viewLink: res.viewLink,
                      }
                    : undefined,
                }
              : {
                  email: emailTo,
                  estimateNo: no,
                  docSource: DOC_SOURCE_LOCAL,
                  message: customMsg,
                  subject: opts.subject || "",
                  attachments: attsForEmail,
                  includeAttachmentsInEmail: attsForEmail.length > 0,
                  job: slimJob,
                  pdfB64: pdfB64 || undefined,
                  filename,
                  viewLink: res?.viewLink || "",
                  html: res?.html || undefined,
                  clientSend: res
                    ? {
                        ok: res.ok,
                        sent: res.sent,
                        error: res.error,
                        reason: res.reason,
                        dryRun: res.dryRun,
                        viewLink: res.viewLink,
                      }
                    : undefined,
                };
          if (res?.ok && res.sent) {
            logSend(
              jobId,
              (kind === "estimate" ? "Estimate" : "Invoice") +
                " emailed (local PDF)" +
                (withPay ? " + payment link" : ""),
              emailTo
            );
            showToast("Emailed " + label + " to " + emailTo);
            return;
          }
          if (res?.skipped || res?.reason === "test_email_unset" || res?.reason === "no_recipient") {
            showToast("Could not send — check the email address and try again.");
            return;
          }
          // Host finishes via Resend retry or office Gmail (full layout when html/viewLink present).
          if (pdfB64 || !res) {
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
            showToast("Finishing send in the background — you'll get a toast when it lands");
          } else {
            showToast(
              (kind === "estimate" ? "Estimate" : "Invoice") +
                " did NOT send — " +
                String(res?.error || res?.reason || "failed").slice(0, 80)
            );
          }
        };
        runLocalBg().catch(() => {
          showToast("Send hit a snag — open the invoice and try again");
        });
        return;
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
      onDone && onDone({ ...activeJob, ...jobPatch });
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
      {/* Top: doc # + Progress invoice toggle (same pattern as CO) */}
      <div
        className="flex flex-wrap items-center gap-2 mb-3 pb-2 border-b border-slate-100"
        data-testid="doc-header-row"
      >
        <label className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide shrink-0">
            {kind === "estimate" ? "Est #" : "Inv #"}
          </span>
          <input
            className="input !py-1.5 !px-2 text-sm font-bold tabular-nums !w-auto max-w-full"
            style={numInputStyle(docNoValue || "DRAFT", { minCh: 7, maxCh: 18, pad: 2 })}
            value={docNoValue}
            onChange={(e) => setDocNo(e.target.value)}
            placeholder={mode === "edit" ? "Number" : "Auto"}
            aria-label={kind === "estimate" ? "Estimate number" : "Invoice number"}
            data-testid="doc-number-input"
          />
        </label>
        {canShowProgressToggle ? (
          <div className="flex items-center gap-1.5 shrink-0 ml-auto" data-testid="doc-progress-toggle-row">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              Progress invoice
            </span>
            <Toggle
              on={!!progressOn}
              onChange={applyProgressToggle}
              label={progressOn ? "Progress invoice on" : "Progress invoice off"}
              small
            />
          </div>
        ) : null}
      </div>

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

      {progressMode ? (
        <div
          className="mb-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1"
          data-testid="progress-summary-bar"
        >
          <label className="flex items-center gap-1.5 text-xs text-slate-700">
            <span className="font-bold text-slate-500 uppercase tracking-wide text-[10px]">Full</span>
            <input
              className="input !py-1 !px-1.5 !w-auto text-sm font-bold tabular-nums text-slate-900 overflow-visible"
              style={numInputStyle(contractAmount || liveContract || "", { minCh: 9, maxCh: 18 })}
              inputMode="decimal"
              value={contractAmount}
              onChange={(e) => {
                setContractAmount(e.target.value);
                const c = parseAmount(e.target.value);
                if (c > 0) {
                  setProgressPctEdit(String(progressPctFromLines(lines, c)));
                  setAmountDueEdit(String(linesTotal(lines)));
                }
              }}
              aria-label="Full job amount"
              data-testid="progress-full-amount"
              title="Original / full job amount"
            />
          </label>
          <span className="text-xs font-extrabold text-amber-900 tabular-nums" data-testid="progress-pct-label">
            {liveProgressPct}%
          </span>
          <span className="text-xs text-slate-600">
            This invoice{" "}
            <b className="text-slate-900 tabular-nums" data-testid="progress-invoice-total">
              {fmt$(liveInvoiceTotal) || "$0"}
            </b>
          </span>
        </div>
      ) : null}

      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mt-1 mb-1.5">
        Line items
      </p>
      {lines.map((ln, i) => (
        <LineRowMemo
          key={i}
          line={ln}
          index={i}
          items={items}
          onChange={changeLine}
          onRemove={removeLine}
          canRemove={lines.length > 1}
          progressMode={progressMode}
          adjustMode={adjustMode}
          onAdjustModeChange={setAdjustMode}
          onLineProgress={onLineProgress}
          onOpenLetter={kind === "invoice" || kind === "estimate" ? openLetterForLine : undefined}
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
            className="input !px-1.5 !py-2 text-sm overflow-visible tabular-nums"
            style={numInputStyle(discountValue, {
              minCh: discountType === "percent" ? 5 : 8,
              maxCh: 14,
            })}
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
          onClick={() =>
            // Close so convert→payment and multi-step flows keep moving (no full confirm wait).
            submitLocal({
              close: true,
              toast: qboOn ? "Saved — syncing to QuickBooks in the background" : "Saved",
            })
          }
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
            setSendEmailsSeed(job.email || sendEmailsSeed || "");
            if (!sendMessageSeed) {
              setSendMessageSeed(
                defaultDocEmailBody(job, kind, {
                  withPay: includePayLinkSeed && kind === "invoice",
                })
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
        <DocEmailComposeSheet
          key={"email-sheet-" + (job.id || "draft") + "-" + kind}
          kind={kind}
          jobEmail={job.email || ""}
          initialEmail={sendEmailsSeed || job.email || ""}
          initialMessage={
            sendMessageSeed ||
            defaultDocEmailBody(job, kind, {
              withPay: includePayLinkSeed && kind === "invoice",
            })
          }
          initialIncludePayLink={includePayLinkSeed}
          qboOn={qboOn}
          saving={saving}
          onClose={() => {
            if (saving) return;
            setEmailSheet(false);
          }}
          onSend={(model) => {
            setSendEmailsSeed(model.email || "");
            setSendMessageSeed(model.message || "");
            setIncludePayLinkSeed(!!model.includePaymentLink);
            submitSync(true, model);
          }}
        />
      ) : null}

      {letterQ ? (
        <LetterQuestionnaireSheet
          job={job}
          lineIndex={letterQ.lineIndex}
          itemName={letterQ.itemName}
          initialTypeId={matchLetterType(letterQ.itemName)?.id || ""}
          initialDraft={
            letterDrafts.find(
              (d) => d.lineIndex === letterQ.lineIndex || d.itemName === letterQ.itemName
            ) || null
          }
          onClose={() => setLetterQ(null)}
          onSave={onLetterSaved}
        />
      ) : null}
    </Sheet>
  );
}