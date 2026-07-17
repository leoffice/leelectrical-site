// Customer detail view — opened by tapping anywhere on a customer card in the
// Jobs list (route /customer/:key). Customer card on top; sub-companies when
// parent; invoices/estimates tabs — jobs open from those lists or job detail.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import Jobs from "./Jobs.jsx";
import CustomerCard from "../components/CustomerCard.jsx";
import CustomerTransactionHistory from "../components/CustomerTransactionHistory.jsx";
import CustomerDocTabs from "../components/CustomerDocTabs.jsx";
import JobDocSheets, { openDocTab } from "../components/JobDocSheets.jsx";
import { buildQboHierarchyCtx, subsUnderParent } from "../lib/customerHierarchy.js";
import { fmt$ } from "../lib/format.js";
import StepBubbleSheet from "../components/StepBubbleSheet.jsx";
import {
  completeAwarenessBubble,
  revertAwarenessBubble,
  skipAwarenessBubble,
  tapAwarenessBubble,
} from "../lib/bubbleHandlers.js";
import { CustEditSheet, PaperworkApptSheet, CustomerMenuSheet } from "../components/JobSheets.jsx";
import CustomerComposeSheet from "../components/CustomerComposeSheet.jsx";
import { sortJobs } from "../lib/stages.js";
import {
  customerAmountSummary,
  customerContact,
  jobsForCustomerKey,
  PENDING_IMPORT_LS,
} from "../lib/customers.js";
import { touchCustomer } from "../lib/customerRecency.js";
import { waitForCommandDone } from "../lib/commandWait.js";

export default function CustomerView() {
  const { key: raw } = useParams();
  const nav = useNavigate();
  const { jobs, loading, events, commands, patchJob, refreshJobs, api, enqueue, showToast } = useStore();
  const [qboIndex, setQboIndex] = useState([]);
  const [shortTxns, setShortTxns] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .searchCustomers("")
      .then((list) => {
        if (!cancelled) setQboIndex(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api]);
  const key = raw ? decodeURIComponent(raw) : "";
  const [sheet, setSheet] = useState(null); // { kind, job? }
  const setDocSheet = useCallback((next) => {
    setSheet((prev) => {
      const patch = typeof next === "function" ? next(prev) : next;
      if (!patch) return patch;
      if (patch.job) return patch;
      const job = prev?.job;
      return job ? { ...patch, job } : patch;
    });
  }, []);
  const [importing, setImporting] = useState(false);
  const [importTimedOut, setImportTimedOut] = useState(false);
  const lastListRef = useRef([]);

  const importHints = useMemo(() => {
    try {
      const pending = JSON.parse(sessionStorage.getItem(PENDING_IMPORT_LS) || "null");
      if (!pending || pending.key !== key) return null;
      return { name: pending.name || "", qboId: pending.qboId || "" };
    } catch {
      return null;
    }
  }, [key]);
  const list = useMemo(
    () => sortJobs(jobsForCustomerKey(jobs, key, importHints || undefined, qboIndex)),
    [jobs, key, importHints, qboIndex]
  );
  if (list.length) lastListRef.current = list;
  const displayJobs = list.length ? list : lastListRef.current;
  useEffect(() => {
    if (key) touchCustomer(key, displayJobs);
  }, [key, displayJobs]);
  const contact = useMemo(() => customerContact(displayJobs), [displayJobs]);
  const summary = useMemo(() => customerAmountSummary(displayJobs), [displayJobs]);
  const primaryJob = displayJobs[0];
  const qboHierarchy = useMemo(() => buildQboHierarchyCtx(qboIndex), [qboIndex]);
  const subs = useMemo(() => {
    if (!key.startsWith("p:")) return [];
    return subsUnderParent(jobs, key, qboHierarchy);
  }, [jobs, key, qboHierarchy]);

  useEffect(() => {
    let pending = null;
    try {
      pending = JSON.parse(sessionStorage.getItem(PENDING_IMPORT_LS) || "null");
    } catch {}
    if (!pending || pending.key !== key) {
      setImporting(false);
      setImportTimedOut(false);
      return;
    }
    setImporting(true);
    setImportTimedOut(false);
    let cancelled = false;
    const hints = { name: pending.name || "", qboId: pending.qboId || "" };
    const testMode = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.MODE === "test";

    const customerHasJobs = async () => {
      const meta = await refreshJobs?.(true);
      if (cancelled) return true;
      return jobsForCustomerKey(meta?.jobs || [], key, hints, qboIndex).length > 0;
    };

    (async () => {
      if (await customerHasJobs()) {
        setImporting(false);
        sessionStorage.removeItem(PENDING_IMPORT_LS);
        return;
      }
      if (pending.idempotencyKey) {
        const wait = await waitForCommandDone(api, pending.idempotencyKey, {
          maxMs: testMode ? 80 : 120000,
          intervalMs: testMode ? 15 : 2000,
        });
        if (cancelled) return;
        if (await customerHasJobs()) {
          setImporting(false);
          sessionStorage.removeItem(PENDING_IMPORT_LS);
          return;
        }
        if (!wait.ok && !wait.timeout) {
          setImporting(false);
          setImportTimedOut(true);
          showToast?.(String(wait.cmd?.error || "Import failed"));
          return;
        }
      }
      for (let n = 0; n < 30 && !cancelled; n++) {
        await new Promise((r) => setTimeout(r, testMode ? 15 : 3000));
        if (await customerHasJobs()) {
          setImporting(false);
          sessionStorage.removeItem(PENDING_IMPORT_LS);
          return;
        }
      }
      if (!cancelled) {
        setImporting(false);
        setImportTimedOut(true);
        sessionStorage.removeItem(PENDING_IMPORT_LS);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, refreshJobs, api, qboIndex, showToast]);

  useEffect(() => {
    if (!displayJobs.length) return;
    let pending = null;
    try {
      pending = JSON.parse(sessionStorage.getItem(PENDING_IMPORT_LS) || "null");
    } catch {}
    if (!pending || pending.key !== key) return;
    sessionStorage.removeItem(PENDING_IMPORT_LS);
    setImporting(false);
  }, [displayJobs, key]);

  const retryImport = async () => {
    let pending = null;
    try {
      pending = JSON.parse(sessionStorage.getItem(PENDING_IMPORT_LS) || "null");
    } catch {}
    const hints = importHints || pending || {};
    const qboId = String(hints.qboId || "").trim();
    const name = String(hints.name || "").trim();
    if (!qboId && !name) return showToast("Nothing to import — search for this customer again");
    const importKey = qboId || name;
    const idk = "import_customer|" + importKey + "|retry|" + Date.now();
    try {
      sessionStorage.setItem(
        PENDING_IMPORT_LS,
        JSON.stringify({ key, name, qboId, started: Date.now(), idempotencyKey: idk })
      );
    } catch {}
    setImportTimedOut(false);
    setImporting(true);
    await enqueue(
      "import_customer",
      "import-" + importKey,
      { name, qboId },
      "deterministic",
      idk
    );
    const testMode = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.MODE === "test";
    const wait = await waitForCommandDone(api, idk, { maxMs: testMode ? 80 : 120000, intervalMs: testMode ? 15 : 2000 });
    await refreshJobs?.(true);
    if (wait.ok) showToast("Import finished — refreshing customer");
    else if (wait.timeout) showToast("Still pulling — give it another moment");
    else showToast(String(wait.cmd?.error || "Import failed"));
    setImporting(false);
    if (!wait.ok && !wait.timeout) setImportTimedOut(true);
  };

  if (!displayJobs.length) {
    return (
      <div className="card px-6 py-12 text-center text-slate-400 text-sm" data-testid="customer-view-empty">
        {importing || (loading && !lastListRef.current.length) ? (
          <div>
            <p className="font-semibold text-slate-600 mb-1">
              {importing ? "Importing customer…" : "Loading…"}
            </p>
            {importing ? (
              <p className="text-xs text-slate-400">Pulling from your local file — usually a few seconds.</p>
            ) : null}
          </div>
        ) : importTimedOut ? (
          <div className="space-y-3">
            <p className="text-slate-600">Import didn&apos;t finish loading this customer yet.</p>
            <button type="button" className="btn bg-brand text-white" data-testid="customer-import-retry" onClick={retryImport}>
              Try import again
            </button>
            <p className="text-xs">
              <Link className="text-brand font-semibold" to="/">
                Back to customers
              </Link>
            </p>
          </div>
        ) : (
          <>
            No jobs for this customer.{" "}
            <Link className="text-brand font-semibold" to="/">
              Back to customers
            </Link>
          </>
        )}
      </div>
    );
  }

  const openDocFor = (j, kind) => {
    openDocTab(j, kind, (s) => setDocSheet({ ...s, job: j }));
  };
  const openDocForBubble = (j, kind, setSheetFn) => {
    openDocTab(j, kind, (s) => setSheetFn({ ...s, job: j }));
  };

  const panel = (
    <div className="space-y-3.5 min-w-0" data-testid="customer-view">
      <div className="flex items-center gap-2">
        <button className="inline-flex items-center gap-1 text-sm font-semibold text-brand min-w-0" onClick={() => nav("/")}>
          ‹ Customers
        </button>
        <button
          type="button"
          className="btn-ghost !py-1 !px-2 ml-auto shrink-0"
          aria-label="Customer options"
          data-testid="customer-menu-btn"
          onClick={() => setSheet({ kind: "custMenu" })}
        >
          ⋮
        </button>
      </div>

      <CustomerCard
        contact={contact}
        summary={summary}
        primaryJob={primaryJob}
        shortTxns={shortTxns}
        onShortTxnsChange={
          !(key.startsWith("p:") && subs.length > 0) ? setShortTxns : undefined
        }
        onEdit={() => setSheet({ kind: "cust", job: primaryJob })}
        onText={() =>
          setSheet({
            kind: "compose",
            channel: "sms",
            job: primaryJob || {
              id: "customer:" + key,
              customer: contact.name,
              phone: contact.phone,
              email: contact.email,
            },
          })
        }
        onEmail={() =>
          setSheet({
            kind: "compose",
            channel: "email",
            job: primaryJob || {
              id: "customer:" + key,
              customer: contact.name,
              phone: contact.phone,
              email: contact.email,
            },
          })
        }
      />

      {/* Parent with subs: sub-company list. Leaf: doc tabs always; short-txns ledger under tabs. */}
      {subs.length > 0 ? (
        <div className="card px-3 py-2.5 space-y-1.5" data-testid="customer-sub-companies">
          <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider px-0.5">
            Sub companies ({subs.length})
          </h2>
          {subs.map((sub) => (
            <button
              key={sub.key}
              type="button"
              className="w-full text-left rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 active:bg-slate-100"
              data-testid="customer-sub-row"
              onClick={() => nav("/customer/" + encodeURIComponent(sub.key))}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-800 truncate">{sub.name}</span>
                <span className="text-sm font-semibold tabular-nums shrink-0">{fmt$(sub.summary.due) || "$0"}</span>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {/* Order: customer card → Invoice/Estimates/CO/Addresses tabs → short transaction list */}
      {!(key.startsWith("p:") && subs.length > 0) ? (
        <>
          <CustomerDocTabs jobs={displayJobs} fromCust={key} />
          {shortTxns ? (
            <CustomerTransactionHistory jobs={displayJobs} fromCust={key} />
          ) : null}
        </>
      ) : null}

      {sheet?.kind === "cust" && sheet.job ? (
        <CustEditSheet job={sheet.job} onClose={() => setSheet(null)} />
      ) : null}
      {sheet?.kind === "custMenu" ? (
        <CustomerMenuSheet
          customerKey={key}
          customerName={contact.name}
          jobCount={displayJobs.length}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet?.kind === "paperAppt" && sheet.job ? (
        <PaperworkApptSheet
          job={sheet.job}
          branch={sheet.branch}
          step={sheet.step}
          initialDt={sheet.initialDt}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet?.kind === "bubble" && sheet.job && sheet.bubble ? (
        <StepBubbleSheet
          bubble={sheet.bubble}
          onClose={() => setSheet(null)}
          onComplete={(b) => {
            const prompt = completeAwarenessBubble(sheet.job.id, sheet.job, b, patchJob);
            if (prompt) {
              setSheet({
                kind: "paperAppt",
                job: sheet.job,
                branch: prompt.branchKey,
                step: prompt.step,
                initialDt: prompt.initialDt,
              });
            } else {
              setSheet(null);
            }
          }}
          onSkip={(b) => {
            skipAwarenessBubble(sheet.job.id, b, patchJob);
            setSheet(null);
          }}
          onRevert={(b) => {
            revertAwarenessBubble(sheet.job.id, sheet.job, b, patchJob);
            setSheet(null);
          }}
          onOpen={(b) => {
            if (b.action === "record-deposit") {
              setSheet({ kind: "paymenu", job: sheet.job });
              return;
            }
            tapAwarenessBubble(sheet.job, b, (s) => setSheet({ ...s, job: sheet.job }), openDocForBubble);
          }}
          onCalendar={(b) =>
            setSheet({
              kind: "paperAppt",
              job: sheet.job,
              branch: b.branchKey,
              step: b.step,
              initialDt: b.date,
            })
          }
        />
      ) : null}
      {sheet?.kind === "compose" && sheet.job ? (
        <CustomerComposeSheet
          job={sheet.job}
          channel={sheet.channel || "email"}
          context={sheet.context || "general"}
          title={sheet.title}
          initialTo={sheet.initialTo}
          initialPhone={sheet.initialPhone}
          initialSubject={sheet.initialSubject}
          initialMessage={sheet.initialMessage}
          paymentUrl={sheet.paymentUrl}
          extraActions={sheet.extraActions}
          onClose={() => setSheet(null)}
        />
      ) : null}
      <JobDocSheets
        sheet={sheet?.job ? sheet : null}
        setSheet={setDocSheet}
        job={sheet?.job}
        onDocDone={() => setDocSheet(null)}
      />
    </div>
  );

  // Desktop: jobs list | customer detail (same split as job detail).
  return (
    <div className="lg:grid lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] lg:gap-5 lg:items-start">
      <div className="hidden lg:block sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden lg-scroll-hidden pr-1" data-testid="list-pane">
        <Jobs embedded collapseGroups />
      </div>
      {panel}
    </div>
  );
}