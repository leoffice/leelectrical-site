# LE Pro — Credit Card Payment: Security & Functionality Review

**Scope:** Read-only inspection. No files changed, no transaction triggered.
**Feature:** "Mark as paid → Credit card" (in-app charge) + the Cardknox/"Sola" processor integration.
**Date:** 2026-07-09

**Bottom line:** The card-security architecture is **correct and PCI-friendly** — no raw card number (PAN) and no CVV are ever stored, and the real card number never touches your server (it's tokenized inside a Cardknox-hosted iframe). Only a Cardknox token + a masked last-4 are saved. The Cardknox **error is almost certainly a configuration/credential issue on Netlify, not a code bug.** Details and exact fixes below.

---

## 1. Record-payment CC form — fields, validation, completeness

The credit-card form lives in `pro-src/src/components/SolaCardForm.jsx`, embedded in the "Mark as paid" sheet (`pro-src/src/components/JobSheets.jsx`, `MarkPaidSheet`). Selecting **Payment method → "Credit card"** reveals it.

Fields:
- **Card number** — a Cardknox iFields `<iframe>` (not a normal input). Hosted by Cardknox, so the digits live in *their* frame, not your page.
- **Exp (MM/YY)** — a normal text input, `maxLength 7`, numeric.
- **CVV** — a Cardknox iFields `<iframe>` (also hosted by Cardknox).
- **Name / ZIP — NOT collected in the form.** Billing name, street, and ZIP are pulled from the job record via `billingFromJob()` (`solaCharge.js`) and sent as `xBillLastName` / `xBillStreet` / `xBillZip`. So AVS/zip verification depends on the job having a clean billing address; a job with no address = no ZIP sent.

Validation:
- Client (`processCard` in JobSheets): invoice # present, amount > 0, amount ≤ open balance, card fields finished loading, and (for saved-card) a token exists.
- Card-field validation is done by Cardknox's `getTokens()` — if the number/exp/CVV are bad, tokenization fails and the error shows in the `card-data-error` label.
- Server (`sola-charge.mjs`): re-checks invoiceNo, principal > 0, that a card **or** token is present, and exp = 4 digits (MMYY).
- Exp is normalized MM/YY → MMYY on both client and server.

**Assessment:** Complete and correct for a tokenized flow. The only gap is a UX one — **no ZIP/name field in the form**, so AVS quality depends entirely on the job's stored address. Consider adding an optional ZIP field for card-not-present AVS if your Cardknox account enforces it.

---

## 2. Card security (CRITICAL) — is the real PAN or CVV ever stored?

**No. Storage is properly tokenized. This is the good outcome.**

When "Save card on file" is on and a charge is approved, the ONLY card data persisted is a Cardknox token + a masked number. Exact storage code — `netlify/functions/sola-shared.mjs`, `patchJobCardOnFile()`:

```js
ov[jobId] = {
  ...(ov[jobId] || {}),
  solaCardToken: cardToken,                 // permanent Cardknox token (xToken)
  solaCardMasked: cardMasked || ov[jobId]?.solaCardMasked || "",  // e.g. "4242"
};
await stateStore.setJSON(STATE_KEY, { ov, ts: Date.now() });
```

The token/mask come straight from Cardknox's gateway response — `sola-charge.mjs`:

```js
let cardToken  = String(data.xToken || "").trim();
let cardMasked = String(data.xMaskedCardNumber || "").trim();
```

Confirmed by full-repo search:
- **Full PAN:** never written to blob storage. The field literally named `xCardNum` only ever holds a Cardknox **single-use token (SUT)** from iFields — never the raw number (see §3) — and it is passed straight to the gateway, never persisted.
- **CVV:** never stored. It's forwarded to the gateway for the one sale and discarded. (Storing CVV is a hard PCI prohibition — you are clean here.)
- **Exp:** used for the sale, not persisted.
- The recorded payment entry (`patchJobPayment`) saves only amount, method, ref, date — no card data.

**Verdict:** ✅ No raw-PAN storage, ✅ no CVV storage. PCI scope is minimized correctly.

---

## 3. Cardknox integration — how the card is captured & charged, and where the key lives

**Capture: client-side tokenization via Cardknox iFields (correct).** The card number and CVV are entered into iframes served from `https://cdn.cardknox.com/ifields/<ver>/ifield.htm`. `tokenizeSolaCard()` calls `window.getTokens()`, which returns **single-use tokens (SUTs)** into hidden inputs. Those tokens — not the real card — are what get POSTed to your backend (`solaCharge.js` → `/.netlify/functions/sola-charge`). The raw PAN never reaches your server. This is the PCI-recommended pattern.

**Charge: server-side.** `sola-charge.mjs` builds a `cc:sale` and POSTs to the Cardknox gateway `https://x1.cardknox.com/gatewayjson` using the secret gateway key. On approval it records the payment and (if requested) saves the token.

**Where the keys live:**
- **Secret gateway key (`xKey`) — server-side only. Good.** `sola-charge.mjs`, `resolveXKey()`:
  ```js
  return isDev
    ? process.env.SOLA_X_KEY_DEV || process.env.SOLA_X_KEY
    : process.env.SOLA_X_KEY;
  ```
  It is read from a Netlify env var and never sent to the browser. ✅
- **iFields key — public by design, but hardcoded fallback present.** `sola-ifields-config.mjs`:
  ```js
  : process.env.SOLA_IFIELDS_KEY || "ifields_blzelectricf19091a9a53f435699d914e935";
  ```
  The iFields key is *meant* to be public (it only tokenizes; it can't charge), so exposing it is acceptable. ⚠️ **But note the hardcoded fallback belongs to account `blzelectric`** — see the error diagnosis below.

**Verdict:** ✅ Secret key is server-side. ✅ Only the public iFields key reaches the client. Architecture is sound.

---

## 4. The Cardknox error — likely root cause

The exact error text isn't checked into the repo (secrets/logs aren't in git, correctly), so this is a diagnosis from the code + config, ranked by likelihood. The tell-tale detail: **the app is wired to a Cardknox account slug `blzelectric`**, and there are references to a *different* dev account `lepaymentsdev` in the tests (`payLanding.view.test.jsx:161`, `paylink.customer.view.test.jsx:52`). Account/key mismatches are the classic cause of Cardknox errors here.

Most likely causes, in order:

1. **`SOLA_X_KEY` not set on Netlify (production).** `SOLA_ENV` defaults to `"production"`, and in production `resolveXKey()` has **no fallback** — if the env var is missing, every charge returns `"SOLA_X_KEY not configured on Netlify"` (HTTP 503). Meanwhile the card form still *loads and tokenizes fine* because the iFields key has a hardcoded fallback — so the failure only appears at the moment of charging. This matches the common symptom "card fields work, but processing errors out." **Check this first.**

2. **iFields key ↔ gateway key account mismatch.** An iFields single-use token minted for account `blzelectric` can only be charged by the `xKey` of that **same** Cardknox account. If `SOLA_X_KEY` is a key for a different/older account (or the `lepaymentsdev` sandbox), Cardknox rejects the token with an `xError` like *"Invalid Token"* / *"Invalid xCardNum."* Because the client iFields key falls back to `blzelectric`, the two halves must both be the `blzelectric` account.

3. **Sandbox vs live mismatch.** Cardknox uses a **single endpoint** (`x1.cardknox.com`) for both — sandbox vs live is determined **by the key**, not the URL. So a test/sandbox `xKey` (or `SOLA_ENV=sandbox` pointing at `SOLA_X_KEY_DEV`) against a live iFields key, or vice-versa, produces token/auth errors. Verify `SOLA_ENV` and that the `SOLA_X_KEY*` and `SOLA_IFIELDS_KEY*` pair belong to the **same environment**.

4. **iFields script/version failing to load.** `SolaCardForm` loads `https://cdn.cardknox.com/ifields/<ver>/ifields.min.js` (`ver` = `2.15.2409.2601`). If the CDN/version is unreachable, you'd instead see *"Could not load card security library"* and the fields never render — a different symptom, less likely if the form is visible.

5. **Endpoint/field mapping** — ruled out on inspection. The gateway URL, `xCommand`, `xVersion: "5.0.0"`, and field names (`xCardNum`, `xCVV`, `xExp`, `xToken`, `xAmount`, `xInvoice`) are all valid Cardknox v5 JSON API. No mapping bug found.

**Note (minor, not the outage):** the save-on-file fallback at `sola-charge.mjs:184` re-sends `xCardNum` (an already-consumed single-use token) to `cc:save`, which would fail — but it's normally skipped because `cc:sale` already returns an `xToken`. Worth cleaning up but it's not what's breaking charges.

---

## 5. Does the CC processing work right now?

- **Code path: functional and correct.** Tokenization, charge, approval handling, payment recording, and token-only storage are all implemented properly and defensively.
- **Runtime: most likely BROKEN due to configuration**, not code — specifically a missing/mismatched `SOLA_X_KEY` on Netlify (cause #1/#2 above). The client half works (fields load via the hardcoded iFields key), which is exactly why the error surfaces at charge time and mentions Cardknox.
- **Test/live status from code:** defaults to **production** (`SOLA_ENV` unset ⇒ `"production"`), account slug `blzelectric`. A `lepaymentsdev` sandbox account exists in test fixtures but isn't the default runtime path.

---

## Exact fixes needed

**Security:** none required — storage is already tokenized (token + last-4 only), no PAN, no CVV. ✅ Keep it this way.

**To fix the Cardknox error — verify on Netlify (Site settings → Environment variables):**
1. **`SOLA_X_KEY`** is set (production secret gateway key). This is the #1 suspect. Without it you get "SOLA_X_KEY not configured on Netlify."
2. **`SOLA_X_KEY` and `SOLA_IFIELDS_KEY` are from the SAME Cardknox account** — the app defaults the iFields key to the `blzelectric` account, so the gateway key must also be `blzelectric`'s (not `lepaymentsdev`, not an older key).
3. **`SOLA_ENV`** matches your keys. If you're testing in sandbox, set `SOLA_ENV=sandbox` **and** provide `SOLA_X_KEY_DEV`/`SOLA_IFIELDS_KEY_DEV` for the sandbox account. For live, leave `SOLA_ENV` unset (defaults to production) and use live keys.
4. After confirming, do **one small live/sandbox test charge yourself** (e.g. $1 on a real invoice, or a sandbox test card) and read the gateway's `xError` — the code already surfaces it to the toast/`payErr`. That message will pinpoint which of the above it is.

**Code cleanup (optional, low priority):**
- Remove the hardcoded iFields-key fallback in `sola-ifields-config.mjs` and require `SOLA_IFIELDS_KEY`, so a missing env var fails loudly instead of silently using `blzelectric`.
- Fix/remove the dead save-on-file branch (`sola-charge.mjs:184`) that reuses a spent single-use token.

## Needs Levi (not something code can fix)
- Confirm which **Cardknox account is the real live one** (`blzelectric` vs `lepaymentsdev`) and that the matching **secret gateway key** is in Netlify prod env.
- Confirm whether you intend to run **live or sandbox** right now, and set `SOLA_ENV` + the corresponding key pair accordingly.
- Confirm your Cardknox account has **tokenization / card-on-file enabled** if you want "Save card on file" to work.
