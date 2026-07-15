// "Same customer?" bottom sheet (bug #2). After jobs load, offers to combine
// near-duplicate customer names — contact info compared immediately side by side.
import React, { useCallback, useMemo, useState } from "react";
import { useStore } from "../state/store.jsx";
import Sheet, { Opt } from "./Sheet.jsx";
import SideBySideCompare from "./SideBySideCompare.jsx";
import api from "../data/adapter.js";
import {
  customerContactCompareRows,
  customerProfileFromJobs,
  dismissPair,
  findMergeSuggestion,
  persistDismissed,
  snoozePair,
} from "../lib/customers.js";
import { parentCustomerPatch } from "../lib/customerHierarchy.js";
import { enqueueCustomerQboSync } from "../lib/customerQboEnqueue.js";
import { serviceAddressesExcludingBilling } from "../lib/addressSync.js";
import { fmt$ } from "../lib/format.js";

function LinkModeTabs({ mode, onChange }) {
  return (
    <div
      className="flex rounded-xl border border-slate-200 bg-white p-1 gap-1"
      data-testid="merge-link-tabs"
      role="tablist"
      aria-label="How to link these customers"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "combined"}
        className={
          "flex-1 rounded-lg px-2 py-2 text-xs font-bold transition-colors " +
          (mode === "combined" ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50")
        }
        onClick={() => onChange("combined")}
        data-testid="merge-tab-combined"
      >
        Combined
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "sub"}
        className={
          "flex-1 rounded-lg px-2 py-2 text-xs font-bold transition-colors " +
          (mode === "sub" ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50")
        }
        onClick={() => onChange("sub")}
        data-testid="merge-tab-sub"
      >
        Sub company
      </button>
    </div>
  );
}

function ProfileColumn({ profile, role, interactive, onTap, testId }) {
  const serviceOnly = serviceAddressesExcludingBilling(profile.serviceAddresses, profile.billingAddress);
  const roleRing =
    role === "parent"
      ? "border-emerald-400 ring-1 ring-emerald-300/80 bg-emerald-50/30"
      : role === "sub"
        ? "border-amber-700 ring-1 ring-amber-600/50 bg-amber-50/40"
        : "border-slate-200 bg-slate-50/80";

  const inner = (
    <>
      <div className={"px-3 py-2.5 bg-white border-b border-slate-200 " + (interactive ? "cursor-pointer" : "")}>
        <div className="font-bold text-sm text-slate-900 break-words">{profile.name}</div>
        {role === "parent" ? (
          <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 mt-0.5">Parent company</div>
        ) : role === "sub" ? (
          <div className="text-[10px] font-bold uppercase tracking-wide text-amber-900 mt-0.5">Sub company</div>
        ) : null}
        <div className="text-[11px] text-slate-500 mt-0.5">
          {profile.jobCount} job{profile.jobCount === 1 ? "" : "s"}
          {profile.totalDue > 0 ? " · " + fmt$(profile.totalDue) + " due" : ""}
        </div>
      </div>
      <dl className="px-3 py-2.5 space-y-2.5 text-xs">
        {[
          ["Business name", profile.businessName],
          profile.personName ? ["Contact person", profile.personName] : null,
          ["Phone", profile.phone],
          ["Email", profile.email],
          ["Billing address", profile.billingAddress],
          profile.qboCustomerId ? ["QuickBooks ID", profile.qboCustomerId] : null,
          serviceOnly.length
            ? [
                "Service address" + (serviceOnly.length > 1 ? "es" : ""),
                serviceOnly.join("\n"),
              ]
            : null,
          [profile.jobCount === 1 ? "Job" : "Jobs (" + profile.jobCount + ")", profile.jobLines.join("\n")],
          profile.totalDue > 0 ? ["Balance due", fmt$(profile.totalDue)] : null,
        ]
          .filter(Boolean)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="font-bold text-slate-500 uppercase tracking-wide text-[10px]">{label}</dt>
              <dd className="text-slate-800 mt-0.5 whitespace-pre-wrap break-words">{value || "—"}</dd>
            </div>
          ))}
      </dl>
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        className={"min-w-0 flex-1 border rounded-2xl overflow-hidden text-left active:opacity-90 " + roleRing}
        onClick={onTap}
        data-testid={testId}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      className={"min-w-0 flex-1 border rounded-2xl overflow-hidden " + roleRing}
      data-testid={testId}
    >
      {inner}
    </div>
  );
}

function CompareSheet({
  sug,
  busy,
  linkMode,
  setLinkMode,
  parentSide,
  onTapLeft,
  onTapRight,
  onClose,
  onCombine,
  onLinkSub,
  onAskLater,
  onSeparate,
}) {
  const left = useMemo(() => customerProfileFromJobs(sug.a.jobs, sug.a.name), [sug]);
  const right = useMemo(() => customerProfileFromJobs(sug.b.jobs, sug.b.name), [sug]);
  const leftRole = linkMode === "sub" ? (parentSide === "left" ? "parent" : "sub") : null;
  const rightRole = linkMode === "sub" ? (parentSide === "right" ? "parent" : "sub") : null;

  return (
    <Sheet title="Full customer profiles" onClose={onClose} wide tall>
      <p className="text-sm text-slate-600 mb-3">
        Jobs, balances, and all contact details for both names.
      </p>
      <div className="mb-3">
        <LinkModeTabs mode={linkMode} onChange={setLinkMode} />
      </div>
      {linkMode === "sub" ? (
        <p className="text-xs text-slate-500 mb-2">
          Tap a customer to mark parent (green) or sub (brown). Tap the parent again to swap.
        </p>
      ) : null}
      <div className="flex flex-col sm:flex-row gap-3 mb-4" data-testid="merge-compare">
        <ProfileColumn
          profile={left}
          role={leftRole}
          interactive={linkMode === "sub"}
          onTap={onTapLeft}
          testId="merge-compare-col-left"
        />
        <ProfileColumn
          profile={right}
          role={rightRole}
          interactive={linkMode === "sub"}
          onTap={onTapRight}
          testId="merge-compare-col-right"
        />
      </div>
      {linkMode === "combined" ? (
        <Opt
          icon="🔗"
          title="Combine — same customer"
          note={"Group all " + (sug.a.jobs.length + sug.b.jobs.length) + " jobs under one row on the Jobs list"}
          onClick={onCombine}
          disabled={busy}
          data-testid="merge-compare-combine"
        />
      ) : (
        <Opt
          icon="🏢"
          title="Save & sync — sub under parent"
          note={
            (parentSide === "left" ? sug.a.name : sug.b.name) +
            " is the parent · " +
            (parentSide === "left" ? sug.b.name : sug.a.name) +
            " bills as sub-entity in QuickBooks"
          }
          onClick={onLinkSub}
          disabled={busy}
          data-testid="merge-compare-sub-save"
        />
      )}
      <Opt
        icon="⏳"
        title="Ask me later"
        note="Hide for now — will ask again next time you open the app"
        onClick={onAskLater}
        data-testid="merge-compare-ask-later"
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
  const { jobs, loading, patchAndSave, enqueue, showToast } = useStore();
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("prompt");
  const [linkMode, setLinkMode] = useState("combined");
  const [parentSide, setParentSide] = useState("left");

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

  const tapLeft = useCallback(() => {
    setParentSide((cur) => (cur === "left" ? "right" : "left"));
  }, []);

  const tapRight = useCallback(() => {
    setParentSide((cur) => (cur === "right" ? "left" : "right"));
  }, []);

  if (!sug) return null;

  const leftRole = linkMode === "sub" ? (parentSide === "left" ? "parent" : "sub") : null;
  const rightRole = linkMode === "sub" ? (parentSide === "right" ? "parent" : "sub") : null;

  const combine = async () => {
    if (busy) return;
    setBusy(true);
    const all = [...sug.a.jobs, ...sug.b.jobs];
    const grp = all.map((j) => j.clientGroup).find(Boolean) || "grp" + Date.now();
    for (const j of all) await patchAndSave(j.id, { clientGroup: grp });
    dismissPair(sug.a.name, sug.b.name);
    persistDismissed(api);
    setBusy(false);
    setMode("prompt");
    setTick((t) => t + 1);
    showToast("Jobs grouped under one client");
  };

  const linkSubCompany = async () => {
    if (busy) return;
    setBusy(true);
    const leftProfile = customerProfileFromJobs(sug.a.jobs, sug.a.name);
    const rightProfile = customerProfileFromJobs(sug.b.jobs, sug.b.name);
    const parentProfile = parentSide === "left" ? leftProfile : rightProfile;
    const subJobs = parentSide === "left" ? sug.b.jobs : sug.a.jobs;
    const parentPatch = parentCustomerPatch({
      businessName: parentProfile.businessName || parentProfile.name,
      name: parentProfile.name,
      qboCustomerId: parentProfile.qboCustomerId,
    });

    for (const j of subJobs) {
      await patchAndSave(j.id, parentPatch);
      const updated = { ...j, ...parentPatch };
      enqueueCustomerQboSync(enqueue, j.id, updated, updated.qboCustomerId);
    }

    dismissPair(sug.a.name, sug.b.name);
    persistDismissed(api);
    setBusy(false);
    setMode("prompt");
    setTick((t) => t + 1);
    showToast("Sub company linked — syncing to QuickBooks…");
  };

  const askLater = () => {
    snoozePair(sug.a.name, sug.b.name);
    setMode("prompt");
    setTick((t) => t + 1);
    showToast("OK — will ask again next login");
  };

  const separate = () => {
    dismissPair(sug.a.name, sug.b.name);
    persistDismissed(api);
    setMode("prompt");
    setTick((t) => t + 1);
    showToast("Got it — separate customers");
  };

  if (mode === "compare") {
    return (
      <CompareSheet
        sug={sug}
        busy={busy}
        linkMode={linkMode}
        setLinkMode={setLinkMode}
        parentSide={parentSide}
        onTapLeft={tapLeft}
        onTapRight={tapRight}
        onClose={() => setMode("prompt")}
        onCombine={combine}
        onLinkSub={linkSubCompany}
        onAskLater={askLater}
        onSeparate={separate}
      />
    );
  }

  return (
    <Sheet title="Same customer?" onClose={askLater} wide tall>
      <div data-testid="merge-prompt">
        <p className="text-sm text-slate-600 mb-3">
          {sug.reason === "contact"
            ? `“${sug.a.name}” and “${sug.b.name}” share the same phone or email — compare contact info below.`
            : `“${sug.a.name}” and “${sug.b.name}” look like the same person — compare contact info below.`}
        </p>
        <div className="mb-3">
          <SideBySideCompare
            leftTitle={sug.a.name}
            rightTitle={sug.b.name}
            rows={contactRows}
            testId="merge-contact-compare"
            interactive={linkMode === "sub"}
            leftRole={leftRole}
            rightRole={rightRole}
            onTapLeft={tapLeft}
            onTapRight={tapRight}
          />
        </div>
        <div className="space-y-2">
          <button
            type="button"
            className="w-full text-left border border-slate-200 bg-white rounded-xl px-3 py-2.5 active:bg-slate-50"
            onClick={() => setMode("compare")}
            data-testid="merge-compare-btn"
          >
            <span className="block text-sm font-bold text-slate-900">View full profiles</span>
            <span className="block text-xs text-slate-500 mt-0.5">Jobs, balances, and all addresses</span>
          </button>
          <LinkModeTabs mode={linkMode} onChange={setLinkMode} />
          {linkMode === "sub" ? (
            <p className="text-[11px] text-slate-500 px-0.5">
              Tap a name above — green is parent, brown is sub. Tap parent again to swap. Save when ready.
            </p>
          ) : null}
          {linkMode === "combined" ? (
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
          ) : (
            <button
              type="button"
              className="w-full text-left border border-brand/30 bg-brand rounded-xl px-3 py-2.5 text-white disabled:opacity-60 active:opacity-90"
              onClick={linkSubCompany}
              disabled={busy}
              data-testid="merge-sub-save-btn"
            >
              <span className="block text-sm font-bold">Save & sync — sub company</span>
              <span className="block text-xs text-white/85 mt-0.5">
                {(parentSide === "left" ? sug.a.name : sug.b.name) +
                  " parent · " +
                  (parentSide === "left" ? sug.b.name : sug.a.name) +
                  " sub"}
              </span>
            </button>
          )}
          <button
            type="button"
            className="w-full text-left border border-slate-200 bg-white rounded-xl px-3 py-2.5 active:bg-slate-50"
            onClick={askLater}
            data-testid="merge-ask-later-btn"
          >
            <span className="block text-sm font-bold text-slate-900">Ask me later</span>
            <span className="block text-xs text-slate-500 mt-0.5">
              Hide for now — will ask again next time you open the app
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
    </Sheet>
  );
}