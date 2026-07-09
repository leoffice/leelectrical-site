// Zelle screenshot reconciliation — pure logic (testable without vision API).
import { parseAmount } from "./format.js";

const STREET_RE =
  /\d+\s+[\w\s.'-]+(?:\bst\b|\bstreet\b|\bave\b|\bavenue\b|\brd\b|\broad\b|\bblvd\b|\bboulevard\b|\bln\b|\blane\b|\bdr\b|\bdrive\b|\bct\b|\bcourt\b|\bpl\b|\bplace\b)[^,;]*/i;

/** Normalize address text for fuzzy comparison. */
export function normalizeAddress(raw) {
  const abbrevs = {
    street: "st",
    avenue: "ave",
    road: "rd",
    boulevard: "blvd",
    drive: "dr",
    lane: "ln",
    court: "ct",
    place: "pl",
  };
  let s = String(raw || "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [full, short] of Object.entries(abbrevs)) {
    s = s.replace(new RegExp("\\b" + full + "\\b", "g"), short);
  }
  return s;
}

/** Score 0–1 how well two addresses match. */
export function addressSimilarity(a, b) {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const ta = new Set(na.split(" ").filter((w) => w.length > 1));
  const tb = new Set(nb.split(" ").filter((w) => w.length > 1));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

/** Pull invoice # from Zelle memo (e.g. "#251841", "inv 251841"). */
export function parseInvoiceFromMemo(memo) {
  const s = String(memo || "");
  const tagged = s.match(/#\s*(\d{5,6})\b/);
  if (tagged) return tagged[1];
  const invWord = s.match(/\binv(?:oice)?\s*#?\s*(\d{5,6})\b/i);
  if (invWord) return invWord[1];
  const lone = s.match(/\b(\d{6})\b/);
  return lone ? lone[1] : null;
}

/** Pull a street address fragment from memo text. */
export function parseAddressFromMemo(memo) {
  const m = String(memo || "").match(STREET_RE);
  return m ? m[0].trim() : null;
}

export function findJobByInvoice(jobs, invoiceNo) {
  if (!invoiceNo) return null;
  const no = String(invoiceNo).replace(/^#/, "");
  return (
    (jobs || []).find(
      (j) => j && !j._archived && !j._deleted && String(j.invoiceNo || "") === no
    ) || null
  );
}

/** Best job whose service address matches memo address. */
export function findJobByServiceAddress(jobs, address) {
  if (!address) return null;
  let best = null;
  let bestScore = 0;
  for (const j of jobs || []) {
    if (!j || j._archived || j._deleted) continue;
    const addr = j.serviceAddress || j.address || "";
    const score = addressSimilarity(addr, address);
    if (score > bestScore) {
      bestScore = score;
      best = j;
    }
  }
  return bestScore >= 0.45 ? best : null;
}

function amountsMatch(a, b) {
  const na = parseAmount(a);
  const nb = parseAmount(b);
  if (na <= 0 || nb <= 0) return false;
  return Math.abs(na - nb) <= 0.01;
}

function hasConfirmation(extracted) {
  const c = String(extracted?.confirmationNumber || "").trim();
  return c.length >= 4;
}

/**
 * Reconcile vision-extracted Zelle fields vs what Levi entered.
 * @returns {{ status: 'full_match'|'discrepancy'|'unreadable', kind?: string, extracted, entered, targetJob?: object, fields?: object }}
 */
export function reconcileZellePayment({ extracted, entered, job, jobs }) {
  const ex = extracted || {};
  const en = entered || {};
  const memoInv = parseInvoiceFromMemo(ex.memo);
  const memoAddr = parseAddressFromMemo(ex.memo);
  const appliedInv = String(en.invoiceNo || job?.invoiceNo || "");
  const appliedAmt = parseAmount(en.amount);
  const extractedAmt = parseAmount(ex.amount);

  const fields = {
    amount: { extracted: extractedAmt, entered: appliedAmt },
    confirmation: { extracted: ex.confirmationNumber || "", entered: en.ref || "" },
    date: { extracted: ex.date || "", entered: en.date || "" },
    memo: { extracted: ex.memo || "", entered: "" },
    invoice: { extracted: memoInv || "", entered: appliedInv },
    address: {
      extracted: memoAddr || "",
      entered: job?.serviceAddress || job?.address || "",
    },
  };

  if (!hasConfirmation(ex) && (ex.confidence === "low" || extractedAmt <= 0)) {
    return { status: "unreadable", kind: "unreadable", extracted: ex, entered: en, fields };
  }

  const amountOk = extractedAmt > 0 && amountsMatch(extractedAmt, appliedAmt);
  const invoiceTarget = memoInv ? findJobByInvoice(jobs, memoInv) : null;
  const invoiceOk =
    !memoInv || memoInv === appliedInv || (invoiceTarget && String(invoiceTarget.id) === String(job?.id));

  let addressTarget = null;
  if (memoAddr) {
    addressTarget = findJobByServiceAddress(jobs, memoAddr);
    const curAddr = job?.serviceAddress || job?.address || "";
    const addrMatchesCurrent = addressSimilarity(curAddr, memoAddr) >= 0.45;
    if (!addrMatchesCurrent && addressTarget && String(addressTarget.id) !== String(job?.id)) {
      if (amountOk && invoiceOk) {
        return {
          status: "discrepancy",
          kind: "address_mismatch",
          extracted: ex,
          entered: en,
          targetJob: addressTarget,
          fields,
        };
      }
    }
  }

  if (!amountOk && extractedAmt > 0) {
    return {
      status: "discrepancy",
      kind: "amount_mismatch",
      extracted: ex,
      entered: en,
      targetJob: invoiceTarget,
      fields,
    };
  }

  if (!invoiceOk && memoInv) {
    return {
      status: "discrepancy",
      kind: "invoice_mismatch",
      extracted: ex,
      entered: en,
      targetJob: invoiceTarget,
      fields,
    };
  }

  if (memoAddr && addressTarget && String(addressTarget.id) !== String(job?.id)) {
    const curAddr = job?.serviceAddress || job?.address || "";
    if (addressSimilarity(curAddr, memoAddr) < 0.45) {
      return {
        status: "discrepancy",
        kind: "address_mismatch",
        extracted: ex,
        entered: en,
        targetJob: addressTarget,
        fields,
      };
    }
  }

  if (!hasConfirmation(ex)) {
    return { status: "unreadable", kind: "unreadable", extracted: ex, entered: en, fields };
  }

  return {
    status: "full_match",
    extracted: ex,
    entered: en,
    confirmationRef: String(ex.confirmationNumber).trim(),
    fields,
  };
}

/** Build payment entry after reconciliation confirm. */
export function buildZellePaymentEntry({
  amount,
  ref,
  date,
  method = "Zelle",
  proofName,
  zelleVerified,
  noteExtra,
}) {
  const bits = [];
  if (ref) bits.push("Zelle ref " + ref);
  if (proofName) bits.push("proof: " + proofName);
  if (noteExtra) bits.push(noteExtra);
  return {
    amount,
    method,
    ref: ref || "",
    date,
    note: bits.length ? bits.join(" · ") : undefined,
    zelleVerified: Boolean(zelleVerified),
    zelleProofName: proofName || "",
  };
}