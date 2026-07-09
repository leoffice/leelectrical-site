/** Rank QBO customer index rows by business name, person name, phone, or email. */

export function digitsOnly(s) {
  return String(s || "").replace(/\D/g, "");
}

function tokens(q) {
  return String(q || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function scoreText(hay, toks) {
  const n = String(hay || "").toLowerCase();
  if (!n) return 0;
  let s = 0;
  for (const t of toks) {
    if (!n.includes(t)) return 0;
    s += n.startsWith(t) ? 3 : 2;
  }
  return s;
}

function scorePhone(phone, query) {
  const qd = digitsOnly(query);
  const pd = digitsOnly(phone);
  if (!qd || qd.length < 3 || !pd) return 0;
  if (pd.includes(qd)) return qd.length >= 7 ? 8 : 5;
  if (qd.includes(pd) && pd.length >= 7) return 6;
  return 0;
}

function scoreEmail(email, query) {
  const e = String(email || "").trim().toLowerCase();
  const q = String(query || "").trim().toLowerCase();
  if (!e || !q || q.length < 2) return 0;
  if (e === q) return 9;
  if (e.includes(q)) return q.includes("@") ? 8 : 6;
  const local = e.split("@")[0];
  if (local && local.includes(q)) return 5;
  return 0;
}

/** Score one customer row against a free-text query. */
export function scoreCustomer(customer, query) {
  const q = String(query || "").trim();
  if (!q || !customer) return 0;
  const toks = tokens(q);
  const fields = [
    customer.businessName,
    customer.personName,
    customer.name,
    customer.billingAddress,
  ];
  let best = 0;
  for (const f of fields) best = Math.max(best, scoreText(f, toks));
  best = Math.max(best, scorePhone(customer.phone, q));
  best = Math.max(best, scoreEmail(customer.email, q));
  return best;
}

/** Top N customer matches for a query. */
export function searchCustomerIndex(customers, query, limit = 12) {
  const q = String(query || "").trim();
  if (!q) return [];
  const scored = [];
  for (const c of customers || []) {
    const s = scoreCustomer(c, q);
    if (s) scored.push({ ...c, _s: s });
  }
  scored.sort(
    (a, b) =>
      b._s - a._s ||
      String(a.name || "").length - String(b.name || "").length
  );
  return scored.slice(0, limit).map(({ _s, ...c }) => c);
}