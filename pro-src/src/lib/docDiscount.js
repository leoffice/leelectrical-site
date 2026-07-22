// Invoice / estimate discount on the document total ($ or %).
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
