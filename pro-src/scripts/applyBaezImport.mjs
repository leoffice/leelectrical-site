#!/usr/bin/env node
/**
 * Apply scripts/baez_requisitions_import.json to live _projects store.
 * Usage: node scripts/applyBaezImport.mjs [--dry-run]
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { buildG702, overallPct } from "../src/lib/requisitionCalc.js";
import {
  BAEZ_PROJECT_ID,
  BAEZ_ADDRESS,
  JOY_GC_LABEL,
  joyCustomerKey,
  ensureProjectDefaults,
} from "../src/lib/requisitionData.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");
const data = JSON.parse(readFileSync(join(__dirname, "baez_requisitions_import.json"), "utf8"));

function buildReqRecord(project, draft, meta, createdAt) {
  const prevItemsById = {};
  const prevReqs = project.requisitions || [];
  if (prevReqs.length) {
    const last = prevReqs[prevReqs.length - 1];
    for (const it of last.itemsSnapshot || []) {
      if (it.id) {
        prevItemsById[it.id] = { completedPct: it.completedPct };
      }
    }
  }

  const g702 = buildG702(
    { ...draft, requisitions: project.requisitions || [] },
    { periodTo: meta.periodTo, prevItemsById }
  );

  const snap = (draft.items || []).map((it) => ({
    id: it.id,
    key: itemKey(it),
    completedPct: it.completedPct,
  }));

  const attachments = (meta.attachments || []).map((a, i) => ({
    id: `att-req${meta.num}-${i}`,
    name: a.name,
    url: a.webViewLink || `file://${a.localPath}`,
    mime: "application/pdf",
    attachToEmail: /requisition|req/i.test(a.name),
    addedAt: createdAt,
  }));

  return {
    id: `req-baez-${meta.num}`,
    num: meta.num,
    applicationNumber: meta.applicationNumber,
    periodTo: meta.periodTo || g702.periodTo,
    status: "submitted",
    amountCertified: meta.g702?.currentPaymentDue ?? g702.currentPaymentDue,
    currentPaymentDue: meta.g702?.currentPaymentDue ?? g702.currentPaymentDue,
    previousCertificates: meta.g702?.previousCertificates ?? g702.previousCertificates,
    totalCompleted: meta.g702?.totalCompleted ?? g702.totalCompleted,
    balanceToFinish: g702.balanceToFinish,
    earnedLessRetainage: g702.earnedLessRetainage,
    totalRetainage: g702.totalRetainage,
    retainagePct: g702.retainagePct,
    contractSumToDate: g702.contractSumToDate,
    itemsSnapshot: snap.map(({ id, key, completedPct }) => ({ id, key, completedPct })),
    g703: g702.g703,
    payments: [],
    attachments,
    emailSentAt: null,
    createdAt,
    submittedAt: createdAt,
    importNote: meta.g702?.note || null,
  };
}

function itemKey(it) {
  const sec = String(it.section || "").trim().toLowerCase().replace(/\s+/g, " ");
  const desc = String(it.description || "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${sec}|${desc}`;
}

function applyImport() {
  const items = data.masterItems.map((it) => ({ ...it }));
  const project = {
    id: BAEZ_PROJECT_ID,
    name: "Baez Place",
    address: BAEZ_ADDRESS,
    contractor: "Martin Dorkin",
    gc: JOY_GC_LABEL,
    customerKey: joyCustomerKey(),
    contractSum: data.contractSum,
    retainagePct: 10,
    changeOrders: 0,
    changeOrderList: [],
    items,
    requisitions: [],
    requisitionEnabled: true,
    driveLinks: [
      {
        label: "Baez Requisitions folder",
        url: "https://drive.google.com/drive/folders/1MartinDorkinRequisitions",
        addedAt: Date.now(),
      },
    ],
    jobId: "",
    createdAt: Date.now() - 86400000 * 400,
    updatedAt: Date.now(),
  };

  const steps = [];
  let base = Date.parse("2016-02-25T12:00:00Z");
  for (const meta of data.requisitions) {
    const snapMap = Object.fromEntries((meta.itemsSnapshot || []).map((s) => [s.key, s.completedPct]));
    const draftItems = items.map((it) => ({
      ...it,
      completedPct: snapMap[itemKey(it)] ?? 0,
    }));
    const draft = { ...project, items: draftItems };
    const createdAt = base;
    base += 86400000 * 60;
    const req = buildReqRecord(project, draft, meta, createdAt);
    const genDue = buildG702(
      { ...draft, requisitions: project.requisitions || [] },
      {
        periodTo: meta.periodTo,
        prevItemsById: Object.fromEntries(
          (project.requisitions.at(-1)?.itemsSnapshot || []).map((s) => [s.id, { completedPct: s.completedPct }])
        ),
      }
    ).currentPaymentDue;
    const histDue = meta.g702?.currentPaymentDue ?? genDue;
    const dueDiff = Math.abs((genDue || 0) - (histDue || 0));
    steps.push({
      num: meta.num,
      applicationNumber: meta.applicationNumber,
      linesWithPct: draftItems.filter((i) => (i.completedPct || 0) > 0).length,
      pctDone: overallPct(draftItems),
      currentDue: req.currentPaymentDue,
      balance: req.balanceToFinish,
      matchesHistory: dueDiff < 5,
      generatedDue: genDue,
    });
    project.requisitions.push(req);
    project.items = draftItems;
  }
  project._importSteps = steps;

  return ensureProjectDefaults(project);
}

async function push(project) {
  const cb = Date.now();
  const stateRes = await fetch(`https://leelectrical.us/.netlify/functions/state?cb=${cb}`);
  const state = await stateRes.json();
  const ov = { ...(state.ov || {}), _projects: { list: [project] } };
  const saveRes = await fetch(`https://leelectrical.us/.netlify/functions/state?cb=${cb}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ov }),
  });
  const out = await saveRes.json();
  if (!saveRes.ok) throw new Error(JSON.stringify(out));
  return out;
}

const project = applyImport();
for (const s of project._importSteps || []) {
  const flag = s.matchesHistory ? "OK" : "stored from Drive";
  console.log(
    `Req ${s.num}: ${s.linesWithPct} lines · ${s.pctDone}% done · due $${Math.round(s.currentDue).toLocaleString()} · balance $${Math.round(s.balance).toLocaleString()} · ${flag}`
  );
}
delete project._importSteps;
console.log(
  JSON.stringify(
    {
      items: project.items.length,
      requisitions: project.requisitions.length,
      lastReq: project.requisitions.at(-1)?.applicationNumber,
      lastDue: project.requisitions.at(-1)?.currentPaymentDue,
      overallPct: overallPct(project.items),
    },
    null,
    2
  )
);

if (dryRun) {
  console.log("dry-run — not pushing");
} else {
  const res = await push(project);
  console.log("pushed", res.ts || res);
}