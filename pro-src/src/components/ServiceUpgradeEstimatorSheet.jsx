// Estimate generator — Service upgrade questionnaire + live total + takeoff.
// Levi 2026-08-03: itemized meters/amps/phases, toggles, save → job + estimate.
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Sheet, { Fld } from "./Sheet.jsx";
import CustomerSearch from "./CustomerSearch.jsx";
import ServiceAddressField from "./ServiceAddressField.jsx";
import LineToggle from "./Toggle.jsx";
import { useStore } from "../state/store.jsx";
import { fmt$ } from "../lib/format.js";
import {
  METER_ROLES,
  METER_SIZES,
  buildServiceUpgradeEstimate,
  coerceMetersForMainPhase,
  defaultAnswers,
  emptyMeter,
  filterEnabledEstimateLines,
  meterSuggestedAmount,
  meterSummaryLine,
  validateAnswers,
} from "../lib/serviceUpgradeEstimator.js";
import { defaultTakeoffItems, searchMaterials } from "../lib/materialCatalog.js";
import { customerKeyForName } from "../lib/customers.js";
import { productName } from "../lib/tenantBranding.js";

function Toggle({ label, on, setOn, testId }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2 border-b border-slate-100" data-testid={testId}>
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={`relative w-11 h-6 rounded-full transition ${on ? "bg-brand" : "bg-slate-300"}`}
        onClick={() => setOn(!on)}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition ${on ? "translate-x-5" : ""}`} />
      </button>
    </label>
  );
}

/** Feet field with − / + one foot; value still typeable. */
function FeetStepper({ label, value, onChange, testId }) {
  const n = Number(value) || 0;
  return (
    <Fld label={label}>
      <div className="flex items-center gap-2" data-testid={testId}>
        <button
          type="button"
          className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 bg-white text-lg font-bold text-slate-700 active:bg-slate-50"
          aria-label="Decrease one foot"
          onClick={() => onChange(Math.max(0, n - 1))}
        >
          −
        </button>
        <input
          className="input text-center font-semibold"
          type="number"
          min={0}
          value={n}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        />
        <button
          type="button"
          className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 bg-white text-lg font-bold text-slate-700 active:bg-slate-50"
          aria-label="Increase one foot"
          onClick={() => onChange(n + 1)}
        >
          +
        </button>
        <span className="text-xs font-semibold text-slate-400 shrink-0">ft</span>
      </div>
    </Fld>
  );
}

export default function ServiceUpgradeEstimatorSheet({ onClose, prefill = {} }) {
  const { createJob, showToast, patchAndSave } = useStore();
  const nav = useNavigate();
  const editingJobId = prefill.jobId || prefill.id || null;
  // 0 customer · 1 service · 2 meters · 3 additional · 4 extras · 5 review · 6 takeoff
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(() =>
    defaultAnswers({
      ...(prefill._estimator?.answers || {}),
      customerName:
        prefill.customer ||
        prefill.businessName ||
        prefill.customerName ||
        prefill._estimator?.answers?.customerName ||
        "",
      personName: prefill.personName || prefill._estimator?.answers?.personName || "",
      email: prefill.email || prefill._estimator?.answers?.email || "",
      phone: prefill.phone || prefill._estimator?.answers?.phone || "",
      serviceAddress:
        prefill.serviceAddress ||
        prefill.address ||
        prefill._estimator?.answers?.serviceAddress ||
        "",
      billingAddress: prefill.billingAddress || prefill._estimator?.answers?.billingAddress || "",
    })
  );
  const [busy, setBusy] = useState(false);
  const [takeoff, setTakeoff] = useState([]);
  const [matQ, setMatQ] = useState("");
  const [shareNote, setShareNote] = useState("");
  // Per-line on/off on Review — true/undefined = include, false = drop from total & save
  const [lineOn, setLineOn] = useState([]);
  /** Which meter accordion is expanded; null = all collapsed. Only one open at a time. */
  const [openMeterIdx, setOpenMeterIdx] = useState(0);

  const builtAll = useMemo(() => buildServiceUpgradeEstimate(answers), [answers]);
  useEffect(() => {
    setLineOn((prev) => {
      const n = builtAll.lines.length;
      const next = Array.from({ length: n }, (_, i) => (prev[i] === false ? false : true));
      if (next.length === prev.length && next.every((v, i) => v === (prev[i] !== false))) return prev;
      return next;
    });
  }, [builtAll.lines.length, builtAll.total, answers]);

  const built = useMemo(
    () => filterEnabledEstimateLines(builtAll, lineOn),
    [builtAll, lineOn]
  );
  const errors = builtAll.errors || validateAnswers(answers);

  const toggleLine = (i, on) => {
    setLineOn((prev) => {
      const next = prev.slice();
      while (next.length <= i) next.push(true);
      next[i] = !!on;
      return next;
    });
  };

  const set = useCallback((patch) => setAnswers((a) => ({ ...a, ...patch })), []);

  const updateMeter = (i, patch) => {
    setAnswers((a) => {
      const meters = a.meters.map((m, idx) => (idx === i ? { ...m, ...patch } : m));
      return { ...a, meters };
    });
  };

  const setMainPhase = (phase) => {
    setAnswers((a) => ({
      ...a,
      mainPhase: phase,
      meters: coerceMetersForMainPhase(a.meters, phase),
    }));
  };

  const openTakeoff = () => {
    setTakeoff(defaultTakeoffItems(builtAll.materialsHint));
    setStep(6);
  };

  const addMaterial = (m) => {
    setTakeoff((list) => [
      ...list,
      {
        id: m.id + "-" + Date.now(),
        name: m.name,
        qty: 1,
        unit: m.unit,
        checked: true,
        custom: false,
        group: "Added",
      },
    ]);
    setMatQ("");
  };

  const addCustomMaterial = () => {
    const name = matQ.trim();
    if (!name) return;
    setTakeoff((list) => [
      ...list,
      { id: "custom-" + Date.now(), name, qty: 1, unit: "ea", checked: true, custom: true, group: "Custom" },
    ]);
    setMatQ("");
  };

  const saveEstimate = async () => {
    if (errors.length) {
      showToast(errors[0]);
      return;
    }
    if (!answers.customerName && !answers.serviceAddress) {
      showToast("Add a customer or service address");
      setStep(0);
      return;
    }
    setBusy(true);
    try {
      const biz = answers.customerName || "Service upgrade customer";
      const estimatorPayload = {
        kind: "service_upgrade",
        answers,
        lineOn,
        takeoff: takeoff.length ? takeoff : defaultTakeoffItems(builtAll.materialsHint),
        builtAt: Date.now(),
      };
      const patch = {
        estimateLines: built.lines,
        amount: fmt$(built.total) || String(built.total),
        title: built.title,
        serviceAddress: answers.serviceAddress || "",
        address: answers.serviceAddress || "",
        notes: answers.notes || "",
        _estimator: estimatorPayload,
      };

      // Re-run generator on an existing job (Edit with estimate generator)
      if (editingJobId) {
        await patchAndSave?.(editingJobId, patch);
        showToast("Estimate updated from generator");
        onClose?.();
        nav("/job/" + encodeURIComponent(editingJobId) + "?fold=0");
        return;
      }

      const jobId = await createJob(
        {
          customer: biz,
          businessName: biz,
          personName: answers.personName || "",
          email: answers.email || "",
          phone: answers.phone || "",
          serviceAddress: answers.serviceAddress || "",
          address: answers.serviceAddress || "",
          billingAddress: answers.billingAddress || answers.serviceAddress || "",
          title: built.title,
          amount: fmt$(built.total) || String(built.total),
          estimateLines: built.lines,
          notes: answers.notes || "",
          _estimator: estimatorPayload,
        },
        prefill.calEventId || ""
      );
      if (!jobId) {
        showToast("Could not create job");
        return;
      }
      await patchAndSave?.(jobId, patch);
      showToast("Estimate created — viewing job");
      onClose?.();
      nav("/job/" + encodeURIComponent(jobId) + "?fold=0");
    } catch (e) {
      showToast(String(e?.message || e || "Save failed"));
    } finally {
      setBusy(false);
    }
  };

  const matResults = useMemo(() => searchMaterials(matQ, 8), [matQ]);

  const steps = ["Customer", "Service", "Meters", "Additional", "Extras", "Review", "Takeoff"];

  return (
    <Sheet title="Estimate generator" onClose={onClose} tall testId="service-upgrade-estimator">
      <p className="text-xs text-slate-500 mb-2">
        Service upgrade · live total{" "}
        <span className="font-extrabold text-brand text-sm">{fmt$(built.total) || "$0"}</span>
      </p>
      <div className="flex gap-1 mb-3 overflow-x-auto">
        {steps.map((s, i) => (
          <button
            key={s}
            type="button"
            className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${
              i === step ? "bg-brand text-white" : i < step ? "bg-brand-soft text-brand" : "bg-slate-100 text-slate-500"
            }`}
            onClick={() => setStep(i)}
          >
            {s}
          </button>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-3" data-testid="est-gen-customer">
          <p className="text-sm text-slate-600">Pick an existing customer or type a new name. Calendar events can prefill address.</p>
          <CustomerSearch
            label="Customer"
            value={answers.customerName}
            onChangeText={(t) => set({ customerName: t })}
            onPick={(c) => {
              if (!c || c._newCustomer) return;
              set({
                customerName: c.businessName || c.name || c.customer || "",
                personName: c.personName || "",
                email: c.email || "",
                phone: c.phone || "",
                billingAddress: c.billingAddress || c.addr || "",
                serviceAddress: answers.serviceAddress || c.serviceAddress || c.addr || "",
              });
            }}
          />
          <Fld label="Person">
            <input className="input" value={answers.personName} onChange={(e) => set({ personName: e.target.value })} />
          </Fld>
          <Fld label="Phone">
            <input className="input" value={answers.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Fld>
          <Fld label="Email">
            <input className="input" value={answers.email} onChange={(e) => set({ email: e.target.value })} />
          </Fld>
          <ServiceAddressField
            label="Service address"
            value={answers.serviceAddress}
            onChange={(v) => set({ serviceAddress: v })}
          />
          <button type="button" className="btn-brand w-full" onClick={() => setStep(1)}>
            Next — service
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3" data-testid="est-gen-service">
          <Fld label="Main service amps">
            <input
              className="input"
              type="number"
              value={answers.mainAmps}
              onChange={(e) => set({ mainAmps: Number(e.target.value) || 0 })}
            />
          </Fld>
          <div className="flex gap-2">
            {[1, 3].map((p) => (
              <button
                key={p}
                type="button"
                className={`flex-1 rounded-xl border py-2.5 text-sm font-bold ${
                  answers.mainPhase === p ? "bg-brand-soft border-brand text-brand" : "border-slate-200"
                }`}
                onClick={() => setMainPhase(p)}
              >
                {p === 1 ? "Single-phase" : "Three-phase"}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Single-phase main cannot include three-phase meters. Three-phase main can mix single-phase meters.
          </p>
          <button type="button" className="btn-brand w-full" onClick={() => setStep(2)}>
            Next — meters
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3" data-testid="est-gen-meters">
          <p className="text-xs text-slate-500">
            Fill a meter, then collapse it for space. Only one meter is open at a time — tap a row to edit.
          </p>
          {answers.meters.map((m, i) => {
            const open = openMeterIdx === i;
            const chip = meterSummaryLine(m);
            const suggested = meterSuggestedAmount(m, answers, i);
            const feet = m.feetToPanel != null ? Number(m.feetToPanel) : 1;
            return (
              <div
                key={i}
                className="rounded-xl border border-slate-200 overflow-hidden bg-white"
                data-testid={`est-gen-meter-${i}`}
                data-open={open ? "1" : "0"}
              >
                {/* Collapsed: meter line + feet parallel */}
                <div className="flex items-stretch gap-0">
                  <button
                    type="button"
                    className="min-w-0 flex-1 flex items-center gap-2 px-3 py-3 text-left active:bg-slate-50"
                    onClick={() => setOpenMeterIdx(open ? null : i)}
                    aria-expanded={open}
                  >
                    <span className="text-sm font-extrabold text-slate-900 shrink-0">
                      Meter {i + 1}
                      {i > 0 ? (
                        <span className="ml-1 text-[10px] font-bold text-slate-400">+add</span>
                      ) : null}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand-soft text-brand border border-brand/20 truncate">
                      {chip}
                    </span>
                    <span className="ml-auto text-sm font-bold text-slate-700 tabular-nums shrink-0">
                      {fmt$(suggested)}
                    </span>
                    <span className="text-slate-400 text-xs shrink-0" aria-hidden>
                      {open ? "▲" : "▼"}
                    </span>
                  </button>
                  {/* Feet parallel to meter line — always visible */}
                  <div
                    className="flex items-center gap-0.5 border-l border-slate-200 px-1.5 bg-slate-50/80 shrink-0"
                    data-testid={`est-gen-feet-inline-${i}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-base font-bold text-slate-700"
                      aria-label="Decrease feet"
                      onClick={() => updateMeter(i, { feetToPanel: Math.max(0, feet - 1) })}
                    >
                      −
                    </button>
                    <div className="w-10 text-center">
                      <input
                        className="w-full text-center text-sm font-extrabold tabular-nums bg-transparent outline-none"
                        type="number"
                        min={0}
                        value={feet}
                        onChange={(e) =>
                          updateMeter(i, { feetToPanel: Math.max(0, Number(e.target.value) || 0) })
                        }
                        aria-label="Feet meter to panel"
                      />
                      <p className="text-[9px] font-bold text-slate-400 -mt-0.5">ft</p>
                    </div>
                    <button
                      type="button"
                      className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-base font-bold text-slate-700"
                      aria-label="Increase feet"
                      onClick={() => updateMeter(i, { feetToPanel: feet + 1 })}
                    >
                      +
                    </button>
                  </div>
                </div>
                {open ? (
                  <div className="px-3 pb-3 space-y-2 border-t border-slate-100 pt-2">
                    <div className="flex justify-end">
                      {answers.meters.length > 1 ? (
                        <button
                          type="button"
                          className="text-xs font-bold text-red-600"
                          onClick={() => {
                            setAnswers((a) => {
                              const meters = a.meters.filter((_, j) => j !== i);
                              return { ...a, meters };
                            });
                            setOpenMeterIdx((cur) => {
                              if (cur == null) return null;
                              if (cur === i) return Math.max(0, i - 1);
                              if (cur > i) return cur - 1;
                              return cur;
                            });
                          }}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {METER_ROLES.map((r) => (
                        <button
                          key={r}
                          type="button"
                          className={`text-xs font-bold px-2 py-1 rounded-lg border ${
                            m.role === r ? "bg-brand-soft border-brand text-brand" : "border-slate-200"
                          }`}
                          onClick={() => updateMeter(i, { role: r })}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <select
                      className="input"
                      value={m.sizeId}
                      onChange={(e) => updateMeter(i, { sizeId: e.target.value })}
                    >
                      {METER_SIZES.filter((s) => answers.mainPhase !== 1 || s.phase === 1).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={m.includePanel !== false}
                        onChange={(e) => updateMeter(i, { includePanel: e.target.checked })}
                      />
                      Include new panel{i > 0 ? " ($450 additional panel rate)" : ""}
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Meter→panel distance is on the right (standard <b>1 ft</b> included). Extra feet add labor + materials to the price.
                      {i > 0 ? " Additional meters use the reduced rate ($1,650 band)." : ""}
                    </p>
                    <button
                      type="button"
                      className="btn w-full bg-slate-100 font-bold text-sm"
                      onClick={() => setOpenMeterIdx(null)}
                      data-testid={`est-gen-meter-done-${i}`}
                    >
                      Done — collapse
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            className="btn w-full bg-slate-100 font-bold"
            data-testid="est-gen-add-meter"
            onClick={() => {
              setAnswers((a) => {
                const meters = [...a.meters, emptyMeter(a.mainPhase)];
                return { ...a, meters };
              });
              setOpenMeterIdx(answers.meters.length); // new index after append
            }}
          >
            + Add meter
          </button>
          <button
            type="button"
            className="btn-brand w-full"
            onClick={() => {
              setOpenMeterIdx(null);
              setStep(3);
            }}
          >
            Next — panels distance
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3" data-testid="est-gen-additional">
          <p className="text-xs text-slate-500">
            Additional details — main service line to the metering equipment, end-line box run, and PLP if used.
            Meter→panel feet stay on each meter row (standard 1 ft; only noted in scope if over 3 ft).
          </p>
          <FeetStepper
            label={`Main service line to metering equipment ($${
              answers.mainAmps <= 100 ? 200 : answers.mainAmps <= 200 ? 260 : answers.mainAmps <= 350 ? 320 : 360
            }/ft for ${answers.mainAmps || 100}A main)`}
            value={answers.feetMainService ?? 0}
            onChange={(v) => set({ feetMainService: v })}
            testId="est-gen-feet-main"
          />
          <FeetStepper
            label="Service end-line box → metering equipment (ft)"
            value={answers.feetEndLineBox ?? 0}
            onChange={(v) => set({ feetEndLineBox: v })}
            testId="est-gen-feet-endline"
          />
          {answers.meters.some((m) => m.role === "plp") ? (
            <FeetStepper
              label="PLP meter → PLP equipment (ft)"
              value={answers.feetPlp}
              onChange={(v) => set({ feetPlp: v })}
              testId="est-gen-feet-plp"
            />
          ) : null}
          <div className="flex gap-2">
            <button type="button" className="btn flex-1 bg-slate-100 font-bold" onClick={() => setStep(2)}>
              Back
            </button>
            <button type="button" className="btn-brand flex-1" onClick={() => setStep(4)}>
              Next — extras
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-1" data-testid="est-gen-extras">
          <Toggle label="Always included (outlet + ground + service light)" on={answers.includeAlways !== false} setOn={(v) => set({ includeAlways: v })} />
          <Toggle label="Removal & disposal of old equipment" on={!!answers.includeRemoval} setOn={(v) => set({ includeRemoval: v })} />
          <Toggle label="City filing (separate fee)" on={!!answers.includeFiling} setOn={(v) => set({ includeFiling: v })} />
          <Toggle label="Conduit / pipe to street or overhead" on={!!answers.includeConduit} setOn={(v) => set({ includeConduit: v })} />
          {answers.includeConduit ? (
            <div className="pt-2 space-y-2">
              <div className="flex gap-2">
                {["underground", "overhead"].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`flex-1 rounded-xl border py-2 text-xs font-bold ${
                      answers.conduitPath === p ? "bg-brand-soft border-brand" : "border-slate-200"
                    }`}
                    onClick={() => set({ conduitPath: p })}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {answers.conduitPath === "underground" ? (
                <>
                  <div className="flex gap-2">
                    {[2, 4].map((inch) => (
                      <button
                        key={inch}
                        type="button"
                        className={`flex-1 rounded-xl border py-2 text-xs font-bold ${
                          answers.conduitInch === inch ? "bg-brand-soft border-brand" : "border-slate-200"
                        }`}
                        onClick={() => set({ conduitInch: inch })}
                      >
                        {inch}&quot; conduit
                      </button>
                    ))}
                  </div>
                  <FeetStepper
                    label="Underground length"
                    value={answers.conduitFeet}
                    onChange={(v) => set({ conduitFeet: v })}
                    testId="est-gen-feet-conduit"
                  />
                </>
              ) : (
                <FeetStepper
                  label="Overhead pipe length (typical 10–15)"
                  value={answers.overheadFeet}
                  onChange={(v) => set({ overheadFeet: v })}
                  testId="est-gen-feet-overhead"
                />
              )}
            </div>
          ) : null}
          <Fld label="Notes">
            <textarea className="input min-h-[4rem]" value={answers.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Fld>
          <div className="flex gap-2 mt-3">
            <button type="button" className="btn flex-1 bg-slate-100 font-bold" onClick={() => setStep(3)}>
              Back
            </button>
            <button type="button" className="btn-brand flex-1" onClick={() => setStep(5)}>
              Next — review
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-3" data-testid="est-gen-review">
          {errors.length ? (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errors.join(" ")}</p>
          ) : null}
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
            <p className="text-xs text-slate-500">Total (on lines)</p>
            <p className="text-2xl font-extrabold text-slate-900" data-testid="est-gen-review-total">
              {fmt$(built.total) || "$0"}
            </p>
          </div>
          <p className="text-xs text-slate-500">
            Toggle lines off if you don’t want them on this estimate — total updates live.
          </p>
          <div className="max-h-56 overflow-y-auto space-y-2" data-testid="est-gen-review-lines">
            {builtAll.lines.map((ln, i) => {
              const on = lineOn[i] !== false;
              return (
                <div
                  key={i}
                  className={`text-sm border-b border-slate-100 pb-2 flex gap-2 items-start ${
                    on ? "" : "opacity-45"
                  }`}
                  data-testid={`est-gen-review-line-${i}`}
                >
                  <LineToggle
                    on={on}
                    onChange={(v) => toggleLine(i, v)}
                    label={on ? "On" : "Off"}
                    small
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold ${on ? "" : "line-through text-slate-400"}`}>
                      {fmt$(ln.amount)}
                      {ln.itemName ? (
                        <span className="ml-1 font-bold text-slate-700">{ln.itemName}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-600 whitespace-pre-wrap">{ln.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" className="btn w-full bg-slate-100 font-bold" onClick={openTakeoff}>
            Takeoff / materials list
          </button>
          <button type="button" className="btn-brand w-full" disabled={busy || errors.length} onClick={saveEstimate}>
            {busy ? "Saving…" : "Save — create job + estimate"}
          </button>
          <p className="text-[11px] text-slate-500 text-center">
            Creates a job with estimate lines ready to send. Invoice when you convert the estimate.
          </p>
        </div>
      )}

      {step === 6 && (
        <div className="space-y-3" data-testid="est-gen-takeoff">
          <p className="text-sm text-slate-600">
            Field checklist. Search common names or type your own. Share this job after save so the crew can complete the list.
          </p>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="Search materials…"
              value={matQ}
              onChange={(e) => setMatQ(e.target.value)}
            />
            <button type="button" className="btn bg-slate-100 font-bold" onClick={addCustomMaterial}>
              Add
            </button>
          </div>
          {matQ.trim() ? (
            <div className="rounded-xl border border-slate-200 max-h-32 overflow-y-auto">
              {matResults.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm border-b border-slate-100 hover:bg-slate-50"
                  onClick={() => addMaterial(m)}
                >
                  {m.name}
                </button>
              ))}
            </div>
          ) : null}
          <div className="max-h-56 overflow-y-auto space-y-1">
            {takeoff.map((it, i) => (
              <label key={it.id} className="flex items-start gap-2 text-sm py-1">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={!!it.checked}
                  onChange={(e) =>
                    setTakeoff((list) => list.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)))
                  }
                />
                <span className="flex-1">
                  <span className="font-semibold">{it.name}</span>
                  <span className="text-xs text-slate-400 block">{it.group}</span>
                </span>
              </label>
            ))}
          </div>
          {shareNote ? <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1.5">{shareNote}</p> : null}
          <button
            type="button"
            className="btn w-full bg-slate-100 font-bold"
            onClick={() => {
              const key = customerKeyForName(answers.customerName || answers.serviceAddress || "job");
              setShareNote(
                `After save, open the job and share ${productName()} link / takeoff with crew. Materials: ${takeoff.filter((t) => t.checked).length} checked. Ref: ${key}`
              );
            }}
          >
            Prepare share note
          </button>
          <button type="button" className="btn-brand w-full" disabled={busy || errors.length} onClick={saveEstimate}>
            {busy ? "Saving…" : "Save job + estimate + takeoff"}
          </button>
          <button type="button" className="btn-ghost w-full text-sm" onClick={() => setStep(5)}>
            Back to review
          </button>
        </div>
      )}
    </Sheet>
  );
}
