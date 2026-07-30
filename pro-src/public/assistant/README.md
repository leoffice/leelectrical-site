# LE Pro assistant knowledge pack

Local files any AI agent (ours or a tenant’s) should load before operating this product.
Live path: `/app/pro/assistant/`

| File | What |
|------|------|
| COMPANY.md | Who we are, area, tone |
| SCOPE.md | White-label isolation, change requests, cosmetic vs major |
| NAVIGATION.md | Tabs and main screens |
| CALENDAR.md | How to book appointments |
| JOBS.md | Jobs, stages, job detail rules |
| BILLING.md | Estimates, invoices, payments (confirm-first) |
| COMMANDS.md | Allowed actions vs ask-first / send ceiling |
| **LE_PRO_CURRENT.md** | **Scoped current-state only** (auto-regen on deploy) — agent loads this, **not** raw HANDOFF |
| LAYOUT.json | Machine map of routes / APIs + context stamp |

**A181:** Agent knowledge = pack + `LE_PRO_CURRENT.md` only. Regen: `npm run regen-agent-context` (also runs on `npm run build`).

Roadmap: `~/.hermes/shared/handoff/AI_ASSISTANT_ROADMAP.md`
