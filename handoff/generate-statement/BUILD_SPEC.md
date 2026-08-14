# Fleet handoff — "Generate Statement" (LE Pro)

**Owner:** Levi · **Builder:** Israel · **Status:** spec ready, build pending

## One rule that must not be missed
The Statement REUSES the invoice/estimate letterhead. It does **not** get its own header/footer design.

- Shared generator: `pro-src/src/lib/qbInvoicePdf.js` → `buildQbDocPdf(data)`.
- **Header to reuse** = `drawCompanyLogo(page, logoImage)` (company block top-left: name + address + phone + email + license; centered company logo) **plus** the top-right title/meta rows (title + `STATEMENT/DATE/…` meta).
- **Footer to reuse** = the per-page footer loop at the bottom of `buildQbDocPdf` ("Thank you for your business!", the contact line, and the `POWERED_BY_LE` mark from `brand.js`).

Build it by adding `docType: "STATEMENT"` support inside `buildQbDocPdf` (or a thin `buildStatementPdf` that calls the exact same header + footer drawing). That way any future letterhead tweak to invoices/estimates flows into statements automatically. **Do not fork or re-implement the letterhead.**

## What differs from an invoice/estimate
Only two things:
1. **Title** reads `Statement` (top-right, same green title style as `INVOICE`/`ESTIMATE`).
2. **Body** carries statement content instead of line items:
   - **Bill To** (customer + company).
   - The **latest invoice** for the job (number, date, progress %, total).
   - **Payments received** (each payment from the job's `payments[]` — date, method, confirmation #).
   - **Totals**: Invoice Total → less Payments Received → **Balance Due** (or credit).

## Progress-invoice handling
The latest Seewald invoice is a **progress bill** — amount due is the billed percentage of the contract, not a flat total.
- Use `isProgressInvoiceJob()` / `invoiceProgressPct` in `pro-src/src/lib/payments.js`.
- Statement shows the latest invoice total, payments applied, and the resulting balance due.
- Do **not** roll in fully-settled older invoices (e.g. the old $16,000 #231595) unless the owner asks for full history.

## Data source
LE Pro is the system of record for the job ledger (invoice total + `payments[]`), reconciled against QuickBooks where synced. The statement renders from the LE Pro job, not from a separate QBO statement.

## Reference render
A standalone HTML sample of the Seewald statement — showing the exact shared header/footer with statement body — was produced for visual sign-off (`seewald-statement-sample.html`). Match that layout when wiring the PDF.

## Open item before final render
Confirm the EXACT latest-invoice number, total (~$42,700), and progress % from LE Pro (the job's invoice ledger). QuickBooks does not yet hold this progress invoice — it only has the old $16k invoice plus a $4k unapplied credit from the 4 payments.
