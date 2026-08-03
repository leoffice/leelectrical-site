// Service / meter upgrade estimate generator — pure model + line builder.
// Levi 2026-08-03: itemized (not 1/2/3 package SKUs). Toggles, distances, always-on scope.
import { parseAmount } from "./format.js";

/** Default unit fees (sell-side starters; editable via answers.feeOverrides). */
export const DEFAULT_FEES = {
  meter: {
    "100-1": 1900,
    "100-3": 2300,
    "200-1": 2500,
    "200-3": 3000,
    "350-3": 3900,
    "400-3": 4500,
  },
  panel: {
    100: 450,
    200: 650,
    350: 1100,
    400: 1200,
  },
  alwaysIncluded: 650, // outlet + grounding + service light
  removalDisposal: 750,
  filing: 1800,
  freeFeetMeterPanel: 10,
  freeFeetPlp: 10,
  freeFeetGround: 15,
  perFootMeterPanel: 12,
  perFootPlp: 12,
  perFootGround: 8,
  conduitPerFoot: 85, // 2" or 4" same band v1
  overheadBase: 1200, // 10–15 ft typical
  overheadPerFootExtra: 40,
  overheadDefaultFeet: 12,
};

export const METER_ROLES = ["residential", "commercial", "plp"];

export const METER_SIZES = [
  { id: "100-1", amps: 100, phase: 1, label: "100 A single-phase" },
  { id: "100-3", amps: 100, phase: 3, label: "100 A three-phase" },
  { id: "200-1", amps: 200, phase: 1, label: "200 A single-phase" },
  { id: "200-3", amps: 200, phase: 3, label: "200 A three-phase" },
  { id: "350-3", amps: 350, phase: 3, label: "350 A three-phase" },
  { id: "400-3", amps: 400, phase: 3, label: "400 A three-phase" },
];

export function defaultAnswers(partial = {}) {
  return {
    customerName: "",
    personName: "",
    email: "",
    phone: "",
    serviceAddress: "",
    billingAddress: "",
    mainAmps: 200,
    mainPhase: 1, // 1 | 3
    meters: [
      { role: "residential", sizeId: "100-1", includePanel: true, feetToPanel: 10 },
    ],
    feetPlp: 10,
    feetGround: 15,
    includeAlways: true, // outlet + ground + light
    includeRemoval: false,
    includeFiling: false,
    includeConduit: false,
    conduitInch: 2, // 2 | 4
    conduitPath: "underground", // underground | overhead
    conduitFeet: 20,
    overheadFeet: 12,
    notes: "",
    feeOverrides: {},
    ...partial,
  };
}

export function feesFor(answers) {
  return { ...DEFAULT_FEES, ...(answers?.feeOverrides || {}) };
}

export function sizeById(id) {
  return METER_SIZES.find((s) => s.id === id) || METER_SIZES[0];
}

/** Validation errors (empty = ok). */
export function validateAnswers(answers) {
  const errs = [];
  const a = answers || defaultAnswers();
  if (!a.meters?.length) errs.push("Add at least one meter.");
  if (Number(a.mainPhase) === 1) {
    for (const m of a.meters) {
      const s = sizeById(m.sizeId);
      if (s.phase === 3) errs.push("Single-phase main cannot have three-phase meters.");
    }
  }
  for (const m of a.meters || []) {
    const s = sizeById(m.sizeId);
    if ((s.amps === 350 || s.amps === 400) && s.phase !== 3) {
      errs.push(`${s.amps}A is three-phase only.`);
    }
  }
  return [...new Set(errs)];
}

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function distCost(feet, free, rate) {
  const over = Math.max(0, (Number(feet) || 0) - free);
  return money(over * rate);
}

/**
 * Build priced line items + totals from questionnaire answers.
 * @returns {{ lines: object[], total: number, materialsHint: object[], errors: string[] }}
 */
export function buildServiceUpgradeEstimate(answers) {
  const a = { ...defaultAnswers(), ...answers, meters: answers?.meters?.length ? answers.meters : defaultAnswers().meters };
  const f = feesFor(a);
  const errors = validateAnswers(a);
  const lines = [];
  const materialsHint = [];

  const push = (itemName, description, amount, opts = {}) => {
    const amt = money(amount);
    if (amt <= 0 && !opts.allowZero) return;
    lines.push({
      itemName,
      item: itemName,
      description,
      qty: opts.qty ?? 1,
      unitPrice: opts.unitPrice ?? amt,
      rate: opts.unitPrice ?? amt,
      amount: amt,
      progressBilling: false,
    });
  };

  // Meters + panels
  a.meters.forEach((m, i) => {
    const s = sizeById(m.sizeId);
    const role = String(m.role || "residential");
    const roleLabel = role === "plp" ? "PLP / common" : role === "commercial" ? "Commercial" : "Residential";
    const meterFee = f.meter[s.id] ?? f.meter["100-1"];
    push(
      "Installation:Installation",
      `${roleLabel} meter ${i + 1}: ${s.label}.\nIncludes meter pan/position and service connection materials.`,
      meterFee
    );
    materialsHint.push({
      group: `Meter ${i + 1} (${s.label})`,
      items: [
        "End-line box (NYC) if first service position",
        `Meter pan ${s.label}`,
        "Connectors / lugs",
        "Wire meter ↔ panel",
        "Bonding",
      ],
    });

    if (m.includePanel !== false) {
      const pFee = f.panel[s.amps] ?? f.panel[100];
      push(
        "Installation:Installation",
        `Panel for meter ${i + 1} (${s.amps}A${s.phase === 3 ? " 3-phase" : " single-phase"}).`,
        pFee
      );
    }

    const d = distCost(m.feetToPanel, f.freeFeetMeterPanel, f.perFootMeterPanel);
    if (d > 0) {
      push(
        "Installation:Installation",
        `Extra distance meter↔panel (meter ${i + 1}): ${m.feetToPanel} ft (first ${f.freeFeetMeterPanel} ft included).`,
        d
      );
    }
  });

  const hasPlp = a.meters.some((m) => m.role === "plp");
  if (hasPlp) {
    const d = distCost(a.feetPlp, f.freeFeetPlp, f.perFootPlp);
    if (d > 0) {
      push(
        "Installation:Installation",
        `Extra distance PLP meter↔PLP equipment: ${a.feetPlp} ft (first ${f.freeFeetPlp} ft included).`,
        d
      );
    }
  }

  const gd = distCost(a.feetGround, f.freeFeetGround, f.perFootGround);
  if (gd > 0) {
    push(
      "Installation:Installation",
      `Extra distance equipment↔ground: ${a.feetGround} ft (first ${f.freeFeetGround} ft included).`,
      gd
    );
  }

  if (a.includeAlways !== false) {
    push(
      "Installation:Installation",
      "Included with every service upgrade: service outlet, grounding system, and service light.",
      f.alwaysIncluded
    );
    materialsHint.push({
      group: "Always included",
      items: ["Service outlet", "Grounding system", "Service light"],
    });
  }

  if (a.includeRemoval) {
    push(
      "Installation:Installation",
      "Removal and disposal of existing metering / service equipment.",
      f.removalDisposal
    );
  }

  if (a.includeConduit) {
    if (a.conduitPath === "overhead") {
      const feet = Number(a.overheadFeet) || f.overheadDefaultFeet;
      const extra = Math.max(0, feet - f.overheadDefaultFeet) * f.overheadPerFootExtra;
      push(
        "Service Upgrade:Over head pipe",
        `Overhead service pipe / riser (~${feet} ft; base covers typical 10–15 ft).`,
        f.overheadBase + extra
      );
    } else {
      const feet = Number(a.conduitFeet) || 0;
      const inch = a.conduitInch === 4 ? 4 : 2;
      push(
        "Installation:Installation",
        `Underground conduit to street — ${inch}" — ${feet} ft.`,
        money(feet * f.conduitPerFoot)
      );
    }
  }

  if (a.includeFiling) {
    push(
      "Tesla Charger:Filing permit:Filing permit",
      "Filing electrical permit with the city (separate fee).",
      f.filing
    );
  }

  // Summary description for job title
  const meterSummary = a.meters
    .map((m) => {
      const s = sizeById(m.sizeId);
      return `${m.role} ${s.label}`;
    })
    .join("; ");
  const title =
    `Service upgrade — ${a.meters.length} meter(s): ${meterSummary}. Main ${a.mainAmps}A ${a.mainPhase === 3 ? "3-phase" : "1-phase"}.` +
    (a.notes ? `\n\n${a.notes}` : "");

  const total = money(lines.reduce((s, ln) => s + parseAmount(ln.amount), 0));

  return {
    lines,
    total,
    title,
    materialsHint,
    errors,
    answers: a,
  };
}

/** Apply main-phase defaults when switching main phase. */
export function coerceMetersForMainPhase(meters, mainPhase) {
  const phase = Number(mainPhase) === 3 ? 3 : 1;
  return (meters || []).map((m) => {
    const s = sizeById(m.sizeId);
    if (phase === 1 && s.phase === 3) {
      // force matching amp single-phase if possible
      const id = s.amps === 200 ? "200-1" : "100-1";
      return { ...m, sizeId: id };
    }
    if (phase === 3 && s.phase === 1 && (s.amps === 100 || s.amps === 200)) {
      // optional: keep single-phase meters allowed on 3ph main
      return m;
    }
    return m;
  });
}

export function emptyMeter(mainPhase = 1) {
  return {
    role: "residential",
    sizeId: Number(mainPhase) === 3 ? "100-3" : "100-1",
    includePanel: true,
    feetToPanel: 10,
  };
}
