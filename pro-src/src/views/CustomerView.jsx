// Customer detail view — opened by tapping a customer group's name header in
// the Jobs list (route /customer/:key). Customer card on top; each job shows
// job information + linked appointment inline.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import Jobs from "./Jobs.jsx";
import CustomerCard from "../components/CustomerCard.jsx";
import JobInfoCard from "../components/JobInfoCard.jsx";
import JobDocSheets, { openDocTab } from "../components/JobDocSheets.jsx";
import StepBubbleSheet from "../components/StepBubbleSheet.jsx";
import {
  completeAwarenessBubble,
  revertAwarenessBubble,
  skipAwarenessBubble,
  tapAwarenessBubble,
} from "../lib/bubbleHandlers.js";
import { CustEditSheet, PaperworkApptSheet } from "../components/JobSheets.jsx";
import { sortJobs } from "../lib/stages.js";
import {
  customerAmountSummary,
  customerContact,
  jobsForCustomerKey,
  PENDING_IMPORT_LS,
} from "../lib/customers.js";

export default function CustomerView() {
  const { key: raw } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const jobAnchor = sp.get("job") || "";
  const { jobs, loading, events, commands, patchJob, syncNow, refreshJobs } = useStore();
  const key = raw ? decodeURIComponent(raw) : "";
  const [sheet, setSheet] = useState(null); // { kind, job? }
  const [importing, setImporting] = useState(false);
  const importPoll = useRef(null);
  const jobsSectionRef = useRef(null);

  const list = useMemo(() => sortJobs(jobsForCustomerKey(jobs, key)), [jobs, key]);
  const contact = useMemo(() => customerContact(list), [list]);
  const summary = useMemo(() => customerAmountSummary(list), [list]);
  const primaryJob = list[0];

  useEffect(() => {
    let pending = null;
    try {
      pending = JSON.parse(sessionStorage.getItem(PENDING_IMPORT_LS) || "null");
    } catch {}
    if (!pending || pending.key !== key) {
      setImporting(false);
      return;
    }
    setImporting(true);
    let n = 0;
    const tick = async () => {
      n += 1;
      await syncNow?.().catch(() => {});
      await refreshJobs?.(true);
      if (n < 20) importPoll.current = setTimeout(tick, 2000);
      else {
        setImporting(false);
        sessionStorage.removeItem(PENDING_IMPORT_LS);
      }
    };
    tick();
    return () => clearTimeout(importPoll.current);
  }, [key, syncNow, refreshJobs]);

  useEffect(() => {
    if (!list.length) return;
    const run = () => {
      const el = jobAnchor
        ? document.getElementById("job-card-" + jobAnchor)
        : jobsSectionRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
    };
    requestAnimationFrame(run);
  }, [key, jobAnchor, list.length]);

  useEffect(() => {
    if (!list.length) return;
    let pending = null;
    try {
      pending = JSON.parse(sessionStorage.getItem(PENDING_IMPORT_LS) || "null");
    } catch {}
    if (!pending || pending.key !== key) return;
    sessionStorage.removeItem(PENDING_IMPORT_LS);
    setImporting(false);
  }, [list, key]);

  if (!list.length) {
    return (
      <div className="card px-6 py-12 text-center text-slate-400 text-sm" data-testid="customer-view-empty">
        {loading || importing ? (
          <div>
            <p className="font-semibold text-slate-600 mb-1">
              {importing ? "Pulling from QuickBooks…" : "Loading…"}
            </p>
            {importing ? (
              <p className="text-xs text-slate-400">Open invoices will appear here in a few seconds.</p>
            ) : null}
          </div>
        ) : (
          <>
            No jobs for this customer.{" "}
            <Link className="text-brand font-semibold" to="/">
              Back to jobs
            </Link>
          </>
        )}
      </div>
    );
  }

  const openDocFor = (j, kind) => {
    openDocTab(j, kind, (s) => setSheet({ ...s, job: j }));
  };
  const openDocForBubble = (j, kind, setSheetFn) => {
    openDocTab(j, kind, (s) => setSheetFn({ ...s, job: j }));
  };

  const panel = (
    <div className="space-y-3.5 min-w-0" data-testid="customer-view">
      <button className="inline-flex items-center gap-1 text-sm font-semibold text-brand" onClick={() => nav("/")}>
        ‹ Jobs
      </button>

      <CustomerCard
        contact={contact}
        summary={summary}
        primaryJob={primaryJob}
        onEdit={() => setSheet({ kind: "cust", job: primaryJob })}
      />

      <h2
        ref={jobsSectionRef}
        className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider px-1 !mb-[-6px] scroll-mt-20"
        data-testid="customer-jobs-section"
      >
        Jobs ({list.length})
      </h2>
      <div className="space-y-3">
        {list.map((j) => (
          <div key={j.id} id={"job-card-" + j.id} className="scroll-mt-20">
          <JobInfoCard
            job={j}
            events={events}
            commands={commands}
            onOpen={() => nav("/job/" + j.id + "?from=" + encodeURIComponent(key))}
            onEstimate={() => openDocFor(j, "estimate")}
            onInvoice={() => openDocFor(j, "invoice")}
            onPayment={() => nav("/job/" + j.id + "?from=" + encodeURIComponent(key) + "&pay=1")}
            onCalendar={() => openDocFor(j, "calendar")}
            onBubbleTap={(bubble) =>
              tapAwarenessBubble(j, bubble, (s) => setSheet({ ...s, job: j }), openDocForBubble)
            }
          />
          </div>
        ))}
      </div>

      {sheet?.kind === "cust" && sheet.job ? (
        <CustEditSheet job={sheet.job} onClose={() => setSheet(null)} />
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
      <JobDocSheets
        sheet={sheet?.job ? sheet : null}
        setSheet={setSheet}
        job={sheet?.job}
        onDocDone={() => setSheet(null)}
      />
    </div>
  );

  // Desktop: jobs list | customer detail (same split as job detail).
  return (
    <div className="lg:grid lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] lg:gap-5 lg:items-start">
      <div className="hidden lg:block sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden pr-1" data-testid="list-pane">
        <Jobs embedded />
      </div>
      {panel}
    </div>
  );
}