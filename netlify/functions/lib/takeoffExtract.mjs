// Takeoff vector-text heuristic — the dependency-free "first cut" the takeoff
// endpoint falls back to when no external PyMuPDF/OpenCV processor is wired
// (TAKEOFF_PROCESSOR_URL). It counts electrical device *tags* in the PDF text
// layer and returns a document shaped like the skill's worker-output.schema.json.
//
// This is deliberately conservative and honest: it finds text-labelled devices
// (WP, GFI, S3, panel/device schedules), NOT symbol geometry — that needs the
// OpenCV template-match path in the Python service. Every count it produces is
// labelled `confidence: "inferred"`. The SAME logic is mirrored in the Python
// service so results stay comparable across engines.
//
// Kept as a pure function over an array of text tokens so it is unit-testable
// without any PDF parser. Whatever extracts the text layer (unpdf in the Worker,
// PyMuPDF in the service) just hands us `words`.

// Curated electrical device tags. Prefixes/whole tokens we treat as devices
// when they appear as standalone tokens on a drawing. Kept small + specific so
// we do not count every stray uppercase word.
const KNOWN_TAGS = new Set([
  "WP", "GFI", "GFCI", "EM", "EX", "EX.", "J", "JB", "TV", "DATA", "TEL", "PH",
  "WAP", "AP", "CAM", "SPKR", "SPK", "SD", "CO", "TSTAT", "THERM", "FA", "FACP",
  "HB", "HH", "PB", "DISC", "XFMR", "PNL", "MTR", "FLR", "OCC", "PC",
]);

// Switch/receptacle/light patterns: a letter or two + optional numeric subscript
// (S, S3, S4, R, R1, F, L, LT, DS). Matches the classic plan-symbol callouts.
const TAG_PATTERN = /^(S|R|F|L|LT|DS|D|C|H|G|W|E)[0-9]{0,2}$/;

// Tokens that look tag-ish but are almost always something else on a drawing.
const STOPWORDS = new Set([
  "A", "AN", "AS", "AT", "BY", "IN", "OF", "ON", "OR", "TO", "N", "S", "E", "W",
  "NO", "NTS", "TYP", "PLAN", "SCALE", "NORTH", "DWG", "REV", "SHEET", "DETAIL",
  "GENERAL", "NOTES", "ELECTRICAL", "LEGEND", "SYMBOL", "TYPE", "ROOM", "AREA",
]);

function normToken(t) {
  return String(t == null ? "" : t).trim().toUpperCase();
}

/** Is this token a device tag we count? Returns the canonical class or null. */
export function classifyTag(rawToken) {
  const t = normToken(rawToken).replace(/[.,;:]+$/, "");
  if (!t || t.length > 5) return null;
  if (STOPWORDS.has(t)) return null;
  if (KNOWN_TAGS.has(t)) return t;
  if (TAG_PATTERN.test(t)) return t;
  return null;
}

/**
 * @param {Array<string|{text:string,page?:number}>} words  extracted tokens
 * @param {object} opts  { source_sha256, sheet_ids, symbolClasses, engine }
 * @returns worker-output document
 */
export function extractFromWords(words, opts = {}) {
  const only = new Set((opts.symbolClasses || []).map(normToken));
  const counts = {};
  const candidates = [];
  const list = Array.isArray(words) ? words : [];

  for (const w of list) {
    const text = typeof w === "string" ? w : w && w.text;
    const cls = classifyTag(text);
    if (!cls) continue;
    if (only.size && !only.has(cls)) continue;
    counts[cls] = (counts[cls] || 0) + 1;
    candidates.push({
      sheet_id: (typeof w === "object" && w.page) || 1,
      symbol_class: cls,
      template_id: null,
      native_center: typeof w === "object" && w.bbox ? [w.bbox[0], w.bbox[1]] : null,
      render_center: null,
      method: "vector",
      score: 0.5,
      angle: 0,
      mirror: false,
      nearest_text: typeof w === "object" ? w.text || cls : cls,
      crop_path: null,
      status: "candidate",
      confidence: "inferred",
    });
  }

  const classes = Object.keys(counts);
  const notes = classes.length
    ? "Text-tag counts from the drawing's vector text layer. Inferred — no symbol-geometry matching (OpenCV) was run; verify against the plans."
    : "No electrical device tags were found in the text layer. The drawing may be raster/scanned or use non-standard tags — route it to the PyMuPDF+OpenCV processor.";

  return {
    engine: opts.engine || "js-heuristic-v0",
    worker_id: opts.worker_id || "takeoff-endpoint",
    assignment: {
      source_sha256: opts.source_sha256 || "",
      sheet_ids: opts.sheet_ids || [1],
    },
    candidates,
    summary: {
      counts,
      anomalies: classes.length ? [] : ["no-tags-found"],
      notes,
    },
  };
}
