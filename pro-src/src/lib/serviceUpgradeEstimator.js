// Service / meter upgrade estimate generator — pure model + line builder.
// Levi 2026-08-03: itemized meters, per-meter feet (default 1 ft), tiered 2nd+ meter pricing.
import { parseAmount } from "./format.js";

/** Default unit fees (sell-side starters; editable via answers.feeOverrides). */
export const DEFAULT_FEES = {
  /** First meter by size */
  meter: {
    "100-1": 1900,
    "100-3": 2300,
    "200-1": 2500,
    "200-3": 3000,
    "350-3": 3900,
    "400-3": 4500,
  },
  /**
   * Additional meters (2nd+) — less labor than first.
   * Levi: $1,650 every additional meter (100A 1φ band); scale others proportionally.
   */
  meterAdditional: {
    "100-1": 1650,
    "100-3": 2000,
    "200-1": 2200,
    "200-3": 2600,
    "350-3": 3400,
    "400-3": 3900,
  },
  /** First panel by amp (when only one panel / first included panel). */
  panel: {
    100: 450,
    200: 650,
    350: 1100,
    400: 1200,
  },
  /** Every additional panel (2nd+) — Levi $450. */
  panelAdditional: 450,
  alwaysIncluded: 650, // outlet + grounding + service light
  removalDisposal: 400, // Levi 2026-08-03: $400 not $750
  filing: 1800,
  /** Standard included feet meter→panel — Levi: 1 ft */
  freeFeetMeterPanel: 1,
  freeFeetPlp: 1,
  freeFeetGround: 15,
  freeFeetEndLine: 0,
  freeFeetMainService: 0,
  /** Labor+materials per extra foot beyond free */
  perFootMeterPanel: 35,
  perFootPlp: 35,
  perFootGround: 8,
  perFootEndLine: 40,
  /**
   * Main service line (utility/street path → metering equipment) $/ft by main amp.
   * Levi: ~$200/ft for 100A — scales up for larger copper/conduit labor.
   */
  perFootMainServiceByAmp: {
    100: 200,
    200: 260,
    350: 320,
    400: 360,
  },
  conduitPerFoot: 85,
  overheadBase: 1200,
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

const ITEM_SERVICE_UPGRADE = "Service Upgrade:Service Upgrade";
const ITEM_FILING = "Service Upgrade:Filing permit";
const ITEM_REMOVAL = "Service Upgrade:Removal & disposal";
const ITEM_CONDUIT = "Service Upgrade:Conduit / overhead";

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
      { role: "residential", sizeId: "100-1", includePanel: true, feetToPanel: 1 },
    ],
    /** Shared fallback if per-meter feet missing (legacy). */
    feetPanelsToMeter: 1,
    feetPlp: 1,
    feetGround: 15,
    /** Service end-line box → metering equipment (NYC) */
    feetEndLineBox: 0,
    /**
     * Main service line distance — utility / street path to metering equipment.
     * Priced per foot by main service amp size.
     */
    feetMainService: 0,
    includeAlways: true,
    includeRemoval: false,
    includeFiling: false,
    includeConduit: false,
    conduitInch: 2,
    conduitPath: "underground",
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

/** $/ft for main service line by main disconnect amp size. */
export function mainServicePerFoot(mainAmps, fees) {
  const f = fees || DEFAULT_FEES;
  const table = f.perFootMainServiceByAmp || DEFAULT_FEES.perFootMainServiceByAmp;
  const a = Number(mainAmps) || 100;
  if (a <= 100) return table[100] ?? 200;
  if (a <= 200) return table[200] ?? 260;
  if (a <= 350) return table[350] ?? 320;
  return table[400] ?? 360;
}

export function roleLabel(role) {
  const r = String(role || "residential");
  if (r === "plp") return "PLP / common";
  if (r === "commercial") return "Commercial";
  return "Residential";
}

/** Meter fee by index: first full price, 2nd+ discounted. */
export function meterFeeForIndex(sizeId, index, fees) {
  const f = fees || DEFAULT_FEES;
  if (index <= 0) return f.meter[sizeId] ?? f.meter["100-1"];
  return f.meterAdditional?.[sizeId] ?? f.meterAdditional?.["100-1"] ?? 1650;
}

/** Panel fee: first panel by amp; every additional panel $450. */
export function panelFeeForIndex(amps, panelIndex, fees) {
  const f = fees || DEFAULT_FEES;
  if (panelIndex <= 0) return f.panel[amps] ?? f.panel[100];
  return f.panelAdditional ?? 450;
}

function feetForMeter(m, answers, f) {
  if (m?.feetToPanel != null && m.feetToPanel !== "") return Number(m.feetToPanel) || 0;
  if (answers?.feetPanelsToMeter != null) return Number(answers.feetPanelsToMeter) || 0;
  return f.freeFeetMeterPanel;
}

/**
 * Build priced line items + totals from questionnaire answers.
 * Main work uses item "Service Upgrade"; filing & removal are separate lines.
 */
export function buildServiceUpgradeEstimate(answers) {
  const a = {
    ...defaultAnswers(),
    ...answers,
    meters: answers?.meters?.length ? answers.meters : defaultAnswers().meters,
  };
  const f = feesFor(a);
  const errors = validateAnswers(a);
  const lines = [];
  const materialsHint = [];
  const workBullets = [];
  const included = [];
  const notIncluded = [];

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

  let panelCount = 0;
  let metersSubtotal = 0;

  a.meters.forEach((m, i) => {
    const s = sizeById(m.sizeId);
    const role = roleLabel(m.role);
    const feet = feetForMeter(m, a, f);
    const mFee = meterFeeForIndex(s.id, i, f);
    metersSubtotal += mFee;

    const extraRun = distCost(feet, f.freeFeetMeterPanel, f.perFootMeterPanel);
    metersSubtotal += extraRun;

    let pFee = 0;
    if (m.includePanel !== false) {
      pFee = panelFeeForIndex(s.amps, panelCount, f);
      panelCount += 1;
      metersSubtotal += pFee;
    }

    // Scope: only call out meter→panel distance when over 3 ft (Levi)
    const distNote =
      feet > 3
        ? ` · ${feet} ft meter→panel` +
          (extraRun > 0 ? ` (+$${extraRun} labor/materials)` : "")
        : "";
    workBullets.push(
      `Meter ${i + 1} (${role}, ${s.label})${i > 0 ? " — additional meter rate" : ""}` +
        (m.includePanel !== false ? ` + panel` : " · no panel") +
        distNote
    );

    materialsHint.push({
      group: `Meter ${i + 1} (${s.label}) · ${feet} ft`,
      items: [
        i === 0 ? "End-line box (NYC) if first service position" : "Tap / continuation as needed",
        `Meter pan ${s.label}`,
        "Connectors / lugs",
        `Wire meter ↔ panel (${feet} ft)`,
        "Bonding",
        m.includePanel !== false ? `Panel ${s.amps}A` : null,
      ].filter(Boolean),
    });
  });

  const hasPlp = a.meters.some((m) => m.role === "plp");
  if (hasPlp) {
    const d = distCost(a.feetPlp, f.freeFeetPlp, f.perFootPlp);
    if (d > 0) {
      metersSubtotal += d;
      workBullets.push(`PLP meter → PLP equipment: ${a.feetPlp} ft (+$${d})`);
    } else {
      workBullets.push(`PLP meter → PLP equipment: ${a.feetPlp} ft (within included)`);
    }
  }

  // Main service line = path to metering / service equipment (priced by main amp)
  const mainRate = mainServicePerFoot(a.mainAmps, f);
  const ms = distCost(a.feetMainService, f.freeFeetMainService ?? 0, mainRate);
  if (Number(a.feetMainService) > 0) {
    metersSubtotal += ms;
    workBullets.push(
      `Main service line to metering equipment: ${a.feetMainService} ft × $${mainRate}/ft` +
        (ms > 0 ? ` = $${ms}` : "") +
        ` (${a.mainAmps}A main)`
    );
  }

  // End-line box → metering (NYC) — only if entered
  const el = distCost(a.feetEndLineBox, f.freeFeetEndLine ?? 0, f.perFootEndLine);
  if (Number(a.feetEndLineBox) > 0) {
    metersSubtotal += el;
    workBullets.push(
      `Service end-line box → metering equipment: ${a.feetEndLineBox} ft` +
        (el > 0 ? ` (+$${el})` : "")
    );
  }

  // Grounding run only when over free included length (always-included covers standard ground)
  const gd = distCost(a.feetGround, f.freeFeetGround, f.perFootGround);
  if (gd > 0) {
    metersSubtotal += gd;
    workBullets.push(`Extra grounding run from metering equipment: ${a.feetGround} ft (+$${gd})`);
  }

  if (a.includeAlways !== false) {
    metersSubtotal += f.alwaysIncluded;
    included.push("Service outlet", "Grounding system", "Service light");
    workBullets.push("Always included: service outlet, grounding system, service light");
    materialsHint.push({
      group: "Always included",
      items: ["Service outlet", "Grounding system", "Service light"],
    });
  }

  // Combined Service Upgrade description (main line)
  const includedTxt = included.length ? included.join("; ") : "See scope below";
  const notInc = ["Filing permit (if not selected)", "Removal of existing equipment (if not selected)"];
  if (!a.includeConduit) notInc.push("Conduit / overhead pipe to street");
  const desc = [
    `Service upgrade — main ${a.mainAmps}A ${a.mainPhase === 3 ? "3-phase" : "1-phase"}, ${a.meters.length} meter(s).`,
    "",
    "SCOPE:",
    ...workBullets.map((b) => `• ${b}`),
    "",
    `INCLUDED: ${includedTxt}.`,
    `NOT INCLUDED (unless separate line below): ${notInc.join("; ")}.`,
    a.notes ? `\nNotes: ${a.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  push(ITEM_SERVICE_UPGRADE, desc, metersSubtotal);

  if (a.includeRemoval) {
    push(
      ITEM_REMOVAL,
      "Removal and disposal of existing metering / service equipment (separate line).",
      f.removalDisposal
    );
  }

  if (a.includeConduit) {
    if (a.conduitPath === "overhead") {
      const feet = Number(a.overheadFeet) || f.overheadDefaultFeet;
      const extra = Math.max(0, feet - f.overheadDefaultFeet) * f.overheadPerFootExtra;
      push(
        ITEM_CONDUIT,
        `Overhead service pipe / riser (~${feet} ft; base covers typical 10–15 ft).`,
        f.overheadBase + extra
      );
    } else {
      const feet = Number(a.conduitFeet) || 0;
      const inch = a.conduitInch === 4 ? 4 : 2;
      push(
        ITEM_CONDUIT,
        `Underground conduit to street — ${inch}" — ${feet} ft.`,
        money(feet * f.conduitPerFoot)
      );
    }
  }

  if (a.includeFiling) {
    push(
      ITEM_FILING,
      "Filing electrical permit with the city (separate fee).",
      f.filing
    );
  }

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

export function filterEnabledEstimateLines(built, enabled) {
  const lines = Array.isArray(built?.lines) ? built.lines : [];
  const flags = Array.isArray(enabled) ? enabled : [];
  const kept = lines.filter((_, i) => flags[i] !== false);
  const total = money(kept.reduce((s, ln) => s + (parseAmount(ln.amount) || 0), 0));
  return {
    ...built,
    lines: kept,
    total,
  };
}

export function coerceMetersForMainPhase(meters, mainPhase) {
  const phase = Number(mainPhase) === 3 ? 3 : 1;
  return (meters || []).map((m) => {
    const s = sizeById(m.sizeId);
    if (phase === 1 && s.phase === 3) {
      const id = s.amps === 200 ? "200-1" : "100-1";
      return { ...m, sizeId: id };
    }
    return m;
  });
}

export function emptyMeter(mainPhase = 1) {
  return {
    role: "residential",
    sizeId: Number(mainPhase) === 3 ? "100-3" : "100-1",
    includePanel: true,
    feetToPanel: 1,
  };
}

/** Compact chip for collapsed accordion row, e.g. "100A 1φ · Residential". */
export function meterSummaryLine(meter) {
  const m = meter || {};
  const s = sizeById(m.sizeId);
  const role =
    m.role === "plp" ? "PLP" : m.role === "commercial" ? "Commercial" : "Residential";
  const phase = s.phase === 3 ? "3φ" : "1φ";
  const feet = m.feetToPanel != null ? Number(m.feetToPanel) : 1;
  return `${s.amps}A ${phase} · ${role} · ${feet} ft`;
}

/** Suggested sell $ for one meter row (meter + optional panel + extra feet). */
export function meterSuggestedAmount(meter, answers, index = 0) {
  const a = answers || defaultAnswers();
  const f = feesFor(a);
  const m = meter || emptyMeter();
  const s = sizeById(m.sizeId);
  let total = meterFeeForIndex(s.id, index, f);
  let panelIdx = 0;
  // Count panels before this index
  for (let i = 0; i < index; i++) {
    const prev = a.meters?.[i];
    if (prev && prev.includePanel !== false) panelIdx += 1;
  }
  if (m.includePanel !== false) {
    total += panelFeeForIndex(s.amps, panelIdx, f);
  }
  const feet = feetForMeter(m, a, f);
  total += distCost(feet, f.freeFeetMeterPanel, f.perFootMeterPanel);
  return money(total);
}
