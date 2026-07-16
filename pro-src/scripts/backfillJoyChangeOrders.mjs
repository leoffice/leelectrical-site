#!/usr/bin/env node
/**
 * Tag Joy Construction invoices that have the QuickBooks "CO / PI" custom field
 * as change-order jobs on the board, linked to the Baez Place project address.
 *
 * Source of truth: live QBO (CustomerRef 1255) — not the local export (which
 * historically dropped the CO / PI field).
 *
 * Usage: node scripts/backfillJoyChangeOrders.mjs [--dry-run]
 *        JOY_CO_JSON=/tmp/joy_co_patches.json node scripts/backfillJoyChangeOrders.mjs
 *
 * Does NOT roll CO $ into project.changeOrders (progress apps stay at contract only).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry-run");
const STORE = "https://leelectrical.us/.netlify/functions/jobsdata";
const STATE = "https://leelectrical.us/.netlify/functions/state";
const PROJECT_ID = "proj-baez-place";
const SOURCE_JOB_ID = "qbo-251747"; // Baez linked job
const JOY_CUSTOMER = "Joy Construction Corp.";
const JOY_QBO_CUST = "1255";

function parseAmt(v) {
  const n = parseFloat(String(v ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function fmt$(n) {
  const v = parseAmt(n);
  if (!v) return "$0";
  return "$" + v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function firstDesc(lines) {
  for (const ln of lines || []) {
    const d = String(ln.description || "").trim();
    if (d) return d.length > 90 ? d.slice(0, 87) + "…" : d;
  }
  return "Change order";
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

/** Load CO rows from JSON file or re-pull via Python QBO client. */
function loadCos() {
  const fromEnv = process.env.JOY_CO_JSON;
  const candidates = [
    fromEnv,
    "/tmp/joy_co_patches.json",
    path.join(__dirname, "joy_co_patches.json"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const rows = JSON.parse(fs.readFileSync(p, "utf8"));
      if (Array.isArray(rows) && rows.length) return rows;
    }
  }
  // Fallback: invoke Python helper
  const py = `
import json, sys, os, urllib.parse
sys.path.insert(0, os.path.expanduser("~/.hermes/qbo_app"))
from qbo_app import QBOClient
import re
c = QBOClient()
all_inv, start = [], 1
while True:
    q = f"select * from Invoice where CustomerRef = '1255' STARTPOSITION {start} MAXRESULTS 100"
    res = c.api_request("GET", "query?query=%s" % urllib.parse.quote(q))
    rows = (res.get("QueryResponse") or {}).get("Invoice") or []
    if not rows: break
    all_inv.extend(rows)
    if len(rows) < 100: break
    start += len(rows)

def co_pi(inv):
    for cf in inv.get("CustomField") or []:
        name = (cf.get("Name") or "").strip().lower()
        if "co" in name and "pi" in name:
            return (cf.get("StringValue") or "").strip()
    return ""

def parse_seq(val):
    m = re.match(r"^\\s*0*(\\d+)", val or "")
    return int(m.group(1)) if m else 0

def lines_of(inv):
    out = []
    for line in inv.get("Line") or []:
        det = line.get("SalesItemLineDetail") or {}
        item = det.get("ItemRef") or {}
        if not item.get("name") and not line.get("Description"): continue
        out.append({
            "description": (line.get("Description") or "").strip(),
            "itemName": item.get("name") or "",
            "amount": float(line.get("Amount") or 0),
            "qty": float(det.get("Qty") or 1),
            "unitPrice": float(det.get("UnitPrice") or 0),
        })
    return out

cos = []
for inv in all_inv:
    val = co_pi(inv)
    if not val: continue
    doc = str(inv.get("DocNumber") or "")
    cos.append({
        "doc": doc, "id": "qbo-" + doc, "qboId": inv.get("Id"),
        "seq": parse_seq(val), "coPi": val,
        "total": float(inv.get("TotalAmt") or 0),
        "balance": float(inv.get("Balance") or 0),
        "date": inv.get("TxnDate"),
        "lines": lines_of(inv),
        "svc": next(((cf.get("StringValue") or "").strip() for cf in (inv.get("CustomField") or [])
                    if (cf.get("Name") or "").strip().lower()=="service address"), ""),
    })
cos.sort(key=lambda x: x["seq"] or 999)
print(json.dumps(cos))
`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    throw new Error("QBO pull failed");
  }
  return JSON.parse(r.stdout);
}

async function main() {
  const cos = loadCos();
  if (!cos.length) {
    console.error("No Joy CO / PI invoices found");
    process.exit(1);
  }

  const jobsDoc = await fetchJson(STORE);
  const jobs = jobsDoc.jobs || [];
  const byId = new Map(jobs.map((j) => [j.id, j]));

  const patches = {};
  const coList = [];

  for (const co of cos) {
    const id = co.id || "qbo-" + co.doc;
    const existing = byId.get(id);
    const seq = Number(co.seq) || 1;
    const label = `CO-${String(seq).padStart(2, "0")}`;
    const total = parseAmt(co.total);
    const bal = parseAmt(co.balance);
    const lines = co.lines || [];
    const title = `Change Order ${seq} · Inv ${co.doc} — ${firstDesc(lines)}`;

    const patch = {
      changeOrder: true,
      changeOrderKind: "invoice",
      changeOrderSourceId: SOURCE_JOB_ID,
      changeOrderSeq: seq,
      changeOrderLabel: label,
      qboCoPi: co.coPi || String(seq).padStart(2, "0"),
      invoiceNo: String(co.doc),
      customer: existing?.customer || JOY_CUSTOMER,
      qboCustomerId: existing?.qboCustomerId || JOY_QBO_CUST,
      serviceAddress: existing?.serviceAddress || co.svc || "334 E 176th ST",
      address: existing?.address || co.svc || "334 E 176th ST",
      amount: fmt$(total),
      openBalance: fmt$(bal),
      paid: bal <= 0.01,
      invoiceLines: lines.length ? lines : existing?.invoiceLines,
      title: existing?.title?.startsWith("Change Order") ? existing.title : title,
      _invoiceConfirmed: true,
      _docEmailed: true,
    };

    if (!existing) {
      patches[id] = {
        _new: true,
        id,
        email: "",
        phone: "",
        estimateNo: "",
        notes: bal > 0.01 ? `Open balance ${fmt$(bal)} of ${fmt$(total)} (Joy CO / PI backfill)` : "Paid (Joy CO / PI backfill)",
        attachments: [],
        status: {
          Lead: { s: "done" },
          "Site Visit": { s: "skipped" },
          Estimate: { s: "done" },
          Accepted: { s: "done" },
          Invoiced: { s: "done", d: co.date || "" },
          "Deposit Receipt": { s: "skipped" },
          Paperwork: { s: "skipped" },
          Scheduled: { s: "skipped" },
          Done: { s: "" },
          "Follow-up": { s: "" },
          Paid: { s: bal <= 0.01 ? "done" : "" },
        },
        ...patch,
      };
    } else {
      patches[id] = patch;
    }

    coList.push({
      id: `qbo-co-${co.doc}`,
      jobId: id,
      invoiceNo: String(co.doc),
      description: firstDesc(lines),
      amount: total,
      date: co.date || "",
      seq,
      coPi: co.coPi,
      // Reference only — do not feed G702 contract sum
      attachOnly: true,
    });
  }

  console.log(
    JSON.stringify(
      {
        dryRun: DRY,
        coCount: cos.length,
        total: cos.reduce((s, c) => s + parseAmt(c.total), 0),
        sample: cos.map((c) => ({
          doc: c.doc,
          seq: c.seq,
          coPi: c.coPi,
          total: c.total,
        })),
      },
      null,
      2
    )
  );

  if (DRY) {
    console.log("Dry run — no write.");
    return;
  }

  const newJobs = [];
  const ovPatch = {};
  for (const [id, p] of Object.entries(patches)) {
    if (p._new) newJobs.push(p);
    else ovPatch[id] = p;
  }

  if (newJobs.length) {
    const mergeJobs = newJobs.map(({ _new, ...rest }) => rest);
    const r = await postJson(STORE, { op: "merge", jobs: mergeJobs });
    console.log("jobsdata merge new", r?.ok !== false ? "ok" : r, "n=", mergeJobs.length);
  }

  // state overlay for CO tags + project changeOrderList (attach-only reference)
  const state = await fetchJson(STATE);
  const ov = { ...(state.ov || {}) };
  for (const [id, p] of Object.entries(ovPatch)) {
    ov[id] = { ...(ov[id] || {}), ...p };
  }

  const projects = { ...(ov._projects || {}), list: [...(ov._projects?.list || [])] };
  const idx = projects.list.findIndex((p) => p.id === PROJECT_ID);
  if (idx >= 0) {
    const prev = projects.list[idx];
    projects.list[idx] = {
      ...prev,
      // Keep G702 contract math clean — COs are attachable invoices, not net change
      changeOrders: 0,
      changeOrderList: coList,
      updatedAt: Date.now(),
    };
    console.log("project", PROJECT_ID, "changeOrderList n=", coList.length, "(changeOrders still 0)");
  } else {
    console.warn("project", PROJECT_ID, "not found — job tags only");
  }
  ov._projects = projects;

  const r = await postJson(STATE, { ov });
  console.log("state.ov write", r?.ts ? "ts=" + r.ts : r);

  try {
    const asJobs = Object.entries(ovPatch).map(([id, p]) => ({ id, ...p }));
    if (asJobs.length) {
      await postJson(STORE, { op: "merge", jobs: asJobs });
      console.log("jobsdata merge tags ok n=", asJobs.length);
    }
  } catch (e) {
    console.warn("jobsdata merge skip", e.message?.slice(0, 120));
  }

  console.log("Joy CO backfill complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
