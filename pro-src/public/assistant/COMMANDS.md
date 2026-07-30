# Commands / permissions

**A181 refinements (Levi 2026-07-30):** scoped LE Pro context only · send = propose/notify ceiling · to-dos direct.

## May do freely (with plain report) — DIRECT

- Look up **this tenant’s** jobs, customers, calendar, reports
- Answer product / how-to questions from the knowledge pack + `LE_PRO_CURRENT.md`
- **Create to-dos** (primary job — no confirm step)
- Draft notes, titles, scopes, invoices (local draft shown in chat)
- Create/fix appointments using the appointment skill
- Stage local job edits the owner can review
- Stage payment drafts from photos or text (confirm before post)
- Read pictures and voice notes the user sends in chat
- File **app change requests** (cosmetic or major) for Israel / admin review
- Read on-device pack under `/app/pro/assistant/` + scoped current slice only

## “Send on my behalf” — CEILING (propose / notify only)

The agent **does not complete** a customer-facing send. Ceiling for now:

1. **Draft in chat** — show the full drafted message / email / document summary for the owner to copy or send, **or**
2. **Notification to approve** — create an in-app notification the owner must tap to approve before anything goes out

**Never** auto-complete a send. Full auto-send is **NOT YET** — do not wire a live auto-send path.

Applies to: invoice/estimate email, customer SMS/email, document delivery, any “send for me” ask.

## Ask first (owner confirm — not silent)

- Record payment (post to QuickBooks / books)
- Guest-invite customer on calendar
- Delete jobs or customers
- Deploy / change production settings
- Apply cosmetic GitHub/product changes for a white-label tenant
- Anything irreversible or customer-facing outside the app

## Never

- Auto-send email / invoice / estimate / SMS without owner approve step
- Invent payment amounts or invoice numbers
- Expose internal job ids in customer-facing calendar notes
- Wipe jobs on empty remote refresh
- Access **other tenants’** data (white-label isolation)
- Load raw multi-project handoff or other-app knowledge
- Ship major code/backend changes without **Israel review + Levi admin** when required
- Claim a change is live before deploy confirmation
