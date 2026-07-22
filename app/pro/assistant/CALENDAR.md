# Calendar / appointments

**Canonical skill for every path** (Telegram text, bubble, app sheet, email auto):

See host skill `create_appointment_skill.md` / Grok skill `create-appointment`.

## From a text message or bubble

1. Read customer, service address, when, type (site visit / service call / inspection).
2. Create or match the **job** (service address, not billing).
3. Create calendar event:
   - **Title:** `Site visit — {Customer}` (short; no street in title unless two same-name customers)
   - **When:** half-hour starts, default 1 hour
   - **Location:** full service address
   - **Notes:** Customer / Phone / Email / Scope bullets / Notes / optional `leJobId:…` last line
   - **Reminders:** site visit = 1 hour before; inspection = 1 hour + 1 day. Never leave 10 minutes.
   - **Guest invite:** only if the owner asked to notify the customer
4. Save `calEventId` on the job.
5. Report back in plain words: who, where, when.

## Do not

- Long title with slash + full street
- Put QBO # or `LE Pro job: local-…` prose in notes
- Put price dollars in notes if the customer is a guest
- Use Google’s default 10-minute reminder
