// S23 — "Submit a Case" questionnaire + create-case queue (branched).
// Add-Load = full (meters+load); No-Additional-Load = short (skips load/meters).
import React, { useEffect, useMemo, useRef, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";
import {
  AUTO_HANDLED,
  DEFAULT_LOAD_ITEMS,
  LOAD_CATALOG,
  REQUEST_TYPES,
  REQUEST_TYPE_LABELS,
  buildLoadLearningEntry,
  createCaseReady,
  createCaseReviewRows,
  isAcItem,
  isFullBranch,
  isLightingItem,
  isMotorItem,
  makeLoadItemFromCatalog,
  mergeLoadLearningHistories,
  missingCreateCaseFields,
  normalizeLoadRow,
  portalWizardStepCount,
  questionnaireSteps,
  readGlobalLoadLearning,
  recordLoadLearning,
  resolveLoadEntryMode,
  sanitizeAnswers,
  seedCreateCaseAnswers,
  sumLoadKw,
} from "../lib/agencyForms/createCaseQuestionnaire.js";
import {
  applyNycLookupToAnswers,
  lookupNycProperty,
} from "../lib/agencyForms/nycPropertyLookup.js";
import { createCasePaperworkJob } from "../lib/agencyForms/createCaseExecution.js";
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
  const loadHistory = mergeLoadLearningHistories(
    job?.paperwork?.coned?.loadLearningHistory || [],
    readGlobalLoadLearning()
  );
  const [answers, setAnswers] = useState(() =>
    seedCreateCaseAnswers(job, existing, { loadHistory })
  );
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const steps = useMemo(() => questionnaireSteps(answers.requestType), [answers.requestType]);
  const [stepIndex, setStepIndex] = useState(() =>
    Math.min(Number(existing?.stepIndex) || 0, Math.max(0, steps.length - 1))
  );
  const stepIndexRef = useRef(stepIndex);
  stepIndexRef.current = stepIndex;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupNote, setLookupNote] = useState("");
  const [showLoadPicker, setShowLoadPicker] = useState(false);
  const [caseNumber, setCaseNumber] = useState(
    () =>
      job?.paperwork?.coned?.caseNumber ||
      existing?.execution?.caseNumber ||
      ""
  );
  const saveTimer = useRef(null);
  const lookupOnce = useRef(false);

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

  /**
   * Functional updates so rapid typing / multi-field edits never drop keystrokes
   * (stale-closure was the "can only paste" bug). Live typing is NOT ASCII-stripped —
   * sanitizeAnswers runs on persist only so the caret stays put.
   */
  const scheduleSave = (updater, idx = stepIndexRef.current) => {
    setAnswers((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      answersRef.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(answersRef.current, idx), 400);
      return next;
    });
  };

  const set = (key, value) => {
    if (key === "serviceAddress") {
      // Keep house/street in sync with freeform address edits (payload prefers these)
      scheduleSave((prev) => {
        const addr = String(value || "").trim();
        const m = addr.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
        let houseNumber = prev.houseNumber;
        let streetName = prev.streetName;
        if (m) {
          houseNumber = m[1];
          streetName = m[2]
            .replace(/,?\s*(brooklyn|queens|manhattan|bronx|staten island).*$/i, "")
            .replace(/,?\s*new york.*$/i, "")
            .replace(/,?\s*ny\b.*$/i, "")
            .replace(/,?\s*\d{5}(?:-\d{4})?\s*$/i, "")
            .replace(/,\s*$/, "")
            .trim();
        }
        return { ...prev, serviceAddress: value, houseNumber, streetName };
      });
      return;
    }
    scheduleSave((prev) => ({ ...prev, [key]: value }));
  };

  /** Public NYC BIN (+ property owner when customer person name is blank). */
  const runPublicLookup = async ({ force = false } = {}) => {
    const addr =
      answersRef.current.serviceAddress || job?.serviceAddress || job?.address || "";
    if (!String(addr).trim()) {
      setLookupNote("Need a street address first.");
      return;
    }
    setLookupBusy(true);
    setLookupNote("");
    try {
      const hit = await lookupNycProperty(addr);
      if (!hit.ok) {
        setLookupNote(
          hit.error === "not_found"
            ? "No public match for that address — type the BIN."
            : `Public lookup failed (${hit.error || "error"}). Type the BIN.`
        );
        return;
      }
      setAnswers((prev) => {
        const next = applyNycLookupToAnswers(prev, hit, {
          forceBin: force,
          forceOwner: false,
        });
        answersRef.current = next;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(
          () => persist(answersRef.current, stepIndexRef.current),
          400
        );
        return next;
      });
      const parts = [];
      if (hit.bin) parts.push(`BIN ${hit.bin}`);
      if (hit.ownerRaw) parts.push(`property owner ${hit.ownerRaw}`);
      setLookupNote(
        parts.length
          ? `Public records: ${parts.join(" · ")}. Confirm owner first/last match the customer card.`
          : "Public records returned — confirm fields."
      );
    } catch (e) {
      setLookupNote(String(e?.message || e || "lookup failed"));
    } finally {
      setLookupBusy(false);
    }
  };

  // Auto-pull public BIN once when the property step opens and BIN is empty
  useEffect(() => {
    if (lookupOnce.current) return;
    if (step?.id !== "property") return;
    if (String(answers.bin || "").trim()) return;
    lookupOnce.current = true;
    runPublicLookup({ force: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id]);

  const setMeter = (i, key, value) => {
    scheduleSave((prev) => {
      const meters = (prev.meters || []).slice();
      meters[i] = { ...(meters[i] || {}), [key]: value };
      return {
        ...prev,
        meters,
        numberOfNewMeters: meters.filter((m) => m?.name).length || prev.numberOfNewMeters,
      };
    });
  };

  const setLoad = (i, key, value) => {
    scheduleSave((prev) => {
      const loadItems = (prev.loadItems || DEFAULT_LOAD_ITEMS.map((x) => ({ ...x }))).slice();
      const row = { ...(loadItems[i] || {}), [key]: value };
      if (key === "name") {
        if (isLightingItem(value)) row.entryMode = "totalKw";
        else if (isAcItem(value) || isMotorItem(value)) {
          row.entryMode = row.unit === "hp" ? "hp" : "kw";
        } else if (
          !row.entryMode ||
          row.entryMode === "totalKw" ||
          row.entryMode === "hp" ||
          row.entryMode === "kw"
        ) {
          row.entryMode = "qtyKw";
        }
      }
      if (key === "unit") {
        row.entryMode = value === "hp" ? "hp" : "kw";
      }
      loadItems[i] = normalizeLoadRow(row);
      return { ...prev, loadItems };
    });
  };

  const addLoadFromCatalog = (catalogId) => {
    scheduleSave((prev) => {
      const next = makeLoadItemFromCatalog(catalogId);
      return {
        ...prev,
        loadItems: (prev.loadItems || []).concat([next]),
      };
    });
    setShowLoadPicker(false);
  };

  const goNext = () => {
    setErr("");
    const latest = answersRef.current;
    const miss = missingCreateCaseFields(step?.id, latest);
    if (miss.length) {
      setErr("Fill required: " + miss.map((m) => m.label).join(", "));
      return;
    }
    if (stepIndex < steps.length - 1) {
      // When request type changes, re-resolve steps length
      const nextSteps = questionnaireSteps(latest.requestType);
      const nextIdx = Math.min(stepIndex + 1, nextSteps.length - 1);
      setStepIndex(nextIdx);
      persist(latest, nextIdx);
    }
  };

  const goBack = () => {
    setErr("");
    if (stepIndex > 0) {
      const nextIdx = stepIndex - 1;
      setStepIndex(nextIdx);
      persist(answersRef.current, nextIdx);
    }
  };

  const onCreateCase = async () => {
    setErr("");
    setOkMsg("");
    const latest = answersRef.current;
    if (!createCaseReady(latest)) {
      setErr("Still missing required fields — go back and complete each step.");
      return;
    }
    setBusy(true);
    try {
      // Learn from this fill so the next similar job pre-fills better (job + device)
      const learnEntry = isFullBranch(latest.requestType)
        ? buildLoadLearningEntry(latest.loadItems, latest, {
            jobId: job?.id || "",
            source: "create_case_queue",
          })
        : null;
      const nextHistory = learnEntry
        ? recordLoadLearning(job?.paperwork?.coned?.loadLearningHistory || [], learnEntry)
        : job?.paperwork?.coned?.loadLearningHistory || [];

      const wrappedSave = (patch) => {
        const coned = patch?.paperwork?.coned || {};
        onSave?.({
          ...patch,
          paperwork: {
            ...(patch.paperwork || {}),
            coned: {
              ...coned,
              loadLearningHistory: nextHistory,
            },
          },
        });
      };

      const r = await createCasePaperworkJob({
        answers: latest,
        job,
        onSave: wrappedSave,
      });
      if (r.ok) {
        setOkMsg(
          `Case queued for the browser agent (${REQUEST_TYPE_LABELS[latest.requestType]} · ${portalWizardStepCount(
            latest.requestType
          )} portal steps). It fills to Review, sends you a screenshot, and waits for YOUR approval — nothing submits without it.`
        );
      } else {
        setErr(r.error || "Could not queue create-case");
        if (r.draft) persist(latest, stepIndexRef.current, { status: r.draft.status, execution: r.draft.execution });
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
        answers: answersRef.current,
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
                persist(answersRef.current, i);
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
              scheduleSave(
                (prev) => sanitizeAnswers({ ...prev, requestType: v }),
                0
              );
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
          <Fld label="BIN" hint="public NYC lookup — you don't type this">
            <div className="flex gap-2">
              <input
                className="input text-base min-h-[44px] flex-1"
                value={answers.bin || ""}
                onChange={(e) => set("bin", e.target.value)}
                data-testid="coned-field-bin"
                placeholder={lookupBusy ? "Looking up…" : "Auto from public records"}
              />
              <button
                type="button"
                className="btn-ghost shrink-0 border border-emerald-300 text-emerald-900 font-bold px-3 min-h-[44px]"
                onClick={() => runPublicLookup({ force: true })}
                disabled={lookupBusy}
                data-testid="coned-lookup-bin"
              >
                {lookupBusy ? "…" : "Look up"}
              </button>
            </div>
            {lookupNote ? (
              <p className="text-[11px] text-emerald-800 mt-1 font-semibold" data-testid="coned-lookup-note">
                {lookupNote}
              </p>
            ) : null}
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
          <p className="text-xs text-slate-500">
            Pulled from the customer card (person name). Company names stay off this line.
          </p>
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
          {!answers.ownerFirst && !answers.ownerLast ? (
            <button
              type="button"
              className="btn-ghost w-full border border-slate-200 text-slate-700 font-bold min-h-[44px]"
              onClick={() => runPublicLookup({ force: false })}
              disabled={lookupBusy}
              data-testid="coned-lookup-owner"
            >
              {lookupBusy ? "Looking up…" : "Fill owner from public property records"}
            </button>
          ) : null}
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
          <Fld label="Scope of work" hint="from estimate when available · plain ASCII">
            <textarea
              className="input text-base min-h-[80px]"
              value={answers.scopeOfWork || ""}
              onChange={(e) => set("scopeOfWork", e.target.value)}
              data-testid="coned-field-scopeOfWork"
            />
          </Fld>
          <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 font-semibold text-sm">
            <input
              type="checkbox"
              className="w-5 h-5 accent-emerald-700"
              checked={!!answers.replaceUpgradeEquipment}
              onChange={(e) => set("replaceUpgradeEquipment", e.target.checked)}
            />
            Replacing / upgrading other equipment?
          </label>
          {answers.replaceUpgradeEquipment ? (
            <Fld label="Name of equipment">
              <input
                className="input text-base min-h-[44px]"
                value={answers.equipmentName || ""}
                onChange={(e) => set("equipmentName", e.target.value)}
                placeholder="Electric meters"
                data-testid="coned-field-equipmentName"
              />
            </Fld>
          ) : null}
          {!full ? (
            <>
              <Fld label="Number of new meters (total installed)">
                <input
                  className="input text-base min-h-[44px]"
                  type="number"
                  value={answers.numberOfNewMeters ?? 0}
                  onChange={(e) => set("numberOfNewMeters", Number(e.target.value) || 0)}
                  data-testid="coned-field-numberOfNewMeters-short"
                />
              </Fld>
              <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white font-semibold text-sm">
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-emerald-700"
                  checked={!!answers.meterCapacityIncrease}
                  onChange={(e) => set("meterCapacityIncrease", e.target.checked)}
                />
                Meter capacity increase? (default No)
              </label>
            </>
          ) : null}
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
                    scheduleSave((prev) => {
                      const meters = (prev.meters || []).filter((_, j) => j !== i);
                      return { ...prev, meters, numberOfNewMeters: meters.length };
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
              scheduleSave((prev) => {
                const meters = (prev.meters || []).concat([
                  { name: "", unitType: "Apartment", sqFt: "" },
                ]);
                return { ...prev, meters, numberOfNewMeters: meters.length };
              });
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
          <p className="text-xs text-slate-500">
            Pick equipment from the list (same idea as the meter application form). Lighting = total
            kW + single/three-phase counts · devices = qty × kW · motors/AC = kW or HP. Each fill
            teaches the next job.
          </p>
          {answers._loadPrefillSource === "learning" ? (
            <p className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1">
              Prefill from your past additional-load fills — review and adjust.
            </p>
          ) : null}

          {(answers.loadItems || DEFAULT_LOAD_ITEMS).map((it, i) => {
            const mode = resolveLoadEntryMode(it);
            return (
              <div
                key={i}
                className="rounded-xl border border-slate-200 p-3 bg-slate-50 space-y-2"
                data-testid={`coned-load-row-${i}`}
              >
                <div className="flex gap-2">
                  <input
                    className="input text-sm min-h-[40px] flex-1 font-semibold"
                    value={it.name || ""}
                    onChange={(e) => setLoad(i, "name", e.target.value)}
                    placeholder="Equipment name"
                    data-testid={`coned-load-name-${i}`}
                  />
                  <button
                    type="button"
                    className="btn-ghost !py-1 !px-2 text-red-600 font-bold"
                    onClick={() => {
                      scheduleSave((prev) => ({
                        ...prev,
                        loadItems: (prev.loadItems || []).filter((_, j) => j !== i),
                      }));
                    }}
                    aria-label="Remove load item"
                  >
                    ×
                  </button>
                </div>

                {mode === "totalKw" ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2">
                      <Fld label="Total kW">
                        <input
                          className="input text-sm min-h-[40px]"
                          type="number"
                          value={it.totalKw ?? it.kwEach ?? 0}
                          onChange={(e) => setLoad(i, "totalKw", Number(e.target.value) || 0)}
                          placeholder="Total kW"
                          data-testid={`coned-load-totalKw-${i}`}
                        />
                      </Fld>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Fld label="Single-phase count">
                        <input
                          className="input text-sm min-h-[40px]"
                          type="number"
                          value={it.singlePhaseCount ?? 1}
                          onChange={(e) =>
                            setLoad(i, "singlePhaseCount", Number(e.target.value) || 0)
                          }
                          data-testid={`coned-load-singlePhase-${i}`}
                        />
                      </Fld>
                      <Fld label="Three-phase count">
                        <input
                          className="input text-sm min-h-[40px]"
                          type="number"
                          value={it.threePhaseCount ?? 0}
                          onChange={(e) =>
                            setLoad(i, "threePhaseCount", Number(e.target.value) || 0)
                          }
                          data-testid={`coned-load-threePhase-${i}`}
                        />
                      </Fld>
                    </div>
                    <Seg
                      testId={`coned-load-phase-${i}`}
                      value={/three/i.test(it.phase || "") ? "Three" : "Single"}
                      onChange={(v) => setLoad(i, "phase", v)}
                      options={[
                        { value: "Single", label: "Single phase" },
                        { value: "Three", label: "Three phase" },
                      ]}
                    />
                  </div>
                ) : mode === "hp" || mode === "kw" ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <Fld label="Qty">
                        <input
                          className="input text-sm min-h-[40px]"
                          type="number"
                          value={it.qty ?? 0}
                          onChange={(e) => setLoad(i, "qty", Number(e.target.value) || 0)}
                          placeholder="Qty"
                        />
                      </Fld>
                      {mode === "hp" ? (
                        <Fld label="HP each">
                          <input
                            className="input text-sm min-h-[40px]"
                            type="number"
                            value={it.hpEach ?? 0}
                            onChange={(e) => setLoad(i, "hpEach", Number(e.target.value) || 0)}
                            placeholder="HP each"
                          />
                        </Fld>
                      ) : (
                        <Fld label="kW each">
                          <input
                            className="input text-sm min-h-[40px]"
                            type="number"
                            value={it.kwEach ?? 0}
                            onChange={(e) => setLoad(i, "kwEach", Number(e.target.value) || 0)}
                            placeholder="kW each"
                          />
                        </Fld>
                      )}
                      <Fld label="Unit">
                        <select
                          className="input text-sm min-h-[40px]"
                          value={it.unit === "hp" ? "hp" : "kw"}
                          onChange={(e) => setLoad(i, "unit", e.target.value)}
                          data-testid={`coned-load-unit-${i}`}
                        >
                          <option value="kw">kW</option>
                          <option value="hp">HP</option>
                        </select>
                      </Fld>
                    </div>
                    <Seg
                      testId={`coned-load-phase-${i}`}
                      value={/three/i.test(it.phase || "") ? "Three" : "Single"}
                      onChange={(v) => setLoad(i, "phase", v)}
                      options={[
                        { value: "Single", label: "Single phase" },
                        { value: "Three", label: "Three phase" },
                      ]}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Fld label="Quantity">
                        <input
                          className="input text-sm min-h-[40px]"
                          type="number"
                          value={it.qty ?? 0}
                          onChange={(e) => setLoad(i, "qty", Number(e.target.value) || 0)}
                          placeholder="Qty"
                          data-testid={`coned-load-qty-${i}`}
                        />
                      </Fld>
                      <Fld label="kW each">
                        <input
                          className="input text-sm min-h-[40px]"
                          type="number"
                          value={it.kwEach ?? 0}
                          onChange={(e) => setLoad(i, "kwEach", Number(e.target.value) || 0)}
                          placeholder="kW each"
                          data-testid={`coned-load-kwEach-${i}`}
                        />
                      </Fld>
                    </div>
                    <Seg
                      testId={`coned-load-phase-${i}`}
                      value={/three/i.test(it.phase || "") ? "Three" : "Single"}
                      onChange={(v) => setLoad(i, "phase", v)}
                      options={[
                        { value: "Single", label: "Single phase" },
                        { value: "Three", label: "Three phase" },
                      ]}
                    />
                  </div>
                )}
                <p className="text-[11px] text-slate-500 font-semibold">
                  Line = {sumLoadKw([it]).toFixed(2)} kW
                </p>
              </div>
            );
          })}

          {showLoadPicker ? (
            <div
              className="rounded-xl border border-emerald-200 bg-white p-3 space-y-1.5"
              data-testid="coned-load-catalog-picker"
              role="listbox"
              aria-label="Add load equipment"
            >
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">
                Add equipment
              </div>
              {LOAD_CATALOG.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  data-testid={"coned-load-catalog-" + opt.id}
                  className="w-full text-left rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
                  onClick={() => addLoadFromCatalog(opt.id)}
                >
                  <div>{opt.name}</div>
                  <div className="text-[11px] text-slate-500 font-normal">{opt.hint}</div>
                </button>
              ))}
              <button
                type="button"
                className="btn-ghost w-full text-slate-600 font-bold mt-1"
                onClick={() => setShowLoadPicker(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-ghost w-full border border-dashed border-emerald-300 text-emerald-800 font-bold min-h-[48px]"
              onClick={() => setShowLoadPicker(true)}
              data-testid="coned-load-add"
            >
              + Add load item
            </button>
          )}

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
              Electric · RTVI Yes (inspection) · Contractor Levi/BLZ (required only) · Start date today ·
              Heating incentives No · Micromobility No · NY route No · Rear-yard Neither ·
              Generator/welding/short-circuit No · Skip ALL optional boxes (Block/Lot, customer company,
              contractor extras) · Mailing=service · Plain ASCII enforced
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
          if (saveTimer.current) clearTimeout(saveTimer.current);
          persist(answersRef.current, stepIndexRef.current);
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
