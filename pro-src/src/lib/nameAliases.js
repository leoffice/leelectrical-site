// First-name nicknames so "Yosef Sternberg" finds "Yossi Sternberg" (Levi 2026-09-01).
const NAME_ALIASES = {
  yosef: ["yossi", "yosi", "joseph", "joe", "josef"],
  yossi: ["yosef", "yosi", "joseph", "joe", "josef"],
  yosi: ["yossi", "yosef", "joseph", "joe"],
  joseph: ["yosef", "yossi", "joe", "josef", "joey"],
  josef: ["yosef", "yossi", "joseph", "joe"],
  joe: ["joseph", "yosef", "yossi", "josef", "joey"],
  joey: ["joe", "joseph"],
  alexander: ["alex", "sasha"],
  alex: ["alexander", "sasha"],
  benjamin: ["ben", "benny", "benji"],
  ben: ["benjamin", "benny"],
  michael: ["mike", "mickey", "michal"],
  mike: ["michael"],
  william: ["will", "bill", "billy"],
  will: ["william", "bill"],
  bill: ["william", "will", "billy"],
  robert: ["rob", "bob", "bobby"],
  rob: ["robert", "bob"],
  bob: ["robert", "rob", "bobby"],
  richard: ["rick", "rich", "dick"],
  jonathan: ["jon", "johnny", "yonatan", "yonathan"],
  jon: ["jonathan", "johnny"],
  yonatan: ["jonathan", "yonathan", "joni"],
  joshua: ["josh"],
  josh: ["joshua"],
  matthew: ["matt"],
  matt: ["matthew"],
  nicholas: ["nick", "nicky"],
  nick: ["nicholas"],
  david: ["dave", "dovid"],
  dave: ["david"],
  dovid: ["david", "dov"],
  jacob: ["jake", "yaakov", "yanky", "yanki"],
  jake: ["jacob"],
  yaakov: ["jacob", "yanky", "yanki", "yankel"],
  yanky: ["yaakov", "yanki", "jacob"],
  yanki: ["yaakov", "yanky", "jacob"],
  moses: ["moshe", "moishy", "moish"],
  moshe: ["moses", "moishy", "moish"],
  moishy: ["moshe", "moses", "moish"],
  abraham: ["avraham", "abe", "avi"],
  avraham: ["abraham", "avi", "avrohom"],
  avrohom: ["avraham", "abraham"],
  isaac: ["yitzchak", "yitzchok", "itzik", "ike"],
  yitzchak: ["isaac", "yitzchok", "itzik"],
  yitzchok: ["isaac", "yitzchak", "itzik"],
  itzik: ["isaac", "yitzchak", "yitzchok"],
  samuel: ["sam", "shmuel"],
  sam: ["samuel", "shmuel"],
  shmuel: ["samuel", "sam"],
  solomon: ["shlomo", "sol"],
  shlomo: ["solomon", "sol"],
  ephraim: ["efi", "effy"],
  menachem: ["mendy", "mendie"],
  mendy: ["menachem"],
  yehuda: ["judah", "yudi", "yudy"],
  yudi: ["yehuda", "judah"],
  chaim: ["haim", "hy"],
  haim: ["chaim"],
  esther: ["ester"],
  ester: ["esther"],
};

/** All interchangeable tokens for one name piece (includes itself). */
export function expandNameToken(tok) {
  const t = String(tok || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9']/g, "");
  if (!t) return [];
  const extras = NAME_ALIASES[t] || [];
  return [t, ...extras];
}

/** True when needle token matches hay token directly or via nickname. */
export function tokensMatch(needle, hay) {
  const nSet = new Set(expandNameToken(needle));
  const hSet = new Set(expandNameToken(hay));
  for (const n of nSet) {
    if (hSet.has(n)) return true;
  }
  return false;
}

/**
 * Multi-word name query vs a customer display string.
 * "Yosef Sternberg" matches "Yossi Sternberg"; single token "Sternberg" still works.
 */
export function nameQueryMatches(customerName, query) {
  const cust = String(customerName || "")
    .toLowerCase()
    .trim();
  const q = String(query || "")
    .toLowerCase()
    .trim();
  if (!cust || !q) return false;
  if (cust.includes(q) || q.includes(cust)) return true;
  const qToks = q.split(/[^a-z0-9']+/).filter((t) => t.length >= 2);
  const cToks = cust.split(/[^a-z0-9']+/).filter((t) => t.length >= 2);
  if (!qToks.length || !cToks.length) return false;
  // Every query token must hit some customer token (direct or alias).
  return qToks.every((qt) => cToks.some((ct) => tokensMatch(qt, ct) || ct.includes(qt) || qt.includes(ct)));
}
