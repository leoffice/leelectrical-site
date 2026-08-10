/**
 * Permit renewal mock invoice seed (Phase A companion — Levi 2026-08-10).
 *
 * Scope: seed normal $365 invoice lines on a job for the invoice builder.
 * Mock target: Levi Tester only (no real-customer auto blast).
 * Full email + pay flow: see permitRenewal.js (preparePhaseAMock / buildPermitRenewEmail).
 * Phase B (later): pay notify → approve → DOB file manually.
 */

export const PERMIT_RENEW_FEE_DEFAULT = 365;

/** QBO-style product label used on filing work. */
export const PERMIT_RENEW_ITEM_NAME = "Tesla Charger:Filing permit:Filing permit";

/**
 * @param {object} job
 * @returns {boolean}
 */
export function isLeviTesterJob(job) {
  const hay = [
    job?.customer,
    job?.businessName,
    job?.customerName,
    job?.billTo,
    job?.email,
  ]
    .map((s) => String(s || "").toLowerCase())
    .join(" ");
  return (
    hay.includes("levi tester") ||
    hay.includes("levi-tester") ||
    hay.includes("levitester") ||
    // common tester emails used in ops
    hay.includes("office@leelectrical") ||
    hay.includes("levi@leelectrical")
  );
}

/**
 * Best filing / permit number from job permits or paperwork.
 * @param {object} job
 * @returns {string}
 */
export function renewFilingLabel(job) {
  const list = Array.isArray(job?.permits) ? job.permits : [];
  for (const p of list) {
    const a = String(p?.agency || "").toLowerCase();
    if (a !== "city" && a !== "dob") continue;
    const n = String(p?.number || p?.filingNumber || p?.id || "").trim();
    if (n) return n;
  }
  const dob =
    job?.paperwork?.dob?.filingNumber ||
    job?.paperwork?.dob?.permitNumber ||
    job?.paperwork?.city?.filingNumber ||
    "";
  return String(dob || "").trim();
}

/**
 * Build invoice line items for a permit renew application.
 * @param {object} job
 * @param {{ fee?: number, mock?: boolean, addressOverride?: string, filingOverride?: string }} [opts]
 * @returns {Array<object>}
 */
export function buildPermitRenewInvoiceLines(job, opts = {}) {
  const fee = Number(opts.fee);
  const amount = Number.isFinite(fee) && fee > 0 ? fee : PERMIT_RENEW_FEE_DEFAULT;
  const mock = opts.mock !== false;
  const addr = String(
    opts.addressOverride || job?.serviceAddress || job?.address || ""
  ).trim();
  const filing = String(opts.filingOverride || renewFilingLabel(job) || "").trim();

  const bits = ["Electrical permit renewal / re-file"];
  if (addr) bits.push(addr);
  if (filing) bits.push(`Permit ${filing}`);
  if (mock) bits.push("[MOCK — send / email Levi Tester only]");

  return [
    {
      itemName: PERMIT_RENEW_ITEM_NAME,
      description: bits.join(" · "),
      qty: 1,
      unitPrice: amount,
      rate: amount,
    },
  ];
}

/**
 * Job patch that seeds invoice builder with renew lines + mock marker.
 * @param {object} job
 * @param {{ fee?: number, mock?: boolean }} [opts]
 */
export function permitRenewMockPatch(job, opts = {}) {
  const mock = opts.mock !== false;
  const fee =
    Number.isFinite(Number(opts.fee)) && Number(opts.fee) > 0
      ? Number(opts.fee)
      : PERMIT_RENEW_FEE_DEFAULT;
  const lines = buildPermitRenewInvoiceLines(job, { ...opts, fee, mock });
  return {
    invoiceLines: lines,
    // amount helps older list chips; invoice builder prefers invoiceLines
    amount: fee,
    permitRenewMock: {
      at: new Date().toISOString(),
      fee,
      mock,
      phase: 1,
      target: "levi-tester",
      address: String(job?.serviceAddress || job?.address || "").trim(),
      filing: renewFilingLabel(job),
      // UI hint — not an auto-send switch
      note: "Phase 1 mock: open invoice → Save / sync / send to Levi Tester only",
    },
  };
}

/**
 * True when job currently has an active phase-1 renew mock seed.
 * @param {object} job
 */
export function hasPermitRenewMock(job) {
  const m = job?.permitRenewMock;
  return !!(m && typeof m === "object" && m.phase === 1);
}
