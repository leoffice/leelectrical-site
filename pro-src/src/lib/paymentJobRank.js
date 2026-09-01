// Rank open (and name-searched) jobs for the payment-notice picker.
import { parseAmount } from "./format.js";
import { nameQueryMatches } from "./nameAliases.js";

/** Whole-token match — "electric" must not hit "electrical". */
export function wordIn(blob, tok) {
  if (!tok || !blob) return false;
  const t = String(tok).toLowerCase();
  const b = String(blob).toLowerCase();
  if (b === t) return true;
  const re = new RegExp(`(?:^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`);
  return re.test(b);
}

/** Score open invoices for "Where does it go?" shortlist (Levi 2026-08-03). */
export function scoreJobForPayment(job, { amount, memo, fromName, query } = {}) {
  if (!job) return -1;
  const open = parseAmount(job.openBalance);
  const paid = job.paid === true || (job.status?.Paid && job.status.Paid.s === "done");
  const inv = String(job.invoiceNo || "").trim();
  const invDigits = inv.replace(/^LE-/i, "");
  const custL = String(job.customer || job.customerName || "")
    .toLowerCase()
    .trim();
  const q = String(query || "").toLowerCase().trim();
  const nameHit = Boolean(q && nameQueryMatches(custL, q));
  const fromHitName = Boolean(
    fromName && nameQueryMatches(custL, String(fromName || "").trim())
  );

  // Name search (typed query or strong payer match): include paid / no-invoice
  // rows so Yosef→Yossi Sternberg still appears when there is no open balance
  // on the board yet (Levi 2026-09-01).
  if (paid && open <= 0.01 && !nameHit && !fromHitName) return -1;
  if (!inv && open <= 0 && !nameHit && !fromHitName) return -1;

  let score = 0;
  const payAmt = parseAmount(amount);
  if (payAmt > 0 && open > 0) {
    if (Math.abs(open - payAmt) < 0.02) score += 100;
    else if (Math.abs(open - payAmt) <= 1) score += 60;
    else if (payAmt <= open + 0.02) score += 25;
  }
  const blob = [
    job.customer,
    job.customerName,
    job.serviceAddress,
    job.address,
    job.billingAddress,
    inv,
    job.memo,
    job.title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const memoL = String(memo || "").toLowerCase();
  const fromL = String(fromName || "").toLowerCase();
  if (memoL) {
    for (const tok of memoL.split(/[^a-z0-9]+/).filter((t) => t.length >= 3)) {
      if (wordIn(blob, tok)) score += 20;
    }
  }
  let fromHits = 0;
  const fromToks = fromL
    ? fromL.split(/[^a-z0-9]+/).filter((t) => t.length >= 3)
    : [];
  if (fromL) {
    for (const tok of fromToks) {
      if (wordIn(blob, tok) || blob.includes(tok)) {
        score += 12;
        fromHits += 1;
      }
      if (custL && (custL.includes(tok) || tok.includes(custL.split(/\s+/)[0] || ""))) {
        score += 80;
        fromHits += 1;
      }
    }
    const firstFrom = fromToks[0] || "";
    if (firstFrom && custL.startsWith(firstFrom)) {
      score += 40;
      fromHits += 1;
    }
    if (fromHitName) {
      score += 100;
      fromHits += 1;
    }
    if (fromToks.length && fromHits === 0) score -= 120;
  }
  if (q) {
    if (blob.includes(q)) score += 50;
    if (nameHit) score += 120;
    else if (custL && (custL.includes(q) || q.split(/\s+/).every((t) => t.length < 2 || custL.includes(t)))) {
      score += 90;
    }
    const qNorm = q.replace(/^#/, "").replace(/^le-/, "le-");
    if (inv && (inv.toLowerCase() === qNorm || inv.toLowerCase() === `le-${qNorm.replace(/^le-/, "")}`)) {
      score += 80;
    }
    if (invDigits && (qNorm === invDigits || qNorm === `le-${invDigits}` || q === invDigits)) {
      score += 80;
    }
    for (const tok of q.split(/[^a-z0-9.$]+/).filter((t) => t.length >= 2)) {
      if (blob.includes(tok) || wordIn(blob, tok)) score += 15;
      if (custL && (custL.includes(tok) || wordIn(custL, tok))) score += 40;
      const n = parseAmount(tok);
      if (
        n > 0 &&
        (Math.abs(open - n) < 0.02 ||
          String(inv) === tok.replace(/^#/, "") ||
          invDigits === tok.replace(/^#/, "") ||
          invDigits === String(Math.round(n)))
      ) {
        score += 40;
      }
    }
  }
  if (open > 0) score += 5;
  // Prefer real invoices when name search also surfaces paid shells.
  if (!inv && open <= 0) score -= 10;
  return score;
}

export function rankJobsForPayment(jobs, opts, limit = 12) {
  return (jobs || [])
    .map((j) => ({ job: j, score: scoreJobForPayment(j, opts) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || parseAmount(a.job.openBalance) - parseAmount(b.job.openBalance))
    .slice(0, limit);
}
