/* Scheduled data-integrity alerter.
 *
 * Read-only. Runs the same invariants as the write gate over the live dataset
 * and emails Levi when anything is non-zero. Added after the 2026-07-20
 * payment↔invoice linkage incident, which sat undetected because nothing ever
 * asserted that job ids and payment ids occupy different namespaces.
 */
import { getStore } from "./lib/storage/index.mjs";
import { auditJobs, formatProblems } from "../../pro-src/src/lib/dataIntegrity.js";
import { PRODUCT_BRAND } from "../../shared/productBrand.mjs";

const KEY = "jobsdata-v1";
const ALERT_TO = process.env.INTEGRITY_ALERT_TO || "6140913@gmail.com";

export default async () => {
  const store = getStore("jobsdata");
  const doc = (await store.get(KEY, { type: "json", consistency: "strong" })) || { jobs: [] };
  const jobs = doc.jobs || [];
  const problems = auditJobs(jobs);

  const summary = {
    checkedAt: new Date().toISOString(),
    jobs: jobs.length,
    problems: problems.length,
    breakdown: formatProblems(problems),
  };

  if (!problems.length) {
    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { "content-type": "application/json" },
    });
  }

  console.error("[integrity-alert] " + problems.length + " problems\n" + summary.breakdown);

  const key = process.env.RESEND_API_KEY;
  if (key) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: `${PRODUCT_BRAND.name} <alerts@leelectrical.us>`,
        to: [ALERT_TO],
        subject: `${PRODUCT_BRAND.name} data-integrity alert — ${problems.length} problems`,
        text:
          `Checked ${jobs.length} jobs at ${summary.checkedAt}\n\n` +
          summary.breakdown +
          `\n\nFirst 20:\n` +
          problems.slice(0, 20).map((p) => JSON.stringify(p)).join("\n"),
      }),
    }).catch((e) => console.error("[integrity-alert] email failed", e));
  }

  return new Response(JSON.stringify({ ok: false, ...summary }), {
    headers: { "content-type": "application/json" },
  });
};

export const config = { schedule: "0 6 * * *" };
