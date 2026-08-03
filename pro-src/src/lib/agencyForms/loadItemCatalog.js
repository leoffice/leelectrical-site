/**
 * Con Ed Additional Load — standard load-item catalog for LE Pro.
 *
 * Matches Energy Services "Residential Electric Load Information" shapes:
 *  - totalKw  — Lighting / common lighting: total kW (+ optional phase counts)
 *  - qtyKw    — devices: quantity × kW each + Single/Three phase
 *  - kw / hp  — AC / motors: quantity × kW or HP each + phase
 *
 * Levi common items (2026-08-03): lighting, computers, electric stoves,
 * kitchen appliances, freezers, EV unit, EV charger, motors.
 */

export const HP_TO_KW = 0.746;

/** Stable catalog keys (storage + learning). */
export const LOAD_CATALOG = Object.freeze([
  {
    id: "lighting",
    name: "Lighting",
    entryMode: "totalKw",
    phase: "Single",
    defaults: { totalKw: 2, singlePhaseCount: 1, threePhaseCount: 0 },
    hint: "Total kW for all lighting + how many single vs three-phase",
  },
  {
    id: "common_lighting",
    name: "Common-area Lighting",
    entryMode: "totalKw",
    phase: "Single",
    defaults: { totalKw: 2, singlePhaseCount: 1, threePhaseCount: 0 },
    hint: "PLP / hallway lighting — total kW",
  },
  {
    id: "computers",
    name: "General Computers",
    entryMode: "qtyKw",
    phase: "Single",
    defaults: { qty: 2, kwEach: 0.5 },
    hint: "Units × kW each",
  },
  {
    id: "electric_stoves",
    name: "Electric Stoves",
    entryMode: "qtyKw",
    phase: "Single",
    defaults: { qty: 2, kwEach: 3 },
    hint: "Units × kW each",
  },
  {
    id: "kitchen_appliances",
    name: "Kitchen Appliances",
    entryMode: "qtyKw",
    phase: "Single",
    defaults: { qty: 6, kwEach: 1 },
    hint: "Units × kW each (ranges, dishwashers, etc.)",
  },
  {
    id: "freezers",
    name: "Freezers",
    entryMode: "qtyKw",
    phase: "Single",
    defaults: { qty: 1, kwEach: 1 },
    hint: "Units × kW each",
  },
  {
    id: "ev_unit",
    name: "EV Unit",
    entryMode: "qtyKw",
    phase: "Single",
    defaults: { qty: 1, kwEach: 7.2 },
    hint: "EV equipment unit — units × kW each",
  },
  {
    id: "ev_charger",
    name: "EV Charger",
    entryMode: "qtyKw",
    phase: "Single",
    defaults: { qty: 1, kwEach: 7.2 },
    hint: "EVSE charger — units × kW each",
  },
  {
    id: "motors",
    name: "Motors",
    entryMode: "hp",
    unit: "hp",
    phase: "Single",
    defaults: { qty: 1, hpEach: 1, kwEach: "" },
    hint: "Motors — units × HP or kW each (toggle)",
  },
  {
    id: "space_cooling",
    name: "Space Cooling / Central AC (cooling-only)",
    entryMode: "kw",
    unit: "kw",
    phase: "Single",
    defaults: { qty: 2, kwEach: 2, hpEach: "" },
    hint: "AC — units × kW or HP each (toggle)",
  },
  {
    id: "custom",
    name: "Other / custom",
    entryMode: "qtyKw",
    phase: "Single",
    defaults: { qty: 1, kwEach: 1 },
    hint: "Type the equipment name yourself",
    custom: true,
  },
]);

const BY_ID = Object.fromEntries(LOAD_CATALOG.map((c) => [c.id, c]));

export function getLoadCatalogItem(id) {
  return BY_ID[String(id || "")] || null;
}

export function isLightingItem(name = "") {
  return /light/i.test(String(name || ""));
}

export function isAcItem(name = "") {
  return /cool|a\/?c\b|air.?cond|space.?cool|central.?ac/i.test(String(name || ""));
}

export function isMotorItem(name = "") {
  return /\bmotors?\b/i.test(String(name || ""));
}

export function isEvItem(name = "") {
  return /\bev\b|electric vehicle|charger|evse/i.test(String(name || ""));
}

/** Resolve entry mode from row or catalog name. */
export function resolveLoadEntryMode(it = {}) {
  if (it.entryMode) return it.entryMode;
  if (isLightingItem(it.name)) return "totalKw";
  if (isAcItem(it.name) || isMotorItem(it.name)) {
    return it.unit === "hp" ? "hp" : "kw";
  }
  return "qtyKw";
}

/** Match free-text name to catalog id when possible. */
export function matchCatalogId(name = "") {
  const s = String(name || "").trim().toLowerCase();
  if (!s) return "";
  if (/common.?area.?light|common light/i.test(s)) return "common_lighting";
  if (/light/i.test(s)) return "lighting";
  if (/computer/i.test(s)) return "computers";
  if (/stove|range/i.test(s)) return "electric_stoves";
  if (/kitchen/i.test(s)) return "kitchen_appliances";
  if (/freezer|fridge|refrigerat/i.test(s)) return "freezers";
  if (/ev\s*charger|charging station|evse/i.test(s)) return "ev_charger";
  if (/\bev\b|electric vehicle/i.test(s)) return "ev_unit";
  if (/\bmotors?\b/i.test(s)) return "motors";
  if (isAcItem(s)) return "space_cooling";
  return "";
}

/**
 * Build a blank/default load row from catalog id (or custom name).
 * @param {string} catalogId
 * @param {{ name?: string, learned?: object }} [opts]
 */
export function makeLoadItemFromCatalog(catalogId, opts = {}) {
  const cat = getLoadCatalogItem(catalogId) || getLoadCatalogItem("custom");
  const learned = opts.learned && typeof opts.learned === "object" ? opts.learned : {};
  const name =
    opts.name != null && String(opts.name).trim()
      ? String(opts.name).trim()
      : cat.custom
        ? ""
        : cat.name;
  const entryMode = learned.entryMode || cat.entryMode;
  const phase = learned.phase || cat.phase || "Single";
  const row = {
    catalogId: cat.id,
    name,
    entryMode,
    phase,
    qty: learned.qty ?? cat.defaults.qty ?? "",
    kwEach: learned.kwEach ?? cat.defaults.kwEach ?? "",
    hpEach: learned.hpEach ?? cat.defaults.hpEach ?? "",
    totalKw: learned.totalKw ?? cat.defaults.totalKw ?? "",
    singlePhaseCount:
      learned.singlePhaseCount ?? cat.defaults.singlePhaseCount ?? (phase === "Single" ? 1 : 0),
    threePhaseCount:
      learned.threePhaseCount ?? cat.defaults.threePhaseCount ?? (phase === "Three" ? 1 : 0),
    unit: learned.unit || cat.unit || (entryMode === "hp" ? "hp" : entryMode === "kw" ? "kw" : undefined),
  };
  return row;
}

/** Default seed set for a typical 2-family (portal-friendly). */
export function defaultLoadItemsFromCatalog() {
  return [
    makeLoadItemFromCatalog("kitchen_appliances"),
    makeLoadItemFromCatalog("lighting"),
    makeLoadItemFromCatalog("electric_stoves"),
    makeLoadItemFromCatalog("space_cooling"),
    makeLoadItemFromCatalog("common_lighting"),
  ];
}

/** kW contribution of one load row. */
export function loadItemKw(it = {}) {
  const mode = resolveLoadEntryMode(it);
  let kw = 0;
  if (mode === "totalKw") {
    const t = it.totalKw != null && it.totalKw !== "" ? it.totalKw : it.kwEach;
    kw = Number(t) || 0;
  } else {
    const qty = Number(it.qty) || 0;
    if (mode === "hp" || it.unit === "hp") {
      kw = qty * (Number(it.hpEach) || 0) * HP_TO_KW;
    } else {
      kw = qty * (Number(it.kwEach) || 0);
    }
  }
  if (!kw && it.lineKw != null && it.lineKw !== "") {
    return Number(it.lineKw) || 0;
  }
  return kw;
}

export function sumLoadKw(items = []) {
  return (items || []).reduce((acc, it) => acc + loadItemKw(it), 0);
}

/**
 * Normalize a row after name/unit edits (keeps entryMode in sync).
 */
export function normalizeLoadRow(row = {}) {
  const r = { ...row };
  if (!r.catalogId) r.catalogId = matchCatalogId(r.name) || "custom";
  if (r.catalogId && r.catalogId !== "custom" && !String(r.name || "").trim()) {
    const cat = getLoadCatalogItem(r.catalogId);
    if (cat) r.name = cat.name;
  }
  const mode = resolveLoadEntryMode(r);
  r.entryMode = mode;
  if (mode === "hp") r.unit = "hp";
  else if (mode === "kw") r.unit = "kw";
  if (!r.phase) r.phase = "Single";
  // Lighting: derive phase counts if only phase set
  if (mode === "totalKw") {
    if (r.singlePhaseCount == null && r.threePhaseCount == null) {
      r.singlePhaseCount = /three/i.test(r.phase) ? 0 : 1;
      r.threePhaseCount = /three/i.test(r.phase) ? 1 : 0;
    }
  }
  return r;
}

/** Payload-ready load rows for host create-case fill. */
export function buildLoadItemsPayload(items = []) {
  return (items || []).map((it) => {
    const row = normalizeLoadRow(it);
    const name = String(row.name || "").trim();
    const entryMode = resolveLoadEntryMode(row);
    const phase = String(row.phase || "Single");
    const kwLine = loadItemKw(row);
    if (entryMode === "totalKw") {
      return {
        name,
        catalogId: row.catalogId || matchCatalogId(name) || "",
        entryMode: "totalKw",
        qty: 1,
        kwEach: kwLine,
        totalKw: kwLine,
        phase,
        singlePhaseCount: Number(row.singlePhaseCount) || 0,
        threePhaseCount: Number(row.threePhaseCount) || 0,
        lineKw: kwLine,
      };
    }
    if (entryMode === "hp") {
      return {
        name,
        catalogId: row.catalogId || matchCatalogId(name) || "",
        entryMode: "hp",
        unit: "hp",
        qty: Number(row.qty) || 0,
        hpEach: Number(row.hpEach) || 0,
        kwEach:
          Math.round((kwLine * 1000) / Math.max(1, Number(row.qty) || 0)) / 1000,
        phase,
        lineKw: Math.round(kwLine * 1000) / 1000,
      };
    }
    return {
      name,
      catalogId: row.catalogId || matchCatalogId(name) || "",
      entryMode: entryMode === "kw" ? "kw" : "qtyKw",
      unit: entryMode === "kw" ? "kw" : undefined,
      qty: Number(row.qty) || 0,
      kwEach: Number(row.kwEach) || 0,
      phase,
      lineKw: kwLine,
    };
  });
}
