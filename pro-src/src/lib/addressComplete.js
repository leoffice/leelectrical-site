// Local + remote address completion helpers.

// Every address field builds a seed index from all jobs + calendar events. That
// scan (and its regex over event descriptions) is identical for every field, so
// we memoize on the (jobs, events) references — one build per data snapshot,
// shared across the billing + service-address inputs. Since polls now keep the
// same array reference when nothing changed, this stays warm while you type.
let _seedCache = { jobs: null, events: null, out: null };

// Cap per-description scanning so a pathological (very long) event note can never
// stall the main thread on a global regex — the address parser only needs the head.
const DESC_SCAN_CAP = 600;

export function collectAddressSeeds(jobs = [], events = []) {
  if (_seedCache.jobs === jobs && _seedCache.events === events && _seedCache.out) {
    return _seedCache.out;
  }
  const out = _buildAddressSeeds(jobs, events);
  _seedCache = { jobs, events, out };
  return out;
}

function _buildAddressSeeds(jobs = [], events = []) {
  const out = [];
  const seen = new Set();
  const add = (v) => {
    const s = String(v || "").trim();
    if (!s) return;
    const key = s.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };

  for (const j of jobs || []) {
    add(j.serviceAddress);
    add(j.address);
    add(j.billingAddress);
    if (j.apartment && (j.serviceAddress || j.address)) {
      add(`${j.serviceAddress || j.address}, Apt ${j.apartment}`);
    }
  }
  for (const e of events || []) {
    add(e.location);
    const desc = String(e.description || "").slice(0, DESC_SCAN_CAP);
    const re =
      /\b(\d{1,6}\s+(?:[NSEW]\.?\s+)?[A-Za-z0-9][\w\s.'-]{1,50}?\s*(?:St\.?|Street|Ave\.?|Avenue|Rd\.?|Road|Blvd\.?|Boulevard|Dr\.?|Drive|Ln\.?|Lane|Ct\.?|Court|Pl\.?|Place|Way|Pkwy)(?:\s*,?\s*[A-Za-z][\w\s-]{0,40})?(?:\s*,?\s*[A-Z]{2})?(?:\s+\d{5}(?:-\d{4})?)?)/gi;
    let m;
    while ((m = re.exec(desc))) add(m[1].trim());
  }
  return out;
}

export function filterLocalAddressSuggestions(seeds, query, limit = 8) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const list = seeds || [];
  const scored = [];
  for (const addr of list) {
    const hay = addr.toLowerCase();
    if (!hay.includes(q)) continue;
    let score = 0;
    if (hay.startsWith(q)) score += 4;
    if (hay.split(",")[0].trim().startsWith(q)) score += 2;
    score += Math.max(0, 20 - hay.length / 4);
    scored.push({ value: addr, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.value.localeCompare(b.value))
    .slice(0, limit)
    .map((s) => s.value);
}