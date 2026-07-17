// Auto customer match — when ≥3 of 5 identity fields match 100% (and service
// matches when both sides have one), link without asking Levi.
// Fields: name, phone, email, billing address, service address.
// Strong pairs auto-combine; orange (unlinked / incomplete) customers auto-link to unique QBO hits.
import {
  clientKey,
  customerContact,
  customerProfileFromJobs,
  dismissPair,
  isMergeDecisionRemembered,
  isStrongCustomerMatch,
  isVoidCustomerJob,
  isVoidCustomerName,
  matchCustomerFields,
  mergePairAlreadyResolved,
  normalizeBillingAddress,
  normalizeCustomer,
  normalizeEmail,
  normalizePhone,
  normalizeServiceAddress,
  pairId,
} from "./customers.js";
import { customerProfileComplete, qboCustomerToJobPatch } from "./customerSync.js";

export { matchCustomerFields, isStrongCustomerMatch, normalizeBillingAddress };

/** Group active jobs by client key → { key, jobs, profile, contact }. */
export function customerGroupsFromJobs(jobs) {
  const map = new Map();
  for (const j of jobs || []) {
    if (!j || j._archived || j._deleted) continue;
    const k = clientKey(j);
    if (!k || k.startsWith("j:")) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(j);
  }
  return [...map.entries()].map(([key, list]) => {
    const contact = customerContact(list);
    const profile = customerProfileFromJobs(list, contact.businessName || contact.name);
    return { key, jobs: list, profile, contact };
  });
}

/**
 * Index pairs that share at least one identity field
 * (phone/email/name/billing/service). Strong 3-of-5 matches must share ≥1 field.
 */
function strongMatchCandidatePairs(groups) {
  const cand = new Set();
  const add = (i, k) => {
    if (i === k) return;
    cand.add(i < k ? `${i}:${k}` : `${k}:${i}`);
  };
  const index = (keyFn) => {
    const m = new Map();
    for (let i = 0; i < groups.length; i++) {
      const key = keyFn(groups[i].profile || {});
      if (!key) continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(i);
    }
    for (const idxs of m.values()) {
      for (let a = 0; a < idxs.length; a++) {
        for (let b = a + 1; b < idxs.length; b++) add(idxs[a], idxs[b]);
      }
    }
  };
  const indexMulti = (keysFn) => {
    const m = new Map();
    for (let i = 0; i < groups.length; i++) {
      for (const key of keysFn(groups[i].profile || {}) || []) {
        if (!key) continue;
        if (!m.has(key)) m.set(key, []);
        m.get(key).push(i);
      }
    }
    for (const idxs of m.values()) {
      const uniq = [...new Set(idxs)];
      for (let a = 0; a < uniq.length; a++) {
        for (let b = a + 1; b < uniq.length; b++) add(uniq[a], uniq[b]);
      }
    }
  };
  index((p) => normalizePhone(p.phone));
  index((p) => normalizeEmail(p.email));
  index((p) => normalizeCustomer(p.businessName || p.name || p.customer || ""));
  index((p) => normalizeBillingAddress(p.billingAddress || p.addr || p.billingAddr));
  indexMulti((p) => {
    const addrs = Array.isArray(p.serviceAddresses) ? p.serviceAddresses : [];
    const single = p.serviceAddress || p.address || "";
    return [...addrs, single].map(normalizeServiceAddress).filter(Boolean);
  });
  return cand;
}

/**
 * All strong (≥3/5 exact, service included when available) same-customer pairs.
 * Deterministic order by pairId.
 */
export function findStrongAutoMergePairs(jobs) {
  const groups = customerGroupsFromJobs(jobs);
  const pairs = [];
  const cand = strongMatchCandidatePairs(groups);
  for (const key of cand) {
    const c = key.indexOf(":");
    const i = Number(key.slice(0, c));
    const k = Number(key.slice(c + 1));
    const ga = groups[i];
    const gb = groups[k];
    const ja = ga.jobs[0];
    const jb = gb.jobs[0];
    if (isVoidCustomerJob(ja) || isVoidCustomerJob(jb)) continue;
    if (mergePairAlreadyResolved(ja, jb)) continue;
    if (isMergeDecisionRemembered(ja, jb)) continue;
    if (!isStrongCustomerMatch(ga.profile, gb.profile, 3)) continue;
    pairs.push({
      id: pairId(ga.profile.name, gb.profile.name),
      score: matchCustomerFields(ga.profile, gb.profile),
      a: { name: ga.profile.name, jobs: ga.jobs, profile: ga.profile, key: ga.key },
      b: { name: gb.profile.name, jobs: gb.jobs, profile: gb.profile, key: gb.key },
    });
  }
  return pairs.sort((x, y) => x.id.localeCompare(y.id));
}

/**
 * Unique QuickBooks customer that strongly matches this app profile (≥3/5).
 * QBO rows usually lack service addresses — service is not required then.
 * Returns the QBO row or null if zero or ambiguous (>1).
 */
export function findUniqueStrongQboMatch(profile, qboIndex, min = 3) {
  if (!profile || !Array.isArray(qboIndex) || !qboIndex.length) return null;
  if (
    isVoidCustomerName(profile?.name) ||
    isVoidCustomerName(profile?.businessName) ||
    isVoidCustomerName(profile?.customer)
  ) {
    return null;
  }
  const hits = [];
  for (const c of qboIndex) {
    if (!c) continue;
    if (
      isVoidCustomerName(c.name) ||
      isVoidCustomerName(c.businessName) ||
      isVoidCustomerName(c.personName)
    ) {
      continue;
    }
    const qboProfile = {
      name: c.businessName || c.name,
      businessName: c.businessName || c.name,
      phone: c.phone,
      email: c.email,
      billingAddress: c.billingAddress || c.addr,
    };
    if (isStrongCustomerMatch(profile, qboProfile, min)) {
      hits.push({ customer: c, score: matchCustomerFields(profile, qboProfile) });
    }
  }
  if (hits.length !== 1) return null;
  return hits[0].customer;
}

/**
 * Orange / incomplete groups: not fully green (missing QBO link or incomplete profile)
 * that have a unique strong QBO match — or already linked and need a fill from QBO.
 */
export function findOrangeAutoLinkTargets(jobs, qboIndex) {
  const out = [];
  if (!Array.isArray(qboIndex) || !qboIndex.length) return out;
  for (const g of customerGroupsFromJobs(jobs)) {
    const contact = g.contact || {};
    const linked = String(contact.qboCustomerId || "").trim();
    const complete = customerProfileComplete(contact) && linked;
    if (complete) continue; // already green

    if (linked) {
      const row = qboIndex.find((c) => String(c?.id || "") === linked);
      if (row) {
        const hasGap =
          (!String(contact.phone || "").trim() && row.phone) ||
          (!String(contact.email || "").trim() && row.email) ||
          (!String(contact.billingAddress || "").trim() && (row.billingAddress || row.addr));
        if (hasGap) {
          out.push({
            key: g.key,
            jobs: g.jobs,
            profile: g.profile,
            qbo: row,
            reason: "fill_linked",
          });
        }
      }
      continue;
    }
    const qbo = findUniqueStrongQboMatch(g.profile, qboIndex, 3);
    if (!qbo) continue;
    out.push({
      key: g.key,
      jobs: g.jobs,
      profile: g.profile,
      qbo,
      reason: "strong_match",
    });
  }
  return out;
}

/**
 * Apply auto-combine for all strong pairs. Mutates via patchAndSave.
 * Returns count of pairs combined.
 */
export async function applyStrongAutoMerges(jobs, { patchAndSave, persistDismiss } = {}) {
  if (!patchAndSave) return 0;
  const pairs = findStrongAutoMergePairs(jobs);
  let n = 0;
  for (const pair of pairs) {
    const all = [...pair.a.jobs, ...pair.b.jobs];
    const grp =
      all.map((j) => j.clientGroup).find(Boolean) ||
      "auto-" + pair.id.replace(/\|/g, "-").slice(0, 40);
    const richer =
      (pair.a.profile.qboCustomerId && pair.a.profile) ||
      (pair.b.profile.qboCustomerId && pair.b.profile) ||
      pair.a.profile;
    const enrichPatch = {};
    if (richer.phone) enrichPatch.phone = richer.phone;
    if (richer.email) enrichPatch.email = richer.email;
    if (richer.billingAddress) enrichPatch.billingAddress = richer.billingAddress;
    if (richer.qboCustomerId) enrichPatch.qboCustomerId = richer.qboCustomerId;
    if (richer.businessName) enrichPatch.businessName = richer.businessName;
    if (richer.personName) enrichPatch.personName = richer.personName;

    for (const j of all) {
      await patchAndSave(j.id, { clientGroup: grp, ...enrichPatch });
    }
    const ja = pair.a.jobs?.[0];
    const jb = pair.b.jobs?.[0];
    if (ja && jb) dismissPair(ja, jb);
    else dismissPair(pair.a.name, pair.b.name);
    n += 1;
  }
  if (n && persistDismiss) {
    try {
      await persistDismiss();
    } catch {
      /* offline ok */
    }
  }
  return n;
}

/**
 * Link orange customers to unique strong QBO matches; fill contact from QBO.
 * Returns count of customer groups linked/filled.
 */
export async function applyOrangeAutoLinks(jobs, qboIndex, { patchAndSave } = {}) {
  if (!patchAndSave) return 0;
  const targets = findOrangeAutoLinkTargets(jobs, qboIndex);
  let n = 0;
  for (const t of targets) {
    const patch = qboCustomerToJobPatch(t.qbo);
    if (!patch.qboCustomerId && t.qbo?.id) patch.qboCustomerId = String(t.qbo.id);
    for (const j of t.jobs) {
      const existing = String(j.qboCustomerId || "").trim();
      if (existing && existing !== String(patch.qboCustomerId || "")) continue;
      await patchAndSave(j.id, patch);
    }
    n += 1;
  }
  return n;
}

/**
 * One-shot auto reconcile used on app open.
 * Combines strong pairs first, then links orange → QBO.
 */
export async function runCustomerAutoReconcile(jobs, qboIndex, ctx = {}) {
  const merged = await applyStrongAutoMerges(jobs, ctx);
  const linked = await applyOrangeAutoLinks(jobs, qboIndex, ctx);
  return { merged, linked, total: merged + linked };
}

/** Stable day key for once-per-day toast. */
export function autoReconcileDayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
