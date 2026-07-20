// Takeoff model — pure, framework-free helpers shared by the Takeoff view,
// the exporters, the correction-diff feedback, and the unit tests.
//
// The processing endpoint (server) returns a document shaped like the skill's
// templates/worker-output.schema.json:
//   { engine, worker_id, assignment:{source_sha256, sheet_ids},
//     candidates:[{ sheet_id, symbol_class, method, score, status, confidence,
//                   nearest_text, ... }],
//     summary:{ counts:{ <class>: n }, anomalies:[], notes } }
//
// We normalise ONE takeoff into a flat, editable line-item list keyed by
// symbol class (one row per class, qty = detected count), enriched with the
// representative candidate's method/confidence. The user edits quantities and
// adds manual rows; on submit we (a) feed the quantities into the requisition
// SOV and (b) diff the human-final list against the original skill output so a
// calibration store can learn per-symbol correction factors later.

/** Confidence ranking, best → worst (matches the skill's labels). */
export const CONFIDENCE_ORDER = ["direct", "supported", "inferred", "unconfirmed"];

/** A stable id for a takeoff line. Manual rows get a `man-` prefix. */
function lineId(symbolClass, manual) {
  const slug = String(symbolClass || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
  return `${manual ? "man" : "tk"}-${slug}`;
}

/** Human label for a symbol class, e.g. "WP" → "WP". Kept verbatim; the
 *  description carries any longer wording the legend supplied. */
function classLabel(symbolClass) {
  return String(symbolClass || "").trim();
}

/**
 * Fold the candidate rows for one class into a single representative record:
 * the count, the best-available confidence, the dominant detection method, and
 * a sample nearest-text anchor / description.
 */
function foldClass(symbolClass, count, candidates) {
  const rows = candidates.filter((c) => c && c.symbol_class === symbolClass);
  let bestConf = "unconfirmed";
  let method = "vector";
  let nearest = "";
  const methodTally = {};
  for (const c of rows) {
    const conf = CONFIDENCE_ORDER.includes(c.confidence) ? c.confidence : "unconfirmed";
    if (CONFIDENCE_ORDER.indexOf(conf) < CONFIDENCE_ORDER.indexOf(bestConf)) bestConf = conf;
    if (c.method) methodTally[c.method] = (methodTally[c.method] || 0) + 1;
    if (!nearest && c.nearest_text) nearest = String(c.nearest_text);
  }
  const dominant = Object.entries(methodTally).sort((a, b) => b[1] - a[1])[0];
  if (dominant) method = dominant[0];
  return {
    id: lineId(symbolClass, false),
    symbol: classLabel(symbolClass),
    symbolClass,
    description: nearest || classLabel(symbolClass),
    qty: Number(count) || 0,
    unit: "EA",
    unitPrice: 0,
    method,
    confidence: bestConf,
    manual: false,
  };
}

/**
 * Normalise a worker-output document (or an array of them, one per file) into
 * a single editable takeoff. Counts for the same class across files are summed.
 */
export function normalizeWorkerOutput(output) {
  const docs = Array.isArray(output) ? output : [output];
  const counts = {}; // class -> total count
  const allCandidates = [];
  const anomalies = [];
  const notesParts = [];
  const engines = new Set();
  let sheetCount = 0;

  for (const doc of docs) {
    if (!doc || typeof doc !== "object") continue;
    if (doc.engine) engines.add(String(doc.engine));
    const summary = doc.summary || {};
    const c = summary.counts || {};
    for (const [cls, n] of Object.entries(c)) {
      counts[cls] = (counts[cls] || 0) + (Number(n) || 0);
    }
    if (Array.isArray(doc.candidates)) allCandidates.push(...doc.candidates);
    if (Array.isArray(summary.anomalies)) anomalies.push(...summary.anomalies);
    if (summary.notes) notesParts.push(String(summary.notes));
    const ids = doc.assignment && Array.isArray(doc.assignment.sheet_ids) ? doc.assignment.sheet_ids : [];
    sheetCount += ids.length;
  }

  const items = Object.keys(counts)
    .sort()
    .map((cls) => foldClass(cls, counts[cls], allCandidates));

  return {
    items,
    engine: Array.from(engines).join(", ") || "unknown",
    notes: notesParts.join(" • "),
    anomalies,
    sheetCount,
    candidateCount: allCandidates.length,
  };
}

/** A fresh, blank manual row for the "+ Add item" affordance. */
export function blankManualItem(seq = 0) {
  return {
    id: `man-new-${seq}`,
    symbol: "",
    symbolClass: "",
    description: "",
    qty: 1,
    unit: "EA",
    unitPrice: 0,
    method: "manual",
    confidence: "direct",
    manual: true,
  };
}

/** Total detected/entered pieces across every line. */
export function totalQty(items) {
  return (items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
}

/** Extended dollar value of a line (qty × unit price). */
export function lineValue(it) {
  return (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
}

/** Grand total value of the sheet. */
export function totalValue(items) {
  return (items || []).reduce((s, it) => s + lineValue(it), 0);
}

/**
 * Map the finalised takeoff lines to requisition/invoice SOV line items
 * (`{ id, section, description, value, contractPct, completedPct }`). Quantity
 * and unit ride in the description so they survive in the SOV; `value` is the
 * extended price (0 until a price book maps symbols → rates, at which point
 * these lines arrive pre-priced). Zero-qty rows are dropped.
 */
export function takeoffItemsToSovItems(items, opts = {}) {
  const prefix = opts.idPrefix || "tk";
  return (items || [])
    .filter((it) => (Number(it.qty) || 0) > 0)
    .map((it, i) => {
      const sym = it.symbol ? `${it.symbol} — ` : "";
      const qty = Number(it.qty) || 0;
      const unit = it.unit || "EA";
      const desc = `${sym}${it.description || it.symbolClass || "Item"} (${qty} ${unit})`;
      return {
        id: `${prefix}-${i + 1}`,
        section: opts.section || "Takeoff",
        description: desc,
        value: Math.round(lineValue(it) * 100) / 100,
        contractPct: 100,
        completedPct: 0,
      };
    });
}

/**
 * Diff the human-finalised lines against the skill's original output. This is
 * the calibration signal: per class, how far off the machine count was, plus
 * rows the human added or zeroed out. Kept plain-data so it can be POSTed to
 * the feedback store verbatim.
 */
export function correctionDiff(skillItems, humanItems) {
  const byClass = (arr) => {
    const m = new Map();
    for (const it of arr || []) {
      const key = it.symbolClass || it.symbol || it.description || it.id;
      m.set(key, it);
    }
    return m;
  };
  const skillMap = byClass(skillItems);
  const humanMap = byClass(humanItems);
  const keys = new Set([...skillMap.keys(), ...humanMap.keys()]);
  const perClass = [];
  for (const key of keys) {
    const s = skillMap.get(key);
    const h = humanMap.get(key);
    const skillQty = s ? Number(s.qty) || 0 : 0;
    const humanQty = h ? Number(h.qty) || 0 : 0;
    const delta = humanQty - skillQty;
    // correctionFactor: multiply a future machine count by this to approach the
    // human answer. Undefined when the machine found nothing (nothing to scale).
    const correctionFactor = skillQty > 0 ? Math.round((humanQty / skillQty) * 1000) / 1000 : null;
    perClass.push({
      symbolClass: key,
      symbol: (h && h.symbol) || (s && s.symbol) || key,
      skillQty,
      humanQty,
      delta,
      correctionFactor,
      addedByHuman: !s && !!h,
      removedByHuman: !!s && humanQty === 0 && skillQty > 0,
      manual: !!(h && h.manual),
    });
  }
  perClass.sort((a, b) => String(a.symbolClass).localeCompare(String(b.symbolClass)));
  const changed = perClass.filter((p) => p.delta !== 0 || p.addedByHuman || p.removedByHuman);
  return {
    perClass,
    changedCount: changed.length,
    totalSkillQty: totalQty(skillItems),
    totalHumanQty: totalQty(humanItems),
  };
}
