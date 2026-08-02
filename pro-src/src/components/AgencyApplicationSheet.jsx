// Multi-step agency application sheet (Con Ed Form A first).
// Mobile + desktop: big targets, progressive disclosure, autosave on each change.
import React, { useEffect, useMemo, useRef, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";
import {
  applicationReady,
  applicationFieldRows,
  conedAgency,
  getAgency,
  missingRequired,
  resolveSubmitEmails,
  seedConedApplication,
  setAnswer as setAns,
  toggleMulti,
  visibleFields,
  buildApplicationPdfBlob,
  applicationPdfFileName,
  applyConedUnitInput,
  completeConedApplicationDestinations,
  CONED_FORM_A_SOURCE_PDF,
} from "../lib/agencyForms/index.js";
import { openPdfBlob, downloadPdfBlob } from "../lib/pdfOpen.js";

/**
 * @param {object} props
 * @param {object} props.job
 * @param {string} [props.agencyId]
 * @param {() => void} props.onClose
 * @param {(patch: object) => void} props.onSave — receives paperwork.coned.application patch piece
 */
export default function AgencyApplicationSheet({ job, agencyId = "coned-form-a", onClose, onSave }) {
  const { api, enqueue } = useStore();
  const agency = useMemo(() => getAgency(agencyId) || conedAgency(), [agencyId]);
  const existing = job?.paperwork?.coned?.application;
  const [draft, setDraft] = useState(() => seedConedApplication(job, existing));
  const [stepIndex, setStepIndex] = useState(() =>
    Math.min(Number(existing?.stepIndex) || 0, Math.max(0, (agency.steps?.length || 1) - 1))
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [destEmail, setDestEmail] = useState(() => resolveSubmitEmails(agency).join(", "));
  const saveTimer = useRef(null);

  const steps = agency.steps || [];
  const step = steps[stepIndex] || steps[0];
  const answers = draft.answers || {};
  const fields = visibleFields(step, answers);
  const missing = missingRequired(step, answers);
  const ready = applicationReady(agency, answers);
  const reviewMode = stepIndex >= steps.length; // after last step

  const persist = (nextDraft) => {
    onSave?.({
      paperwork: {
        coned: {
          application: nextDraft,
        },
      },
    });
  };

  const scheduleAutosave = (next) => {
    setDraft(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      persist({ ...next, stepIndex, updatedAt: Date.now() });
    }, 400);
  };

  useEffect(() => () => saveTimer.current && clearTimeout(saveTimer.current), []);

  const updateAnswer = (key, value) => {
    let nextAnswers = setAns(answers, key, value);

    // Con Ed unit field: first pass auto-abbreviates; second correction is left alone.
    if (key === "serviceUnit" || key === "billingUnit") {
      const flagAuto = key + "AutoApplied";
      const flagUser = key + "UserCorrected";
      const unit = applyConedUnitInput({
        prevValue: answers[key] || "",
        nextValue: value,
        alreadyAutoApplied: !!answers[flagAuto],
        userCorrected: !!answers[flagUser],
      });
      nextAnswers = {
        ...nextAnswers,
        [key]: unit.value,
        [flagAuto]: unit.autoApplied || !!answers[flagAuto],
        [flagUser]: unit.userCorrected || !!answers[flagUser],
      };
    }

    // One-tap: service address = billing address (copies billing → service).
    if (key === "serviceSameAsBilling" && value) {
      nextAnswers = {
        ...nextAnswers,
        serviceAddress: nextAnswers.billingAddress || answers.billingAddress || answers.serviceAddress || "",
        serviceCity: nextAnswers.billingCity || answers.billingCity || answers.serviceCity || "",
        serviceZip: nextAnswers.billingZip || answers.billingZip || answers.serviceZip || "",
        serviceUnit: nextAnswers.billingUnit || answers.billingUnit || answers.serviceUnit || "",
      };
    }
    // Keep service mirrored while the one-tap stays on.
    if (
      (key === "billingAddress" || key === "billingCity" || key === "billingZip" || key === "billingUnit") &&
      (nextAnswers.serviceSameAsBilling ?? answers.serviceSameAsBilling)
    ) {
      const map = {
        billingAddress: "serviceAddress",
        billingCity: "serviceCity",
        billingZip: "serviceZip",
        billingUnit: "serviceUnit",
      };
      nextAnswers[map[key]] = nextAnswers[key];
    }

    const next = {
      ...draft,
      answers: nextAnswers,
      status: draft.status === "submitted" ? "submitted" : "draft",
      updatedAt: Date.now(),
    };
    scheduleAutosave(next);
  };

  const goNext = () => {
    setErr("");
    if (missing.length) {
      setErr("Fill required fields: " + missing.map((f) => f.label).join(", "));
      return;
    }
    if (stepIndex < steps.length - 1) {
      const ni = stepIndex + 1;
      setStepIndex(ni);
      scheduleAutosave({ ...draft, stepIndex: ni });
      return;
    }
    // last content step → review
    setStepIndex(steps.length);
    scheduleAutosave({ ...draft, stepIndex: steps.length - 1 });
  };

  const goBack = () => {
    setErr("");
    if (reviewMode) {
      setStepIndex(steps.length - 1);
      return;
    }
    if (stepIndex > 0) {
      const ni = stepIndex - 1;
      setStepIndex(ni);
      scheduleAutosave({ ...draft, stepIndex: ni });
    }
  };

  const previewPdf = async () => {
    setErr("");
    try {
      const blob = await buildApplicationPdfBlob({ agency, answers, job });
      try {
        openPdfBlob(blob);
      } catch {
        downloadPdfBlob(blob, applicationPdfFileName(agency, job));
      }
    } catch (ex) {
      setErr(ex?.message || "Preview failed");
    }
  };

  const submit = async () => {
    setErr("");
    setOkMsg("");
    if (!ready) {
      setErr("Still missing required fields — go back and complete every step.");
      return;
    }
    setBusy(true);
    try {
      // Slice 1: same proven fill → customer email + office copy + job tab + Drive.
      const result = await completeConedApplicationDestinations({
        agency,
        answers,
        job,
        api,
        onSave,
        enqueue,
        destEmailOverride: destEmail,
      });
      setDraft(result.submitted);

      const d = result.destinations || {};
      const parts = [];
      if (d.customerEmail?.ok) parts.push("customer emailed");
      else if (d.customerEmail?.skipped) parts.push("no customer email on form");
      else if (d.customerEmail?.error) parts.push("customer email issue");
      if (d.officeEmail?.ok) parts.push("office copy sent");
      if (d.jobTab?.ok) parts.push("saved on Con Edison Application tab");
      if (d.drive?.queued || d.drive?.ok) parts.push("Drive save queued");
      else if (d.drive?.error) parts.push("Drive: " + String(d.drive.error).slice(0, 80));

      const anyEmail = !!(d.customerEmail?.ok || d.officeEmail?.ok);
      if (anyEmail || d.jobTab?.ok) {
        setOkMsg(
          `Application complete — ${result.filename}. ${parts.filter(Boolean).join(" · ") || "Saved on job."}`
        );
      } else {
        setOkMsg("Application saved on the job. Delivery had a problem — check the details below.");
      }
      const errs = [
        !d.customerEmail?.ok && !d.customerEmail?.skipped ? d.customerEmail?.error : "",
        !d.officeEmail?.ok ? d.officeEmail?.error : "",
        !d.jobTab?.ok ? d.jobTab?.error : "",
        !d.drive?.ok && !d.drive?.queued ? d.drive?.error : "",
      ].filter(Boolean);
      if (errs.length && !anyEmail) setErr(errs[0]);
      else if (errs.length) setErr(""); // soft: partial success already in okMsg
    } catch (ex) {
      setErr(ex?.message || "Submit failed");
    } finally {
      setBusy(false);
    }
  };

  const progressLabel = reviewMode
    ? "Review & send"
    : `Step ${stepIndex + 1} of ${steps.length}`;

  return (
    <Sheet title={agency.label || "Application"} onClose={onClose} wide tall testId="agency-app-sheet">
      <p className="text-sm text-slate-500 mb-2" data-testid="agency-app-intro">
        {agency.description}
      </p>
      <div className="flex items-center gap-2 mb-3" data-testid="agency-app-progress">
        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-emerald-600 rounded-full transition-all"
            style={{
              width: `${Math.min(100, Math.round(((reviewMode ? steps.length : stepIndex) / steps.length) * 100))}%`,
            }}
          />
        </div>
        <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">{progressLabel}</span>
      </div>

      {/* Step chips — horizontal scroll on mobile */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 -mx-1 px-1" data-testid="agency-step-chips">
        {steps.map((s, i) => {
          const done = missingRequired(s, answers).length === 0;
          const on = !reviewMode && i === stepIndex;
          return (
            <button
              key={s.id}
              type="button"
              className={
                "shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-bold border " +
                (on
                  ? "bg-emerald-700 text-white border-emerald-800"
                  : done
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-white text-slate-600 border-slate-200")
              }
              onClick={() => {
                setStepIndex(i);
                setErr("");
              }}
              data-testid={"agency-step-chip-" + s.id}
            >
              {s.shortTitle || s.title}
            </button>
          );
        })}
        <button
          type="button"
          className={
            "shrink-0 px-2.5 py-1.5 rounded-full text-[11px] font-bold border " +
            (reviewMode
              ? "bg-emerald-700 text-white border-emerald-800"
              : "bg-white text-slate-600 border-slate-200")
          }
          onClick={() => setStepIndex(steps.length)}
          data-testid="agency-step-chip-review"
        >
          Review
        </button>
      </div>

      {!reviewMode && step ? (
        <>
          <h4 className="font-extrabold text-slate-900 text-sm mb-1" data-testid="agency-step-title">
            {step.title}
          </h4>
          {step.intro ? <p className="text-xs text-slate-500 mb-3">{step.intro}</p> : null}

          {fields.map((f) =>
            f.type === "checkbox" ? (
              <label
                key={f.key}
                className="flex items-center gap-3 py-2 mb-2 min-h-[44px] cursor-pointer border border-slate-200 rounded-xl px-3"
              >
                <input
                  type="checkbox"
                  className="w-5 h-5"
                  checked={!!answers[f.key]}
                  onChange={(e) => updateAnswer(f.key, e.target.checked)}
                  data-testid={"agency-field-" + f.key}
                />
                <span className="text-sm font-semibold text-slate-800">
                  {f.label}
                  {f.required ? " *" : ""}
                </span>
              </label>
            ) : (
            <Fld key={f.key} label={f.label + (f.required ? " *" : "")} hint={f.hint}>
              {f.type === "textarea" ? (
                <textarea
                  className="input min-h-[4.5rem] text-base"
                  value={answers[f.key] || ""}
                  onChange={(e) => updateAnswer(f.key, e.target.value)}
                  placeholder={f.placeholder || ""}
                  data-testid={"agency-field-" + f.key}
                />
              ) : f.type === "checkboxes" ? (
                <div className="space-y-1" data-testid={"agency-field-" + f.key}>
                  {(f.options || []).map((opt) => {
                    const on = Array.isArray(answers[f.key]) && answers[f.key].includes(opt);
                    return (
                      <label key={opt} className="flex items-center gap-3 py-2 min-h-[44px] cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-5 h-5"
                          checked={on}
                          onChange={(e) => {
                            const next = {
                              ...draft,
                              answers: toggleMulti(answers, f.key, opt, e.target.checked),
                              updatedAt: Date.now(),
                            };
                            scheduleAutosave(next);
                          }}
                        />
                        <span className="text-sm font-semibold text-slate-800">{opt}</span>
                      </label>
                    );
                  })}
                </div>
              ) : f.type === "radio" ? (
                <div className="flex flex-wrap gap-2" data-testid={"agency-field-" + f.key}>
                  {(f.options || []).map((opt) => {
                    const on = answers[f.key] === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        className={
                          "px-3 py-2.5 rounded-xl text-sm font-bold border min-h-[44px] " +
                          (on
                            ? "bg-emerald-700 text-white border-emerald-800"
                            : "bg-white text-slate-700 border-slate-200")
                        }
                        onClick={() => updateAnswer(f.key, opt)}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              ) : f.type === "select" ? (
                <select
                  className="input text-base min-h-[44px]"
                  value={answers[f.key] || ""}
                  onChange={(e) => updateAnswer(f.key, e.target.value)}
                  data-testid={"agency-field-" + f.key}
                >
                  <option value="">Select…</option>
                  {(f.options || []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input text-base min-h-[44px]"
                  type={f.type === "tel" || f.type === "email" || f.type === "date" ? f.type : "text"}
                  inputMode={f.inputMode}
                  autoComplete={f.autoComplete || "off"}
                  maxLength={f.maxLength || undefined}
                  value={answers[f.key] || ""}
                  onChange={(e) => updateAnswer(f.key, e.target.value)}
                  placeholder={f.placeholder || ""}
                  data-testid={"agency-field-" + f.key}
                />
              )}
            </Fld>
            )
          )}
        </>
      ) : (
        <div data-testid="agency-review">
          <h4 className="font-extrabold text-slate-900 text-sm mb-2">Review & complete</h4>
          <p className="text-xs text-slate-500 mb-2">
            Finishing sends the filled Form A PDF to the customer (form contact email), keeps the
            office copy, saves it on the Con Edison Application tab, and files a Drive copy. Portal
            submit to Con Ed stays a human step — the app never enters your Con Ed password.
          </p>
          {CONED_FORM_A_SOURCE_PDF ? (
            <p className="text-[11px] text-slate-400 mb-3" data-testid="agency-source-form">
              Source form: Con Ed Application for Service (Form A) — company file.
            </p>
          ) : null}
          {answers.email ? (
            <p className="text-xs text-slate-600 mb-2" data-testid="agency-customer-email-hint">
              Customer copy → <b>{answers.email}</b>
            </p>
          ) : (
            <p className="text-xs text-amber-700 mb-2" data-testid="agency-customer-email-missing">
              No contact email on the form — only the office copy will be emailed.
            </p>
          )}
          <Fld
            label="Office / extra copy"
            hint="Office keeps a copy. Change only if you need a different office mailbox."
          >
            <input
              className="input text-base min-h-[44px]"
              type="email"
              value={destEmail}
              onChange={(e) => setDestEmail(e.target.value)}
              data-testid="agency-dest-email"
            />
          </Fld>
          <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 max-h-[40vh] overflow-y-auto mb-3">
            {applicationFieldRows(agency, answers).map((r) => (
              <div key={r.key + r.stepId} className="px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{r.stepTitle}</div>
                <div className="text-xs text-slate-500">{r.label}</div>
                <div className="text-sm font-semibold text-slate-900">{r.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {err ? (
        <p className="text-sm text-red-600 font-semibold mb-2" data-testid="agency-app-error">
          {err}
        </p>
      ) : null}
      {okMsg ? (
        <p className="text-sm text-emerald-700 font-semibold mb-2" data-testid="agency-app-ok">
          {okMsg}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 mt-2">
        {!reviewMode ? (
          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1 !py-3" onClick={goBack} disabled={stepIndex === 0 || busy}>
              Back
            </button>
            <button
              type="button"
              className="btn bg-emerald-700 text-white flex-1 !py-3 font-bold"
              onClick={goNext}
              disabled={busy}
              data-testid="agency-next"
            >
              {stepIndex >= steps.length - 1 ? "Review" : "Next"}
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="btn bg-emerald-700 text-white w-full !py-3.5 font-bold text-base min-h-[48px]"
              onClick={submit}
              disabled={busy || !ready}
              data-testid="agency-submit"
            >
              {busy ? "Completing…" : "Complete application (email + save)"}
            </button>
            <button type="button" className="btn-ghost w-full !py-3" onClick={previewPdf} disabled={busy} data-testid="agency-preview-pdf">
              Preview PDF
            </button>
            <button type="button" className="btn-ghost w-full !py-3" onClick={goBack} disabled={busy}>
              Back to edit
            </button>
          </>
        )}
        <button
          type="button"
          className="btn-ghost w-full !py-2 text-slate-500"
          onClick={() => {
            const next = { ...draft, stepIndex, updatedAt: Date.now() };
            persist(next);
            onClose?.();
          }}
          disabled={busy}
          data-testid="agency-save-close"
        >
          Save draft & close
        </button>
      </div>
    </Sheet>
  );
}
