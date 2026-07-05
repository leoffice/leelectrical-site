// "Same customer?" bottom sheet (bug #2). After jobs load, offers to combine
// near-duplicate customer names — one prompt at a time. Combine sets a shared
// clientGroup on all their jobs (stage + save via the adapter, like sleek's
// doCombine); "Not the same" is remembered permanently in lepro_nomerge.
import React, { useMemo, useState } from "react";
import { useStore } from "../state/store.jsx";
import { dismissPair, findMergeSuggestion } from "../lib/customers.js";

export default function MergePrompt() {
  const { jobs, loading, patchAndSave, showToast } = useStore();
  const [tick, setTick] = useState(0); // re-check after a dismissal
  const [busy, setBusy] = useState(false);

  const sug = useMemo(
    () => (loading ? null : findMergeSuggestion(jobs)),
    [jobs, loading, tick] // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!sug) return null;

  const combine = async () => {
    if (busy) return;
    setBusy(true);
    const all = [...sug.a.jobs, ...sug.b.jobs];
    const grp = all.map((j) => j.clientGroup).find(Boolean) || "grp" + Date.now();
    for (const j of all) await patchAndSave(j.id, { clientGroup: grp });
    setBusy(false);
    showToast("Jobs grouped under one client");
  };

  const notSame = () => {
    dismissPair(sug.a.name, sug.b.name);
    setTick((t) => t + 1);
    showToast("Got it — won't ask about these two again");
  };

  return (
    <div
      className="fixed z-40 inset-x-3 bottom-20 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[400px] card border-amber-200 bg-amber-50 shadow-2xl px-4 py-3.5"
      data-testid="merge-prompt"
      role="dialog"
      aria-label="Same customer?"
    >
      <div className="font-bold text-slate-900 text-sm">Same customer?</div>
      <p className="text-sm text-slate-600 mt-1">
        Combine “{sug.a.name}” and “{sug.b.name}” — their jobs will group together.
      </p>
      <div className="mt-2.5 flex gap-2">
        <button
          className="flex-1 text-sm font-bold text-white bg-brand rounded-xl py-2 disabled:opacity-60"
          onClick={combine}
          disabled={busy}
        >
          Combine
        </button>
        <button
          className="flex-1 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl py-2"
          onClick={notSame}
        >
          Not the same
        </button>
      </div>
    </div>
  );
}
