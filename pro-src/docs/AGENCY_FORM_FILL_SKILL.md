# Agency form-fill skill (reusable)

**Purpose:** Generate and handle fillable agency applications inside LE Pro. First agency = **Con Edison Form A — Application for Service**. Same engine powers future agencies (DOB, National Grid, etc.).

## Concept

An **agency** is a config:

| Piece | Meaning |
|-------|---------|
| `id` | Stable key (`coned-form-a`) |
| `formTitle` / `label` | Human title |
| `submitEmailDefault` | Where completed apps email on submit |
| `steps[]` | Progressive screens (Part A–E style) |
| `fields[]` | Schema: type, required, progressive `when(answers)` |
| `seedFromJob(job)` | Prefill from job/customer |

## Code map (LE Pro)

| Path | Role |
|------|------|
| `src/lib/agencyForms/engine.js` | Validation, visibility, email HTML/text, drafts |
| `src/lib/agencyForms/conedFormA.js` | Con Ed Form A config + registry |
| `src/lib/agencyForms/applicationPdf.js` | Client PDF of full application |
| `src/lib/agencyForms/index.js` | Public exports |
| `src/components/AgencyApplicationSheet.jsx` | Multi-step mobile/desktop UI |
| Job detail → Paperwork → **Con Edison progress** ON → **Fill Con Ed application** | Entry point |
| `send-doc-email` kind `application` | Server email of full HTML + PDF |

## Phase 1 (shipped)

1. **Toggle** — `paperwork.coned.enabled` labeled **Con Edison progress**
2. **Fillable form** — big touch targets, step chips, autosave draft on job
3. **Submit** — PDF + structured email of every filled field
4. **Default destination** — `office@leelectrical.us` until Levi confirms Con Ed intake address

## Phase 2 (PENDING — do not build)

After fill: upload/attach application to the case. **Await Levi walkthrough** of the exact attach flow.

## Add a new agency later

1. Copy `conedFormA.js` → `myAgency.js` with new field schema
2. Register in `AGENCY_REGISTRY`
3. Open `AgencyApplicationSheet` with `agencyId="…"`
4. Optionally new entry button on the matching paperwork branch

## Need from Levi (non-blocking)

- (a) Confirm Form A is the right Con Ed application (or drop exact PDF/field list)
- (b) Destination email(s) for completed applications (Con Ed intake and/or LE office)

## Tests

`test/agencyForms.test.js` — schema, progressive disclosure, PDF `%PDF`, email body completeness.
