# LE Electrical — leelectrical.us

Static site. Deployed via Netlify continuous deploy.

- `index.html` — homepage
- `app/index.html` — gated Command Center (Supabase email+password login)
- `app/jobs.html` — LE Electric Jobs in Progress dashboard (opened from the "Jobs in Progress" tab)
- `ev/`, `command-center/`, `console/` — other sections

## Workflow
- Edit files, commit, push to `main` → Netlify auto-deploys to live.
- Push to `beta` branch → Netlify branch-deploy preview URL for testing.
- When beta looks good, merge `beta` → `main` to promote to live.
