/**
 * Auto-link open Con Ed cases (MC-######) to LE Pro jobs by service address.
 *
 * Levi 2026-08-04: cases open in Project Center / email but stay unlinked on the
 * job (example: 1127 Lincoln Pl). Any open case with a matchable address should
 * attach to the job; if no job exists, propose creating one.
 */
import { extractMcNumber, CONED_STAGE_LABELS } from "./conedPermit.js";
import { addressSimilarity, normalizeAddress } from "./emailInsight.js";

const MIN_ADDR_SCORE = 0.72;

/**
 * Collect unique open cases from email insights (MC + address).
 * @returns {Array<{ caseNumber: string, address: string, stage?: string, subject?: string, insightId?: string }>}
 */
export function collectOpenConedCasesFromInsights(insights = []) {
  const byMc = new Map();
  for (const raw of insights || []) {
    const subj = raw?.source?.subject || raw?.subject || "";
    const body = raw?.emailSnippet || raw?.summary || raw?.body || "";
    const blob = `${subj}\n${body}`;
    const mc =
      extractMcNumber(blob) ||
      extractMcNumber(raw?.caseNumber || "") ||
      (String(raw?.primaryKey || "").match(/^MC-\d+/i) ? String(raw.primaryKey).toUpperCase() : "");
    if (!mc) continue;
    const address = String(raw?.address || "").trim();
    const prev = byMc.get(mc) || { caseNumber: mc, address: "", stage: "", subject: "", insightId: "" };
    if (address && (!prev.address || address.length > prev.address.length)) prev.address = address;
    if (subj) prev.subject = subj;
    if (raw?.id) prev.insightId = raw.id;
    // Prefer non-cancelled
    if (/cancell/i.test(subj) || /cancell/i.test(body)) {
      prev.cancelled = true;
    } else {
      prev.cancelled = false;
    }
    byMc.set(mc, prev);
  }
  return [...byMc.values()].filter((c) => c.caseNumber && !c.cancelled);
}

/**
 * Find best job for a case: existing caseNumber match wins, else address score.
 */
export function findJobForConedCase(jobs, { caseNumber = "", address = "" } = {}) {
  const mc = String(caseNumber || "").toUpperCase().trim();
  const list = (jobs || []).filter((j) => j && j.id && !j._deleted && !j._archived);

  if (mc) {
    const byCase = list.find((j) => {
      const cn =
        j?.paperwork?.coned?.caseNumber ||
        j?.paperwork?.coned?.createCase?.execution?.caseNumber ||
        j?.paperwork?.coned?.meterDeploy?.caseNumber ||
        "";
      return String(cn).toUpperCase() === mc;
    });
    if (byCase) return { job: byCase, score: 1, via: "caseNumber" };
  }

  if (!address) return { job: null, score: 0, via: "" };

  let best = null;
  let bestScore = 0;
  for (const j of list) {
    const candidates = [j.serviceAddress, j.address, j.billingAddress].filter(Boolean);
    for (const c of candidates) {
      const score = addressSimilarity(address, c);
      if (score > bestScore) {
        bestScore = score;
        best = j;
      }
    }
  }
  if (!best || bestScore < MIN_ADDR_SCORE) return { job: null, score: bestScore, via: "address" };
  return { job: best, score: bestScore, via: "address" };
}

/**
 * Patch to attach MC to job paperwork (non-destructive).
 */
export function jobPatchLinkConedCase(job, caseNumber, { address = "", stage = "application_filed" } = {}) {
  const mc = String(caseNumber || "").toUpperCase().trim();
  if (!mc || !/^MC-\d{5,8}$/i.test(mc)) return null;
  const existing = job?.paperwork?.coned?.caseNumber || "";
  if (String(existing).toUpperCase() === mc) return null; // already linked

  const stageLabel = CONED_STAGE_LABELS[stage] || "Application filed";
  return {
    paperwork: {
      coned: {
        enabled: true,
        caseNumber: mc,
        currentStage: job?.paperwork?.coned?.currentStage || stage,
        stageLabel: job?.paperwork?.coned?.stageLabel || stageLabel,
        meterDeploy: {
          ...(job?.paperwork?.coned?.meterDeploy || {}),
          caseNumber: mc,
          attached: true,
        },
      },
    },
  };
}

/**
 * Fields for createJob when no matching job exists for an open case.
 */
export function createJobFieldsForConedCase({
  caseNumber = "",
  address = "",
  customer = "",
  email = "",
  phone = "",
} = {}) {
  const mc = String(caseNumber || "").toUpperCase().trim();
  const addr = String(address || "").trim();
  return {
    customer: customer || "Con Ed case customer",
    businessName: customer || "",
    email: email || "",
    phone: phone || "",
    serviceAddress: addr,
    address: addr,
    title: mc ? `Con Edison case ${mc}` : "Con Edison open case",
    description: mc
      ? `Auto-created from open Con Ed case ${mc}${addr ? ` at ${addr}` : ""}.`
      : `Auto-created from open Con Ed case${addr ? ` at ${addr}` : ""}.`,
    paperwork: {
      coned: {
        enabled: true,
        caseNumber: mc || "",
        currentStage: "application_filed",
        stageLabel: "Application filed",
        meterDeploy: mc ? { caseNumber: mc, attached: true } : {},
      },
    },
  };
}

/**
 * Plan links + creates from open cases vs current jobs.
 * @returns {{ links: Array<{jobId, caseNumber, score, patch}>, creates: Array<{caseNumber, address, fields}> }}
 */
export function planConedCaseJobLinks({ jobs = [], cases = [] } = {}) {
  const links = [];
  const creates = [];
  const linkedMcs = new Set();

  for (const j of jobs || []) {
    const cn = String(j?.paperwork?.coned?.caseNumber || "").toUpperCase();
    if (cn) linkedMcs.add(cn);
  }

  for (const c of cases || []) {
    const mc = String(c.caseNumber || "").toUpperCase();
    if (!mc || linkedMcs.has(mc)) continue;

    const { job, score } = findJobForConedCase(jobs, {
      caseNumber: mc,
      address: c.address,
    });

    if (job?.id) {
      const patch = jobPatchLinkConedCase(job, mc, { address: c.address });
      if (patch) {
        links.push({
          jobId: job.id,
          caseNumber: mc,
          score,
          address: c.address || job.serviceAddress || job.address || "",
          patch,
        });
        linkedMcs.add(mc);
      }
    } else if (c.address && normalizeAddress(c.address)) {
      creates.push({
        caseNumber: mc,
        address: c.address,
        fields: createJobFieldsForConedCase({
          caseNumber: mc,
          address: c.address,
        }),
      });
    }
  }

  return { links, creates };
}
