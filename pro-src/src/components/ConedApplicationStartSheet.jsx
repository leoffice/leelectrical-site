// Con Ed application START flow (S27) — the gate BEFORE the fill form.
//
// Levi 2026-08-02 (refine): meter setup = ONE field (meter title).
// Then Create Application → Fill up yourself | Email application to customer.
// After email → only "Sent email, done." (no long link, no Copy link)
//
// Levi 2026-08-04: email to field + keep/once policy (same as invoice/estimate send).
import React, { useState } from "react";
import Sheet from "./Sheet.jsx";
import { requestCustomerFill } from "../lib/agencyForms/conedIntake.js";
import {
  EMAIL_POLICY_KEEP,
  EMAIL_POLICY_ONCE,
  sendEmailDiffersFromCustomer,
} from "../lib/sendDocConfirm.js";

const inputCls =
  "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500";

/** One display title per meter. Prefer name, then unit (legacy two-field rows). */
function meterTitle(m) {
  return String(m?.name || m?.purpose || m?.unit || m?.partSupply || m?.title || "").trim();
}

function seedMeters(job) {
  const existing = job?.paperwork?.coned?.meters;
  if (Array.isArray(existing) && existing.length) {
    return existing.map((m) => {
      const title = meterTitle(m);
      return { name: title, unit: title };
    });
  }
  // Empty first row — user types the meter title (apt, PLP, person, etc.)
  return [{ name: "", unit: "" }];
}

export default function ConedApplicationStartSheet({ job, onClose, onFill, onSave }) {
  const [step, setStep] = useState(0); // 0 = meters, 1 = choice
  const [meters, setMeters] = useState(() => seedMeters(job));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sentOk, setSentOk] = useState(false);

  const jobEmail = String(job?.email || job?.customerEmail || "").trim();
  // Editable send-to (default job email). Policy when different from saved job email.
  const [sendTo, setSendTo] = useState(jobEmail);
  const [emailPolicy, setEmailPolicy] = useState("");

  const differs = sendEmailDiffersFromCustomer(sendTo, jobEmail);
  const emailNeedsPolicy =
    differs && emailPolicy !== EMAIL_POLICY_KEEP && emailPolicy !== EMAIL_POLICY_ONCE;

  const setMeterTitle = (i, value) => {
    const title = value;
    setMeters((prev) => prev.map((m, mi) => (mi === i ? { name: title, unit: title } : m)));
  };
  const addMeter = () => setMeters((prev) => [...prev, { name: "", unit: "" }]);
  const removeMeter = (i) => setMeters((prev) => prev.filter((_, mi) => mi !== i));

  const cleanMeters = () =>
    meters
      .map((m) => {
        const title = meterTitle(m);
        return title ? { name: title, unit: title } : null;
      })
      .filter(Boolean);

  const metersReady = () => cleanMeters().length > 0 && meters.every((m) => meterTitle(m));

  const persistMeters = (list) => {
    onSave?.({ paperwork: { coned: { meters: list, enabled: true } } });
  };

  const chooseFill = () => {
    if (!metersReady()) {
      setErr("Add a meter title for each meter.");
      return;
    }
    const list = cleanMeters();
    persistMeters(list);
    onFill?.(list);
  };

  const chooseSend = async () => {
    if (!metersReady()) {
      setErr("Add a meter title for each meter first.");
      return;
    }
    const to = String(sendTo || "").trim();
    if (!to || !to.includes("@")) {
      setErr("Enter a customer email before you can send the application.");
      return;
    }
    if (emailNeedsPolicy) {
      setErr("Choose whether to keep this email on the job or use it once.");
      return;
    }
    const list = cleanMeters();
    setBusy(true);
    setErr("");
    try {
      const r = await requestCustomerFill({ job, meters: list, to });
      if (!r.ok) {
        setErr("Could not email the customer: " + (r.error || "unknown error"));
        return;
      }
      if (!r.emailed) {
        setErr(
          to
            ? `Email didn't go out (${r.emailError || "no email service"}). Try again or fill it yourself.`
            : "This job has no customer email."
        );
        return;
      }
      // Keep on job/customer when same as saved OR user chose Keep this email.
      const keepEmail =
        !sendEmailDiffersFromCustomer(to, jobEmail) || emailPolicy === EMAIL_POLICY_KEEP;
      const jobPatch = keepEmail ? { email: to } : {};
      onSave?.({
        ...jobPatch,
        paperwork: {
          coned: {
            meters: list,
            enabled: true,
            applicationRequest: {
              sentAt: new Date().toISOString(),
              to,
              link: r.link,
              emailed: true,
              meters: list,
              emailPolicy: keepEmail ? EMAIL_POLICY_KEEP : EMAIL_POLICY_ONCE,
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
            One application per meter. Name each meter (apartment, PLP, person, etc.).
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
                Meter title
              </label>
              <input
                className={inputCls}
                value={meterTitle(m)}
                onChange={(e) => setMeterTitle(i, e.target.value)}
                placeholder="e.g. 2B, PLP, or house meter"
                data-testid="coned-start-meter-title"
                autoFocus={i === 0}
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
                setErr("Add a meter title for each meter.");
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
            {cleanMeters().length === 1 ? "1 meter." : `${cleanMeters().length} meters.`} How do you want
            to complete the application?
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

          <div
            className="w-full rounded-2xl border-2 border-slate-300 bg-white p-4 space-y-3"
            data-testid="coned-start-send-panel"
          >
            <div>
              <div className="font-extrabold text-slate-800 text-[15px]">Email application to customer</div>
              <div className="text-xs text-slate-600 mt-0.5">
                Sends a personal prefilled link. Choose the address below.
              </div>
            </div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              Send to
            </label>
            <input
              className={inputCls}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={sendTo}
              onChange={(e) => {
                setSendTo(e.target.value);
                setEmailPolicy("");
                setErr("");
              }}
              placeholder="customer@email.com"
              data-testid="coned-start-send-email"
            />
            {differs ? (
              <div
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3"
                data-testid="coned-start-email-policy"
              >
                <p className="text-sm font-semibold text-amber-900 mb-2">
                  Different from the customer&apos;s saved email. Keep it or use once?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`btn !py-2 text-sm ${
                      emailPolicy === EMAIL_POLICY_KEEP
                        ? "bg-brand text-white"
                        : "bg-white border border-amber-200 text-slate-800"
                    }`}
                    onClick={() => setEmailPolicy(EMAIL_POLICY_KEEP)}
                    data-testid="coned-start-email-keep"
                  >
                    Keep this email
                  </button>
                  <button
                    type="button"
                    className={`btn !py-2 text-sm ${
                      emailPolicy === EMAIL_POLICY_ONCE
                        ? "bg-brand text-white"
                        : "bg-white border border-amber-200 text-slate-800"
                    }`}
                    onClick={() => setEmailPolicy(EMAIL_POLICY_ONCE)}
                    data-testid="coned-start-email-once"
                  >
                    Use it once
                  </button>
                </div>
              </div>
            ) : null}
            <button
              type="button"
              className="btn bg-slate-800 text-white w-full !py-2.5 text-sm font-extrabold disabled:opacity-60"
              onClick={chooseSend}
              disabled={busy}
              data-testid="coned-start-send"
            >
              {busy ? "Sending…" : "Send application email"}
            </button>
          </div>

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
