import { describe, it, expect } from "vitest";

// Lightweight pure collect logic (mirrors PendingPaymentPrompts)
function collectPending(jobs, systemItems = []) {
  const out = [];
  const seen = new Set();
  for (const j of jobs || []) {
    const p = j?.pendingCheckPayment || j?.pendingZellePayment;
    if (!p || p.status === "dismissed" || p.status === "approved") continue;
    const id = p.id || `${j.id}-${p.proofKey || p.amount}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...p, jobId: j.id, job: j, id });
  }
  for (const p of systemItems || []) {
    if (!p || p.status === "dismissed" || p.status === "approved") continue;
    const id = p.id || `sys-${p.amount}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...p, id });
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
});
