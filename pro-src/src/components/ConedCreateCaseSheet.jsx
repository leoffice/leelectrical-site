// S23 — "Submit a Case" questionnaire + create-case queue (branched).
// Add-Load = full (meters+load); No-Additional-Load = short (skips load/meters).
import React, { useMemo, useRef, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";
import {
  AUTO_HANDLED,
  DEFAULT_LOAD_ITEMS,
  REQUEST_TYPES,
  REQUEST_TYPE_LABELS,
  createCaseReady,
  createCaseReviewRows,
  isFullBranch,
  missingCreateCaseFields,
  portalWizardStepCount,
  questionnaireSteps,
  sanitizeAnswers,
  seedCreateCaseAnswers,
  sumLoadKw,
  toPlainAscii,
} from "../lib/agencyForms/createCaseQuestionnaire.js";
import { queueConedCreateCase } from "../lib/agencyForms/createCaseExecution.js";
import {
  queueConedUploadDocument,
  resolveFormAForUpload,
} from "../lib/agencyForms/uploadToCase.js";
import { listConedCompletedFiles } from "../lib/agencyForms/completeDestinations.js";

function Seg({ value, options, onChange, testId }) {
  return (
    <div className="flex flex-wrap gap-2" data-testid={testId}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            className={
              "flex-1 min-w-[120px] px-3 py-3 rounded-xl text-sm font-bold border min-h-[48px] " +
              (on
                ? "bg-emerald-700 text-white border-emerald-800"
                : "bg-white text-slate-800 border-slate-200")
            }
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.job
 * @param {() => void} props.onClose
 * @param {(patch: object) => void} props.onSave
 */
export default function ConedCreateCaseSheet({ job, onClose, onSave }) {
  const { enqueue } = useStore();
  const existing = job?.paperwork?.coned?.createCase;
  const [answers, setAnswers] = useState(() => seedCreateCaseAnswers(job, existing));
  const steps = useMemo(() => questionnaireSteps(answers.requestType), [answers.requestType]);
  const [stepIndex, setStepIndex] = useState(() =>
    Math.min(Number(existing?.stepIndex) || 0, Math.max(0, steps.length - 1))
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [caseNumber, setCaseNumber] = useState(
    () =>
      job?.paperwork?.coned?.caseNumber ||
      existing?.execution?.caseNumber ||
      ""
  );
  const saveTimer = useRef(null);

  const step = steps[stepIndex] || steps[0];
  const missing = missingCreateCaseFields(step?.id, answers);
  const reviewMode = step?.id === "review";
  const full = isFullBranch(answers.requestType);
  const completedFiles = listConedCompletedFiles(job);
  const formA = resolveFormAForUpload({ job, answers });

  const persist = (nextAnswers, nextStep = stepIndex, extra = {}) => {
    const draft = {
      status: extra.status || existing?.status || "draft",
      answers: sanitizeAnswers(nextAnswers),
      stepIndex: nextStep,
      updatedAt: Date.now(),
      execution: existing?.execution || null,
      ...extra,
    };
    onSave?.({
      paperwork: {
        coned: {
          enabled: true,
          createCase: draft,
        },
      },
    });
  };

  const scheduleSave = (next, idx = stepIndex) => {
    setAnswers(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(next, idx), 400);
  };

  const set = (key, value) => {
    const v =
      typeof value === "string" &&
      ["ownerFirst", "ownerLast", "serviceAddress", "streetName", "scopeOfWork", "bin"].includes(
        key
      )
        ? toPlainAscii(value)
        : value;
    scheduleSave({ ...answers, [key]: v });
  };

  const setMeter = (i, key, value) => {
    const meters = (answers.meters || []).slice();
    meters[i] = { ...(meters[i] || {}), [key]: key === "name" ? toPlainAscii(value) : value };
    const next = {
      ...answers,
      meters,
      numberOfNewMeters: meters.filter((m) => m?.name).length || answers.numberOfNewMeters,
    };
    scheduleSave(next);
  };

  const setLoad = (i, key, value) => {
    const loadItems = (answers.loadItems || []).slice();
    loadItems[i] = {
      ...(loadItems[i] || {}),
      [key]: key === "name" ? toPlainAscii(value) : value,
    };
    scheduleSave({ ...answers, loadItems });
  };

  const goNext = () => {
    setErr("");
    if (missing.length) {
      setErr("Fill required: " + missing.map((m) => m.label).join(", "));
      return;
    }
    if (stepIndex < steps.length - 1) {
      // When request type changes, re-resolve steps length
      const nextSteps = questionnaireSteps(answers.requestType);
      const nextIdx = Math.min(stepIndex + 1, nextSteps.length - 1);
      setStepIndex(nextIdx);
      persist(answers, nextIdx);
    }
  };

  const goBack = () => {
    setErr("");
    if (stepIndex > 0) {
      const nextIdx = stepIndex - 1;
      setStepIndex(nextIdx);
      persist(answers, nextIdx);
    }
  };

  const onCreateCase = async () => {
    setErr("");
    setOkMsg("");
    if (!createCaseReady(answers)) {
      setErr("Still missing required fields — go back and complete each step.");
      return;
    }
    setBusy(true);
    try {
      const r = await queueConedCreateCase({ answers, job, enqueue, onSave });
      if (r.ok && r.queued) {
        setOkMsg(
          `Case fill queued (${REQUEST_TYPE_LABELS[answers.requestType]} · ${portalWizardStepCount(
            answers.requestType
          )} portal steps). Host fills up to Review — you confirm submit. No auto-submit.`
        );
      } else {
        setErr(r.error || "Could not queue create-case");
        if (r.draft) persist(answers, stepIndex, { status: r.draft.status, execution: r.draft.execution });
      }
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const onUploadToCase = async () => {
    setErr("");
    setOkMsg("");
    setBusy(true);
    try {
      const r = await queueConedUploadDocument({
        job,
        answers,
        caseNumber,
        enqueue,
        onSave,
      });
      if (r.ok && r.queued) {
        setOkMsg(
          `Upload queued: ${r.payload.filename} → ${r.payload.caseNumber} as "${r.payload.documentType}". Human confirms submit.`
        );
      } else {
        setErr(r.error || "Could not queue upload");
      }
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const progressPct = Math.round(((stepIndex + 1) / steps.length) * 100);
  const kwDisplay =
    answers.requiredTotalKw !== "" && answers.requiredTotalKw != null
      ? answers.requiredTotalKw
      : sumLoadKw(answers.loadItems);

  return (
    <Sheet
      title="Submit a Case"
      onClose={onClose}
      wide
      tall
      testId="coned-create-case-sheet"
    >
      <p className="text-sm text-slate-500 mb-2" data-testid="coned-create-case-intro">
        Create a Con Edison Energy Services case. Pick the request type — the questions change.
        Auto-fill stops at Review; you confirm the final submit.
      </p>

      <div className="flex items-center gap-2 mb-3" data-testid="coned-create-case-progress">
        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-emerald-600 rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">
          {step?.short || ""} · {stepIndex + 1}/{steps.length}
        </span>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 -mx-1 px-1">
        {steps.map((s, i) => {
          const on = i === stepIndex;
          const done = i < stepIndex;
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
                persist(answers, i);
              }}
            >
              {s.short}
            </button>
          );
        })}
      </div>

      {step?.id === "request_type" && (
        <div data-testid="coned-step-request-type">
          <h4 className="font-extrabold text-slate-900 text-sm mb-1">What kind of case?</h4>
          <p className="text-xs text-slate-500 mb-3">
            Each type has a different portal flow. No-Additional-Load is the short one (most common).
          </p>
          <Seg
            testId="coned-request-type-seg"
            value={answers.requestType}
            onChange={(v) => {
              const next = sanitizeAnswers({ ...answers, requestType: v });
              scheduleSave(next, 0);
              setStepIndex(0);
            }}
            options={[
              {
                value: REQUEST_TYPES.NO_ADD_LOAD,
                label: "No additional load (short · 5 steps)",
              },
              {
                value: REQUEST_TYPES.ADD_LOAD,
                label: "Add load (full · 6 steps)",
              },
            ]}
          />
          <p className="text-[11px] text-slate-500 mt-3">
            Portal: {REQUEST_TYPE_LABELS[answers.requestType]}
          </p>
        </div>
      )}

      {step?.id === "property" && (
        <div className="space-y-2" data-testid="coned-step-property">
          <h4 className="font-extrabold text-slate-900 text-sm">Where&apos;s the job?</h4>
          <Fld label="Street address" hint="house # + street with suffix">
            <input
              className="input text-base min-h-[44px]"
              value={answers.serviceAddress || ""}
              onChange={(e) => set("serviceAddress", e.target.value)}
              data-testid="coned-field-serviceAddress"
            />
          </Fld>
          <div className="grid grid-cols-3 gap-2">
            <Fld label="City">
              <input
                className="input text-base min-h-[44px]"
                value={answers.city || ""}
                onChange={(e) => set("city", e.target.value)}
              />
            </Fld>
            <Fld label="State">
              <input
                className="input text-base min-h-[44px]"
                value={answers.state || "NY"}
                onChange={(e) => set("state", e.target.value)}
              />
            </Fld>
            <Fld label="Zip">
              <input
                className="input text-base min-h-[44px]"
                value={answers.zip || ""}
                onChange={(e) => set("zip", e.target.value)}
              />
            </Fld>
          </div>
          <Fld label="Borough (service area)">
            <select
              className="input text-base min-h-[44px]"
              value={answers.borough || "Brooklyn"}
              onChange={(e) => set("borough", e.target.value)}
              data-testid="coned-field-borough"
            >
              {["Brooklyn", "Manhattan", "Queens", "Bronx", "Staten Island"].map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Fld>
          <Fld label="BIN" hint="required">
            <input
              className="input text-base min-h-[44px]"
              value={answers.bin || ""}
              onChange={(e) => set("bin", e.target.value)}
              data-testid="coned-field-bin"
            />
          </Fld>
          <Fld label="Building type">
            <Seg
              testId="coned-building-type"
              value={answers.buildingType || "Residential"}
              onChange={(v) => set("buildingType", v)}
              options={["Residential", "Commercial", "Mixed"].map((x) => ({
                value: x,
                label: x,
              }))}
            />
          </Fld>
          <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 font-semibold text-sm">
            <input
              type="checkbox"
              className="w-5 h-5 accent-emerald-700"
              checked={answers.is1to3Family !== false}
              onChange={(e) => set("is1to3Family", e.target.checked)}
            />
            1–3 family home
          </label>
        </div>
      )}

      {step?.id === "owner" && (
        <div className="space-y-2" data-testid="coned-step-owner">
          <h4 className="font-extrabold text-slate-900 text-sm">Who owns the property?</h4>
          <div className="grid grid-cols-2 gap-2">
            <Fld label="First name">
              <input
                className="input text-base min-h-[44px]"
                value={answers.ownerFirst || ""}
                onChange={(e) => set("ownerFirst", e.target.value)}
                data-testid="coned-field-ownerFirst"
              />
            </Fld>
            <Fld label="Last name">
              <input
                className="input text-base min-h-[44px]"
                value={answers.ownerLast || ""}
                onChange={(e) => set("ownerLast", e.target.value)}
                data-testid="coned-field-ownerLast"
              />
            </Fld>
          </div>
          <Fld label="Phone">
            <input
              className="input text-base min-h-[44px]"
              type="tel"
              value={answers.ownerPhone || ""}
              onChange={(e) => set("ownerPhone", e.target.value)}
              data-testid="coned-field-ownerPhone"
            />
          </Fld>
          <Fld label="Email">
            <input
              className="input text-base min-h-[44px]"
              type="email"
              value={answers.ownerEmail || ""}
              onChange={(e) => set("ownerEmail", e.target.value)}
              data-testid="coned-field-ownerEmail"
            />
          </Fld>
          <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 font-semibold text-sm">
            <input
              type="checkbox"
              className="w-5 h-5 accent-emerald-700"
              checked={answers.mailingSameAsService !== false}
              onChange={(e) => set("mailingSameAsService", e.target.checked)}
            />
            Mailing same as service address
          </label>
          <p className="text-[11px] text-slate-500">
            Customer contact must differ from contractor (Levi/BLZ) — checked at fill time.
          </p>
        </div>
      )}

      {step?.id === "service" && (
        <div className="space-y-2" data-testid="coned-step-service">
          <h4 className="font-extrabold text-slate-900 text-sm">What are we doing to the service?</h4>
          <Fld label="Service panel size (amps)">
            <input
              className="input text-base min-h-[44px]"
              type="number"
              value={answers.servicePanelAmps ?? 100}
              onChange={(e) => set("servicePanelAmps", Number(e.target.value) || 0)}
              data-testid="coned-field-panelAmps"
            />
          </Fld>
          <Fld label="Phase">
            <Seg
              testId="coned-phase"
              value={answers.phase || "Single phase"}
              onChange={(v) => set("phase", v)}
              options={[
                { value: "Single phase", label: "Single phase" },
                { value: "Three phase", label: "Three phase" },
              ]}
            />
          </Fld>
          {full ? (
            <Fld label="Required total kW" hint="auto-sums from load items if blank">
              <input
                className="input text-base min-h-[44px]"
                type="number"
                placeholder={String(sumLoadKw(answers.loadItems))}
                value={answers.requiredTotalKw ?? ""}
                onChange={(e) => set("requiredTotalKw", e.target.value)}
              />
            </Fld>
          ) : null}
          <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 font-semibold text-sm">
            <input
              type="checkbox"
              className="w-5 h-5 accent-emerald-700"
              checked={answers.useExistingService !== false}
              onChange={(e) => set("useExistingService", e.target.checked)}
            />
            Use existing service
          </label>
          <Fld label="Facility serviced by">
            <Seg
              testId="coned-facility"
              value={answers.facilityServicedBy || "Underground"}
              onChange={(v) => set("facilityServicedBy", v)}
              options={["Underground", "Overhead", "Don't know"].map((x) => ({
                value: x,
                label: x,
              }))}
            />
          </Fld>
          <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 font-semibold text-sm">
            <input
              type="checkbox"
              className="w-5 h-5 accent-emerald-700"
              checked={!!answers.changePoe}
              onChange={(e) => set("changePoe", e.target.checked)}
            />
            Change point of entry (POE)?
          </label>
          <Fld label="Scope of work" hint="plain ASCII">
            <textarea
              className="input text-base min-h-[80px]"
              value={answers.scopeOfWork || ""}
              onChange={(e) => set("scopeOfWork", e.target.value)}
            />
          </Fld>
        </div>
      )}

      {step?.id === "meters" && full && (
        <div className="space-y-2" data-testid="coned-step-meters">
          <h4 className="font-extrabold text-slate-900 text-sm">How many meters?</h4>
          <p className="text-xs text-slate-500">
            Number of new meters = total meters installed (not just the new one). Capacity increase
            stays No when each meter stays 100A.
          </p>
          {(answers.meters || []).map((m, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200 p-3 space-y-2 bg-slate-50"
            >
              <div className="flex items-center gap-2">
                <input
                  className="input text-base min-h-[44px] flex-1"
                  value={m.name || ""}
                  onChange={(e) => setMeter(i, "name", e.target.value)}
                  placeholder="Apartment 1 / PLP"
                />
                <button
                  type="button"
                  className="btn-ghost !py-2 !px-2 text-red-600 font-bold"
                  onClick={() => {
                    const meters = (answers.meters || []).filter((_, j) => j !== i);
                    scheduleSave({
                      ...answers,
                      meters,
                      numberOfNewMeters: meters.length,
                    });
                  }}
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="input text-sm min-h-[40px]"
                  value={m.unitType || ""}
                  onChange={(e) => setMeter(i, "unitType", e.target.value)}
                  placeholder="Unit type"
                />
                <input
                  className="input text-sm min-h-[40px]"
                  value={m.sqFt || ""}
                  onChange={(e) => setMeter(i, "sqFt", e.target.value)}
                  placeholder="Sq ft"
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost w-full border border-dashed border-emerald-300 text-emerald-800 font-bold"
            onClick={() => {
              const meters = (answers.meters || []).concat([
                { name: "", unitType: "Apartment", sqFt: "" },
              ]);
              scheduleSave({ ...answers, meters, numberOfNewMeters: meters.length });
            }}
          >
            + Add meter
          </button>
          <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white font-semibold text-sm">
            <input
              type="checkbox"
              className="w-5 h-5 accent-emerald-700"
              checked={!!answers.meterCapacityIncrease}
              onChange={(e) => set("meterCapacityIncrease", e.target.checked)}
            />
            Meter capacity increase? (default No)
          </label>
          <Fld label="Number of new meters (total installed)">
            <input
              className="input text-base min-h-[44px]"
              type="number"
              value={answers.numberOfNewMeters ?? (answers.meters || []).length}
              onChange={(e) => set("numberOfNewMeters", Number(e.target.value) || 0)}
            />
          </Fld>
        </div>
      )}

      {step?.id === "load" && full && (
        <div className="space-y-2" data-testid="coned-step-load">
          <h4 className="font-extrabold text-slate-900 text-sm">What&apos;s the electrical load?</h4>
          <p className="text-xs text-slate-500">Seeded 2-family pattern — edit freely. Single-phase defaults.</p>
          {(answers.loadItems || DEFAULT_LOAD_ITEMS).map((it, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-3 bg-slate-50 space-y-2">
              <div className="flex gap-2">
                <input
                  className="input text-sm min-h-[40px] flex-1"
                  value={it.name || ""}
                  onChange={(e) => setLoad(i, "name", e.target.value)}
                />
                <button
                  type="button"
                  className="btn-ghost !py-1 !px-2 text-red-600 font-bold"
                  onClick={() => {
                    const loadItems = (answers.loadItems || []).filter((_, j) => j !== i);
                    scheduleSave({ ...answers, loadItems });
                  }}
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  className="input text-sm min-h-[40px]"
                  type="number"
                  value={it.qty ?? 0}
                  onChange={(e) => setLoad(i, "qty", Number(e.target.value) || 0)}
                  placeholder="Qty"
                />
                <input
                  className="input text-sm min-h-[40px]"
                  type="number"
                  value={it.kwEach ?? 0}
                  onChange={(e) => setLoad(i, "kwEach", Number(e.target.value) || 0)}
                  placeholder="kW each"
                />
                <input
                  className="input text-sm min-h-[40px]"
                  value={it.phase || "Single"}
                  onChange={(e) => setLoad(i, "phase", e.target.value)}
                  placeholder="Phase"
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost w-full border border-dashed border-emerald-300 text-emerald-800 font-bold"
            onClick={() => {
              const loadItems = (answers.loadItems || []).concat([
                { name: "", qty: 1, kwEach: 1, phase: "Single" },
              ]);
              scheduleSave({ ...answers, loadItems });
            }}
          >
            + Add load item
          </button>
          <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-50 border border-emerald-100 font-extrabold text-sm">
            <span>Required total kW</span>
            <span data-testid="coned-kw-sum">{kwDisplay}</span>
          </div>
        </div>
      )}

      {reviewMode && (
        <div data-testid="coned-step-review">
          <h4 className="font-extrabold text-slate-900 text-sm mb-2">Review</h4>
          <p className="text-xs text-slate-500 mb-2">
            Create Case fills the portal up to Review only. You confirm submit. No password stored.
          </p>
          <details className="mb-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
            <summary className="font-bold text-indigo-900 text-sm cursor-pointer">
              Already handled for you
            </summary>
            <p className="text-[12px] text-indigo-800 mt-2">
              Electric · RTVI Yes · Contractor Levi/BLZ · Start date today · Heating incentives No ·
              Micromobility No · NY route No · Rear-yard Neither · Generator/welding/short-circuit No ·
              Skip optional Block/Lot · Mailing=service · Plain ASCII enforced
            </p>
            <p className="text-[11px] text-indigo-700 mt-1">
              {JSON.stringify(AUTO_HANDLED).slice(0, 120)}…
            </p>
          </details>
          <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 max-h-[40vh] overflow-y-auto mb-3">
            {createCaseReviewRows(answers).map((r) => (
              <div key={r.label} className="px-3 py-2 flex justify-between gap-3">
                <div className="text-xs text-slate-500 font-semibold">{r.label}</div>
                <div className="text-sm font-semibold text-slate-900 text-right">{r.value}</div>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="btn bg-emerald-700 text-white w-full !py-3.5 font-bold text-base min-h-[48px] mb-2"
            onClick={onCreateCase}
            disabled={busy || !createCaseReady(answers)}
            data-testid="coned-create-case-submit"
          >
            {busy ? "Queuing…" : "Create Case (fill up to Review)"}
          </button>

          {/* S24 upload — available when Form A + case number exist */}
          <div
            className="mt-3 p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2"
            data-testid="coned-upload-section"
          >
            <h5 className="font-extrabold text-sm text-slate-800">Upload Form A to case</h5>
            <p className="text-[11px] text-slate-500">
              Pulls from Drive folder {formA.dedicatedFolder}. Type: Application for Service. PDF ≤
              10MB. Human confirms submit.
            </p>
            <p className="text-xs font-semibold text-slate-700 truncate" data-testid="coned-upload-filename">
              {formA.filename || "No Form A yet — complete application first"}
            </p>
            {completedFiles.length === 0 ? (
              <p className="text-[11px] text-amber-700 font-semibold">
                No completed Form A on this job yet.
              </p>
            ) : null}
            <Fld label="Case number (MC-######)">
              <input
                className="input text-base min-h-[44px]"
                value={caseNumber}
                onChange={(e) => setCaseNumber(e.target.value)}
                placeholder="MC-941412"
                data-testid="coned-field-caseNumber"
              />
            </Fld>
            <button
              type="button"
              className="btn bg-slate-800 text-white w-full !py-3 font-bold min-h-[44px]"
              onClick={onUploadToCase}
              disabled={busy || !formA.filename}
              data-testid="coned-upload-submit"
            >
              {busy ? "Queuing…" : "Upload Form A to case"}
            </button>
          </div>
        </div>
      )}

      {err ? (
        <p className="text-sm text-red-600 font-semibold mt-2" data-testid="coned-create-case-error">
          {err}
        </p>
      ) : null}
      {okMsg ? (
        <p className="text-sm text-emerald-700 font-semibold mt-2" data-testid="coned-create-case-ok">
          {okMsg}
        </p>
      ) : null}

      {!reviewMode ? (
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            className="btn-ghost flex-1 !py-3"
            onClick={goBack}
            disabled={stepIndex === 0 || busy}
          >
            Back
          </button>
          <button
            type="button"
            className="btn bg-emerald-700 text-white flex-1 !py-3 font-bold"
            onClick={goNext}
            disabled={busy}
            data-testid="coned-create-case-next"
          >
            {stepIndex >= steps.length - 2 ? "Review" : "Next"}
          </button>
        </div>
      ) : (
        <button type="button" className="btn-ghost w-full !py-3 mt-2" onClick={goBack} disabled={busy}>
          Back to edit
        </button>
      )}

      <button
        type="button"
        className="btn-ghost w-full !py-2 text-slate-500 mt-1"
        onClick={() => {
          persist(answers, stepIndex);
          onClose?.();
        }}
        disabled={busy}
        data-testid="coned-create-case-save-close"
      >
        Save draft & close
      </button>
    </Sheet>
  );
}
