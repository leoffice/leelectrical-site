// Service / meter upgrade estimate generator — pure model + line builder.
// Levi 2026-08-03: itemized meters, per-meter feet (default 1 ft), tiered 2nd+ meter pricing.
// Levi 2026-08-04: white-label description process, conduit/trenching wording, filing scope,
// material-cost basis so sell prices stay above rough material+labor budget.
import { parseAmount } from "./format.js";

/**
 * Rough material cost basis (supply-house ballpark, NYC metro 2024–2026).
 * Used to keep sell fees above materials so the builder has room for labor + markup.
 * Not customer-facing — white-label safe (no brand names).
 */
export const MATERIAL_COST_BASIS = {
  /** $/ft PVC Sch 40 material only */
  conduit2MaterialPerFt: 3.5,
  conduit4MaterialPerFt: 12,
  /** $/ft feeder/service wire material (avg copper/AL mix) */
  wireMeterPanelPerFt: 8,
  wireMainServicePerFtByAmp: { 100: 12, 200: 18, 350: 28, 400: 36 },
  /** Each */
  meterPan: {
    "100-1": 180,
    "100-3": 280,
    "200-1": 260,
    "200-3": 420,
    "350-3": 900,
    "400-3": 1200,
  },
  panel: { 100: 160, 200: 280, 350: 650, 400: 850 },
  endLineBox: 220,
  serviceOutlet: 45,
  serviceLight: 85,
  groundingKit: 90,
  lugsConnectors: 75,
  /**
   * Labor-only rough for dig (excavation/backfill dirt; saw-cut concrete trench).
   * Sell rates below must clear material+labor before markup.
   */
  trenchDirtLaborPerFt: 28,
  trenchConcreteLaborPerFt: 70,
};

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
  /**
   * Underground conduit install (pipe + pull for utility connection) — NO dig.
   * ~2" material ~$3.50/ft; sell covers labor + material + markup.
   */
  conduitPerFoot: 85,
  conduitPerFootByInch: { 2: 85, 4: 120 },
  overheadBase: 1200,
  overheadPerFootExtra: 40,
  overheadDefaultFeet: 12,
  /**
   * Optional trenching (builder add-on). Dirt cover only — no cement pour / pavement seal.
   * Concrete = cut/trench through pavement or hard surface (still no re-pour).
   */
  trenchDirtPerFoot: 45,
  trenchConcretePerFoot: 95,
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
const ITEM_TRENCHING = "Service Upgrade:Trenching";

/**
 * True only when this job was created/saved via the estimate generator.
 * Levi 2026-08-04: do NOT infer from Service Upgrade line names alone —
 * "Edit with estimate generator" must not appear on ordinary jobs.
 */
export function isEstimateGeneratorJob(job) {
  if (!job) return false;
  if (job._fromEstimateGenerator === true) return true;
  if (job._estimator?.kind === "service_upgrade") return true;
  if (job._estimator?.source === "service_upgrade_generator") return true;
  return false;
}

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
    /**
     * Optional dig/trenching when underground conduit is on.
     * Dirt = earth trench + dirt cover. Concrete = through pavement/hard surface.
     * Neither includes pouring cement or sealing pavement.
     */
    includeTrenching: false,
    trenchFeetDirt: 0,
    trenchFeetConcrete: 0,
    notes: "",
    feeOverrides: {},
    ...partial,
  };
}

/** Sell $/ft for conduit by inch, with budget floor from material basis. */
export function conduitSellPerFoot(inch, fees) {
  const f = fees || DEFAULT_FEES;
  const i = Number(inch) === 4 ? 4 : 2;
  const table = f.conduitPerFootByInch || DEFAULT_FEES.conduitPerFootByInch;
  const sell = table[i] ?? f.conduitPerFoot ?? 85;
  const mat =
    i === 4
      ? MATERIAL_COST_BASIS.conduit4MaterialPerFt
      : MATERIAL_COST_BASIS.conduit2MaterialPerFt;
  // Keep at least ~3x material so labor + markup fit white-label budgets
  return Math.max(sell, Math.ceil(mat * 3));
}

/**
 * Build customer-facing scope bullets (white-label process).
 * Describes work only — no internal "$ math" or meta notes like "(separate line)".
 */
export function buildScopeBullets(answers, fees) {
  const a = {
    ...defaultAnswers(),
    ...answers,
    meters: answers?.meters?.length ? answers.meters : defaultAnswers().meters,
  };
  const f = fees || feesFor(a);
  const bullets = [];

  a.meters.forEach((m, i) => {
    const s = sizeById(m.sizeId);
    const role = roleLabel(m.role);
    const feet = feetForMeter(m, a, f);
    const parts = [
      `Install meter ${i + 1} (${role}, ${s.label})`,
      m.includePanel !== false ? "with new panel" : "without new panel",
    ];
    if (i > 0) parts.push("at additional-meter rate");
    // Only call out long meter-to-panel runs (over 3 ft) — Levi
    if (feet > 3) parts.push(`${feet} ft meter-to-panel run`);
    bullets.push(parts.join(" "));
  });

  const hasPlp = a.meters.some((m) => m.role === "plp");
  if (hasPlp) {
    bullets.push(
      `PLP meter to PLP equipment run: ${Number(a.feetPlp) || 0} ft`
    );
  }

  if (Number(a.feetMainService) > 0) {
    bullets.push(
      `Main service line to metering equipment: ${a.feetMainService} ft (${a.mainAmps}A main)`
    );
  }

  if (Number(a.feetEndLineBox) > 0) {
    bullets.push(
      `Service end-line box to metering equipment: ${a.feetEndLineBox} ft`
    );
  }

  if (distCost(a.feetGround, f.freeFeetGround, f.perFootGround) > 0) {
    bullets.push(
      `Extra grounding run from metering equipment: ${a.feetGround} ft`
    );
  }

  if (a.includeAlways !== false) {
    bullets.push("Service outlet, grounding system, and service light");
  }

  return bullets;
}

/** Customer-facing description for underground utility conduit (no dig). */
export function describeUndergroundConduit(answers, fees) {
  const a = answers || defaultAnswers();
  const feet = Number(a.conduitFeet) || 0;
  const inch = a.conduitInch === 4 ? 4 : 2;
  return [
    `Underground conduit to the street for the utility company connection to the building - ${inch}" conduit, ${feet} ft.`,
    "Price includes conduit material and installation for the utility path to the building.",
    "Price does not include the cost of digging or trenching.",
    "Price does not include pouring cement or sealing pavement.",
  ].join("\n");
}

/** Customer-facing description for optional trenching (dirt and/or concrete). */
export function describeTrenching(answers, fees) {
  const a = answers || defaultAnswers();
  const f = fees || feesFor(a);
  const dirt = Number(a.trenchFeetDirt) || 0;
  const conc = Number(a.trenchFeetConcrete) || 0;
  const lines = [
    "Trenching for underground conduit path to the street (builder option).",
  ];
  if (dirt > 0) {
    lines.push(
      `Dirt trench: ${dirt} ft at $${f.trenchDirtPerFoot ?? 45}/ft - dig and cover conduit with dirt only.`
    );
  }
  if (conc > 0) {
    lines.push(
      `Concrete / pavement trench: ${conc} ft at $${f.trenchConcretePerFoot ?? 95}/ft - cut and trench through hard surface.`
    );
  }
  lines.push(
    "Price includes covering the conduit with dirt where applicable.",
    "Price does not include pouring cement or sealing pavement."
  );
  return lines.join("\n");
}

/** Customer-facing filing line: DOB + utility paperwork + inspections. */
export function describeFiling(answers) {
  return [
    "Filing electrical permit with the DOB, filing paperwork with the utility company (Con Edison), opening a case, and inspection fees.",
    "Price includes filing fees, inspection appointments, and paperwork for the scope of work described on this estimate.",
    "Price does not include the cost of filing any additional work not described in this estimate or not part of the scope of work.",
  ].join("\n");
}

/** Customer-facing removal line (own item when selected — no meta "separate line" wording). */
export function describeRemoval() {
  return "Removal and disposal of existing metering and service equipment.";
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
 * Main work uses item "Service Upgrade"; filing, conduit, trenching & removal are own lines.
 * Description process is white-label: work-only scope, no internal $ math or meta labels.
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
  const included = [];

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
    const feet = feetForMeter(m, a, f);
    const mFee = meterFeeForIndex(s.id, i, f);
    metersSubtotal += mFee;

    const extraRun = distCost(feet, f.freeFeetMeterPanel, f.perFootMeterPanel);
    metersSubtotal += extraRun;

    if (m.includePanel !== false) {
      metersSubtotal += panelFeeForIndex(s.amps, panelCount, f);
      panelCount += 1;
    }

    // Materials takeoff hints (with rough cost basis for budget check)
    const panCost = MATERIAL_COST_BASIS.meterPan[s.id] ?? 200;
    const panelCost = MATERIAL_COST_BASIS.panel[s.amps] ?? 200;
    materialsHint.push({
      group: `Meter ${i + 1} (${s.label}) · ${feet} ft`,
      items: [
        i === 0 ? "End-line box (NYC) if first service position" : "Tap / continuation as needed",
        `Meter pan ${s.label}`,
        "Connectors / lugs",
        `Wire meter to panel (${feet} ft)`,
        "Bonding",
        m.includePanel !== false ? `Panel ${s.amps}A` : null,
      ].filter(Boolean),
      costBasis: {
        meterPan: panCost,
        panel: m.includePanel !== false ? panelCost : 0,
        wireFt: feet * MATERIAL_COST_BASIS.wireMeterPanelPerFt,
      },
    });
  });

  const hasPlp = a.meters.some((m) => m.role === "plp");
  if (hasPlp) {
    metersSubtotal += distCost(a.feetPlp, f.freeFeetPlp, f.perFootPlp);
  }

  // Main service line = path to metering / service equipment (priced by main amp)
  const mainRate = mainServicePerFoot(a.mainAmps, f);
  metersSubtotal += distCost(a.feetMainService, f.freeFeetMainService ?? 0, mainRate);

  // End-line box to metering (NYC) — only if entered
  metersSubtotal += distCost(a.feetEndLineBox, f.freeFeetEndLine ?? 0, f.perFootEndLine);

  // Grounding run only when over free included length
  metersSubtotal += distCost(a.feetGround, f.freeFeetGround, f.perFootGround);

  if (a.includeAlways !== false) {
    metersSubtotal += f.alwaysIncluded;
    included.push("Service outlet", "Grounding system", "Service light");
    materialsHint.push({
      group: "Always included",
      items: ["Service outlet", "Grounding system", "Service light"],
      costBasis: {
        outlet: MATERIAL_COST_BASIS.serviceOutlet,
        light: MATERIAL_COST_BASIS.serviceLight,
        ground: MATERIAL_COST_BASIS.groundingKit,
      },
    });
  }

  const workBullets = buildScopeBullets(a, f);

  // NOT INCLUDED only lists options that were NOT turned on (no "if not selected" lies)
  const includedTxt = included.length ? included.join("; ") : "See scope below";
  const notInc = [];
  if (!a.includeFiling) notInc.push("Filing permit and utility case paperwork");
  if (!a.includeRemoval) notInc.push("Removal of existing equipment");
  if (!a.includeConduit) notInc.push("Conduit / overhead pipe to street");
  if (!a.includeTrenching) notInc.push("Digging and trenching");
  // When conduit is on but trenching off, still call out dig not included on main scope
  if (a.includeConduit && a.conduitPath !== "overhead" && !a.includeTrenching) {
    if (!notInc.includes("Digging and trenching")) notInc.push("Digging and trenching");
  }

  const desc = [
    `Service upgrade - main ${a.mainAmps}A ${a.mainPhase === 3 ? "3-phase" : "1-phase"}, ${a.meters.length} meter(s).`,
    "",
    "SCOPE:",
    ...workBullets.map((b) => `- ${b}`),
    "",
    `INCLUDED: ${includedTxt}.`,
    notInc.length ? `NOT INCLUDED: ${notInc.join("; ")}.` : "",
    a.notes ? `\nNotes: ${a.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // ASCII only in customer-facing text — PDF fonts map arrows/×/bullets to "?"
  push(ITEM_SERVICE_UPGRADE, desc, metersSubtotal);

  if (a.includeRemoval) {
    push(ITEM_REMOVAL, describeRemoval(), f.removalDisposal);
  }

  if (a.includeConduit) {
    if (a.conduitPath === "overhead") {
      const feet = Number(a.overheadFeet) || f.overheadDefaultFeet;
      const extra = Math.max(0, feet - f.overheadDefaultFeet) * f.overheadPerFootExtra;
      push(
        ITEM_CONDUIT,
        [
          `Overhead service pipe / riser (~${feet} ft; base covers typical 10-15 ft).`,
          "Price includes pipe material and installation for the overhead utility path.",
        ].join("\n"),
        f.overheadBase + extra
      );
    } else {
      const feet = Number(a.conduitFeet) || 0;
      const inch = a.conduitInch === 4 ? 4 : 2;
      const rate = conduitSellPerFoot(inch, f);
      push(ITEM_CONDUIT, describeUndergroundConduit(a, f), money(feet * rate));
      materialsHint.push({
        group: `Underground conduit ${inch}"`,
        items: [`Underground conduit ${inch}" (${feet} ft)`, "Couplings / hubs for utility path"],
        costBasis: {
          materialPerFt:
            inch === 4
              ? MATERIAL_COST_BASIS.conduit4MaterialPerFt
              : MATERIAL_COST_BASIS.conduit2MaterialPerFt,
          feet,
          sellPerFt: rate,
        },
      });
    }
  }

  // Optional trenching — only when feet entered (dirt and/or concrete)
  const dirtFt = Number(a.trenchFeetDirt) || 0;
  const concFt = Number(a.trenchFeetConcrete) || 0;
  if (a.includeTrenching && (dirtFt > 0 || concFt > 0)) {
    const trenchAmt = money(
      dirtFt * (f.trenchDirtPerFoot ?? 45) + concFt * (f.trenchConcretePerFoot ?? 95)
    );
    push(ITEM_TRENCHING, describeTrenching(a, f), trenchAmt);
    materialsHint.push({
      group: "Trenching",
      items: [
        dirtFt > 0 ? `Dirt trench ${dirtFt} ft` : null,
        concFt > 0 ? `Concrete / pavement trench ${concFt} ft` : null,
      ].filter(Boolean),
      costBasis: {
        dirtLabor: dirtFt * MATERIAL_COST_BASIS.trenchDirtLaborPerFt,
        concreteLabor: concFt * MATERIAL_COST_BASIS.trenchConcreteLaborPerFt,
      },
    });
  }

  if (a.includeFiling) {
    push(ITEM_FILING, describeFiling(a), f.filing);
  }

  const meterSummary = a.meters
    .map((m) => {
      const s = sizeById(m.sizeId);
      return `${m.role} ${s.label}`;
    })
    .join("; ");
  const title =
    `Service upgrade - ${a.meters.length} meter(s): ${meterSummary}. Main ${a.mainAmps}A ${a.mainPhase === 3 ? "3-phase" : "1-phase"}.` +
    (a.notes ? `\n\n${a.notes}` : "");

  const total = money(lines.reduce((s, ln) => s + parseAmount(ln.amount), 0));

  // Budget check: sell total should clear rough material basis (white-label price builder)
  const materialBudget = estimateMaterialBudget(a, materialsHint);

  return {
    lines,
    total,
    title,
    materialsHint,
    materialBudget,
    errors,
    answers: a,
  };
}

/** Sum rough material/labor floor from takeoff cost basis (not customer-facing). */
export function estimateMaterialBudget(answers, materialsHint = []) {
  let materials = 0;
  for (const g of materialsHint) {
    const c = g.costBasis || {};
    for (const v of Object.values(c)) {
      if (typeof v === "number" && Number.isFinite(v)) materials += v;
    }
  }
  return money(materials);
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
