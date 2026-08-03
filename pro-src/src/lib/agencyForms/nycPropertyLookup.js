/**
 * Public NYC property lookup (BIN + owner of record).
 * Sources: NYC Open Data MapPLUTO + Building Footprints (no API key).
 * Used by Con Ed "Submit a Case" so Levi never has to dig up the BIN.
 */

const PLUTO = "https://data.cityofnewyork.us/resource/64uk-42ks.json";
const FOOTPRINTS = "https://data.cityofnewyork.us/resource/5zhs-2jue.json";

/**
 * Normalize a freeform NYC address for PLUTO match.
 * @param {string} addr
 * @returns {{ house: string, street: string, boroughHint: string }}
 */
export function parseNycAddressParts(addr = "") {
  const raw = String(addr || "").trim();
  const lower = raw.toLowerCase();
  let boroughHint = "";
  if (/brooklyn/.test(lower)) boroughHint = "BK";
  else if (/manhattan|new york\b/.test(lower) && !/brooklyn|queens|bronx|staten/.test(lower))
    boroughHint = "MN";
  else if (/queens/.test(lower)) boroughHint = "QN";
  else if (/bronx/.test(lower)) boroughHint = "BX";
  else if (/staten/.test(lower)) boroughHint = "SI";

  let cleaned = raw
    .replace(/,?\s*(brooklyn|queens|manhattan|bronx|staten island).*$/i, "")
    .replace(/,?\s*new york.*$/i, "")
    .replace(/,?\s*ny\b.*$/i, "")
    .replace(/,?\s*\d{5}(?:-\d{4})?\s*$/i, "")
    .replace(/,\s*$/, "")
    .trim();

  const m = cleaned.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
  if (!m) return { house: "", street: cleaned, boroughHint };
  // PLUTO uses full street types + full cardinals + bare ordinals
  // e.g. "E 53rd St" → "EAST 53 STREET" (not "E 53RD STREET")
  let street = m[2]
    .replace(/\bst\b\.?/gi, "STREET")
    .replace(/\bave\b\.?/gi, "AVENUE")
    .replace(/\bav\b\.?/gi, "AVENUE")
    .replace(/\brd\b\.?/gi, "ROAD")
    .replace(/\bblvd\b\.?/gi, "BOULEVARD")
    .replace(/\bpl\b\.?/gi, "PLACE")
    .replace(/\bpkwy\b\.?/gi, "PARKWAY")
    .replace(/\bdr\b\.?/gi, "DRIVE")
    // Leading / token cardinals (word-boundary so "EAST" stays put)
    .replace(/(^|\s)E\b\.?/gi, "$1EAST")
    .replace(/(^|\s)W\b\.?/gi, "$1WEST")
    .replace(/(^|\s)N\b\.?/gi, "$1NORTH")
    .replace(/(^|\s)S\b\.?/gi, "$1SOUTH")
    // 53rd / 1st / 2nd / 3rd → bare number (PLUTO: "EAST 53 STREET")
    .replace(/\b(\d+)(?:ST|ND|RD|TH)\b/gi, "$1")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  return { house: m[1], street, boroughHint };
}

/**
 * Parse PLUTO ownername "LAST, FIRST MIDDLE" → { first, last }.
 * @param {string} ownername
 */
export function parsePlutoOwnerName(ownername = "") {
  const s = String(ownername || "").trim();
  if (!s) return { first: "", last: "" };
  if (s.includes(",")) {
    const [last, rest] = s.split(",").map((x) => x.trim());
    const first = unglueGivenNames(rest || "")
      .split(/\s+/)
      .filter(Boolean)
      .map(titleCaseToken)
      .join(" ");
    return { first, last: titleCaseToken(last) };
  }
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: titleCaseToken(parts[0]), last: "" };
  return {
    first: parts.slice(0, -1).map(titleCaseToken).join(" "),
    last: titleCaseToken(parts[parts.length - 1]),
  };
}

function titleCaseToken(t = "") {
  const s = String(t || "").toLowerCase();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * PLUTO often glues first+middle ("YITZCHOKDOVID"). Split on common given-name prefixes.
 */
function unglueGivenNames(raw = "") {
  const s = String(raw || "").trim();
  if (!s || /\s/.test(s)) return s;
  const upper = s.toUpperCase();
  // Longest-first common Jewish/Hebrew given names seen on NYC deeds
  const names = [
    "YITZCHOK",
    "YISROEL",
    "SHLOMO",
    "SHOLOM",
    "SHALOM",
    "MENACHEM",
    "MOSHE",
    "MORDECHAI",
    "YEHUDA",
    "YAAKOV",
    "AVRAHAM",
    "AVROHOM",
    "YOSEF",
    "DOVID",
    "DAVID",
    "CHAIM",
    "ARYEH",
    "LEVI",
    "MEIR",
  ].sort((a, b) => b.length - a.length);
  for (const n of names) {
    if (upper.startsWith(n) && upper.length > n.length) {
      const rest = s.slice(n.length);
      return `${titleCaseToken(n)} ${unglueGivenNames(rest)}`.trim();
    }
  }
  return s;
}

/**
 * @param {string} address freeform service address
 * @param {{ fetchImpl?: typeof fetch, signal?: AbortSignal }} [opts]
 * @returns {Promise<{
 *   ok: boolean,
 *   bin?: string,
 *   bbl?: string,
 *   ownerFirst?: string,
 *   ownerLast?: string,
 *   ownerRaw?: string,
 *   address?: string,
 *   unitsRes?: number,
 *   numFloors?: number,
 *   buildingClass?: string,
 *   source?: string,
 *   error?: string
 * }>}
 */
export async function lookupNycProperty(address, opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return { ok: false, error: "fetch_unavailable" };
  }
  const { house, street, boroughHint } = parseNycAddressParts(address);
  if (!house || !street) {
    return { ok: false, error: "need_house_and_street" };
  }

  // PLUTO address is like "1349 PRESIDENT STREET"
  const plutoAddr = `${house} ${street}`.toUpperCase().replace(/\s+/g, " ");
  const whereParts = [`upper(address)='${plutoAddr.replace(/'/g, "''")}'`];
  if (boroughHint) whereParts.push(`borough='${boroughHint}'`);
  const where = whereParts.join(" AND ");
  const plutoUrl =
    `${PLUTO}?$where=${encodeURIComponent(where)}&$limit=3` +
    `&$select=${encodeURIComponent(
      "address,ownername,borough,block,lot,bbl,yearbuilt,unitsres,numfloors,bldgclass,zipcode"
    )}`;

  try {
    const pr = await fetchImpl(plutoUrl, { signal: opts.signal });
    if (!pr.ok) return { ok: false, error: `pluto_http_${pr.status}` };
    const rows = await pr.json();
    if (!Array.isArray(rows) || !rows.length) {
      // Fuzzy: house + first *significant* street token (skip EAST/WEST alone —
      // "607 E%" used to match Manhattan 607 EAST 11 before Brooklyn 607 EAST 53).
      const streetWords = String(street)
        .split(/\s+/)
        .filter(Boolean)
        .filter((w) => !/^(EAST|WEST|NORTH|SOUTH)$/i.test(w));
      const streetTok = String(streetWords[0] || street.split(" ")[0] || "").replace(
        /'/g,
        "''"
      );
      const houseEsc = String(house).replace(/'/g, "''");
      const fuzzyParts = [`upper(address) like '${houseEsc} %${streetTok}%'`];
      if (boroughHint) fuzzyParts.push(`borough='${boroughHint}'`);
      const fuzzyWhere = fuzzyParts.join(" AND ");
      const fuzzyUrl = `${PLUTO}?$where=${encodeURIComponent(fuzzyWhere)}&$limit=5`;
      const fr = await fetchImpl(fuzzyUrl, { signal: opts.signal });
      if (!fr.ok) return { ok: false, error: `pluto_http_${fr.status}` };
      const fuzzy = await fr.json();
      if (!Array.isArray(fuzzy) || !fuzzy.length) {
        return { ok: false, error: "not_found" };
      }
      // Prefer exact house number + borough match
      const upperHouse = `${house} `;
      const hit =
        fuzzy.find(
          (r) =>
            String(r.address || "").toUpperCase().startsWith(upperHouse) &&
            (!boroughHint || String(r.borough || "") === boroughHint)
        ) ||
        fuzzy.find((r) => String(r.address || "").toUpperCase().startsWith(upperHouse)) ||
        fuzzy[0];
      return await enrichWithBin(hit, fetchImpl, opts.signal);
    }
    return await enrichWithBin(rows[0], fetchImpl, opts.signal);
  } catch (e) {
    return { ok: false, error: String(e?.message || e || "lookup_failed") };
  }
}

async function enrichWithBin(plutoRow, fetchImpl, signal) {
  const bbl = String(plutoRow.bbl || "").replace(/\.0+$/, "").split(".")[0];
  let bin = "";
  if (bbl) {
    try {
      const binUrl = `${FOOTPRINTS}?base_bbl=${encodeURIComponent(bbl)}&$select=bin&$limit=1`;
      const br = await fetchImpl(binUrl, { signal });
      if (br.ok) {
        const bins = await br.json();
        if (Array.isArray(bins) && bins[0]?.bin) bin = String(bins[0].bin);
      }
    } catch {
      // BIN optional if footprints fail — still return owner
    }
  }
  const { first, last } = parsePlutoOwnerName(plutoRow.ownername);
  return {
    ok: true,
    bin: bin || undefined,
    bbl: bbl || undefined,
    ownerFirst: first || undefined,
    ownerLast: last || undefined,
    ownerRaw: plutoRow.ownername || undefined,
    address: plutoRow.address || undefined,
    unitsRes: plutoRow.unitsres != null ? Number(plutoRow.unitsres) : undefined,
    numFloors: plutoRow.numfloors != null ? Number(plutoRow.numfloors) : undefined,
    buildingClass: plutoRow.bldgclass || undefined,
    zip: plutoRow.zipcode || undefined,
    source: "nyc_open_data_pluto_footprints",
  };
}

/**
 * Merge public lookup into create-case answers.
 * BIN always fills when empty (or force).
 * Owner fills only when both owner fields empty — customer person name wins first.
 * @param {object} answers
 * @param {object} lookup result of lookupNycProperty
 * @param {{ forceBin?: boolean, forceOwner?: boolean }} [opts]
 */
export function applyNycLookupToAnswers(answers = {}, lookup = {}, opts = {}) {
  if (!lookup?.ok) return { ...answers };
  const next = { ...answers };
  if (lookup.bin && (opts.forceBin || !String(next.bin || "").trim())) {
    next.bin = String(lookup.bin);
  }
  const ownerEmpty =
    !String(next.ownerFirst || "").trim() && !String(next.ownerLast || "").trim();
  if ((opts.forceOwner || ownerEmpty) && (lookup.ownerFirst || lookup.ownerLast)) {
    if (lookup.ownerFirst) next.ownerFirst = lookup.ownerFirst;
    if (lookup.ownerLast) next.ownerLast = lookup.ownerLast;
  }
  if (lookup.zip && !String(next.zip || "").trim()) next.zip = String(lookup.zip);
  if (lookup.unitsRes != null && Number(lookup.unitsRes) > 0) {
    next.totalUnits = Number(lookup.unitsRes);
  }
  if (lookup.numFloors != null && Number(lookup.numFloors) > 0) {
    next.numberOfFloors = Math.max(1, Math.round(Number(lookup.numFloors)));
  }
  next._nycLookup = {
    at: Date.now(),
    bin: lookup.bin,
    ownerRaw: lookup.ownerRaw,
    source: lookup.source,
  };
  return next;
}
