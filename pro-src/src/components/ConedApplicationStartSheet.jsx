// Con Ed application START flow (S27) — the gate BEFORE the fill form.
//
// Levi: pressing "Application" must NOT drop you into the full fill form.
// Step 1 asks the meter setup (how many + what meters, prefilled to correct),
// step 2 offers the two real choices:
//   - Fill it up            -> office fills now (opens the existing sheet)
//   - Send to the customer  -> personal fill link, emailed via the intake API
import React, { useState } from "react";
import Sheet from "./Sheet.jsx";
import { requestCustomerFill } from "../lib/agencyForms/conedIntake.js";

const inputCls =
  "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500";

export default function ConedApplicationStartSheet({ job, onClose, onFill, onSave }) {
  const [step, setStep] = useState(0); // 0 = meters, 1 = choice
  const [meters, setMeters] = useState(() => {
    const existing = job?.paperwork?.coned?.meters;
    if (Array.isArray(existing) && existing.length) return existing.map((m) => ({ ...m }));
    const name = String(job?.customer || "").trim();
    return [{ name: name || "Meter 1", unit: "" }];
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sentInfo, setSentInfo] = useState(null);

  const customerEmail = String(job?.email || job?.customerEmail || "").trim();

  const setMeter = (i, key, value) => {
    setMeters((prev) => prev.map((m, mi) => (mi === i ? { ...m, [key]: value } : m)));
  };
  const addMeter = () =>
    setMeters((prev) => [...prev, { name: `Meter ${prev.length + 1}`, unit: "" }]);
  const removeMeter = (i) => setMeters((prev) => prev.filter((_, mi) => mi !== i));

  const cleanMeters = () =>
    meters
      .map((m) => ({ ...m, name: String(m.name || "").trim(), unit: String(m.unit || "").trim() }))
      .filter((m) => m.name || m.unit);

  const persistMeters = (list) => {
    onSave?.({ paperwork: { coned: { meters: list, enabled: true } } });
  };

  const chooseFill = () => {
    const list = cleanMeters();
    if (!list.length) {
      setErr("Add at least one meter (a name like the tenant, or PLP for the house meter).");
      return;
    }
    persistMeters(list);
    onFill?.(list);
  };

  const chooseSend = async () => {
    const list = cleanMeters();
    if (!list.length) {
      setErr("Add at least one meter first.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await requestCustomerFill({ job, meters: list, to: customerEmail });
      if (!r.ok) {
        setErr("Could not create the customer link: " + (r.error || "unknown error"));
        return;
      }
      persistMeters(list);
      onSave?.({
        paperwork: {
          coned: {
            applicationRequest: {
              sentAt: new Date().toISOString(),
              to: customerEmail,
              link: r.link,
              emailed: r.emailed,
              meters: list,
            },
          },
        },
      });
      setSentInfo({ link: r.link, emailed: r.emailed, emailError: r.emailError });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Con Edison Application" onClose={onClose} testId="coned-app-start-sheet">
      {sentInfo ? (
        <div className="space-y-3 p-1">
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
            <div className="font-extrabold text-emerald-800 text-sm mb-1">
              {sentInfo.emailed
                ? `Application link emailed to ${customerEmail}`
                : "Customer fill link created"}
            </div>
            {!sentInfo.emailed ? (
              <p className="text-xs text-slate-600">
                {customerEmail
                  ? `Email didn't go out (${sentInfo.emailError || "no email service"}) — share the link below instead.`
                  : "This job has no customer email — share the link below by text."}
              </p>
            ) : (
              <p className="text-xs text-slate-600">
                When they finish, the completed Form A lands on this job's Con Edison
                Application tab and the office gets an email copy.
              </p>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 break-all text-[12px] text-slate-700 select-all">
            {sentInfo.link}
          </div>
          <button
            type="button"
            className="btn bg-slate-800 text-white w-full !py-2.5 text-sm font-bold"
            onClick={() => {
              try {
                navigator.clipboard?.writeText(sentInfo.link);
              } catch {
                /* select-all fallback above */
              }
            }}
          >
            Copy link
          </button>
          <button
            type="button"
            className="btn-ghost w-full !py-2.5 text-sm font-bold"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      ) : step === 0 ? (
        <div className="space-y-3 p-1" data-testid="coned-start-meters">
          <p className="text-sm text-slate-600">
            How many meters is this application for, and what are they? One
            application is filed per meter.
          </p>
          {meters.map((m, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200 p-3 space-y-2"
              data-testid="coned-start-meter-row"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-slate-500 uppercase">
                  Meter {i + 1}
                </span>
                <span className="flex-1" />
                {meters.length > 1 ? (
                  <button
                    type="button"
                    className="text-xs font-bold text-red-600"
                    onClick={() => removeMeter(i)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <input
                className={inputCls}
                value={m.name || ""}
                onChange={(e) => setMeter(i, "name", e.target.value)}
                placeholder="Who is this meter for? (tenant name, or PLP)"
              />
              <input
                className={inputCls}
                value={m.unit || ""}
                onChange={(e) => setMeter(i, "unit", e.target.value)}
                placeholder="Apt / unit (e.g. 2B) — or PLP for the house meter"
              />
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost w-full !py-2.5 text-sm font-bold"
            onClick={addMeter}
            data-testid="coned-start-add-meter"
          >
            + Add another meter
          </button>
          {err ? <p className="text-xs font-bold text-red-600">{err}</p> : null}
          <button
            type="button"
            className="btn bg-emerald-700 text-white w-full !py-3 text-sm font-extrabold min-h-[44px]"
            onClick={() => {
              if (!cleanMeters().length) {
                setErr("Add at least one meter (a name, or PLP for the house meter).");
                return;
              }
              setErr("");
              setStep(1);
            }}
            data-testid="coned-start-continue"
          >
            Continue
          </button>
        </div>
      ) : (
        <div className="space-y-3 p-1" data-testid="coned-start-choice">
          <p className="text-sm text-slate-600">
            {cleanMeters().length === 1
              ? "1 meter."
              : `${cleanMeters().length} meters.`}{" "}
            Who fills out the application?
          </p>
          <button
            type="button"
            className="w-full rounded-2xl border-2 border-emerald-600 bg-emerald-50 p-4 text-left"
            onClick={chooseFill}
            data-testid="coned-start-fill"
          >
            <div className="font-extrabold text-emerald-800 text-[15px]">Fill it up</div>
            <div className="text-xs text-slate-600 mt-0.5">
              Fill the application here now, one meter at a time.
            </div>
          </button>
          <button
            type="button"
            className="w-full rounded-2xl border-2 border-slate-300 bg-white p-4 text-left disabled:opacity-60"
            onClick={chooseSend}
            disabled={busy}
            data-testid="coned-start-send"
          >
            <div className="font-extrabold text-slate-800 text-[15px]">
              {busy ? "Creating link…" : "Send it to the customer to fill up"}
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              {customerEmail
                ? `Emails ${customerEmail} a personal prefilled link.`
                : "Creates a personal prefilled link to share (no email on this job)."}
            </div>
          </button>
          {err ? <p className="text-xs font-bold text-red-600">{err}</p> : null}
          <button
            type="button"
            className="btn-ghost w-full !py-2.5 text-sm font-bold"
            onClick={() => setStep(0)}
          >
            Back to meters
          </button>
        </div>
      )}
    </Sheet>
  );
}
