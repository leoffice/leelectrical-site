// Build a QuickBooks estimate or invoice — line items, service address, attachments.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import DescriptionField, { PolishButton } from "./DescriptionField.jsx";
import { DOC_SOURCE_LOCAL, DOC_SOURCE_QBO } from "../lib/docSource.js";
import CustomerSearch from "./CustomerSearch.jsx";
import { useStore } from "../state/store.jsx";
import { useTenantConfig } from "../state/tenant.jsx";
import { isQuickbooksDocEnabled, resolveDocSource } from "../lib/qboEnabled.js";
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
import { buildLetterheadPdfBlobWithPhotos, letterPdfFileName } from "../lib/letterheadPdf.js";
import { isImageAttachment } from "../lib/letterPhotos.js";

import { enrichAndPatchCustomer } from "./NewJobFlow.jsx";
import {
  applyDueAmountToLines,
  applyProgressPctToLines,
  contractTotalForJob,
  contractTotalFromEstimate,
  dueFromContract,
  fullLineQty,
  progressPctFromLines,
  roundQty,
} from "../lib/progressBilling.js";
import { RECUR_INTERVALS, defaultRecurringState } from "../lib/recurringBilling.js";
import { resumeFollowUpPrompts } from "../lib/calendarNavigate.js";

/** Width that hugs the typed number — hard floor so money never clips. */
function numInputStyle(value, { minCh = 8, maxCh = 18, pad = 2 } = {}) {
  const s = String(value ?? "").trim();
  const ch = Math.max(minCh, Math.min(maxCh, (s.length || 1) + pad));
  return { width: ch + "ch", minWidth: minCh + "ch" };
}

/** Labeled money field — hard min width so full rate / % / total never cut off. */
function MetricFld({ label, children, testId, minWidth = "8.5rem" }) {
  return (
    <div
      className="flex flex-col gap-0.5 flex-1 overflow-visible"
      style={{ minWidth }}
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
  // The item name is a textarea so a long name wraps into view instead of
  // scrolling sideways inside the box (Levi 2026-07-28). Grow it to fit.
  const itemRef = useRef(null);
  useEffect(() => {
    const el = itemRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [itemQ, open]);
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
            className="min-h-[2.5rem] flex-1 min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-xs font-bold leading-snug text-slate-800 whitespace-pre-wrap break-words"
            onClick={reOpenItem}
            title={productLabel}
            aria-label={"Product service line " + (index + 1) + " — change"}
            data-testid={"doc-line-item-chip-" + (index + 1)}
          >
            {productLabel || "?"}
          </button>
        ) : (
          <div className="relative flex-1 min-w-0">
            <textarea
              rows={1}
              className="input !py-2 text-sm resize-none leading-snug overflow-hidden"
              value={itemQ}
              ref={itemRef}
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
                    <span className="font-semibold text-slate-800 block break-words">{it.name}</span>
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
        <MetricFld label={progressMode ? "Full rate" : "Rate"} testId={"doc-line-rate-fld-" + (index + 1)} minWidth="8.5rem">
          <input
            className="input !px-2 !py-1.5 text-sm text-right tabular-nums !w-auto max-w-full overflow-visible"
            style={numInputStyle(line.unitPrice, { minCh: 9, maxCh: 16 })}
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
            minWidth="7rem"
          >
            <div className="flex items-center gap-1 w-full overflow-visible">
              <input
                className="input !px-1.5 !py-1.5 text-center text-sm tabular-nums flex-1 overflow-visible"
                style={numInputStyle(progressDisplay, {
                  minCh: adjustMode === "pct" ? 6 : 9,
                  maxCh: 14,
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
        <MetricFld label={progressMode ? "Line total" : "Amount"} testId={"doc-line-amount-fld-" + (index + 1)} minWidth="8.5rem">
          <div
            className="input !px-2 !py-1.5 bg-slate-50 text-slate-700 font-semibold text-right text-sm tabular-nums w-full overflow-visible whitespace-nowrap"
            style={numInputStyle(fmt$(due) || due, { minCh: 9, maxCh: 16 })}
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

  // Six stacked fields ate most of the first screen (Levi 2026-07-28). Collapsed
  // to a single summary line; tap to open the full editor.
  const [open, setOpen] = useState(false);
  const summary = [
    job.businessName || job.customer,
    job.personName,
    job.billingAddress,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(" · ");

  if (!open) {
    return (
      <div className="mb-3 pb-2 border-b border-slate-200" data-testid="doc-customer-header">
        <button
          type="button"
          className="w-full flex items-center gap-2 text-left rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 active:bg-slate-100"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          data-testid="doc-customer-summary"
        >
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 shrink-0">
            Bill to
          </span>
          <span className="flex-1 min-w-0 truncate text-sm font-semibold text-slate-800">
            {summary || "Add customer details"}
          </span>
          <span className="text-slate-400 text-[10px] shrink-0" aria-hidden>
            ▶
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 pb-3 border-b border-slate-200" data-testid="doc-customer-header">
      <button
        type="button"
        className="w-full flex items-center gap-2 text-left mb-2"
        onClick={() => setOpen(false)}
        aria-expanded
        data-testid="doc-customer-collapse"
      >
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 flex-1">Bill to</p>
        <span className="text-slate-400 text-[10px]" aria-hidden>
          ▼
        </span>
      </button>
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

/** One read-only fact line inside the gray summary box. */
function FactRow({ label, value }) {
  if (!String(value || "").trim()) return null;
  return (
    <div className="flex gap-2 items-baseline">
      <dt className="font-semibold text-slate-500 shrink-0 w-[5.5rem]">{label}</dt>
      <dd className="text-slate-800 break-words min-w-0">{value}</dd>
    </div>
  );
}

/**
 * Gray "facts" box: all customer + service-address + basic info stated up top,
 * read-only, with one Edit button that reveals the fields only when needed
 * (Levi: condensed; edit customer info only if you have to).
 */
function CustomerFactsPanel({
  job,
  allJobs,
  events,
  api,
  onPatch,
  allowCustomerSearch,
  serviceAddress,
  apartment,
  onServiceAddress,
  onApartment,
  startEditing,
  coControls,
  docLabel,
  docNo,
  invoicedAmount,
  dueAmount,
  progressPct,
}) {
  const [editing, setEditing] = useState(!!startEditing);

  const applyCustomer = async (c) => {
    if (!c) return;
    if (c._newCustomer) {
      onPatch({ businessName: c.name || "", customer: c.name || "", qboCustomerId: "" });
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
  const svcLine = [serviceAddress, apartment && "Apt " + apartment].filter(Boolean).join(", ");

  return (
    <div
      className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
      data-testid="doc-customer-facts"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex-1">
          Bill to
        </p>
        <button
          type="button"
          className="text-[11px] font-semibold text-slate-600 hover:text-brand px-2 py-0.5 rounded-md border border-slate-200 bg-white shrink-0"
          onClick={() => setEditing((v) => !v)}
          data-testid="doc-facts-edit-toggle"
          aria-pressed={editing}
        >
          {editing ? "Done" : "✏️ Edit"}
        </button>
      </div>

      {editing ? (
        <div className="space-y-2">
          {allowCustomerSearch ? (
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
          ) : (
            <div className="text-sm font-bold text-slate-800 px-0.5">
              {job.businessName || job.customer || "—"}
            </div>
          )}
          <Fld label="Person name">
            <input className="input" value={job.personName || ""} onChange={set("personName")} aria-label="Person name" />
          </Fld>
          <div className="grid grid-cols-2 gap-2">
            <Fld label="Phone">
              <input className="input" value={job.phone || ""} onChange={set("phone")} aria-label="Phone" inputMode="tel" />
            </Fld>
            <Fld label="Email">
              <input className="input" value={job.email || ""} onChange={set("email")} aria-label="Email" inputMode="email" />
            </Fld>
          </div>
          <Fld label="Billing address" hint="Saved addresses first, then real-world matches as you type">
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
          <Fld label="Service address" hint="Where the work is — pick a saved site or type a new one">
            <div className="flex items-stretch gap-1.5">
              <ServiceAddressField
                job={job}
                jobs={allJobs}
                events={events}
                value={serviceAddress}
                onChange={onServiceAddress}
                onApartmentChange={onApartment}
                suggestAddresses={api.suggestAddresses?.bind(api)}
                testId="doc-service-address"
                partialOk={false}
                sitePicker="dropdown"
                compact
              />
              <input
                className="input !w-[4.5rem] shrink-0"
                value={apartment}
                onChange={(e) => onApartment(e.target.value)}
                aria-label="Apartment"
                placeholder="Apt"
                data-testid="doc-apartment"
              />
            </div>
          </Fld>
          <Fld label="Job title / scope" hint="What this invoice is for">
            <input className="input" value={job.title || ""} onChange={set("title")} aria-label="Job title" />
          </Fld>
          {coControls}
        </div>
      ) : (
        <dl className="text-xs space-y-1" data-testid="doc-facts-list">
          <FactRow label="Customer" value={job.businessName || job.customer} />
          <FactRow label={docLabel || "Invoice"} value={docNo ? "#" + docNo : ""} />
          <FactRow label="Service" value={svcLine} />
          <FactRow label="Invoiced" value={invoicedAmount > 0 ? fmt$(invoicedAmount) : ""} />
          <FactRow label="Due" value={dueAmount > 0 ? fmt$(dueAmount) : ""} />
          {progressPct != null ? <FactRow label="Progress" value={progressPct + "%"} /> : null}
          <FactRow label="Contact" value={job.personName} />
          <FactRow label="Phone" value={job.phone} />
          <FactRow label="Email" value={job.email} />
          <FactRow label="Billing" value={job.billingAddress} />
          <FactRow label="Scope" value={job.title} />
          {coControls ? <div className="pt-1">{coControls}</div> : null}
        </dl>
      )}
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
  editableCustomer = true,
  draftMode = false,
  allJobs,
  onCustomerPatch,
}) {
  const { patchAndSave, enqueue, logSend, showToast, api, createJob, jobs: storeJobs, events } = useStore();
  const tenantConfig = useTenantConfig();
  const appSettings = useAppSettings();
  void appSettings.quickbooks;
  void appSettings.quickbooksInvoices;
  void appSettings.quickbooksEstimates;
  // Send/view through QB for THIS doc kind — sync can stay on for the backend.
  const qboOn = isQuickbooksDocEnabled(kind, tenantConfig);
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
  // Progress invoice is intentional: from-estimate path, explicit flag, partial %, or fractional qty.
  // Do NOT auto-enable just because the job once had an estimate / Accepted stage.
  const seed = jobProp || {};
  const autoProgress =
    kind === "invoice" &&
    (progressPct != null ||
      mode === "from_estimate" ||
      mode === "turn_from_estimate" ||
      !!seed.invoiceProgressBilling ||
      (seed.invoiceProgressPct != null &&
        seed.invoiceProgressPct !== "" &&
        parseAmount(seed.invoiceProgressPct) < 99.99) ||
      (seed.invoiceLines || []).some((ln) => {
        const q = parseAmount(ln?.qty);
        return q > 0 && q < 0.9999;
      }));
  const [progressOn, setProgressOn] = useState(() => !!autoProgress);
  useEffect(() => {
    setProgressOn(!!autoProgress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, kind, mode, progressPct]);
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
  const [lines, setLines] = useState(() => initialLines(job, { kind, mode, progressPct }));
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
    // Re-open edit: prefer last saved progress % so 100% does not fall back to old 75%.
    if (job?.invoiceProgressPct != null && job.invoiceProgressPct !== "") {
      return String(job.invoiceProgressPct);
    }
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

  /** Progress invoice toggle — only when estimate-linked or already progressive. */
  const applyProgressToggle = (on) => {
    if (kind !== "invoice") return;
    const next = !!on;
    setProgressOn(next);
    patchJobState({ invoiceProgressBilling: next });
    if (next) {
      const contract = parseAmount(contractAmount) || contractTotalForJob(job) || linesTotal(lines);
      if (contract > 0 && !parseAmount(contractAmount)) setContractAmount(String(contract));
      const pct = parseAmount(progressPctEdit) || 100;
      if (pct < 100) {
        setLines((rows) => applyProgressPctToLines(rows, contractLines, pct));
      }
    }
  };

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
      // Load Letter → auto-invoice (Invoice_Attach_Load_Letter_SPEC): the doc
      // this letter rides on becomes the load-test invoice. Default the line to
      // the catalog "Load Letter" item + price ($500 in the LE catalog) when
      // the line has no rate yet — Levi can still change it. Idempotent: the
      // line is updated in place (keyed by lineIndex/letterId), never duplicated.
      if (draft.typeId === "load_letter") {
        const catalogItem =
          items.find((it) => /load\s*letter/i.test(it?.name || "") && it.price != null) || null;
        setLines((rows) =>
          rows.map((ln, idx) => {
            if (idx !== draft.lineIndex) return ln;
            if (parseAmount(ln.unitPrice) > 0) return ln;
            return {
              ...ln,
              itemName: (ln.itemName || "").trim() || (catalogItem?.name || "Load Letter"),
              itemId: ln.itemId || catalogItem?.id || "",
              unitPrice: catalogItem?.price != null ? catalogItem.price : 500,
              qty: parseAmount(ln.qty) > 0 ? ln.qty : 1,
            };
          })
        );
      }
      try {
        setAttUploading(true);
        const blob = await buildLetterheadPdfBlobWithPhotos({ draft });
        const fileName = letterPdfFileName(draft);
        const file = new File([blob], fileName, { type: "application/pdf" });
        const { uploadChatAttachment } = await import("../lib/chatAttach.js");
        const url = await uploadChatAttachment(file);
        const att = letterAttachmentFromUpload(draft, { url, name: fileName, mime: "application/pdf" });
        setAttachments((rows) => {
          const filtered = rows.filter((a) => a.letterId !== draft.id);
          return filtered.concat([att]);
        });
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
    [showToast, items]
  );


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
            // Scale from full line qty (not already-fractional qty) so 75→100 sticks.
            const base = fullLineQty(ln);
            const q = pct >= 99.99 ? base : roundQty(base * (pct / 100));
            return {
              ...ln,
              qty: q,
              contractQty: base,
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
          if (!rate) return { ...ln, unitPrice: val, qty: 1, progressBilling: true, contractQty: 1 };
          const base = fullLineQty(ln);
          const q = roundQty(val / rate);
          return {
            ...ln,
            qty: q,
            contractQty: base,
            progressBilling: q < base * 0.9999,
          };
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

  /** Open an attached file in a new tab (image preview or PDF viewer). */
  const openAttachment = (att) => {
    const url = String(att?.url || "").trim();
    if (!url) {
      showToast("That attachment has no file yet");
      return;
    }
    try {
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (!w) showToast("Allow pop-ups to view attachments");
    } catch {
      showToast("Couldn't open that file");
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

  /** @param {{ close?: boolean, printPdf?: boolean, toast?: string }} opts */
  const submitLocal = async (opts = {}) => {
    const close = opts.close !== false;
    const printPdf = !!opts.printPdf;
    const valid = validate(false);
    if (!valid) return null;

    setSaving(true);
    try {
      const jobId = await ensureJobId();
      if (!jobId) {
        return null;
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
        discountType,
        discountValue,
      });
      Object.assign(jobPatch, coTagsFromJob(activeJob));
      if (kind === "invoice") jobPatch.invoiceProgressBilling = !!progressOn;
      // Always stamp a real Inv # / Est # on save (never leave "Inv draft" after Save).
      const docNoKey = kind === "estimate" ? "estimateNo" : "invoiceNo";
      const preferredNo =
        (kind === "invoice" ? jobPatch._preferredInvoiceNo : jobPatch._preferredEstimateNo) ||
        preferredChangeOrderDocNo(activeJob, kind) ||
        "";
      const stampedNo = resolveDocNumberOnSave({
        kind,
        existing: activeJob[docNoKey] || jobPatch[docNoKey] || "",
        preferred: preferredNo,
        jobs: boardJobs,
      });
      if (stampedNo) jobPatch[docNoKey] = stampedNo;
      // Confirm flags so the invoice card never waits on a heal pass (Levi 2026-08-05).
      if (kind === "invoice" && stampedNo) jobPatch._invoiceConfirmed = true;
      if (kind === "estimate" && stampedNo) jobPatch._estimateConfirmed = true;
      if (attachments.length) {
        jobPatch.attachments = (job.attachments || []).concat(attachments);
      }
      if (letterDrafts.length) {
        let drafts = job.letterDrafts || [];
        for (const d of letterDrafts) drafts = upsertJobLetterDraft({ letterDrafts: drafts }, d);
        jobPatch.letterDrafts = drafts;
      }
      // Local apply is instant inside patchAndSave; network continues in background.
      void patchAndSave(jobId, jobPatch);
      // Keep builder fields in sync so a re-open does not look empty.
      setJob((o) => ({ ...o, id: jobId, ...jobPatch }));
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
      // SNAPPY: toast + close builder immediately so we land on the job's
      // estimate/invoice card under the customer — never wait on cloud save.
      showToast(
        opts.toast ||
          (printPdf
            ? "Saved + printed " + noLabel + " PDF"
            : "Saved " + noLabel + " on this job")
      );
      resumeFollowUpPrompts();
      onDone && onDone({ ...activeJob, ...jobPatch });
      if (close) onClose();
      return pdfJob;
    } catch (e) {
      showToast(String(e?.message || e || "Save failed"));
      return null;
    } finally {
      // Always clear Saving… so the button never sticks (Levi 2026-08-05).
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
      if (kind === "invoice") jobPatch.invoiceProgressBilling = !!progressOn;
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
      if (kind === "invoice") jobPatch.invoiceProgressBilling = !!progressOn;
      // Stamp Inv # / Est # on save so the job never stays stuck as "draft".
      const docNoKey = kind === "estimate" ? "estimateNo" : "invoiceNo";
      const preferredNo =
        (kind === "invoice" ? jobPatch._preferredInvoiceNo : jobPatch._preferredEstimateNo) ||
        preferredChangeOrderDocNo(activeJob, kind) ||
        "";
      const stampedNo = resolveDocNumberOnSave({
        kind,
        existing: activeJob[docNoKey] || jobPatch[docNoKey] || "",
        preferred: preferredNo,
        jobs: boardJobs,
      });
      if (stampedNo) {
        jobPatch[docNoKey] = stampedNo;
        for (const cmd of commands || []) {
          if (cmd.payload) cmd.payload[docNoKey] = stampedNo;
        }
      }
      if (keepOnCustomer) jobPatch.email = emailTo;
      else delete jobPatch.email;

      // Persist attachments + letter drafts on the job (submitLocal already
      // did). Without this a Save & Email left no letter on the record, so a
      // later resend from the job card had nothing to attach.
      if (attachments.length) {
        jobPatch.attachments = (job.attachments || []).concat(attachments);
      }
      if (letterDrafts.length) {
        let drafts = job.letterDrafts || [];
        for (const d of letterDrafts) drafts = upsertJobLetterDraft({ letterDrafts: drafts }, d);
        jobPatch.letterDrafts = drafts;
      }

      // Local first / network background — never block Save on cloud.
      // BUT a SEND must never outrun its durable save: invoice LE-251859 was
      // emailed to the customer (with the letter attached) while this promise
      // was still in flight, and the record never landed — leaving a customer
      // holding an invoice the business had no record of. When sending, we
      // keep the promise and await confirmation before the email goes out.
      const savePromise = patchAndSave(jobId, jobPatch);
      if (!send) void savePromise;

      const needsCustomer =
        mode !== "edit" && !String(activeJob.qboCustomerId || "").trim();

      // Levi decides per send whether the letter / photos ride along.
      const wantAttachments = opts.includeAttachments !== false;
      const attsForEmail = send ? (wantAttachments ? emailAttachments() : []) : attachments;
      const attsForQbo = attachments;
      const docSource = resolveDocSource(
        opts.docSource === DOC_SOURCE_LOCAL ? DOC_SOURCE_LOCAL : DOC_SOURCE_QBO,
        undefined,
        kind
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
          // send=save atomicity: confirm the invoice is durably stored BEFORE
          // it reaches the customer. If the save fails we do not send — a
          // missing record is recoverable, an unrecorded sent invoice is not.
          try {
            await savePromise;
          } catch (err) {
            showToast(
              "Not sent — " +
                label +
                " could not be saved (" +
                String(err?.message || err).slice(0, 60) +
                "). Nothing went to the customer; try again."
            );
            return;
          }
          let res = null;
          // Approved letter (+ any builder attachment) must land in the SAME
          // email as the invoice — build the parts from the builder's live
          // state, which is authoritative before the job round-trips.
          let extraAttachments = [];
          try {
            const { buildEmailAttachmentParts } = await import("../lib/emailAttachments.js");
            extraAttachments = await buildEmailAttachmentParts({
              attachments: attsForEmail,
              letterDrafts,
            });
          } catch {
            extraAttachments = [];
          }
          try {
            if (typeof api.sendDocEmailNow === "function") {
              res = await api.sendDocEmailNow(pdfJob, kind, {
                email: emailTo,
                includePaymentLink: withPay,
                message: customMsg,
                subject: opts.subject || "",
                extraAttachments,
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
      <CustomerFactsPanel
        job={job}
        allJobs={boardJobs}
        events={events}
        api={api}
        onPatch={patchJobState}
        allowCustomerSearch
        serviceAddress={serviceAddress}
        apartment={apartment}
        onServiceAddress={setServiceAddress}
        onApartment={setApartment}
        startEditing={false}
        docLabel={kind === "estimate" ? "Estimate" : "Invoice"}
        docNo={kind === "estimate" ? (job.estimateNo || "") : (job.invoiceNo || "")}
        invoicedAmount={0}
        dueAmount={0}
        progressPct={null}
      />

      {/* CO + Progress toggles — service address lives in the facts panel Edit view */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        {canToggleCo || alreadyCo || asChangeOrder ? (
          <div className="flex items-center gap-1.5" data-testid="doc-co-toggle-row">
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
        {canShowProgressToggle ? (
          <div className="flex items-center gap-1.5" data-testid="doc-progress-toggle-row">
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
              {/* Tap the name to actually view the file — the row used to be
                  dead text with no way to open what was attached. */}
              <button
                type="button"
                className="flex-1 truncate min-w-[6rem] text-left underline decoration-dotted underline-offset-2 text-slate-700"
                onClick={() => openAttachment(a)}
                title={"View " + (a.name || "attachment")}
                data-testid={"doc-attachment-view-" + (i + 1)}
              >
                {isImageAttachment(a) ? "🖼" : "📎"} {a.name}
              </button>
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
          attachmentCount={emailAttachments().length}
          attachmentLabel={emailAttachments()
            .map((a) => a.name)
            .filter(Boolean)
            .join(", ")}
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
          docAttachments={attachments}
          onClose={() => setLetterQ(null)}
          onSave={onLetterSaved}
        />
      ) : null}

    </Sheet>
  );
}