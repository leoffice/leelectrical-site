// Parent / sub-customer hierarchy + service-address job grouping.
// Management companies (parents) roll up balance; LLC subs bill separately in QB.
import { normalizeCustomer, clientKey, customerAmountSummary, totalBalanceDue } from "./customers.js";
import { effectiveServiceAddress } from "./customerSync.js";

/** Job belongs to a sub-entity under a parent company. */
export function hasParentCustomer(job) {
  const j = job || {};
  return !!(String(j.parentQboCustomerId || "").trim() || normalizeCustomer(j.parentCustomerName));
}

/** Build lookup from the QuickBooks customer index (parentId on sub-customers). */
export function buildQboHierarchyCtx(qboIndex) {
  const byId = new Map();
  const childToParent = new Map();
  for (const c of qboIndex || []) {
    const id = String(c?.id || "").trim();
    if (id) byId.set(id, c);
  }
  for (const c of qboIndex || []) {
    const id = String(c?.id || "").trim();
    const pid = String(c?.parentId || "").trim();
    if (!id || !pid) continue;
    const parent = byId.get(pid) || {};
    childToParent.set(id, {
      parentId: pid,
      parentName: String(c?.parentName || parent.businessName || parent.name || "").trim(),
    });
  }
  return { byId, childToParent };
}

function qboParentLink(job, ctx) {
  if (!ctx) return null;
  const qid = String(job?.qboCustomerId || "").trim();
  return qid ? ctx.childToParent.get(qid) || null : null;
}

/** True when the job or its QBO customer row is a sub-company. */
export function effectiveHasParentCustomer(job, ctx) {
  if (hasParentCustomer(job)) return true;
  return !!qboParentLink(job, ctx);
}

/** Stable board key for a parent company. */
export function parentBoardKey(job) {
  const j = job || {};
  const pqid = String(j.parentQboCustomerId || "").trim();
  if (pqid) return "p:q:" + pqid;
  const pn = normalizeCustomer(j.parentCustomerName);
  return pn ? "p:c:" + pn : "";
}

/** Parent board key from job fields or QBO parentId on the customer row. */
export function effectiveParentBoardKey(job, ctx) {
  const explicit = parentBoardKey(job);
  if (explicit) return explicit;
  const link = qboParentLink(job, ctx);
  return link?.parentId ? "p:q:" + link.parentId : "";
}

/** Display label for the parent company on a job. */
export function parentDisplayName(job, jobs, ctx) {
  const j = job || {};
  const pqid = String(j.parentQboCustomerId || "").trim();
  if (j.parentCustomerName) return String(j.parentCustomerName).trim();
  const link = qboParentLink(j, ctx);
  if (link?.parentName) return link.parentName;
  if (link?.parentId && ctx?.byId) {
    const parent = ctx.byId.get(link.parentId);
    if (parent) return parent.businessName || parent.name || "";
  }
  if (pqid && jobs) {
    const hit = (jobs || []).find(
      (x) =>
        x &&
        !effectiveHasParentCustomer(x, ctx) &&
        String(x.qboCustomerId || "").trim() === pqid &&
        (x.businessName || x.customer)
    );
    if (hit) return hit.businessName || hit.customer || "";
  }
  return "";
}

/** Normalize service address for grouping jobs at the same site. */
export function normalizeServiceAddress(addr) {
  return String(addr || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Service-address key for a job (street + apt). */
export function serviceAddressKey(job) {
  const j = job || {};
  const street = normalizeServiceAddress(effectiveServiceAddress(j));
  const apt = normalizeServiceAddress(j.apartment);
  if (!street) return "";
  return apt ? street + "|" + apt : street;
}

/** Same billing customer (sub) + same service address. */
export function sameAddressGroup(jobA, jobB) {
  if (!jobA || !jobB) return false;
  if (clientKey(jobA) !== clientKey(jobB)) return false;
  const ka = serviceAddressKey(jobA);
  const kb = serviceAddressKey(jobB);
  return !!(ka && kb && ka === kb);
}

/** All jobs at the same service address for this billing customer (includes job). */
export function jobsAtSameAddress(jobs, job) {
  const list = (jobs || []).filter((j) => j && !j._archived && !j._deleted);
  if (!job) return [];
  const key = serviceAddressKey(job);
  if (!key) return [job];
  const ck = clientKey(job);
  return list.filter((j) => clientKey(j) === ck && serviceAddressKey(j) === key);
}

/** Distinct service addresses for a customer's jobs. */
export function serviceAddressesForJobs(jobs) {
  const seen = new Map();
  for (const j of jobs || []) {
    const k = serviceAddressKey(j);
    if (!k || seen.has(k)) continue;
    seen.set(k, effectiveServiceAddress(j) + (j.apartment ? ", Apt " + j.apartment : ""));
  }
  return [...seen.entries()].map(([key, label]) => ({ key, label }));
}

/** Sub-entities under a parent QuickBooks id. */
export function subsForParentQboId(jobs, parentQboId) {
  const qid = String(parentQboId || "").trim();
  if (!qid) return [];
  return subsUnderParent(jobs, "p:q:" + qid);
}

/** Jobs billed directly to the parent company (not sub-entities). */
export function directJobsForParent(activeJobs, parentKey, ctx) {
  const list = (activeJobs || []).filter(
    (j) => j && !j._archived && !j._deleted && !effectiveHasParentCustomer(j, ctx)
  );
  if (parentKey.startsWith("p:q:")) {
    const pqid = parentKey.slice(4);
    return list.filter((j) => String(j.qboCustomerId || "").trim() === pqid);
  }
  if (parentKey.startsWith("p:c:")) {
    const pname = parentKey.slice(4);
    return list.filter((j) => {
      const n = normalizeCustomer(j.customer);
      const b = normalizeCustomer(j.businessName);
      return n === pname || b === pname;
    });
  }
  return [];
}

/** Sub-entities under one parent (unique client keys). */
export function subsUnderParent(jobs, parentKey, ctx) {
  const list = (jobs || []).filter(
    (j) => j && !j._archived && !j._deleted && effectiveParentBoardKey(j, ctx) === parentKey
  );
  const map = new Map();
  for (const j of list) {
    const sk = clientKey(j);
    if (!map.has(sk)) map.set(sk, []);
    map.get(sk).push(j);
  }
  return [...map.entries()].map(([key, subJobs]) => ({
    key,
    name: subJobs[0]?.businessName || subJobs[0]?.customer || "(sub)",
    jobs: subJobs,
    summary: customerAmountSummary(subJobs),
  }));
}

/**
 * Board rows for the Customers tab.
 * Returns [{ kind:'standalone'|'parent', key, name, jobs, subs?, summary }]
 */
export function buildCustomerBoardGroups(activeJobs, sortJobsFn, qboIndex) {
  const active = (activeJobs || []).filter((j) => j && !j._archived && !j._deleted);
  const sort = sortJobsFn || ((x) => x);
  const ctx = buildQboHierarchyCtx(qboIndex);
  const parentMap = new Map(); // parentKey -> all jobs under parent
  const standaloneMap = new Map(); // clientKey -> jobs (no parent)

  for (const j of active) {
    const pk = effectiveParentBoardKey(j, ctx);
    if (pk) {
      if (!parentMap.has(pk)) parentMap.set(pk, []);
      parentMap.get(pk).push(j);
    } else {
      const k = clientKey(j);
      if (!standaloneMap.has(k)) standaloneMap.set(k, []);
      standaloneMap.get(k).push(j);
    }
  }

  const rows = [];

  const absorbedIds = new Set();
  for (const pk of parentMap.keys()) {
    const direct = directJobsForParent(active, pk, ctx);
    if (!direct.length) continue;
    parentMap.set(pk, parentMap.get(pk).concat(direct));
    direct.forEach((j) => absorbedIds.add(j.id));
  }
  for (const [sk, slist] of [...standaloneMap]) {
    const remaining = slist.filter((j) => !absorbedIds.has(j.id));
    if (remaining.length) standaloneMap.set(sk, remaining);
    else standaloneMap.delete(sk);
  }

  for (const [pk, allJobs] of parentMap) {
    const sorted = sort(allJobs);
    const name =
      parentDisplayName(sorted[0], active, ctx) ||
      sorted[0]?.parentCustomerName ||
      sorted[0]?.businessName ||
      sorted[0]?.customer ||
      "(parent)";
    const subs = subsUnderParent(active, pk, ctx).map((s) => ({ ...s, jobs: sort(s.jobs) }));
    rows.push({
      kind: "parent",
      key: pk,
      name,
      jobs: sorted,
      subs,
      summary: customerAmountSummary(sorted),
      due: totalBalanceDue(sorted),
    });
  }

  for (const [k, list] of standaloneMap) {
    const sorted = sort(list);
    const j = sorted[0];
    rows.push({
      kind: "standalone",
      key: k,
      name: j?.businessName || j?.customer || "(no customer)",
      jobs: sorted,
      subs: [],
      summary: customerAmountSummary(sorted),
      due: totalBalanceDue(sorted),
    });
  }

  return rows;
}

/** Route key for parent customer view (all subs). */
export function customerKeyForParent(job, qboIndex) {
  const ctx = buildQboHierarchyCtx(qboIndex);
  return effectiveParentBoardKey(job, ctx) || "";
}

/** Patch fields when linking a job to a parent company. */
export function parentCustomerPatch(parent) {
  const p = parent || {};
  const name = p.businessName || p.name || p.customer || "";
  const qid = p.id != null ? String(p.id) : String(p.qboCustomerId || "").trim();
  return {
    parentCustomerName: name,
    parentQboCustomerId: qid,
  };
}

/** Patch for a new job cloned from an existing one at the same address. */
export function cloneJobAtAddressPatch(sourceJob) {
  const j = sourceJob || {};
  return {
    businessName: j.businessName || j.customer || "",
    personName: j.personName || "",
    customer: j.businessName || j.customer || "",
    phone: j.phone || "",
    email: j.email || "",
    billingAddress: j.billingAddress || "",
    serviceAddress: j.serviceAddress || j.address || "",
    address: j.serviceAddress || j.address || "",
    apartment: j.apartment || "",
    qboCustomerId: j.qboCustomerId || "",
    parentCustomerName: j.parentCustomerName || "",
    parentQboCustomerId: j.parentQboCustomerId || "",
    title: "",
    invoiceNo: "",
    estimateNo: "",
  };
}