#!/usr/bin/env node
/**
 * Backfill change-order metadata from QuickBooks local export + live jobs.
 *
 * - Detects "Change order…" line items on QBO invoices
 * - Tags pure-CO invoices as changeOrder jobs
 * - Stores changeOrderLines on mixed project invoices
 * - Sequences Change Order 1, 2, … per customer + service address
 *
 * Usage: node scripts/backfillChangeOrders.mjs [--dry-run]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry-run");
const STORE = "https://leelectrical.us/.netlify/functions/jobsdata";
const STATE = "https://leelectrical.us/.netlify/functions/state";
const INVOICES = path.join(
  process.env.HOME || "",
  ".hermes/shared/le_local_db/invoices.json"
);

const CO_LINE_RE =
  /^\s*change\s*ord(?:er|ers)?\b|change\s*order\s*(?:for|:)|change\s*over\b/i;

function parseAmt(v) {
  const n = parseFloat(String(v ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function normAddr(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function extractCoLines(lines) {
  const out = [];
  let seq = 0;
  (lines || []).forEach((ln, idx) => {
    const desc = String(ln.description || ln.item || "").trim();
    if (!CO_LINE_RE.test(desc)) return;
    if (/including all the change orders/i.test(desc)) return;
    seq += 1;
    out.push({
      description: desc,
      itemName: ln.item || ln.itemName || "",
      amount: parseAmt(ln.amount),
      qty: ln.qty != null ? ln.qty : 1,
      unitPrice: ln.unitPrice,
      changeOrderSeq: seq,
      _idx: idx,
    });
  });
  return out;
}

function isPureCo(lines, total, coLines) {
  if (!coLines.length) return false;
  const coSum = coLines.reduce((s, l) => s + parseAmt(l.amount), 0);
  const t = parseAmt(total);
  if (t <= 0) return coLines.length === (lines || []).length && coLines.length > 0;
  return coSum >= t * 0.85;
}

async function fetchJson(url) {
  const res = await fetch(url + (url.includes("?") ? "&" : "?") + "cb=" + Date.now());
  if (!res.ok) throw new Error("GET " + url + " " + res.status);
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) throw new Error("POST " + url + " " + res.status + " " + text.slice(0, 200));
  return data;
}

async function main() {
  if (!fs.existsSync(INVOICES)) {
    console.error("Missing local invoices export:", INVOICES);
    process.exit(1);
  }
  const invDoc = JSON.parse(fs.readFileSync(INVOICES, "utf8"));
  const invoices = invDoc.records || invDoc || [];
  const byDoc = new Map(invoices.map((i) => [String(i.docNumber), i]));

  const jobsDoc = await fetchJson(STORE);
  const jobs = jobsDoc.jobs || [];
  const jobByInv = new Map();
  for (const j of jobs) {
    if (j.invoiceNo) jobByInv.set(String(j.invoiceNo), j);
  }

  // Group board jobs by customer+address for sequencing pure COs
  const groups = new Map();
  for (const j of jobs) {
    if (j._deleted || j._archived) continue;
    const key =
      String(j.qboCustomerId || j.customer || "") +
      "|" +
      normAddr(j.serviceAddress || j.address);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(j);
  }

  const patches = {}; // jobId -> overlay fields
  let lineJobs = 0;
  let pureTagged = 0;
  let imported = 0;

  // 1) Stamp CO lines / pure tags onto existing board jobs from QBO export
  for (const inv of invoices) {
    const coLines = extractCoLines(inv.lines);
    if (!coLines.length) continue;
    const doc = String(inv.docNumber);
    let job = jobByInv.get(doc);
    const pure = isPureCo(inv.lines, inv.total, coLines);

    if (!job) {
      // Import missing invoices that carry CO line items so they show in the tab
      const id = "qbo-" + doc;
      const bal = parseAmt(inv.balance);
      const total = parseAmt(inv.total);
      const key =
        String(inv.customerQboId || "") + "|" + normAddr(inv.serviceAddress);
      const peers = groups.get(key) || [];
      const source =
        peers.find((p) => !String(p.title || "").match(/change\s*ord/i) && p.invoiceNo !== doc) ||
        peers[0];
      const seq =
        (peers.filter((p) => p.changeOrder || String(p.title || "").match(/change\s*ord/i)).length ||
          0) + 1;
      const label = (source?.invoiceNo || doc) + (pure ? "-CO-" + seq : "");
      const firstLine = (inv.lines || []).find((l) => l.description)?.description || "Electrical work";
      const row = {
        _new: true,
        id,
        customer: inv.customerName || "",
        qboCustomerId: String(inv.customerQboId || ""),
        title: pure
          ? "Change Order " + seq + " · " + (label || doc)
          : String(firstLine).slice(0, 90),
        amount: total ? "$" + total.toLocaleString() : "",
        openBalance: bal ? "$" + bal.toLocaleString() : "$0",
        paid: bal <= 0.01,
        invoiceNo: doc,
        email: inv.email || "",
        address: inv.serviceAddress || "",
        serviceAddress: inv.serviceAddress || "",
        billingAddress: inv.billingAddress || "",
        changeOrderLines: coLines,
        invoiceLines: (inv.lines || []).map((ln) => ({
          description: ln.description || "",
          itemName: ln.item || "",
          amount: parseAmt(ln.amount),
          qty: ln.qty != null ? ln.qty : 1,
          unitPrice: ln.unitPrice,
        })),
        _invoiceConfirmed: true,
        _docEmailed: true,
        notes: bal > 0.01 ? `Open balance $${bal} of $${total} (QBO CO backfill)` : "Paid (QBO CO backfill)",
      };
      if (pure) {
        Object.assign(row, {
          changeOrder: true,
          changeOrderKind: "invoice",
          changeOrderSourceId: source?.id || id,
          changeOrderSeq: seq,
          changeOrderLabel: label || doc + "-CO-" + seq,
        });
      }
      patches[id] = row;
      imported += 1;
      continue;
    }

    const patch = {};
    if (coLines.length) {
      patch.changeOrderLines = coLines;
      // Also seed invoiceLines when missing so expand shows detail
      if (!job.invoiceLines?.length && inv.lines?.length) {
        patch.invoiceLines = inv.lines.map((ln) => ({
          description: ln.description || "",
          itemName: ln.item || "",
          amount: parseAmt(ln.amount),
          qty: ln.qty != null ? ln.qty : 1,
          unitPrice: ln.unitPrice,
        }));
      }
      lineJobs += 1;
    }
    if (pure && !job.changeOrder) {
      const key =
        String(job.qboCustomerId || job.customer || "") +
        "|" +
        normAddr(job.serviceAddress || job.address);
      const peers = (groups.get(key) || []).filter((p) => p.id !== job.id);
      const source = peers.find((p) => !p.changeOrder) || peers[0] || job;
      const seq = 1;
      Object.assign(patch, {
        changeOrder: true,
        changeOrderKind: "invoice",
        changeOrderSourceId: source.id,
        changeOrderSeq: seq,
        changeOrderLabel: (source.invoiceNo || job.invoiceNo || "CO") + "-CO-" + seq,
      });
      pureTagged += 1;
    }
    if (Object.keys(patch).length) {
      patches[job.id] = { ...(patches[job.id] || {}), ...patch };
    }
  }

  // 2) Tag title-based CO jobs already on board (tester leftovers etc.)
  for (const j of jobs) {
    if (j._deleted || j.changeOrder) continue;
    if (!/change\s*ord/i.test(String(j.title || ""))) continue;
    if (patches[j.id]?.changeOrder) continue;
    patches[j.id] = {
      ...(patches[j.id] || {}),
      changeOrder: true,
      changeOrderKind: j.estimateNo && !j.invoiceNo ? "estimate" : "invoice",
      changeOrderSeq: j.changeOrderSeq || 1,
      changeOrderLabel: j.changeOrderLabel || (j.invoiceNo || j.estimateNo || "CO") + "-CO-1",
      changeOrderSourceId: j.changeOrderSourceId || j.id,
    };
    pureTagged += 1;
  }

  console.log(
    JSON.stringify(
      {
        dryRun: DRY,
        invoicesScanned: invoices.length,
        boardJobs: jobs.length,
        patchCount: Object.keys(patches).length,
        lineJobs,
        pureTagged,
        imported,
        sample: Object.entries(patches)
          .slice(0, 8)
          .map(([id, p]) => ({
            id,
            invoiceNo: p.invoiceNo,
            changeOrder: p.changeOrder,
            lines: p.changeOrderLines?.length,
            title: p.title,
          })),
      },
      null,
      2
    )
  );

  if (DRY || !Object.keys(patches).length) {
    console.log(DRY ? "Dry run — no write." : "Nothing to patch.");
    return;
  }

  // Apply via state overlay merge (preserves user edits; jobsdata merge for new imports)
  const newJobs = [];
  const ovPatch = {};
  for (const [id, p] of Object.entries(patches)) {
    if (p._new) {
      newJobs.push(p);
    } else {
      ovPatch[id] = p;
    }
  }

  if (newJobs.length) {
    // Strip _new before merge into jobs base
    const mergeJobs = newJobs.map(({ _new, ...rest }) => rest);
    const r = await postJson(STORE, { op: "merge", jobs: mergeJobs });
    console.log("jobsdata merge", r?.ok !== false ? "ok" : r, "n=", mergeJobs.length);
  }

  if (Object.keys(ovPatch).length) {
    // state.ov always wins at render — same as customer_auto_reconcile
    const state = await fetchJson(STATE);
    const ov = { ...(state.ov || {}) };
    for (const [id, p] of Object.entries(ovPatch)) {
      ov[id] = { ...(ov[id] || {}), ...p };
    }
    const r = await postJson(STATE, { ov });
    console.log("state.ov write", r?.ts ? "ts=" + r.ts : r, "n=", Object.keys(ovPatch).length);
    // Best-effort jobsdata merge so base store also has CO fields
    try {
      const asJobs = Object.entries(ovPatch).map(([id, p]) => ({ id, ...p }));
      await postJson(STORE, { op: "merge", jobs: asJobs });
      console.log("jobsdata merge ok n=", asJobs.length);
    } catch (e) {
      console.warn("jobsdata merge skip", e.message?.slice(0, 100));
    }
  }

  console.log("Backfill complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
