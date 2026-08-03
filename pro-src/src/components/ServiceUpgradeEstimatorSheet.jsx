// Estimate generator — Service upgrade questionnaire + live total + takeoff.
// Levi 2026-08-03: itemized meters/amps/phases, toggles, save → job + estimate.
import React, { useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Sheet, { Fld } from "./Sheet.jsx";
import CustomerSearch from "./CustomerSearch.jsx";
import ServiceAddressField from "./ServiceAddressField.jsx";
import { useStore } from "../state/store.jsx";
import { fmt$ } from "../lib/format.js";
import {
  METER_ROLES,
  METER_SIZES,
  buildServiceUpgradeEstimate,
  coerceMetersForMainPhase,
  defaultAnswers,
  emptyMeter,
  validateAnswers,
} from "../lib/serviceUpgradeEstimator.js";
import { defaultTakeoffItems, searchMaterials } from "../lib/materialCatalog.js";
import { customerKeyForName } from "../lib/customers.js";

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

export default function ServiceUpgradeEstimatorSheet({ onClose, prefill = {} }) {
  const { createJob, showToast, patchAndSave } = useStore();
  const nav = useNavigate();
  const [step, setStep] = useState(0); // 0 customer, 1 service, 2 meters, 3 extras, 4 review, 5 takeoff
  const [answers, setAnswers] = useState(() =>
    defaultAnswers({
      customerName: prefill.customer || prefill.businessName || prefill.customerName || "",
      personName: prefill.personName || "",
      email: prefill.email || "",
      phone: prefill.phone || "",
      serviceAddress: prefill.serviceAddress || prefill.address || "",
      billingAddress: prefill.billingAddress || "",
    })
  );
  const [busy, setBusy] = useState(false);
  const [takeoff, setTakeoff] = useState([]);
  const [matQ, setMatQ] = useState("");
  const [shareNote, setShareNote] = useState("");

  const built = useMemo(() => buildServiceUpgradeEstimate(answers), [answers]);
  const errors = built.errors || validateAnswers(answers);

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
    setTakeoff(defaultTakeoffItems(built.materialsHint));
    setStep(5);
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
          _estimator: {
            kind: "service_upgrade",
            answers,
            takeoff: takeoff.length ? takeoff : defaultTakeoffItems(built.materialsHint),
            builtAt: Date.now(),
          },
        },
        prefill.calEventId || ""
      );
      if (!jobId) {
        showToast("Could not create job");
        return;
      }
      // Ensure estimator payload + takeoff persisted (createJob already has lines).
      await patchAndSave?.(jobId, {
        estimateLines: built.lines,
        amount: fmt$(built.total) || String(built.total),
        title: built.title,
        _estimator: {
          kind: "service_upgrade",
          answers,
          takeoff: takeoff.length ? takeoff : defaultTakeoffItems(built.materialsHint),
          builtAt: Date.now(),
        },
      });
      showToast("Estimate ready — open job to send");
      onClose?.();
      nav("/job/" + encodeURIComponent(jobId));
    } catch (e) {
      showToast(String(e?.message || e || "Save failed"));
    } finally {
      setBusy(false);
    }
  };

  const matResults = useMemo(() => searchMaterials(matQ, 8), [matQ]);

  const steps = ["Customer", "Service", "Meters", "Extras", "Review", "Takeoff"];

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
        <div className="space-y-4" data-testid="est-gen-meters">
          {answers.meters.map((m, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-sm font-extrabold">Meter {i + 1}</p>
                {answers.meters.length > 1 ? (
                  <button
                    type="button"
                    className="text-xs font-bold text-red-600"
                    onClick={() => setAnswers((a) => ({ ...a, meters: a.meters.filter((_, j) => j !== i) }))}
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
                Include new panel
              </label>
              <Fld label="Feet meter → panel">
                <input
                  className="input"
                  type="number"
                  value={m.feetToPanel ?? 10}
                  onChange={(e) => updateMeter(i, { feetToPanel: Number(e.target.value) || 0 })}
                />
              </Fld>
            </div>
          ))}
          <button
            type="button"
            className="btn w-full bg-slate-100 font-bold"
            onClick={() => setAnswers((a) => ({ ...a, meters: [...a.meters, emptyMeter(a.mainPhase)] }))}
          >
            + Add meter
          </button>
          {answers.meters.some((m) => m.role === "plp") ? (
            <Fld label="Feet PLP meter → PLP equipment">
              <input
                className="input"
                type="number"
                value={answers.feetPlp}
                onChange={(e) => set({ feetPlp: Number(e.target.value) || 0 })}
              />
            </Fld>
          ) : null}
          <Fld label="Feet equipment → ground">
            <input
              className="input"
              type="number"
              value={answers.feetGround}
              onChange={(e) => set({ feetGround: Number(e.target.value) || 0 })}
            />
          </Fld>
          <button type="button" className="btn-brand w-full" onClick={() => setStep(3)}>
            Next — extras
          </button>
        </div>
      )}

      {step === 3 && (
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
                  <Fld label="Underground length (ft)">
                    <input
                      className="input"
                      type="number"
                      value={answers.conduitFeet}
                      onChange={(e) => set({ conduitFeet: Number(e.target.value) || 0 })}
                    />
                  </Fld>
                </>
              ) : (
                <Fld label="Overhead pipe length (ft, typical 10–15)">
                  <input
                    className="input"
                    type="number"
                    value={answers.overheadFeet}
                    onChange={(e) => set({ overheadFeet: Number(e.target.value) || 0 })}
                  />
                </Fld>
              )}
            </div>
          ) : null}
          <Fld label="Notes">
            <textarea className="input min-h-[4rem]" value={answers.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Fld>
          <button type="button" className="btn-brand w-full mt-3" onClick={() => setStep(4)}>
            Next — review
          </button>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3" data-testid="est-gen-review">
          {errors.length ? (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errors.join(" ")}</p>
          ) : null}
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
            <p className="text-xs text-slate-500">Total</p>
            <p className="text-2xl font-extrabold text-slate-900">{fmt$(built.total) || "$0"}</p>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-2">
            {built.lines.map((ln, i) => (
              <div key={i} className="text-sm border-b border-slate-100 pb-2">
                <p className="font-semibold">{fmt$(ln.amount)}</p>
                <p className="text-xs text-slate-600 whitespace-pre-wrap">{ln.description}</p>
              </div>
            ))}
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

      {step === 5 && (
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
                `After save, open the job and share LE Pro link / takeoff with crew. Materials: ${takeoff.filter((t) => t.checked).length} checked. Ref: ${key}`
              );
            }}
          >
            Prepare share note
          </button>
          <button type="button" className="btn-brand w-full" disabled={busy || errors.length} onClick={saveEstimate}>
            {busy ? "Saving…" : "Save job + estimate + takeoff"}
          </button>
          <button type="button" className="btn-ghost w-full text-sm" onClick={() => setStep(4)}>
            Back to review
          </button>
        </div>
      )}
    </Sheet>
  );
}
