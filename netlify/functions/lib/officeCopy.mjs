/**
 * Silent office@ copy of every real customer-facing LE Pro email.
 * Gmail host labeler files these into LE Pro tabs (Invoices / Messages / Cases).
 * Levi 2026-07-22 (invoices) · expanded 2026-08-03 (all outbound).
 */
export const OFFICE_EMAIL = "office@leelectrical.us";

/**
 * Add payload.bcc = [office@] unless already office-only / test / empty.
 * Mutates and returns payload.
 *
 * @param {object} payload  Resend payload ({ to, ... })
 * @param {object} [opts]
 * @param {string[]|string} [opts.recipients]  explicit recipient list (defaults to payload.to)
 * @param {boolean} [opts.officeOnly]
 * @param {boolean} [opts.testMode]
 */
export function applyOfficeBcc(payload, { recipients, officeOnly = false, testMode = false } = {}) {
  if (!payload || officeOnly || testMode) return payload;
  const list = Array.isArray(recipients)
    ? recipients
    : recipients
      ? [recipients]
      : Array.isArray(payload.to)
        ? payload.to
        : payload.to
          ? [payload.to]
          : [];
  if (!list.length) return payload;
  const officeLc = OFFICE_EMAIL.toLowerCase();
  const allOffice = list.every((r) => String(r || "").toLowerCase() === officeLc);
  if (allOffice) return payload;
  const alreadyTo = list.some((r) => String(r || "").toLowerCase() === officeLc);
  const alreadyCc = (Array.isArray(payload.cc) ? payload.cc : []).some(
    (r) => String(r || "").toLowerCase() === officeLc
  );
  if (alreadyTo || alreadyCc) return payload;
  const prior = Array.isArray(payload.bcc) ? payload.bcc : payload.bcc ? [payload.bcc] : [];
  const merged = [...prior.map(String), OFFICE_EMAIL].filter(Boolean);
  const seen = new Set();
  payload.bcc = merged.filter((e) => {
    const k = e.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return payload;
}
