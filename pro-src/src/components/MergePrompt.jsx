// "Same customer?" bottom sheet (bug #2). After jobs load, offers to combine
// near-duplicate customer names — contact info compared immediately side by side.
import React, { useMemo, useState } from "react";
import { useStore } from "../state/store.jsx";
import Sheet, { Opt } from "./Sheet.jsx";
import SideBySideCompare from "./SideBySideCompare.jsx";
import {
  customerContactCompareRows,
  customerProfileFromJobs,
  dismissPair,
  findMergeSuggestion,
} from "../lib/customers.js";
import { fmt$ } from "../lib/format.js";

function ProfileColumn({ profile }) {
  const rows = [
    ["Business name", profile.businessName],
    profile.personName ? ["Contact person", profile.personName] : null,
    ["Phone", profile.phone],
    ["Email", profile.email],
    ["Billing address", profile.billingAddress],
    profile.qboCustomerId ? ["QuickBooks ID", profile.qboCustomerId] : null,
    profile.serviceAddresses.length
      ? ["Service address" + (profile.serviceAddresses.length > 1 ? "es" : ""), profile.serviceAddresses.join("\n")]
      : null,
    [profile.jobCount === 1 ? "Job" : "Jobs (" + profile.jobCount + ")", profile.jobLines.join("\n")],
    profile.totalDue > 0 ? ["Balance due", fmt$(profile.totalDue)] : null,
  ].filter(Boolean);

  return (
    <div className="min-w-0 flex-1 border border-slate-200 rounded-2xl bg-slate-50/80 overflow-hidden" data-testid="merge-compare-col">
      <div className="px-3 py-2.5 bg-white border-b border-slate-200">
        <div className="font-bold text-sm text-slate-900 break-words">{profile.name}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          {profile.jobCount} job{profile.jobCount === 1 ? "" : "s"}
          {profile.totalDue > 0 ? " · " + fmt$(profile.totalDue) + " due" : ""}
        </div>
      </div>
      <dl className="px-3 py-2.5 space-y-2.5 text-xs">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="font-bold text-slate-500 uppercase tracking-wide text-[10px]">{label}</dt>
            <dd className="text-slate-800 mt-0.5 whitespace-pre-wrap break-words">{value || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CompareSheet({ sug, busy, onClose, onCombine, onSeparate }) {
  const left = useMemo(() => customerProfileFromJobs(sug.a.jobs, sug.a.name), [sug]);
  const right = useMemo(() => customerProfileFromJobs(sug.b.jobs, sug.b.name), [sug]);

  return (
    <Sheet title="Full customer profiles" onClose={onClose} wide tall>
      <p className="text-sm text-slate-600 mb-3">
        Jobs, balances, and all contact details for both names.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 mb-4" data-testid="merge-compare">
        <ProfileColumn profile={left} />
        <ProfileColumn profile={right} />
      </div>
      <Opt
        icon="🔗"
        title="Combine — same customer"
        note={"Group all " + (sug.a.jobs.length + sug.b.jobs.length) + " jobs under one row on the Jobs list"}
        onClick={onCombine}
        disabled={busy}
        data-testid="merge-compare-combine"
      />
      <Opt
        icon="✋"
        title="Separate customers"
        note="Keep them separate — won't ask about this pair again"
        onClick={onSeparate}
        data-testid="merge-compare-separate"
      />
    </Sheet>
  );
}

export default function MergePrompt() {
  const { jobs, loading, patchAndSave, showToast } = useStore();
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("prompt");

  const sug = useMemo(
    () => (loading ? null : findMergeSuggestion(jobs)),
    [jobs, loading, tick] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const contactRows = useMemo(() => {
    if (!sug) return [];
    const left = customerProfileFromJobs(sug.a.jobs, sug.a.name);
    const right = customerProfileFromJobs(sug.b.jobs, sug.b.name);
    return customerContactCompareRows(left, right);
  }, [sug]);

  if (!sug) return null;

  const combine = async () => {
    if (busy) return;
    setBusy(true);
    const all = [...sug.a.jobs, ...sug.b.jobs];
    const grp = all.map((j) => j.clientGroup).find(Boolean) || "grp" + Date.now();
    for (const j of all) await patchAndSave(j.id, { clientGroup: grp });
    setBusy(false);
    setMode("prompt");
    showToast("Jobs grouped under one client");
  };

  const separate = () => {
    dismissPair(sug.a.name, sug.b.name);
    setMode("prompt");
    setTick((t) => t + 1);
    showToast("Got it — separate customers");
  };

  if (mode === "compare") {
    return (
      <CompareSheet
        sug={sug}
        busy={busy}
        onClose={() => setMode("prompt")}
        onCombine={combine}
        onSeparate={separate}
      />
    );
  }

  return (
    <div
      className="fixed z-40 inset-x-3 bottom-20 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[440px] card border-amber-200 bg-amber-50 shadow-2xl px-4 py-3.5"
      data-testid="merge-prompt"
      role="dialog"
      aria-label="Same customer?"
    >
      <div className="font-bold text-slate-900 text-sm">Same customer?</div>
      <p className="text-sm text-slate-600 mt-1">
        {sug.reason === "contact"
          ? `“${sug.a.name}” and “${sug.b.name}” share the same phone or email — compare contact info below.`
          : `“${sug.a.name}” and “${sug.b.name}” look like the same person — compare contact info below.`}
      </p>
      <div className="mt-2">
        <SideBySideCompare
          leftTitle={sug.a.name}
          rightTitle={sug.b.name}
          rows={contactRows}
          testId="merge-contact-compare"
        />
      </div>
      <div className="mt-2.5 space-y-2">
        <button
          type="button"
          className="w-full text-left border border-slate-200 bg-white rounded-xl px-3 py-2.5 active:bg-slate-50"
          onClick={() => setMode("compare")}
          data-testid="merge-compare-btn"
        >
          <span className="block text-sm font-bold text-slate-900">View full profiles</span>
          <span className="block text-xs text-slate-500 mt-0.5">Jobs, balances, and all addresses</span>
        </button>
        <button
          type="button"
          className="w-full text-left border border-brand/30 bg-brand rounded-xl px-3 py-2.5 text-white disabled:opacity-60 active:opacity-90"
          onClick={combine}
          disabled={busy}
          data-testid="merge-combine-btn"
        >
          <span className="block text-sm font-bold">Combine — same customer</span>
          <span className="block text-xs text-white/85 mt-0.5">
            Group all jobs under one row on the Jobs list
          </span>
        </button>
        <button
          type="button"
          className="w-full text-left border border-slate-200 bg-white rounded-xl px-3 py-2.5 active:bg-slate-50"
          onClick={separate}
          data-testid="merge-separate-btn"
        >
          <span className="block text-sm font-bold text-slate-900">Separate customers</span>
          <span className="block text-xs text-slate-500 mt-0.5">
            Keep separate — won't ask about this pair again
          </span>
        </button>
      </div>
    </div>
  );
}