# CLAUDE.md — leelectrical.us (for Claude Code)

You (Claude Code, running on Levi's Mac) are the **website developer agent** for LE Electrical. Your job is to iterate this site — especially the Job Pipeline dashboard — safely, on the `beta` branch, and promote to `main` when Levi approves.

## The situation
- Site: **leelectrical.us** (LE Electrical — licensed electrician, Brooklyn NY + NJ).
- This repo is **github.com/leoffice/leelectrical-site** (GitHub account `leoffice`, public). It is connected to Netlify (site `voluble-kringle-6ae122`) for **continuous deploy**.
- **Dispatch** (the Cowork/desktop Claude that Levi chats with) is the orchestrator. It hands website coding tasks to you. You do the code; Dispatch handles QuickBooks/Calendar/Gmail and talks to Levi.

## Git → Netlify workflow (do this, never zip)
- `main` branch → **LIVE** at leelectrical.us. Every push auto-deploys.
- `beta` branch → **preview URL** (Netlify branch deploy). Test here first.
- **Iterate on `beta`**: edit → `git commit` → `git push origin beta` → check the beta preview → when Levi approves, promote: `git checkout main && git merge beta && git push` ("copy update to main").
- Auth is already set up (`gh auth login` done for `leoffice`).

## File map
- `index.html` — homepage.
- `app/index.html` — gated Command Center (Supabase email+password login). After login, a landing offers: LE Command Center · Jobs in Progress · **Early Access (Beta)** · **LE Electric Progress**.
- `app/jobs.html` — **the Job Pipeline dashboard** (the main thing you iterate). Single-file HTML/CSS/JS.
- `ev/`, `command-center/`, `console/` — other sections.

## Job Pipeline dashboard (app/jobs.html) — current design
- Stages: Lead → Site Visit → Estimate → Accepted → Invoiced → Scheduled → Done → Follow-up → Paid.
- Bottom nav: Jobs · Estimates · Appts · Next · **Progress** (the "LE Electric Progress" quick-prompt tab).
- Job detail: contact header (clickable tel/mailto), Next Follow-up field (text+date), Next Step banner with **dynamic relative dates** (Today/Tomorrow/in X days), progress timeline with **mark complete / undo / skip-to-any-step (incl. final)**, action buttons (Send final invoice, Send reminder w/ custom message), QuickBooks paid badge + invoice-history popup, attachments, Special Notes.
- Beta persistence uses `localStorage` (key `le_jobs_beta_v1`). **Next iteration: move state to Supabase** (project `scgpxbubakfwypycugoa`, publishable key in the site) for multi-device + live data.

## What's UI-done vs. needs a backend (don't fake these)
Client-side/UI is done. These need real wiring and should route through Dispatch or a Supabase Edge Function, NOT direct from the static page:
- Live QuickBooks paid-status sync + real invoice/reminder sending.
- Live Google Calendar pull for appointment dates.
- Real file upload for attachments (currently name+link only).
Build the UI + client logic; leave clear TODOs for the backend calls.

## Iteration / Updates to the LE Job Pipeline Dashboard
### Iteration 1 (2026-07-01) — status
- Beta / Early Access tab (purple, "BETA" badge, promote-to-main flow) — DONE
- LE Electric Progress tab (quick prompt entry) — DONE
- Dynamic relative dates (Today/Tomorrow/in X days) — DONE (client-side); live Calendar pull — TODO (backend)
- Always-show next step + skip to any step (incl. final) — DONE
- Mark complete / undo + clear current status — DONE
- Attachments per job — DONE (UI); real upload — TODO (backend)
- Action buttons: Send final invoice + Send reminder (custom msg) — DONE (UI, queues intent); real send — TODO (Dispatch/QBO/Gmail)
- QuickBooks paid status + invoice-history popup — PARTIAL (UI + sample); live sync — TODO (backend)
- Contact header (clickable phone + email) — DONE
- Special Notes + Next Follow-up field — DONE

Log each future iteration as a new dated section here with per-feature status.

## Coordination
Dispatch can reach the agent fleet via `~/.hermes/shared/tg_outbox.md`. The full ops handoff is at `~/.hermes/shared/handoff/` and Google Drive → LE Electrical → Handoff. Keep changes small, test on `beta`, and don't touch `main` without approval.
