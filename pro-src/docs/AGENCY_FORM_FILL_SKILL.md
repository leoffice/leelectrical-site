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

## Phase 1 (shipped + refined)

1. **Toggle** — `paperwork.coned.enabled` labeled **Con Edison progress**
2. **Fillable form** — big touch targets, step chips, autosave draft on job
3. **Real Form A PDF** — exact BLZ company file `application-for-service.pdf` packaged as `/forms/coned-application-for-service.pdf`
4. **AcroForm fill (page 1 / Part A only)** — `fillConedFormA.js` writes official field names (not a recreated layout)
5. **Part Supply unit guard** — field labeled *Part Supply: Floor/Office #/Apartment #* on Account + Mailing (page 1 ×2); auto-abbrev first pass; second correction left as typed; max 6 chars
6. **Service vs billing** — one-tap “Service address = billing address”; email from contact with override
7. **Submit** — filled official PDF + structured email to **office/contact only** (no Con Ed intake / no portal auto-login)
8. Review copy states **human** Con Ed portal submit

## Phase 2 (PENDING — do not build)

After fill: upload/attach application to the case. **Await Levi walkthrough** of the exact attach flow. NOTE-ONLY until then.

## Source of truth (Dispatch 2026-07-30 correction)

| | |
|---|---|
| Drive | `My Drive/BLZ Electric Inc/Company files/application-for-service.pdf` (office@leelectrical.us) |
| Host | `/Users/levik/Library/CloudStorage/GoogleDrive-office@leelectrical.us/My Drive/BLZ Electric Inc/Company files/application-for-service.pdf` |
| Packaged | `public/forms/coned-application-for-service.pdf` |
| Unit field | AcroForm `Part Supply FloorOffice Apartment` (+ `_2` mailing) — tooltip *Part Supply: Floor/Office #/Apartment #* |

**Not** a web form. **Not** in Letters folder.

## Add a new agency later

1. Copy `conedFormA.js` → `myAgency.js` with new field schema
2. Register in `AGENCY_REGISTRY`
3. Open `AgencyApplicationSheet` with `agencyId="…"`
4. Optionally new entry button on the matching paperwork branch
5. If the agency has an official fillable PDF, add a fill module like `fillConedFormA.js`

## Tests

`test/agencyForms.test.js` + `test/conedUnit.test.js` — schema, progressive disclosure, unit abbrev, real AcroForm fill round-trip, PDF `%PDF`, email body completeness.
