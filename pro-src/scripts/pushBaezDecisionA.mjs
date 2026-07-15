// Push the Decision-A reconciled Baez project to the live store, REPLACING the
// stale requisitions directly (the import script's mergeProject would keep the
// old server reqs because richness/length tie). Backup taken separately.
import { readFileSync } from "fs";
import { join } from "path";

const PRO = "/Users/levik/Downloads/leelectrical-cf/pro-src";
const DRY = process.argv.includes("--dry-run");

const { buildG702, changeOrderItems, sumItemValues } = await import(join(PRO, "src/lib/requisitionCalc.js"));
const { reconcileRequisitionFinancials } = await import(join(PRO, "src/lib/requisitionHelpers.js"));
const { ensureProjectDefaults, BAEZ_PROJECT_ID, BAEZ_ADDRESS, JOY_GC_LABEL, joyCustomerKey } = await import(join(PRO, "src/lib/requisitionData.js"));
const data = JSON.parse(readFileSync(join(PRO, "scripts/baez_requisitions_import.json"), "utf8"));

const itemKey = (it) => `${String(it.section||"").trim().toLowerCase().replace(/\s+/g," ")}|${String(it.description||"").trim().toLowerCase().replace(/\s+/g," ")}`;

function buildReqRecord(project, draft, meta, createdAt) {
  const prevItemsById = {};
  const prev = project.requisitions || [];
  if (prev.length) for (const it of prev[prev.length-1].itemsSnapshot||[]) if (it.id) prevItemsById[it.id]={completedPct:it.completedPct};
  const g = buildG702({ ...draft, requisitions: project.requisitions||[] }, { periodTo: meta.periodTo, prevItemsById });
  const snap = (draft.items||[]).map((it)=>({id:it.id,key:itemKey(it),completedPct:it.completedPct}));
  return {
    id:`req-baez-${meta.num}`, num:meta.num, applicationNumber:meta.applicationNumber, periodTo:meta.periodTo||g.periodTo,
    status:"submitted", amountCertified:meta.g702?.currentPaymentDue??g.currentPaymentDue, currentPaymentDue:meta.g702?.currentPaymentDue??g.currentPaymentDue,
    previousCertificates:meta.g702?.previousCertificates??g.previousCertificates, totalCompleted:meta.g702?.totalCompleted??g.totalCompleted,
    balanceToFinish:g.balanceToFinish, earnedLessRetainage:g.earnedLessRetainage, totalRetainage:g.totalRetainage, retainagePct:g.retainagePct,
    contractSumToDate:g.contractSumToDate, itemsSnapshot:snap, g703:g.g703, payments:[], attachments:(meta.attachments||[]).map((a,i)=>({id:`att-req${meta.num}-${i}`,name:a.name,url:a.webViewLink||`file://${a.localPath}`,mime:"application/pdf",attachToEmail:/requisition|req/i.test(a.name),addedAt:createdAt})),
    emailSentAt:null, createdAt, submittedAt:createdAt, importNote:meta.g702?.note||null,
    g702: meta.g702 && meta.g702.authoritative ? meta.g702 : undefined,
  };
}

const items = data.masterItems.map((it)=>({...it}));
const coLineTotal = sumItemValues(changeOrderItems(items));
const coTotal = data.changeOrdersTotal != null ? data.changeOrdersTotal : coLineTotal;
const baseContract = sumItemValues(items) - coLineTotal;
const project = {
  id: BAEZ_PROJECT_ID, name:"Baez Place", address:BAEZ_ADDRESS, contractor:"Martin Dorkin", gc:JOY_GC_LABEL, customerKey:joyCustomerKey(),
  contractSum: baseContract, retainagePct:10, changeOrders: coTotal, changeOrderList:[], items, requisitions:[], requisitionEnabled:true,
  driveLinks:[{label:"Baez Requisitions folder",url:"https://drive.google.com/drive/folders/1MartinDorkinRequisitions",addedAt:Date.now()}],
  jobId:"", createdAt: Date.now()-86400000*400, updatedAt: Date.now(),
};
let base = Date.parse("2016-02-25T12:00:00Z");
for (const meta of data.requisitions) {
  const snapMap = Object.fromEntries((meta.itemsSnapshot||[]).map((s)=>[s.key,s.completedPct]));
  const draftItems = items.map((it)=>({...it,completedPct:snapMap[itemKey(it)]??0}));
  const req = buildReqRecord(project, {...project,items:draftItems}, meta, base);
  base += 86400000*60;
  project.requisitions.push(req);
  project.items = draftItems;
}
const reconciled = ensureProjectDefaults(reconcileRequisitionFinancials(project));
const r12 = reconciled.requisitions.find((r)=>r.num===12);
console.log("Decision-A project built. Req12:", JSON.stringify({totalCompleted:r12.totalCompleted, totalRetainage:r12.totalRetainage, earnedLessRetainage:r12.earnedLessRetainage, previousCertificates:r12.previousCertificates, currentPaymentDue:r12.currentPaymentDue, balanceToFinish:r12.balanceToFinish}));
const item1 = reconciled.items.find((it)=>/electric service equipment/i.test(it.description||""));
console.log("item1 exempt:", item1.retainageExempt, "changeOrders:", reconciled.changeOrders, "contractSum:", reconciled.contractSum);

const cb = Date.now();
const state = await (await fetch(`https://leelectrical.us/.netlify/functions/state?cb=${cb}`)).json();
const list = state.ov?._projects?.list || [];
const idx = list.findIndex((p)=>p.id===reconciled.id || /baez/i.test(p.name||""));
console.log(`\nExisting Baez at index ${idx} of ${list.length} projects. Other project ids:`, list.filter((_,i)=>i!==idx).map(p=>p.id));
const newList = idx>=0 ? list.map((p,i)=>i===idx?reconciled:p) : [...list, reconciled];
const ov = { ...(state.ov||{}), _projects: { ...(state.ov?._projects||{}), list: newList } };
console.log("Preserved ov keys:", Object.keys(ov));

if (DRY) { console.log("\nDRY-RUN — not pushing."); process.exit(0); }

// Prove the POST body carries the corrected Baez project.
const bodyBaez = ov._projects.list.find((p)=>p.id===reconciled.id||/baez/i.test(p.name||""));
const bodyR12 = bodyBaez.requisitions.find((r)=>r.num===12);
console.log("\nPOST BODY Baez Req12:", JSON.stringify({totalCompleted:bodyR12.totalCompleted,totalRetainage:bodyR12.totalRetainage,balanceToFinish:bodyR12.balanceToFinish}));
console.log("POST body bytes:", JSON.stringify({ov}).length);

const res = await fetch(`https://leelectrical.us/.netlify/functions/state?cb=${cb}`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ ov }) });
const out = await res.json();
if (!res.ok) { console.error("PUSH FAILED", out); process.exit(1); }
console.log("PUSHED ts:", out.ts);

// Immediate read-back
await new Promise((r)=>setTimeout(r,1500));
const back = await (await fetch(`https://leelectrical.us/.netlify/functions/state?cb=${Date.now()}`)).json();
const bBaez=(back.ov?._projects?.list||[]).find((p)=>/baez/i.test(p.name||""));
const bR12=(bBaez?.requisitions||[]).find((r)=>r.num===12);
console.log("READBACK ts:", back.ts, "| Req12 retainage:", bR12?.totalRetainage, "totalCompleted:", bR12?.totalCompleted);
