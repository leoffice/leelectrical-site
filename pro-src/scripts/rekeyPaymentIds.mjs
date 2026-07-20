#!/usr/bin/env node
/* Re-key colliding QBO payment ids and stamp the invoice back-reference.
 *
 * Incident 2026-07-20: payment ids were written as "qbo-" + paymentId, the same
 * namespace as job ids ("qbo-" + invoice DocNumber), so payments resolve to
 * unrelated invoices. This moves them to "qbopay-" + paymentId and stamps
 * invoiceNo + jobId from the job each payment is already nested under (that
 * nesting was never corrupted, so it is the trustworthy source of truth).
 *
 * DRY RUN BY DEFAULT. Writes nothing without --apply, and --apply is gated on
 * an explicit confirmation phrase. Never deletes: uses op:"merge".
 *
 *   node pro-src/scripts/rekeyPaymentIds.mjs                 # dry run + report
 *   node pro-src/scripts/rekeyPaymentIds.mjs --out report.json
 *   node pro-src/scripts/rekeyPaymentIds.mjs --apply --i-have-levis-approval
 */

import { writeFileSync } from "node:fs";

const BASE = "https://leelectrical.us/.netlify/functions";
const PAY_NS = "qbopay-";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : null;
};

const APPLY = has("--apply");
const APPROVED = has("--i-have-levis-approval");

if (APPLY && !APPROVED) {
  console.error("Refusing to apply: --apply requires --i-have-levis-approval.");
  process.exit(2);
}

const isJobNs = (id) => /^qbo-/.test(String(id || ""));

function qboPaymentIdOf(p) {
  const explicit = String(p?.qboPaymentId || "").trim();
  if (explicit) return explicit;
  const id = String(p?.id || "").trim();
  if (id.startsWith(PAY_NS)) return id.slice(PAY_NS.length);
  if (/^qbo-\d+$/.test(id)) return id.slice(4);
  return "";
}

function canonicalId(p) {
  const id = String(p?.id || "").trim();
  if (id.startsWith("sola-")) return id;
  const qid = qboPaymentIdOf(p);
  if (qid) return PAY_NS + qid;
  const ref = String(p?.ref || "").trim();
  if (ref) return PAY_NS + "ref-" + ref;
  return id;
}

async function main() {
  const res = await fetch(`${BASE}/jobsdata?cb=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`jobsdata: HTTP ${res.status}`);
  const doc = await res.json();
  const jobs = doc.jobs || [];
  const jobIds = new Set(jobs.map((j) => j.id));

  const changes = [];
  const patched = [];

  for (const job of jobs) {
    const payments = Array.isArray(job.payments) ? job.payments : [];
    if (!payments.length) continue;

    let touched = false;
    const next = payments.map((p) => {
      const newId = canonicalId(p);
      const idChanged = newId !== p.id;
      const needsInvoice = !p.invoiceNo && job.invoiceNo;
      const needsJobId = !p.jobId;
      if (!idChanged && !needsInvoice && !needsJobId) return p;

      touched = true;
      changes.push({
        hostJobId: job.id,
        hostInvoiceNo: job.invoiceNo || "",
        hostCustomer: job.customer || "",
        amount: p.amount,
        date: p.date,
        oldId: p.id,
        newId,
        // The heart of the bug: the old id pointed at a real but unrelated job.
        collidedWithUnrelatedJob: idChanged && isJobNs(p.id) && jobIds.has(p.id) && p.id !== job.id
          ? p.id
          : null,
        stampedInvoiceNo: needsInvoice ? job.invoiceNo : null,
        stampedJobId: needsJobId ? job.id : null,
      });

      return {
        ...p,
        id: newId,
        qboPaymentId: qboPaymentIdOf(p) || p.qboPaymentId || "",
        invoiceNo: p.invoiceNo || job.invoiceNo || "",
        jobId: p.jobId || job.id,
      };
    });

    if (touched) patched.push({ id: job.id, payments: next });
  }

  const collisions = changes.filter((c) => c.collidedWithUnrelatedJob);

  console.log("=".repeat(72));
  console.log(APPLY ? "APPLY MODE" : "DRY RUN — nothing will be written");
  console.log("=".repeat(72));
  console.log(`jobs scanned .................. ${jobs.length}`);
  console.log(`jobs with payments to patch ... ${patched.length}`);
  console.log(`payment records changed ....... ${changes.length}`);
  console.log(`  ...that collided with an unrelated invoice: ${collisions.length}`);
  console.log(`  ...id re-keyed .............. ${changes.filter((c) => c.oldId !== c.newId).length}`);
  console.log(`  ...invoiceNo stamped ........ ${changes.filter((c) => c.stampedInvoiceNo).length}`);
  console.log(`  ...jobId stamped ............ ${changes.filter((c) => c.stampedJobId).length}`);
  console.log("");
  console.log("Sample of collision repairs (payment → its TRUE invoice):");
  for (const c of collisions.slice(0, 20)) {
    console.log(
      `  ${c.oldId} → ${c.newId}  ${String(c.amount).padStart(9)}  ${c.date}\n` +
      `      belongs to inv ${c.hostInvoiceNo} (${c.hostCustomer})\n` +
      `      old id pointed at unrelated job ${c.collidedWithUnrelatedJob}`
    );
  }

  const out = valOf("--out");
  if (out) {
    writeFileSync(out, JSON.stringify({ generatedFrom: BASE, changes, patched }, null, 2));
    console.log(`\nFull report written to ${out}`);
  }

  if (!APPLY) {
    console.log("\nDry run complete. Re-run with --apply --i-have-levis-approval to write.");
    return;
  }

  // Backup first. jobsdata.mjs rotates a backup on every write, but take an
  // explicit local snapshot too so rollback never depends on the server.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `jobsdata-backup-${stamp}.json`;
  writeFileSync(backup, JSON.stringify(doc, null, 2));
  console.log(`\nLocal backup written to ${backup}`);

  // Non-destructive: merge upserts by id and never deletes.
  const post = await fetch(`${BASE}/jobsdata`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "merge", jobs: patched }),
  });
  if (!post.ok) throw new Error(`apply: HTTP ${post.status}`);
  console.log(`Applied ${patched.length} job patches via op:"merge".`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
