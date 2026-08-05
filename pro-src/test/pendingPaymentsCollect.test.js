import { describe, it, expect } from "vitest";

// Mirrors PendingPaymentPrompts helpers (keep in sync when bounce rules change).

function isOpenPaymentNotice(p) {
  if (!p) return false;
  const s = String(p.status || "pending");
  if (s === "dismissed" || s === "acked") return false;
  if (s === "approved") return false;
  if (p.ackedAt) return false;
  if (p.autoApplied && s === "auto_applied") return true;
  if (s === "pending" || s === "auto_applied" || s === "needs_match") return true;
  return false;
}

function normalizePayments(job) {
  const list = Array.isArray(job?.payments) ? job.payments : [];
  return list.filter((p) => p && !p._deleted);
}

function activePaymentRefs(job) {
  const refs = new Set();
  for (const p of normalizePayments(job) || []) {
    const r = String(p?.ref || p?.confirmationNumber || p?.checkNumber || "").trim();
    if (r) refs.add(r);
  }
  return refs;
}

function noticeConfAlreadyOnOtherJob(p, jobs) {
  if (!p || !jobs?.length) return false;
  const conf = String(p.confirmationNumber || p.ref || p.checkNumber || "").trim();
  if (!conf) return false;
  const noticeJob = String(p.jobId || "").trim();
  for (const j of jobs) {
    if (!activePaymentRefs(j).has(conf)) continue;
    if (!noticeJob || String(j.id) !== noticeJob) return true;
  }
  return false;
}

function collectPending(jobs, systemItems = []) {
  const out = [];
  const seen = new Set();
  for (const j of jobs || []) {
    const p = j?.pendingCheckPayment || j?.pendingZellePayment;
    if (!isOpenPaymentNotice(p)) continue;
    if (noticeConfAlreadyOnOtherJob({ ...p, jobId: j.id }, jobs)) continue;
    const id = p.id || `${j.id}-${p.proofKey || p.confirmationNumber || p.amount}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...p, jobId: j.id, job: j, id });
  }
  for (const p of systemItems || []) {
    if (!isOpenPaymentNotice(p)) continue;
    if (noticeConfAlreadyOnOtherJob(p, jobs)) continue;
    const id = p.id || `sys-${p.proofKey || p.confirmationNumber || p.amount}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const job = (jobs || []).find((j) => String(j.id) === String(p.jobId)) || null;
    out.push({ ...p, id, job });
  }
  return out;
}

describe("pending payment collect", () => {
  it("picks pending check on job and skips approved", () => {
    const jobs = [
      {
        id: "qbo-1",
        pendingCheckPayment: { id: "a", status: "pending", amount: "450" },
      },
      {
        id: "qbo-2",
        pendingCheckPayment: { id: "b", status: "approved", amount: "100" },
      },
    ];
    const list = collectPending(jobs, []);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("a");
    expect(list[0].jobId).toBe("qbo-1");
  });

  it("keeps auto_applied sticky until Got it", () => {
    const jobs = [
      {
        id: "qbo-251741",
        pendingZellePayment: {
          id: "pend-zelle-1",
          status: "auto_applied",
          autoApplied: true,
          confirmationNumber: "JPM99crx431u",
          amount: "1800",
        },
      },
    ];
    expect(collectPending(jobs, [])).toHaveLength(1);
  });

  it("does not re-show approved+autoApplied after reassignment (Sima bounce)", () => {
    // Live bug: job pending stayed status=approved autoApplied=true after Approve to Sima.
    const jobs = [
      {
        id: "qbo-251741",
        customer: "Yechiel marozov",
        pendingZellePayment: {
          id: "pend-zelle-1",
          status: "approved",
          autoApplied: true,
          confirmationNumber: "JPM99crx431u",
          amount: "1800",
          jobId: "qbo-251741",
        },
      },
    ];
    expect(collectPending(jobs, [])).toHaveLength(0);
  });

  it("suppresses system queue sticky when conf already lives on another job", () => {
    // Payment on Sima; system queue still points at Marozov auto_applied.
    const jobs = [
      {
        id: "qbo-251741",
        customer: "Yechiel marozov",
        payments: [],
      },
      {
        id: "local-sima",
        customer: "Sima Expediter",
        payments: [{ id: "pay-1", amount: "1800", ref: "JPM99crx431u" }],
      },
    ];
    const systemItems = [
      {
        id: "pend-zelle-1",
        status: "auto_applied",
        autoApplied: true,
        confirmationNumber: "JPM99crx431u",
        jobId: "qbo-251741",
        customer: "Yechiel marozov",
        amount: "1800",
      },
    ];
    expect(collectPending(jobs, systemItems)).toHaveLength(0);
  });

  it("still shows auto_applied when conf is on the same job (Got it needed)", () => {
    const jobs = [
      {
        id: "qbo-1",
        payments: [{ id: "pay-1", amount: "1800", ref: "JPM99aa" }],
        pendingZellePayment: {
          id: "pend-1",
          status: "auto_applied",
          autoApplied: true,
          confirmationNumber: "JPM99aa",
          jobId: "qbo-1",
        },
      },
    ];
    expect(collectPending(jobs, [])).toHaveLength(1);
  });

  it("hides acked tombstone in system queue", () => {
    const systemItems = [
      {
        id: "pend-zelle-1",
        status: "acked",
        ackedAt: Date.now(),
        confirmationNumber: "JPM99crx431u",
      },
    ];
    expect(collectPending([], systemItems)).toHaveLength(0);
  });
});
