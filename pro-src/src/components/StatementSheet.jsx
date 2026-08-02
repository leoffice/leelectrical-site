// Generate Statement — type picker, selectable content, PDF preview/download, email.
// Spec §1a: same options as invoice/estimate (email + keep-once vs update customer).
import React, { useMemo, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import SendDocConfirmSheet from "./SendDocConfirmSheet.jsx";
import {
  STATEMENT_TYPES,
  DEFAULT_STATEMENT_TYPE,
  buildStatementModel,
  defaultSelectedIds,
  listStatementItems,
  statementFilename,
} from "../lib/statementDoc.js";
import { buildQbStatementPdf } from "../lib/statementPdf.js";
import {
  defaultStatementEmailBody,
  defaultStatementEmailSubject,
  buildStatementEmailPayload,
} from "../lib/statementEmail.js";
import {
  afterSendApprovedClose,
  EMAIL_POLICY_KEEP,
} from "../lib/sendDocConfirm.js";
import { fmt$ } from "../lib/format.js";
import { downloadPdfBlob } from "../lib/pdfOpen.js";
import LocalDocViewer from "./LocalDocViewer.jsx";
import { useStore } from "../state/store.jsx";
import { DOC_SOURCE_LOCAL } from "../lib/docSource.js";

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

export default function StatementSheet({
  jobs = [],
  customerName = "",
  customerEmail = "",
  billingAddress = "",
  /** Preferred job for patching email on "Keep this email". */
  primaryJob = null,
  scopeLabel = "customer",
  onClose,
}) {
  const { api, patchAndSave, showToast } = useStore();
  const allItems = useMemo(() => listStatementItems(jobs), [jobs]);

  const [type, setType] = useState(DEFAULT_STATEMENT_TYPE);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedIds, setSelectedIds] = useState(() =>
    defaultSelectedIds(allItems, DEFAULT_STATEMENT_TYPE)
  );
  const [busy, setBusy] = useState(false);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState("");

  // When type changes, re-default selection (open items → open only).
  const onTypeChange = (next) => {
    setType(next);
    const modelPreview = buildStatementModel({
      jobs,
      type: next,
      dateFrom,
      dateTo,
      customerName,
      customerEmail,
      billingAddress,
    });
    setSelectedIds(defaultSelectedIds(modelPreview.allItems, next));
  };

  const model = useMemo(
    () =>
      buildStatementModel({
        jobs,
        type,
        selectedIds,
        dateFrom,
        dateTo,
        customerName,
        customerEmail,
        billingAddress,
        includePayLinks: true,
      }),
    [jobs, type, selectedIds, dateFrom, dateTo, customerName, customerEmail, billingAddress]
  );

  const jobForSend = useMemo(() => {
    const base = primaryJob || jobs.find((j) => j?.email) || jobs[0] || {};
    return {
      ...base,
      customer: customerName || base.customer || base.businessName || "",
      businessName: base.businessName || customerName || "",
      email: customerEmail || base.email || "",
      // Statement has no invoiceNo — attachment name comes from kind handling.
      invoiceNo: "",
      estimateNo: "",
      _statementModel: model,
    };
  }, [primaryJob, jobs, customerName, customerEmail, model]);

  const toggleId = (id) => {
    setSelectedIds((prev) => {
      const set = new Set(prev.map(String));
      const key = String(id);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return [...set];
    });
  };

  const selectAll = () => setSelectedIds(allItems.map((r) => r.id));
  const selectOpen = () => setSelectedIds(allItems.filter((r) => r.isOpen).map((r) => r.id));

  const buildPdf = async () => {
    const blob = buildQbStatementPdf(model);
    if (!blob) throw new Error("pdf_failed");
    return blob;
  };

  const onPreview = async () => {
    setBusy(true);
    try {
      const blob = await buildPdf();
      // In-app viewer — a blob new-tab open is silently blocked in the
      // installed PWA / popup-blocked browsers (audit finding: Preview did
      // nothing). LocalDocViewer always renders, with download/share/native.
      setPreviewBlob(blob);
    } catch (err) {
      showToast("Could not build statement — try again");
      console.error("[statement] preview", err);
    } finally {
      setBusy(false);
    }
  };

  const onDownload = async () => {
    setBusy(true);
    try {
      const blob = await buildPdf();
      downloadPdfBlob(blob, statementFilename(model));
      showToast("Statement downloaded");
    } catch (err) {
      showToast("Could not download statement — try again");
      console.error("[statement] download", err);
    } finally {
      setBusy(false);
    }
  };

  const onApproveSend = async (confirmModel) => {
    setSendBusy(true);
    setSendError("");
    try {
      const email = String(confirmModel?.email || "").trim();
      if (!email.includes("@")) {
        setSendError("Add a recipient email.");
        setSendBusy(false);
        return;
      }

      // Keep this email → update customer (primary job record) — non-destructive (only email field).
      if (confirmModel.emailPolicy === EMAIL_POLICY_KEEP && jobForSend?.id) {
        try {
          await patchAndSave(jobForSend.id, { email });
        } catch {
          /* send still proceeds */
        }
      }

      const blob = await buildPdf();
      const pdfB64 = await blobToBase64(blob);
      const payload = buildStatementEmailPayload(model, {
        email,
        subject: confirmModel.subject,
        message: confirmModel.message,
        pdfB64,
      });

      let result = null;
      if (typeof api?.sendDocEmailNow === "function") {
        result = await api.sendDocEmailNow(jobForSend, "statement", {
          email,
          subject: payload.subject,
          message: payload.message,
          pdfB64,
          filename: payload.filename,
          statement: payload.statement,
          includePaymentLink: false,
        });
      } else {
        setSendError("Email send is not available right now.");
        setSendBusy(false);
        return;
      }

      if (!result?.ok) {
        const reason = result?.error || result?.reason || "send_failed";
        // Dry-run / missing key still counts as a soft success for office testing.
        if (result?.dryRun || reason === "no_api_key") {
          showToast("Statement ready — email path is test-mode (no live send key). PDF is fine.");
          await afterSendApprovedClose({
            ok: true,
            onClose: () => {
              setEmailOpen(false);
              onClose?.();
            },
          });
          setSendBusy(false);
          return;
        }
        setSendError(String(reason));
        setSendBusy(false);
        return;
      }

      showToast("Statement sent to " + email);
      await afterSendApprovedClose({
        ok: true,
        onClose: () => {
          setEmailOpen(false);
          onClose?.();
        },
      });
    } catch (err) {
      setSendError(String(err?.message || err));
    } finally {
      setSendBusy(false);
    }
  };

  if (emailOpen) {
    return (
      <SendDocConfirmSheet
        job={jobForSend}
        kind="statement"
        docSource={DOC_SOURCE_LOCAL}
        withPay={false}
        initialEmail={model.customerEmail || jobForSend.email}
        busy={sendBusy}
        error={sendError}
        onBack={() => {
          setEmailOpen(false);
          setSendError("");
        }}
        onApprove={onApproveSend}
      />
    );
  }

  const showRange = type === "activity" || type === "balance_forward";

  return (
    <Sheet title="Generate Statement" onClose={onClose} tall testId="statement-sheet">
      <p className="text-sm text-slate-500 mb-3" data-testid="statement-intro">
        Build a statement for this {scopeLabel}. Pick the type, choose what to include, then preview,
        download, or email.
      </p>

      {/* Type picker */}
      <div className="mb-3" data-testid="statement-type-picker" role="group" aria-label="Statement type">
        <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">
          Statement type
        </p>
        <div className="grid grid-cols-1 gap-1.5">
          {STATEMENT_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`rounded-xl border px-3 py-2.5 text-left text-sm ${
                type === t.id
                  ? "bg-brand-soft text-brand border-brand/40 font-bold"
                  : "bg-white text-slate-700 border-slate-200"
              }`}
              onClick={() => onTypeChange(t.id)}
              data-testid={"statement-type-" + t.id}
            >
              <span className="font-extrabold block">{t.label}</span>
              <span className="text-[11px] opacity-80 font-semibold">{t.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Date range (activity / balance-forward) */}
      {showRange ? (
        <div className="grid grid-cols-2 gap-2 mb-3" data-testid="statement-date-range">
          <Fld label="From">
            <input
              type="date"
              className="input"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              data-testid="statement-date-from"
            />
          </Fld>
          <Fld label="To">
            <input
              type="date"
              className="input"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              data-testid="statement-date-to"
            />
          </Fld>
        </div>
      ) : null}

      {/* Selectable content */}
      <div className="mb-3" data-testid="statement-item-picker">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            Include invoices
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-[11px] font-bold text-brand"
              onClick={selectAll}
              data-testid="statement-select-all"
            >
              All
            </button>
            <button
              type="button"
              className="text-[11px] font-bold text-brand"
              onClick={selectOpen}
              data-testid="statement-select-open"
            >
              Open only
            </button>
          </div>
        </div>
        {!allItems.length ? (
          <p className="text-xs text-slate-400 text-center py-3">No invoices on file for this {scopeLabel}.</p>
        ) : (
          <div className="max-h-52 overflow-y-auto space-y-1 rounded-xl border border-slate-200 p-2">
            {allItems.map((r) => {
              const on = selectedIds.map(String).includes(String(r.id));
              return (
                <label
                  key={r.id}
                  className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm cursor-pointer ${
                    on ? "bg-brand-soft/60" : "hover:bg-slate-50"
                  }`}
                  data-testid={"statement-item-" + r.invoiceNo}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={on}
                    onChange={() => toggleId(r.id)}
                    data-testid={"statement-check-" + r.invoiceNo}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold block">
                      #{r.invoiceNo} · {r.date || "—"}
                    </span>
                    <span className="text-[11px] text-slate-500 block truncate">{r.description}</span>
                  </span>
                  <span
                    className={`text-xs tabular-nums shrink-0 font-bold ${
                      r.isOpen ? "text-red-700" : "text-emerald-700"
                    }`}
                  >
                    {fmt$(r.balance) || "$0"}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Balance summary */}
      <div
        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 mb-3 text-sm"
        data-testid="statement-summary"
      >
        <div className="flex justify-between gap-2">
          <span className="text-slate-600">Charges</span>
          <span className="font-semibold tabular-nums">{fmt$(model.totalCharge) || "$0.00"}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-slate-600">Payments</span>
          <span className="font-semibold tabular-nums">{fmt$(model.totalPaid) || "$0.00"}</span>
        </div>
        {model.type === "balance_forward" && model.priorBalance ? (
          <div className="flex justify-between gap-2">
            <span className="text-slate-600">Prior balance</span>
            <span className="font-semibold tabular-nums">{fmt$(model.priorBalance)}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-2 mt-1 pt-1 border-t border-slate-200">
          <span className="font-extrabold text-slate-800">Balance due</span>
          <span className="font-extrabold tabular-nums text-brand" data-testid="statement-balance-due">
            {fmt$(model.totalDue) || "$0.00"}
          </span>
        </div>
      </div>

      <button
        type="button"
        className="btn-brand w-full mb-2"
        disabled={busy || !model.rows.length}
        onClick={onPreview}
        data-testid="statement-preview"
      >
        {busy ? "Building…" : "Preview PDF"}
      </button>
      <button
        type="button"
        className="btn w-full mb-2 border border-slate-200"
        disabled={busy || !model.rows.length}
        onClick={onDownload}
        data-testid="statement-download"
      >
        Download PDF
      </button>
      <button
        type="button"
        className="btn w-full mb-2 border border-brand/30 bg-brand-soft/40 text-brand font-bold"
        disabled={busy || !model.rows.length}
        onClick={() => {
          setSendError("");
          setEmailOpen(true);
        }}
        data-testid="statement-email"
      >
        📧 Send to email
      </button>
      <button type="button" className="btn-ghost w-full" onClick={onClose} data-testid="statement-close">
        Close
      </button>
      {previewBlob ? (
        <LocalDocViewer
          blob={previewBlob}
          title={`Statement — ${model.customerName || "Customer"}`}
          filename={statementFilename(model)}
          onClose={() => setPreviewBlob(null)}
        />
      ) : null}
    </Sheet>
  );
}

// Re-export defaults for tests that import from the sheet module path.
export { defaultStatementEmailBody, defaultStatementEmailSubject };
