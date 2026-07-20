// Branded takeoff-sheet PDF — reuses the shared doc engine (buildQbDocPdf) so
// the header, logo and "Powered by" wording match every other document the app
// produces. We render the takeoff as a TAKEOFF-typed document whose line items
// carry the detected symbol, quantity, unit price and extended amount.

import { buildQbDocPdf } from "./qbInvoicePdf.js";
import { tenantCompany, tenantAddressLines } from "./tenantBranding.js";
import { lineValue, totalValue } from "./takeoffModel.js";
import { todayStr } from "./format.js";

/**
 * @param {Array} items  finalised takeoff line items
 * @param {object} meta   { number, date, jobName, addressLines, engineNote }
 * @returns {Blob} application/pdf
 */
export function buildTakeoffPdf(items, meta = {}) {
  const lines = (items || [])
    .filter((it) => (Number(it.qty) || 0) > 0)
    .map((it) => ({
      description:
        `${it.symbol ? it.symbol + " — " : ""}${it.description || it.symbolClass || "Item"}` +
        (it.confidence ? `  [${it.confidence}]` : ""),
      qty: Number(it.qty) || 0,
      rate: Number(it.unitPrice) || 0,
      amount: lineValue(it),
    }));

  const grand = totalValue(items);
  const company = { ...tenantCompany(), addressLines: tenantAddressLines() };

  const data = {
    docType: "TAKEOFF",
    company,
    docNumber: meta.number || "",
    date: meta.date || todayStr(),
    billTo: {
      name: meta.jobName || "",
      addressLines: meta.addressLines || [],
    },
    lines,
    subtotal: grand,
    total: grand,
    totalLabel: "ESTIMATED TOTAL",
    messageLines: [
      meta.engineNote,
      "Quantities are a takeoff estimate read from the attached drawings — verify against the",
      "plans and specs before ordering or bidding.",
    ].filter(Boolean),
    showAcceptance: false,
  };

  return buildQbDocPdf(data);
}
