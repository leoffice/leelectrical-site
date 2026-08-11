// Invoice / estimate discount on the document total ($ or %).
// Keep free of qboDoc imports (qboDoc imports this module).
import { parseAmount } from "./format.js";

/** @typedef {'amount' | 'percent'} DiscountType */

/**
 * Normalize stored job discount fields into a working shape.
 * @param {object} [job]
 * @returns {{ type: DiscountType, value: number }}
 */
export function discountInputFromJob(job) {
  const type = job?.discountType === "percent" ? "percent" : "amount";
  if (type === "percent") {
    const pct =
      job?.discountPercent != null && job.discountPercent !== ""
        ? parseAmount(job.discountPercent)
        : parseAmount(job?.discountValue);
    return { type: "percent", value: pct > 0 ? pct : 0 };
  }
  const dollars = parseAmount(job?.discount ?? job?.discountValue ?? 0);
  return { type: "amount", value: dollars > 0 ? dollars : 0 };
}

/** Sum line amounts without importing qboDoc (avoids circular deps). */
function roughLinesSubtotal(lines) {
  if (!Array.isArray(lines) || !lines.length) return 0;
  let sum = 0;
  for (const ln of lines) {
    const hasQty = ln?.qty != null && ln.qty !== "";
    const q = hasQty ? parseAmount(ln.qty) : 1;
    const p = parseAmount(ln?.unitPrice) || parseAmount(ln?.rate) || 0;
    if (p) sum += Math.round((q || 0) * p * 100) / 100;
    else sum += parseAmount(ln?.amount) || 0;
  }
  return Math.round(sum * 100) / 100;
}

/**
 * Pre-discount face total for $ discounts and builder preview.
 * Prefer live line math; fall back to stored amount + any already-applied
 * discount (so a re-edit of inv #231596 with amount $36,500 + discount $5,000
 * still sees $41,500 face). Mobile list-projection jobs often have empty lines.
 * @param {object} [job]
 * @param {number|Array} [linesOrSubtotal] line rows or a precomputed subtotal
 */
export function docFaceTotal(job, linesOrSubtotal) {
  let linesSub = 0;
  if (typeof linesOrSubtotal === "number") {
    linesSub = Math.max(0, Number(linesOrSubtotal) || 0);
  } else if (Array.isArray(linesOrSubtotal)) {
    linesSub = roughLinesSubtotal(linesOrSubtotal);
  } else if (Array.isArray(job?.invoiceLines) && job.invoiceLines.length) {
    linesSub = roughLinesSubtotal(job.invoiceLines);
  } else if (Array.isArray(job?.estimateLines) && job.estimateLines.length) {
    linesSub = roughLinesSubtotal(job.estimateLines);
  }
  const storedDisc = parseAmount(job?.discount) || 0;
  const amountFace = (parseAmount(job?.amount) || 0) + (storedDisc > 0 ? storedDisc : 0);
  return Math.max(
    linesSub,
    amountFace,
    parseAmount(job?.paymentBaseline) || 0,
    parseAmount(job?.amountWhenBaselined) || 0
  );
}

/**
 * Resolve discount dollars from subtotal + type/value.
 * Caps at subtotal; never negative.
 * @param {number} subtotal
 * @param {{ type?: DiscountType, value?: number|string, discountType?: DiscountType, discountValue?: number|string, discountPercent?: number|string, discount?: number|string }} opts
 */
export function resolveDiscountAmount(subtotal, opts = {}) {
  const sub = Math.max(0, Number(subtotal) || 0);
  const type =
    opts.type === "percent" || opts.discountType === "percent" ? "percent" : "amount";
  let dollars = 0;
  if (type === "percent") {
    const pct = parseAmount(
      opts.value != null
        ? opts.value
        : opts.discountPercent != null
          ? opts.discountPercent
          : opts.discountValue
    );
    if (pct > 0) dollars = Math.round(sub * (pct / 100) * 100) / 100;
  } else {
    dollars = parseAmount(
      opts.value != null
        ? opts.value
        : opts.discount != null
          ? opts.discount
          : opts.discountValue
    );
  }
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.min(sub, Math.round(dollars * 100) / 100);
}

/** Final doc total after discount (tax not applied here — matches current pipeline). */
export function docTotalAfterDiscount(subtotal, opts = {}) {
  const sub = Math.max(0, Number(subtotal) || 0);
  const disc = resolveDiscountAmount(sub, opts);
  return Math.max(0, Math.round((sub - disc) * 100) / 100);
}

/**
 * Fields to persist on the job when saving a doc.
 * @param {number} subtotal
 * @param {{ type: DiscountType, value: number|string }} input
 */
export function discountJobPatch(subtotal, input) {
  const type = input?.type === "percent" ? "percent" : "amount";
  const raw = parseAmount(input?.value);
  const dollars = resolveDiscountAmount(subtotal, { type, value: raw });
  if (dollars <= 0) {
    return {
      discount: 0,
      discountType: "amount",
      discountPercent: 0,
      discountValue: 0,
    };
  }
  if (type === "percent") {
    return {
      discount: dollars,
      discountType: "percent",
      discountPercent: raw,
      discountValue: raw,
    };
  }
  return {
    discount: dollars,
    discountType: "amount",
    discountPercent: 0,
    discountValue: dollars,
  };
}

/**
 * Payload fragment for create/update invoice/estimate commands.
 * @param {object} job
 * @param {number} [subtotal]
 */
export function discountCommandFields(job, subtotal) {
  const sub = subtotal != null ? subtotal : parseAmount(job?.amount) || 0;
  const input = discountInputFromJob(job);
  const amount = resolveDiscountAmount(sub, input);
  if (amount <= 0) return {};
  if (input.type === "percent" && input.value > 0) {
    return {
      discount: amount,
      discountType: "percent",
      discountPercent: input.value,
      percentBased: true,
    };
  }
  return {
    discount: amount,
    discountType: "amount",
    discountPercent: 0,
    percentBased: false,
  };
}
