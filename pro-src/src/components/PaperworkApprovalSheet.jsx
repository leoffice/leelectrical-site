// Levi's RED LINE — pre-submit approval for browser-driven paperwork.
//
// A create_case run parks at awaiting_approval with the fleet's screenshot of
// the filled Energy Services Review page. This sheet shows the screenshot +
// the case data that was filled; ONLY the Approve button lets the fleet click
// Submit (the backend also refuses submitted unless status is approved).
// Keep this gate until Levi removes it.
import React, { useState } from "react";
import Sheet from "./Sheet.jsx";
import {
  approvePaperworkJob,
  paperworkJobStatusLabel,
  paperworkScreenshotUrl,
} from "../lib/paperworkJobs.js";

const s = (v) => (v == null ? "" : String(v).trim());

/** Human rows from the create-case payload (plain values only). */
function payloadRows(payload = {}) {
  const skip = new Set(["answers", "skill", "stopAt", "autoSubmit", "jobId"]);
  const rows = [];
  for (const [k, v] of Object.entries(payload || {})) {
    if (skip.has(k) || v == null || v === "") continue;
    if (typeof v === "object") {
      if (Array.isArray(v) && v.every((x) => typeof x !== "object")) {
        rows.push([k, v.join(", ")]);
      }
      continue;
    }
    rows.push([k, String(v)]);
  }
  return rows;
}

export default function PaperworkApprovalSheet({ pwJob, onClose, onDecided }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [decided, setDecided] = useState("");
  const shotUrl = paperworkScreenshotUrl(pwJob);

  const decide = async (approve) => {
    setBusy(true);
    setErr("");
    try {
      const r = await approvePaperworkJob(pwJob.id, approve, note);
      if (!r.ok) {
        setErr(r.error || "Could not record the decision — try again");
        return;
      }
      setDecided(approve ? "approved" : "rejected");
      onDecided?.(r.job);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Review before submit"
      onClose={onClose}
      tall
      testId="paperwork-approval-sheet"
    >
      {decided ? (
        <div className="space-y-3 p-1">
          <div
            className={`rounded-2xl border p-4 ${
              decided === "approved"
                ? "bg-emerald-50 border-emerald-200"
                : "bg-red-50 border-red-200"
            }`}
          >
            <div className="font-extrabold text-sm">
              {decided === "approved"
                ? "Approved — the agent will click Submit and report the case number here."
                : "Rejected — the agent will NOT submit this case."}
            </div>
          </div>
          <button type="button" className="btn-ghost w-full !py-2.5 font-bold" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-3 p-1">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3">
            <div className="text-[12px] font-extrabold text-red-800 uppercase tracking-wide">
              Nothing is submitted without you
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              The browser agent filled the Con Ed case to the Review screen and
              stopped. Check the screenshot and the data — Submit only happens if
              you approve.
            </p>
          </div>

          {shotUrl ? (
            <a href={shotUrl} target="_blank" rel="noreferrer" className="block">
              <img
                src={shotUrl}
                alt="Pre-submit review screenshot"
                className="w-full rounded-xl border border-slate-200"
                data-testid="approval-screenshot"
              />
            </a>
          ) : (
            <p className="text-xs text-amber-700 font-semibold px-1">
              No screenshot attached yet — ask the agent to re-send, or reject.
            </p>
          )}

          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            {payloadRows(pwJob?.payload).map(([k, v]) => (
              <div key={k} className="flex gap-2 px-3 py-1.5 text-[12px]">
                <span className="text-slate-500 w-32 shrink-0 break-words">{k}</span>
                <span className="text-slate-800 font-semibold min-w-0 break-words">{v}</span>
              </div>
            ))}
          </div>

          <input
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-[14px]"
            placeholder="Note (optional — included with reject)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {err ? <p className="text-xs font-bold text-red-600">{err}</p> : null}
          <button
            type="button"
            className="btn bg-emerald-700 text-white w-full !py-3 text-sm font-extrabold min-h-[44px] disabled:opacity-60"
            disabled={busy}
            onClick={() => decide(true)}
            data-testid="approval-approve"
          >
            {busy ? "Saving…" : "Approve — submit this case"}
          </button>
          <button
            type="button"
            className="btn w-full !py-2.5 text-sm font-bold border border-red-300 text-red-700 disabled:opacity-60"
            disabled={busy}
            onClick={() => decide(false)}
            data-testid="approval-reject"
          >
            Reject — do not submit
          </button>
          <p className="text-[11px] text-slate-500 text-center">
            Status: {paperworkJobStatusLabel(pwJob?.status)}
          </p>
        </div>
      )}
    </Sheet>
  );
}
