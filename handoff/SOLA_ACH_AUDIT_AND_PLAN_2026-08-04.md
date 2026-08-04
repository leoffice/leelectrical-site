# Sola ACH audit + execution plan (LE Pro)

**Date:** 2026-08-04  
**Authority:** Levi (Telegram) — audit how **Sola** (not Solr) does ACH; authorization letter; plan manual routing/account in LE Pro first; test before everyone; “pretending to work” honesty.  
**Constraint:** no real customer debit until flag + test path approved.

---

## Bottom line (honest)

| What people think | What’s true today |
|---|---|
| “ACH Process” debits the bank | **Code path exists** (`check:sale`) but **`SOLA_ACH_ENABLED` is off in prod** → Process returns 503 / toast “not turned on yet” |
| Typing routing + account charges them | Only when Process + flag on + gateway approves |
| Check photo → ACH debit | Vision extracts amount/check#/memo — **not** routing/account for debit. Process fields are **manual** (photo optional / optional autofill if MICR ever filled) |
| “Record only” ACH | **Works** — books a received bank payment (like Zelle). Does **not** call Sola |

**Rate:** Sola/Tili Merlin wrote ACH is **1% per transaction** (see `CARDKNOX_RATE_FINDINGS.md`). Cards remain 3.5% surcharge path; ACH Process intentionally **does not** add the card fee unless `includeFee: true`.

---

## What is built (code truth)

### 1. Backend — real Cardknox ACH command (gated)

`netlify/functions/sola-charge.mjs`:

- Detects ACH body (`paymentMethod` ach/check/bank **or** routing fields present).
- If `SOLA_ACH_ENABLED` is not `1`/`true`/`yes` → **503** with clear error (not a silent success).
- When enabled: `xCommand: "check:sale"` with `xRouting`, `xAccount`, `xName`, `xAccountType`, amount, invoice, optional check image.
- Requires `SOLA_X_KEY` (same gateway key as cards).
- On gateway approve (`xResult` A/APPROVED): applies payment to job via existing Sola apply path.
- Agent fleet still goes through `agentPaymentGate` (confirm required for agents).

### 2. Staff UI — LE Pro Mark-as-paid (manual first)

`JobSheets.jsx` ACH method:

- **Record only** — confirmation # + optional proof; ledger only.
- **Process payment** — name + **9-digit routing** + account (manual); confirm sheet (“will debit …last4”); calls `chargeAchInApp` → `sola-charge`.
- `achEnabled` from `sola-ifields-config` (`achEnabled: true` only if env flag on). When off, amber banner: *Process ready in app — host still needs ACH turned on*.
- Confirm step is **staff** confirm, not a signed customer auth letter PDF.

### 3. Client helper

`pro-src/src/lib/solaCharge.js` — `validateAchBankFields` (routing 9 digits, account ≥4, name required) + `chargeAchInApp` / `chargeAchFromLanding`.

### 4. Customer pay landing

`PayLanding.jsx` can show ACH when `achEnabled` — **do not turn on for customers until staff path is proven.**

### 5. Out of date

`handoff/ACH-check-capture-review.md` (July 31) said **no `check:sale` exists**. That is **stale** — check:sale **is** in tree now; the gap is **env flag + merchant ACH readiness + authorization UX**, not missing API plumbing.

---

## Why it still “pretends” / feels broken

1. **Flag off** — Process button path is honest about flag, but staff may still expect money to move.
2. **No authorization letter capture** — NACHA/WEB/TEL risk: merchant agreement usually needs customer authorization language on file (written or recorded). App only has staff “Yes — process payment”.
3. **No ABA checksum** — invalid routing can fail at gateway only.
4. **Merchant account** — Sola must have ACH/e-check product enabled on the Cardknox account (`blzelectric`); env flag alone is not enough if processor rejects check:sale.
5. **Customer path not gated by role** — when flag flips global, landing could expose bank entry to everyone unless we staff-only first.

---

## Authorization letter (what we need)

Minimum for **manual staff Process** (office types RTN/ACCT from voided check or customer verbal/email):

1. **One-time or per-payment auth** the customer signs or emails back, e.g.:
   - “I authorize BLZ Electric Inc. to debit account ****1234, routing ######### for $X on or after DATE for invoice #Y.”
   - Name, signature/date, account type (checking/savings), last4 optional on letter if full account only in secure Process form.
2. **Store** PDF/photo on the job (existing Attach / payment proof), **not** full account number in the payment note long-term (today Process does not put full RTN into ledger note the way old Record-note path did — keep it that way).
3. **Staff confirm** stays: never auto-debit from OCR alone.
4. Later: in-app checkbox + typed name + timestamp as electronic authorization (plus PDF template).

**Do not** ship customer self-serve ACH without auth language on the pay page.

---

## Execution plan (phased — LE Pro first)

### Phase 0 — Honesty (no money) ✅ code mostly done

- Keep **Record only** for bank deposits already received.
- Keep **Process** disabled until Phase 1 flag.
- UI already warns when `achEnabled` is false.

### Phase 1 — Merchant + flag (ops)

1. Confirm with **Sola / Tili** that ACH/e-check is live on BLZ Cardknox account and `check:sale` is allowed.
2. Confirm sandbox key pair if testing with `SOLA_ENV=sandbox` + `SOLA_X_KEY_DEV`.
3. Set **`SOLA_ACH_ENABLED=true`** only on a **test host** or after Phase 2 (not wide prod until Phase 3).
4. Leave **customer Pay landing ACH off** (or feature-flag staff-only) until Phase 3.

### Phase 2 — Staff-only manual Process (LE Pro app)

1. Open job → Mark paid → **ACH** → **Process payment**.
2. Enter **account holder, routing (9), account** (from voided check / customer).
3. Attach authorization letter or voided check photo.
4. Confirm sheet → gateway → ref # on success.
5. **Test invoice** first (small $1–$5 or Sola test account) — not Seewald production balance.
6. Reconcile: gateway ref, bank settlement, QBO/LE Pro open balance.

**Success criteria:** one approved test debit, one intentional decline (bad routing), staff confirm cannot be skipped, flag-off still 503.

### Phase 3 — Limited staff rollout

1. Flip `SOLA_ACH_ENABLED` on prod after Phase 2 pass.
2. Levi + office only; no customer marketing of “pay by bank” yet.
3. Keep auth letter requirement (checklist in handoff / optional UI reminder).

### Phase 4 — Customer later (optional)

1. Pay page ACH with explicit auth text + amount + last4 display before submit.
2. Same `check:sale` path; rate 1% (decide absorb vs pass-through — today Process has no ACH fee line).

### Not in scope yet

- Full MICR OCR debit (vision does not own routing/account reliably).
- Tokenized bank accounts / vault for repeat ACH.
- Automatic ACH on invoice send.

---

## Env checklist

| Var | Role |
|---|---|
| `SOLA_X_KEY` | Gateway secret (required for card + ACH) |
| `SOLA_IFIELDS_KEY` | Card iFields only |
| `SOLA_ACH_ENABLED` | Must be `true`/`1` for Process ACH |
| `SOLA_ENV` | production vs sandbox key selection |

---

## Recommended next actions for Levi

1. **Lag** — separate: list slim v316 (status map was still ~1.45 MB of the ~4.3 MB list).  
2. **ACH** — reply Sola that ACH product is on; then enable flag for **one test charge** only.  
3. Drop a simple **authorization PDF** (or email template) into job Attach before first real Process.  
4. Do **not** enable customer ACH until staff path works twice.

---

## Code map

| Piece | Path |
|---|---|
| ACH sale | `netlify/functions/sola-charge.mjs` → `solaCheckSale` / `achEnabledEnv` |
| Flag to UI | `netlify/functions/sola-ifields-config.mjs` → `achEnabled` |
| Staff Process | `pro-src/src/components/JobSheets.jsx` + `pro-src/src/lib/solaCharge.js` |
| Customer | `pro-src/src/views/PayLanding.jsx` |
| Rates note | `~/.hermes/shared/handoff/CARDKNOX_RATE_FINDINGS.md` |
