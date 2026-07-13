import handler from "../../../netlify/functions/docs-cleanup.mjs";
import { toPagesFunction } from "../../../netlify/functions/lib/pagesAdapter.mjs";

// Netlify ran this nightly via `[functions."docs-cleanup"] schedule = "@daily"`.
// Cloudflare Pages projects don't support Cron Triggers directly (that's a
// Workers-only feature) -- wired here as a manually/externally-invokable
// endpoint. Automatic nightly scheduling needs a follow-up decision (see
// Phase 2 batch 4 notes): a companion cron Worker, or an external pinger.
export const onRequest = toPagesFunction(handler);
