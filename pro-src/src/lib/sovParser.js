// Parse Schedule of Values (SOV) CSV exports — Baez Place / Joy Construction format.

function parseMoney(raw) {
  const s = String(raw || "").replace(/[$,\s]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function parsePct(raw) {
  const s = String(raw || "").replace(/%/g, "").trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Split a CSV line respecting quoted fields. */
export function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      q = !q;
      continue;
    }
    if (c === "," && !q) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function pickCols(cols) {
  const a = (cols[0] || "").trim();
  const b = (cols[1] || "").trim();
  const c = (cols[2] || "").trim();
  const d = (cols[3] || "").trim();
  return { a, b, c, d };
}

/**
 * Parse SOV CSV text into structured items.
 * Returns { name, contractSum, items: [{ id, section, description, value, contractPct, completedPct }] }
 */
export function parseSovCsv(text, opts = {}) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let name = opts.name || "Project";
  let contractSum = 0;
  let section = "";
  const items = [];
  let headerSeen = false;

  for (const line of lines) {
    const cols = splitCsvLine(line);
    const { a, b, c, d } = pickCols(cols);

    if (!headerSeen) {
      if (/schedule|description/i.test(a + b) && /value|percentage/i.test(c + d)) {
        headerSeen = true;
        continue;
      }
      const money = parseMoney(c || b || a);
      if (money > 100000 && /sov|bae|dorkin|place/i.test(line)) {
        contractSum = money;
        const m = line.match(/([^,]+SOV[^,]*|[^,]+Baez[^,]*|[^,]+Dorkin[^,]*)/i);
        if (m) name = m[1].replace(/"/g, "").trim();
        continue;
      }
      if (money > 100000) contractSum = money;
      continue;
    }

    const value = parseMoney(c);
    const pct = parsePct(d);
    const descB = b;
    const descA = a;

    if (value > 0 && (descB || descA)) {
      const description = descB || descA;
      items.push({
        id: `item-${items.length + 1}`,
        section,
        description,
        value,
        contractPct: pct,
        completedPct: 0,
      });
      continue;
    }

    const sectionName = descA || descB;
    if (sectionName && !value) {
      section = sectionName;
    }
  }

  if (!contractSum && items.length) {
    contractSum = items.reduce((s, it) => s + it.value, 0);
  }

  return { name, contractSum, items };
}