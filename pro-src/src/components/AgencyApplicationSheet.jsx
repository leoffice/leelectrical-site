// Multi-step agency application sheet (Con Ed Form A first).
// Mobile + desktop: big targets, progressive disclosure, autosave on each change.
import React, { useEffect, useMemo, useRef, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";
import {
  applicationReady,
  applicationFieldRows,
  buildApplicationDraft,
  buildApplicationEmailHtml,
  buildApplicationEmailText,
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
  blobToBase64,
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
  const { api } = useStore();
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
    const next = {
      ...draft,
      answers: setAns(answers, key, value),
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
      const blob = await buildApplicationPdfBlob({ agency, answers, job });
      const pdfB64 = await blobToBase64(blob);
      const filename = applicationPdfFileName(agency, job);
      const emails = resolveSubmitEmails(agency, destEmail);
      const to = emails[0] || "office@leelectrical.us";
      const subject = `${agency.formTitle} — ${job?.customer || job?.customerName || "Job"} ${
        job?.serviceAddress || job?.address || ""
      }`.trim();
      const html = buildApplicationEmailHtml(agency, answers, job);
      const text = buildApplicationEmailText(agency, answers, job);

      let result = { ok: false, error: "no_send_api" };
      if (api && typeof api.sendDocEmailNow === "function") {
        result = await api.sendDocEmailNow(job, "application", {
          email: to,
          pdfB64,
          filename,
          subject,
          message: text,
          htmlBody: html,
          includePaymentLink: false,
          application: {
            agencyId: agency.id,
            formTitle: agency.formTitle,
            rows: applicationFieldRows(agency, answers),
          },
        });
      }

      const emailResult = {
        ok: !!result?.ok,
        to,
        at: Date.now(),
        error: result?.error || result?.reason || "",
      };

      const submitted = buildApplicationDraft({
        agencyId: agency.id,
        answers,
        status: "submitted",
        stepIndex: steps.length - 1,
        submittedAt: new Date().toISOString(),
        emailResult,
      });
      setDraft(submitted);

      // Mark Application submitted + store draft on the job
      onSave?.({
        paperwork: {
          coned: {
            application: submitted,
            steps: { "Application submitted": true },
            active: { "Application submitted": true },
          },
        },
      });

      if (result?.ok) {
        setOkMsg("Application emailed with the full form attached.");
      } else {
        setOkMsg("Application saved on the job. Email had a problem — try again or check office email settings.");
        setErr(result?.error || result?.reason || "Email send issue");
      }
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
          <h4 className="font-extrabold text-slate-900 text-sm mb-2">Review full application</h4>
          <p className="text-xs text-slate-500 mb-3">
            Everything below is emailed as a complete copy, with a PDF attached.
          </p>
          <Fld label="Send completed application to" hint="Office copy by default until Con Ed intake address is confirmed.">
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
              {busy ? "Sending…" : "Submit & email full application"}
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
