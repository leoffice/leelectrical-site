/**
 * Work-description polish learning — Levi edits a polish → save pair → prefer next time.
 * Device bag: localStorage. Durable: ov._workDescriptionPolishLearning (adapter).
 */

const LS_KEY = "le_pro_work_description_polish_learning_v1";
const MAX_ENTRIES = 100;
const MIN_SCORE = 0.52;

/** In-memory fallback when localStorage is missing (Node/tests) or blocked. */
let memoryLearning = [];

function storageAvailable() {
  try {
    return typeof localStorage !== "undefined" && !!localStorage;
  } catch {
    return false;
  }
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/** Jaccard similarity on word tokens (0–1). */
export function polishLearningSimilarity(a, b) {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}

/**
 * @param {{ raw: string, polished?: string, edited: string, ts?: number, jobId?: string, styleKey?: string }} entry
 */
export function normalizePolishLearningEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const raw = String(entry.raw || "").trim();
  const edited = String(entry.edited || "").trim();
  if (!raw || !edited) return null;
  if (raw === edited) return null;
  return {
    raw,
    polished: String(entry.polished || "").trim(),
    edited,
    ts: Number(entry.ts) || Date.now(),
    jobId: entry.jobId ? String(entry.jobId) : "",
    styleKey: entry.styleKey ? String(entry.styleKey) : "",
  };
}

export function loadPolishLearning() {
  if (storageAvailable()) {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return memoryLearning.slice();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return memoryLearning.slice();
      memoryLearning = parsed
        .map(normalizePolishLearningEntry)
        .filter(Boolean)
        .slice(-MAX_ENTRIES);
      return memoryLearning.slice();
    } catch {
      return memoryLearning.slice();
    }
  }
  return memoryLearning.slice();
}

function persistLocal(list) {
  memoryLearning = list.slice(-MAX_ENTRIES);
  if (storageAvailable()) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(memoryLearning));
    } catch {
      /* quota / private mode — memory still holds */
    }
  }
  return memoryLearning.slice();
}

/** Append one training pair to the local bag. */
export function appendPolishLearningLocal(entry) {
  const norm = normalizePolishLearningEntry(entry);
  if (!norm) return loadPolishLearning();
  const cur = loadPolishLearning();
  // Replace near-duplicate raw (keep newest edit).
  const next = cur.filter((e) => polishLearningSimilarity(e.raw, norm.raw) < 0.92);
  next.push(norm);
  return persistLocal(next);
}

/**
 * Best learned pair for this rough text, or null.
 * @param {string} raw
 * @param {object[]} [entries]
 * @param {number} [minScore]
 */
export function findBestLearnedPair(raw, entries, minScore = MIN_SCORE) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const list = Array.isArray(entries) ? entries : loadPolishLearning();
  let best = null;
  let bestScore = 0;
  for (const e of list) {
    if (!e || !e.edited) continue;
    const score = polishLearningSimilarity(text, e.raw);
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  if (!best || bestScore < minScore) return null;
  return { ...best, score: bestScore };
}

/**
 * Prefer a prior Levi edit when the rough notes match closely.
 * @returns {string|null}
 */
export function preferLearnedPolish(raw, styleKey = "professional", entries) {
  const hit = findBestLearnedPair(raw, entries);
  if (!hit) return null;
  if (hit.styleKey && styleKey && hit.styleKey !== styleKey) {
    // Allow professional ↔ invoice cross-use (same SOW voice).
    const soft = new Set(["professional", "invoice"]);
    if (!(soft.has(hit.styleKey) && soft.has(styleKey))) return null;
  }
  return String(hit.edited).trim() || null;
}

/**
 * Save train pair locally and optionally sync via adapter method.
 * @param {object} entry
 * @param {{ appendRemote?: (e: object) => Promise<unknown>, handoffPath?: string }} [opts]
 */
export async function savePolishLearningEntry(entry, opts = {}) {
  const list = appendPolishLearningLocal(entry);
  const norm = normalizePolishLearningEntry(entry);
  if (!norm) return { ok: false, local: list };

  if (typeof opts.appendRemote === "function") {
    try {
      await opts.appendRemote(norm);
    } catch {
      /* local still saved */
    }
  }

  // Durable JSON under handoff when a path is provided (Node / agent tooling).
  if (opts.handoffPath && typeof process !== "undefined") {
    try {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const dir = path.dirname(opts.handoffPath);
      fs.mkdirSync(dir, { recursive: true });
      let remote = [];
      if (fs.existsSync(opts.handoffPath)) {
        try {
          remote = JSON.parse(fs.readFileSync(opts.handoffPath, "utf8"));
        } catch {
          remote = [];
        }
      }
      if (!Array.isArray(remote)) remote = [];
      remote.push(norm);
      fs.writeFileSync(opts.handoffPath, JSON.stringify(remote.slice(-MAX_ENTRIES), null, 2));
    } catch {
      /* optional */
    }
  }

  return { ok: true, local: list, entry: norm };
}

/** Test helper — wipe memory + localStorage bag. */
export function clearPolishLearningForTests() {
  memoryLearning = [];
  if (storageAvailable()) {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
  }
}
