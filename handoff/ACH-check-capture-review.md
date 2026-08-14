# ACH / Check-Capture Payment Review — LE Pro

**Reviewed:** cf-native (current working branch) + all local/remote branches, July 31 2026
**Scope:** the "photo a check → extract account/routing/name → confirm → process ACH via Sola" feature.
**Constraint honored:** no real payment run, no money moved. Extraction exercised with a dummy (non-real) check payload only.

## Recommendation: DON'T DEPLOY as an "ACH from check photo" feature

The end-to-end feature described does **not exist** in the code. What's on the branch is a UI scaffold that can't actually debit anyone. Shipping it as an ACH payment feature would be misleading and carries a real data-handling risk with no working payment path behind it.

## What is actually built

**1. Check-photo vision (real, works, tested) — but it does NOT read bank details.**
`netlify/functions/lib/paymentVision.mjs` runs the check photo through xAI Grok vision. The CHECK prompt extracts only: `amount, checkNumber, date, memo, payee, payer, invoiceNumber, confidence`. There is **no routing number and no account number** in the prompt or the normalized output. Verified by running a dummy check through `normalizePaymentExtracted` — output keys contain no `routingNumber`/`accountNumber`. The MICR line is mentioned only as a fallback source for the *check number*, never parsed into routing/account. This vision path exists to record *received* payments (autofill amount + match the invoice), not to capture bank details for a debit.

**2. "ACH" payment method in the app (record-only, behind a flag).**
`pro-src/src/components/JobSheets.jsx` has an ACH method that records a *received* deposit (like Zelle). When env flag `SOLA_ACH_ENABLED` is on, it reveals an optional collapsible "debit via Sola (routing / account)" with three fields: account holder, routing, account. These fields are **manually typed only** — nothing OCR-fills them (`setAchRouting`/`setAchAccount` are wired solely to `onChange`). On Record they are just concatenated into the payment *note* string (`routing <full> · acct …<last4>`). They trigger no charge.

**3. Sola charge backend is credit-card only.**
`netlify/functions/sola-charge.mjs` issues Cardknox `cc:sale` / `cc:save` with card number/exp/CVV. There is **no `check:sale` / `xRouting` / `xAccount` / ACH command anywhere in the repo or on any branch** (grep across all branch tips = zero hits, including Israel's `israel/invoice-pay-v234`, which is actually behind cf-native, not ahead). So there is no ACH debit call to reach.

**4. Customer check-pay endpoint records, doesn't debit.**
`netlify/functions/customer-check-pay.mjs` stores the photo and enqueues office review; a payment is recorded only after Levi confirms the deposit. No money movement.

## Assessment against the deploy questions

- **Does extraction reliably pull account #, routing #, name?** No — it doesn't pull account or routing at all. Name/amount/date/check#/invoice extraction is solid and tested (dummy check parsed cleanly: `$450.00***` → 450, date normalized, bare memo → invoice 251843).
- **Customer-confirm before charging?** For recording a received payment, yes (office/Levi confirm). For an ACH *debit*, N/A — there's nothing to confirm because there's no debit.
- **Is the ACH charge gated behind explicit confirmation (never auto-charge)?** There is no ACH charge to gate. The *card* charge path is properly gated: `agentPaymentGate.mjs` requires accessOn + paymentsOn + per-action confirm for agent identities; owner/human passes through. That gate is sound.
- **Missing validation:** routing field has no ABA checksum validation and account has no format check — low impact today only because the values are never used to charge.

## Risks if deployed with `SOLA_ACH_ENABLED=1`

1. **Misleading UI.** Staff see "debit via Sola" and may believe entering routing/account pulls funds. It does nothing but write to a note — customers won't be charged, invoices silently stay open.
2. **Bank-detail handling.** The routing number is stored in **full** inside the payment note/ledger (plaintext external record); account is masked to last-4, which is fine, but the full account number still lives in client state and in an unvalidated free-text field feeding a note. Collecting bank credentials for a debit that doesn't happen is the wrong direction — either wire a real, PCI/NACHA-appropriate ACH tokenization path or don't collect them.

## Bottom line

- **Safe to ship / leave as-is:** the check-photo autofill for *recording* received checks and Zelle, and the credit-card charge path (gated). These work.
- **Don't ship** the "ACH via Sola / check-capture debit" as a customer-charging feature. It's a scaffold: no OCR of bank details, no ACH debit endpoint, no charge to gate. Keep `SOLA_ACH_ENABLED` off in prod until a real ACH path (Cardknox `check:sale` with tokenized routing/account, checksum validation, explicit customer authorization + confirm step) is actually implemented and tested.

## Live UI test caveat

A full in-app walkthrough is still pending: the LE Pro prod app is PIN-locked and the agent-entry fix isn't live, so the on-device flow needs Levi to unlock it. This review is code + staged-branch only; unlock when you want the on-screen pass.
