// Local + remote address completion helpers.

export function collectAddressSeeds(jobs = [], events = []) {
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
    const desc = String(e.description || "");
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