# LE Pro — current-state agent context (scoped)

> **AUTO-GENERATED** — do not hand-edit. Regen: `node scripts/regen-le-pro-agent-context.mjs`
> **generatedAt:** 2026-07-30T23:13:50.370Z
> **versionStamp:** git `208cd89` · builtAt 2026-07-30T22:34:19.726Z
> **scope:** LE Pro ONLY · CURRENT state ONLY
> **must not load:** raw HANDOFF.md · other projects · roadmap / planned / future

## Purpose

This is the **only** ops-context slice the in-app LE Pro agent may treat as "what is true about the product right now."
Product how-to still comes from the on-device pack (`COMPANY`, `NAVIGATION`, `JOBS`, …).
This file replaces feeding the full multi-project handoff into the bubble agent (A181 refinement).

## Hard rules for the agent

1. You only know **LE Pro** (this app). You do not know or discuss other company projects.
2. You only know **current** state — what is live or held *now*. Never invent roadmap items.
3. If this file and the knowledge pack disagree on a product rule, prefer the knowledge pack for UX rules and this file for live/version facts.
4. **Send on behalf:** draft in chat **or** create a notification for the owner to approve — never auto-complete a customer send.
5. **To-dos / read / show:** direct (no confirm) — primary job.

## Live product (from handoff filter)

### LE Pro — live now
| Field | Value |
|-------|--------|
| URL | https://www.leelectrical.us/app/pro (Cloudflare) |
| Git HEAD (LIVE) | **LE Pro v245 LIVE** — SW `le-pro-v245`; CF prod `ea9fdd40` @ `55d253d` on `cf-native` · rollback prior SW `le-pro-v244` / `a6857bd`
K21 pass in pro-src |
| Invoice email | **LIVE to customers** — `EMAIL_TEST_MODE=false`; Resend from office@; short `/pay/…` View Invoice; PDF stored for pay-page open |

**Board (fetch live):** `curl -sS 'https://leelectrical.us/.netlify/functions/devtasks?cb='$(date +%s)`

### Recent LE Pro ships (filtered)

- **2026-07-30 LE Pro LIVE (v245)** — (Israel: Dispatch deploy order A178 + Winthrop hold lifted A172). Letters + shared signature + Con Ed Form A real PDF fill (page 1) + meter-install calendar RED (Winthrop) + email reschedule removes prior appointment. **Agent-access / payment scaffold intentionally NOT shipped** (held for reliability + standing/payment final form). Smoke: state/command/jobs…
- **2026-07-30 LE Pro LIVE (v244)** — (Israel: Levi DM Winthrop Aug 5 missing + regular email→calendar inspect). Root cause: Con Ed “Your appointment is set” / APPT-* mail was treated as a reminder because marketing footers say “upcoming service appointment,” so LE Pro never created the booking; nested HTML bodies also lost the date. Fix: real appointment-set mail wins first; email scanner re-h…
- **2026-07-29 LE Pro LIVE (v242)** — (Israel: Levi “deploy”). Override ship (no peer wait). Chat bubble: expand big window / smaller / ✕ minimizes. Settings → AI Assistant: Speak replies + voice presets. Assistant knowledge pack scope for tenant isolation + change requests. 13 focused tests pass. git `52e0c59` / stamp `07c5c28` · CF `0a034aa8` · SW `le-pro-v242`. Ship: **LE Pro — Chat expand +…
- **2026-07-29 LE Pro LIVE (v241)** — (Israel: Levi “Deploy all”). Override ship (no peer wait). (1) Invoice balance always heals after amount raise (Seewald-class: due = invoice − paid, never frozen paid-in-full). (2) Fold/phone Open invoice → native PDF (tap, no blank iframe). (3) ~20 min after first open: one-time chat welcome from Levi. 44 focused tests pass; full suite 1554 pass / same pre…
- **2026-07-29 LE Pro LIVE (v240)** — Phone invoice open. git `c351c85` · SW `le-pro-v240`.
- **2026-07-29 LE Pro LIVE (v239)** — Chat readable colors. git `cf6a7d3` · SW `le-pro-v239` (prod cache was already `le-pro-v240` after phone-open stamp).
- **2026-07-28 LE Pro LIVE (v238)** — (Israel: Levi “Le pro get verified by agents and deploy”). Panel: Eved **APPROVE** A74. (1) Open job = card + transaction history (no auto open-invoice list at address). (2) Invoices list: open (still due) first. (3) Line items always show Rate + Qty; Progress % only when Progress invoice is on (toggle after estimate). 1573 tests pass (4 pre-existing flakes…
- **2026-07-28 LE Pro LIVE (v237)** — (Israel: Levi “Get confirmation from agents then deploy”). Panel: Office **APPROVE** A67 + Eved **APPROVE** A66. View Local opens full-screen in-app (Download / Share / Close) — no auto-download; QuickBooks view same viewer. 1576 tests pass (3 pre-existing flakes same as live). git `8aea222` · CF `fecef2af` · SW `le-pro-v237`. Ship: **LE Pro — In-app docume…
- **2026-07-28 LE Pro LIVE (v236)** — Invoice # heal + unlinked payment apply. git `7e1492e` · SW `le-pro-v236`.
- **2026-07-28 LE Pro LIVE (v235)** — (Israel: Levi “test + peer approve + deploy”). Letterhead letters on invoice/estimate: Load Letter / safety / equipment safety / affidavit opens questionnaire (toggles + photos), preview company letterhead PDF with signature, approve attaches so send = invoice + letter. Re-open letter from the line. QBO sync popup names monthly Intuit API cap (upgrade or wa…
- **2026-07-28 LE Pro LIVE (v234)** — (Israel: Levi DM invoice draft + job tabs + payment apply). Save now stamps a real invoice/estimate number so the job leaves "Inv draft". Job info Est/Inv/Payment buttons match body text size (were tiny). Payment edit: customer → service address → open invoices (removed dual Find invoice list). 1561 tests pass (1 pre-existing permits flake). git `e0a5ca4` ·…
- **2026-07-28 LE Pro LIVE (v233)** — (Israel: Levi DM lag + remove bottom plus + push). Root cause: calendar save waited on network (command queue + full calendar re-pull) and the form re-rendered on every store poll while typing; address suggestions also scanned every event description. Fix: appointment save paints locally and closes immediately (queue + Google pull in background); lighter ad…

### Status notes (LE Pro only)

- **Israel 2026-07-30:** LE Pro **v245 LIVE** — Letters + Con Ed Form A fill + Winthrop meter RED. git `55d253d` · SW `le-pro-v245` · CF `ea9fdd40`. Rollback v244/`a6857bd`. **HELD:** 24h Agent Access + payment (reliability + standing/payment A169 first). **NEXT:** bubble → real in-app AI agent (plan ACK’d).
- **Israel 2026-07-30:** LE Pro **24-Hour Agent Access HELD** (was staged `208cd89`/`c440746`) — not in v245. Ship only after Durable Object consistency fix + standing access + payment Option 1 as one package. Package still `DEPLOY_REVIEW_LE_PRO_AGENT_24H.md` (supersede when A169 lands).
- **LE Pro:** No new staged batch — speech-to-text + company logo already live.
- **LE Pro APK:** staged in cf-native `app/pro/apk/` code 3 / sha256 `762e1072…` — **not pages-deployed** (avoid stomping concurrent LE Pro work). Set DEPLOY_NOW=1 when safe.

### Ready / held (LE Pro only — current queue, not a roadmap dump)

- **HELD — 24h Agent Access + standing + payment (A169)** — do **not** ship until (a) redeem flip-flop fixed (move grant/session to Durable Object, strong consistency) AND (b) standing mode + payment capability (Option 1: stage customer invoice pay via Sola; Levi per-action confirm) are built + peer-reviewed as **one solid access ship**. Default 24h scope → full when that ship lands. Payment en…
- **NEXT BUILD — LE Pro bubble → real in-app AI agent** (Levi-approved; modeled on NEC Ask NEC). Knowledge pack currency on deploy + actions (to-dos primary; send staged/confirm; vision/voice reuse). Plan ACK’d on bus; build starting after this ship.
- **2026-07-30 (Israel, STAGED):** **LE Pro — Agent Access TOGGLE standard (no codes)**. Cross-app `AGENT_ACCESS_STANDARD.md`. Settings: access on/off · 24h vs manual · payment OFF default + warn · STOP · audit. DO worker `le-agent-access-do` + fleet identity. Codes/mint/redeem removed. Payment gate stage+confirm. Tests 21 new + full ~1646/1 preexist. git on cf-native. Package `DEPLOY_REVIEW_LE…
- **2026-07-28 (Israel, STAGED → LIVE in v238):** **Job info default = transaction history + Zelle auto-apply** (Levi DM screenshot Mendy Lein + UI note). UI parts shipped in **v238**. Zelle apply on Mendy Lein inv 251852 remains applied in app data (QBO monthly API cap still blocks QuickBooks write until Intuit resets).
- Prior staged: approve-send confirm close + billing-first; Open|All on customer invoice history
- **2026-07-29 (Israel, STAGED → LIVE in v238):** **Invoice rate + qty always; progress only when progress invoice** — shipped in **LE Pro v238**.
- **2026-07-24 staged → 2026-07-28 SHIPPED LIVE v232 (Israel)** — **Approve-send confirm close + customer billing first**: (1) Invoice approve & send with link: button flips to **Approved**, holds ~1s, window closes; backend finishes the email. (2) Customer expand + customer card: **billing address first** (with the customer), then each service address with its open invoices. Tests: sendDocConf…
- **2026-07-24 staged → 2026-07-28 SHIPPED LIVE v232 (Israel)** — Customer transaction history: on **Invoices**, **Open | All** toggle next to Newest/Oldest (Open = balance still due only). Test: customerTransactionHistory.open.test.jsx. Bundled in **LE Pro v232** review package (see `DEPLOY_REVIEW_LE_PRO_v232.md`).
- **2026-07-23 Invoice edit polish + hide empty CO tab LIVE (v213)** — (Israel: Levi DM “Deploy”). Shipped both staged items: product rectangle + progress Full/%/this-invoice summary; no Edit payments (tap payment in history); CO bottom tab only when CO history exists; header **＋ Add change order** still creates. 1365 tests (CF tree). CF `8cd0b3ff` @ `146cc76` · SW `le-pro-v213`. Ship: **LE Pro…
- **2026-07-23 LE Pro staged batch LIVE (v211)** — (Israel: Levi DM “Deploy all”). Shipped: QBO sync issue popup; paid without QuickBooks wait; customer expand billing-first + history default; transaction history UX + open-invoice speed. 1383 tests. git `8558d8c`/`4756b95` · CF `527935c2` · demo `963eb426` · SW `le-pro-v212`. Ship: **LE Pro — Staged batch (v211)**. Rollback `c964c9f` / `le-pro-…

## Do not regress (current product law)

## Do not regress

**Job detail:** Job Information card always fully visible (never collapses). Only sections *below* it collapse (payment history, progress, follow-up, notes, attachments, activity). Tap card toggles those sections; sibling jobs fill the space when collapsed. Scroll to `job-info-anchor` on load.

**Customer view:** All jobs stay open with full job info + doc tabs. Tap a job card opens JobDetail.

**Sync:** Tap runs calendar → refresh (no full QBO pull). QBO runs per-action (import customer, save/sync, fetch payments). No tap-to-skip twitch. Red→amber→green gradient progress. **Never wipe jobs** when server returns empty during sync.

**Send/view is LOCAL by default (2026-07-23, v223):** QuickBooks still *syncs jobs in the background*, but invoices/estimates **send and view locally** by default (branded Gmail/Resend layout, local PDF/print). Sending/viewing *through* QuickBooks is a separate **Settings → "Send & view through QuickBooks" toggle, OFF by default**. Do not re-route send/view back through QB implicitly. Invoice send is instant: close the send sheet immediately, build the PDF once, finish email in the background; multi-recipient (comma-joined) To must be split for Resend; on cloud-send failure fall back to full branded Gmail layout with amount + View Invoice.

**Instant Save principle (2026-07-23, v220/v221) — locked:** UI first, backend second, retry, escalate only real failures. Customer + job edit sheets (save/archive/delete) close immediately and apply locally; server write + QuickBooks queue run in the background with one auto-retry. Never make the sheet wait on network/blob lag.

**White-label / demo isolation (2026-07-23, v218):** Settings company profile (name/email/phone/address/Zelle/check) drives every local printout — invoice, estimate, requisition. Only the **LE Electrical** account falls back to the LE logo/contact seed; demo and other tenants **never** stamp the LE mark. Uploaded company logo sticks immediately (memory + tenant snapshot).

**Chat composer (2026-07-24, v230) — LIVE:** the message box **clears the instant you hit Send** — never wait on the network or Israel's reply; focus stays so the next line can be typed while a reply is still working. The composer is **one bubble**: **+** bottom-left (emoji / photo-or-file / voice), send bottom-right. Do not regress back to a box that stays full until the AI answers.

**Payment & draft doc flow (2026-07-24, STAGED — awaiting deploy batch; not yet live, CHANGELOG is source of truth):** captured here so it's findable. (1) **Customer-history payments open instantly** (no ~30s hang). (2) **Find invoice** shows invoices *or* open estimates at the service address; **convert estimate** returns to the payment after Save. (3) A saved **draft's "Sync to QuickBooks" actually syncs and closes** — it must not reopen the create sheet; Save proceeds right away and, with QB-docs on, also queues QuickBooks (parallel Sync / Edit buttons). (4) **Approve-send confirm beat:** Approve → button flips to **Approved** ~1s → window closes; the backend finishes the email after close. (5) **Customer expand / card is billing-first:** billing address (with the customer) first, then each service address with its open invoices. (6) Customer transaction history has an **Open / All** invoices filter.

**Mobile nav:** + and chat in bottom bar between Archive and Dev.


## Do-not-regress — v240→v242 (LIVE 2026-07-29/30)

- **Balance heal (v241):** when an invoice total is raised **after** payments are recorded, due always recalculates as **invoice − paid** — never show the pre-raise balance.
- **Fold / Android invoice open (v241):** opening an invoice on phone / Galaxy Fold taps into the **native PDF reader**; do NOT regress to the blank in-app iframe.
- **Delayed admin welcome (v241):** ~20 min after an admin's first app open, one-time welcome chat from Levi fires once — never on every open.
- **Chat bubble (v239→v242):** high-contrast bubbles (your = deep navy/white, Israel = cool gray/near-black), high-contrast in dark mode; bubble **expands to a big window / smaller / ✕ minimizes** (v242).
- **AI Assistant voice (v242):** Settings → AI Assistant has **Speak replies** + voice presets; assistant knowledge-pack **scope** keeps tenant isolation for white-label change requests.

## On-device knowledge pack (always load with this file)

Path: `/app/pro/assistant/`

- **COMPANY.md**: - **Product:** LE Pro (white-label name can differ per tenant) - **Business (LE Electrical default):** Electrical contractor — Brooklyn, NY + New Jersey - **Office calendar:** office@leelectrical.us
- **SCOPE.md**: - **LE Electrical (seller):** full office assistant (Israel) — customers, jobs, calendar, billing help, reports, change requests. - **White-label tenants (e.g. BLZ):** same product help, **only that company’s data**. Nev…
- **NAVIGATION.md**: | Area | What for | |------|----------| | **Today** | Day view, appointments, follow-ups, smart suggestions |
- **JOBS.md**: - Each job has customer, service address, billing address, stages (Lead → Site Visit → Estimate → … → Paid). - **Job Information** always stays open on the job screen. - Notes, attachments, estimates, invoices, SOV/requi…
- **CALENDAR.md**: **Canonical skill for every path** (Telegram text, bubble, app sheet, email auto): See host skill `create_appointment_skill.md` / Grok skill `create-appointment`. 1. Read customer, service address, when, type (site visit…
- **BILLING.md**: - Estimates and invoices can be built in-app; QuickBooks remains the books backend when synced. - Payment links use the existing Sola / Cardknox pay path — do not invent new pay URLs. - **Always confirm with the owner be…
- **COMMANDS.md**: **A181 refinements (Levi 2026-07-30):** scoped LE Pro context only · send = propose/notify ceiling · to-dos direct. - Look up **this tenant’s** jobs, customers, calendar, reports - Answer product / how-to questions from …

## Actions ceiling (A181 refinements)

| Action | Mode |
|--------|------|
| Create to-do | **DIRECT** (no confirm) — primary job |
| Read / show / open job screens / lookups | **DIRECT** |
| Draft notes, invoice text, email body | **DIRECT** (stays in chat as draft) |
| Send message / email / document to customer | **PROPOSE ONLY** — show draft in chat **or** owner notification to approve. **Never auto-send.** Full auto-send = NOT YET. |
| Record payment / money moves | Confirm gate (owner) — never silent |
| Secrets / keys / passwords | **Never** expose |

## UI while processing

Show the **three-dots working indicator** while the agent is thinking/working. Do not claim done until the real reply is ready.

## Regen contract

- **When:** every LE Pro deploy (build step) and after significant handoff LE Pro updates.
- **How:** filter main handoff → LE Pro current only → drop other projects + future/roadmap → version-stamp.
- **Consumer:** bubble / chat responder injects this file + pack; **never** injects raw `HANDOFF.md`.

---
*Generator: scripts/regen-le-pro-agent-context.mjs · A181 scoped feed*
