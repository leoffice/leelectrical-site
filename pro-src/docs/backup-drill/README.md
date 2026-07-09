# #37 Backup + restore drill

## What this proves
1. Nightly backup (`~/.hermes/shared/lepro_backup.sh`) captures live Netlify stores.
2. One store can be copied to Google Drive (`Claude-Workflow/Handoff/`).
3. That store can be restored from the Drive file via POST to the matching function.

## Run (safe)
From `pro-src/`:

```bash
node scripts/backup-restore-drill.mjs --store state
# or
node scripts/backup-restore-drill.mjs --store jobsdata
node scripts/backup-restore-drill.mjs --dry-run
```

Default restore posts the same snapshot just taken (no intentional data loss).

## Unit proof
`npm test -- --run test/backup.restore.test.js` — in-memory rotate + Drive-file restore.

## Live report
See `DRILL_REPORT.json` after a successful run.
