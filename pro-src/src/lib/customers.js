// Customer identity — grouping keys + near-duplicate detection for the
// "Same customer?" combine prompt (bugs #1/#2).
//
//   normalizeCustomer("  Meir  Kabakov. ") -> "meir kabakov"
//   clientKey(job)  -> "g:<clientGroup>" | "c:<normalized name>" | "j:<id>"
//   namesNearDuplicate("Arthur koptiv","Arthur Koptive") -> true
//   findMergeSuggestion(jobs) -> first non-dismissed near-duplicate pair
//   dismissPair / isDismissed -> permanent "Not the same" memory
//     (localStorage lepro_nomerge, key = sorted normalized pair)

export function normalizeCustomer(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\s.,;:!?]+$/, "");
}

/** Grouping key: explicit clientGroup first, then the normalized customer
 *  name (so "Meir Kabakov" and "meir kabakov " share a row), and only
 *  jobs with no customer at all stand alone. */
export function clientKey(job) {
  if (job.clientGroup) return "g:" + job.clientGroup;
  const n = normalizeCustomer(job.customer);
  return n ? "c:" + n : "j:" + job.id;
}

/** Plain Levenshtein distance (small strings — names). */
export function levenshtein(a, b) {
  a = String(a);
  b = String(b);
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** Near-identical customer names: case-insensitive Levenshtein <= 2 on
 *  strings longer than 4 chars, or one contains the other with a
 *  >= 5-char overlap. Identical names are NOT a "pair" (same key already). */
export function namesNearDuplicate(a, b) {
  const x = normalizeCustomer(a);
  const y = normalizeCustomer(b);
  if (!x || !y || x === y) return false;
  if (x.length > 4 && y.length > 4 && levenshtein(x, y) <= 2) return true;
  const short = x.length <= y.length ? x : y;
  const long = x.length <= y.length ? y : x;
  return short.length >= 5 && long.includes(short);
}

/** Stable id for a name pair — order-independent. */
export function pairId(a, b) {
  return [normalizeCustomer(a), normalizeCustomer(b)].sort().join("|");
}

const NOMERGE_KEY = "lepro_nomerge";

export function loadDismissed() {
  try {
    const v = JSON.parse(localStorage.getItem(NOMERGE_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function isDismissed(a, b) {
  return loadDismissed().includes(pairId(a, b));
}

export function dismissPair(a, b) {
  const list = loadDismissed();
  const id = pairId(a, b);
  if (!list.includes(id)) {
    list.push(id);
    try {
      localStorage.setItem(NOMERGE_KEY, JSON.stringify(list));
    } catch {}
  }
}

/** First (deterministic) pair of distinct client keys whose names look like
 *  the same customer and that Levi hasn't already said "Not the same" to.
 *  Returns { id, a:{name,jobs}, b:{name,jobs} } or null. */
export function findMergeSuggestion(jobs) {
  const map = new Map();
  for (const j of jobs || []) {
    if (!j || j._archived || j._deleted) continue;
    const k = clientKey(j);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(j);
  }
  const entries = [...map.entries()];
  for (let i = 0; i < entries.length; i++) {
    const na = entries[i][1][0].customer;
    for (let k = i + 1; k < entries.length; k++) {
      const nb = entries[k][1][0].customer;
      if (!namesNearDuplicate(na, nb)) continue;
      if (isDismissed(na, nb)) continue;
      return {
        id: pairId(na, nb),
        a: { name: na, jobs: entries[i][1] },
        b: { name: nb, jobs: entries[k][1] },
      };
    }
  }
  return null;
}
