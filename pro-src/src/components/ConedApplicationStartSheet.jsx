// Con Ed application START flow (S27) — the gate BEFORE the fill form.
//
// Levi 2026-08-02: Create Application =
//  1) Meter setup only — Apartment / Part Supply # + Purpose / designated for
//  2) Create Application → Fill up yourself | Send to customer to fill up
//  3) After email → only "Sent email, done." (no long link, no Copy link)
import React, { useState } from "react";
import Sheet from "./Sheet.jsx";
import { requestCustomerFill } from "../lib/agencyForms/conedIntake.js";

const inputCls =
  "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500";

function seedMeters(job) {
  const existing = job?.paperwork?.coned?.meters;
  if (Array.isArray(existing) && existing.length) {
    return existing.map((m) => ({
      name: String(m.name || m.purpose || "").trim(),
      unit: String(m.unit || m.partSupply || "").trim(),
    }));
  }
  const name = String(job?.customer || "").trim();
  return [{ name: name || "", unit: "" }];
}

export default function ConedApplicationStartSheet({ job, onClose, onFill, onSave }) {
  const [step, setStep] = useState(0); // 0 = meters, 1 = choice
  const [meters, setMeters] = useState(() => seedMeters(job));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sentOk, setSentOk] = useState(false);

  const customerEmail = String(job?.email || job?.customerEmail || "").trim();

  const setMeter = (i, key, value) => {
    setMeters((prev) => prev.map((m, mi) => (mi === i ? { ...m, [key]: value } : m)));
  };
  const addMeter = () => setMeters((prev) => [...prev, { name: "", unit: "" }]);
  const removeMeter = (i) => setMeters((prev) => prev.filter((_, mi) => mi !== i));

  const cleanMeters = () =>
    meters
      .map((m) => ({
        name: String(m.name || "").trim(),
        unit: String(m.unit || "").trim(),
      }))
      .filter((m) => m.name || m.unit);

  const metersReady = () => {
    const list = cleanMeters();
    if (!list.length) return false;
    // Each meter needs Part Supply/apt OR purpose (at least one real field)
    return list.every((m) => m.unit || m.name);
  };

  const persistMeters = (list) => {
    onSave?.({ paperwork: { coned: { meters: list, enabled: true } } });
  };

  const chooseFill = () => {
    if (!metersReady()) {
      setErr("Add apartment / Part Supply # or purpose for each meter.");
      return;
    }
    const list = cleanMeters();
    persistMeters(list);
    onFill?.(list);
  };

  const chooseSend = async () => {
    if (!metersReady()) {
      setErr("Add apartment / Part Supply # or purpose for each meter first.");
      return;
    }
    if (!customerEmail) {
      setErr("This job needs a customer email before you can send the application.");
      return;
    }
    const list = cleanMeters();
    setBusy(true);
    setErr("");
    try {
      const r = await requestCustomerFill({ job, meters: list, to: customerEmail });
      if (!r.ok) {
        setErr("Could not email the customer: " + (r.error || "unknown error"));
        return;
      }
      if (!r.emailed) {
        setErr(
          customerEmail
            ? `Email didn't go out (${r.emailError || "no email service"}). Try again or fill it yourself.`
            : "This job has no customer email."
        );
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
              emailed: true,
              meters: list,
            },
          },
        },
      });
      setSentOk(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Con Edison Application" onClose={onClose} testId="coned-app-start-sheet">
      {sentOk ? (
        <div className="space-y-4 p-1" data-testid="coned-start-sent-done">
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 text-center">
            <div className="font-extrabold text-emerald-800 text-base">Sent email, done.</div>
            <p className="text-xs text-slate-600 mt-2">
              When they finish, the completed Form A lands on this job and the office gets a copy.
            </p>
          </div>
          <button
            type="button"
            className="btn bg-slate-800 text-white w-full !py-2.5 text-sm font-bold"
            onClick={onClose}
            data-testid="coned-start-done"
          >
            Done
          </button>
        </div>
      ) : step === 0 ? (
        <div className="space-y-3 p-1" data-testid="coned-start-meters">
          <p className="text-sm text-slate-600">
            Meter setup — one application per meter. Apartment number and Part Supply are the same Con Ed field.
          </p>
          {meters.map((m, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200 p-3 space-y-2"
              data-testid="coned-start-meter-row"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-slate-500 uppercase">Meter {i + 1}</span>
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
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                Apartment / Part Supply #
              </label>
              <input
                className={inputCls}
                value={m.unit || ""}
                onChange={(e) => setMeter(i, "unit", e.target.value)}
                placeholder="e.g. 2B — or PLP for house meter"
                data-testid="coned-start-part-supply"
              />
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                Purpose / designated for
              </label>
              <input
                className={inputCls}
                value={m.name || ""}
                onChange={(e) => setMeter(i, "name", e.target.value)}
                placeholder="Who or what this meter is for"
                data-testid="coned-start-purpose"
              />
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost w-full !py-2.5 text-sm font-bold"
            onClick={addMeter}
            data-testid="coned-start-add-meter"
          >
            + Add meter
          </button>
          {err ? <p className="text-xs font-bold text-red-600">{err}</p> : null}
          <button
            type="button"
            className="btn bg-emerald-700 text-white w-full !py-3 text-sm font-extrabold min-h-[44px]"
            onClick={() => {
              if (!metersReady()) {
                setErr("Add apartment / Part Supply # or purpose for each meter.");
                return;
              }
              setErr("");
              setStep(1);
            }}
            data-testid="coned-start-continue"
          >
            Create Application
          </button>
        </div>
      ) : (
        <div className="space-y-3 p-1" data-testid="coned-start-choice">
          <p className="text-sm text-slate-600">
            {cleanMeters().length === 1 ? "1 meter." : `${cleanMeters().length} meters.`} Who fills out the
            application?
          </p>
          <button
            type="button"
            className="w-full rounded-2xl border-2 border-emerald-600 bg-emerald-50 p-4 text-left"
            onClick={chooseFill}
            data-testid="coned-start-fill"
          >
            <div className="font-extrabold text-emerald-800 text-[15px]">Fill up yourself</div>
            <div className="text-xs text-slate-600 mt-0.5">Fill the application here now.</div>
          </button>
          <button
            type="button"
            className="w-full rounded-2xl border-2 border-slate-300 bg-white p-4 text-left disabled:opacity-60"
            onClick={chooseSend}
            disabled={busy}
            data-testid="coned-start-send"
          >
            <div className="font-extrabold text-slate-800 text-[15px]">
              {busy ? "Sending…" : "Send to customer to fill up"}
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              {customerEmail
                ? `Emails ${customerEmail} a personal prefilled link.`
                : "Needs a customer email on this job."}
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
