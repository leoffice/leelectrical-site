// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildPaperworkFailPayload,
  paperworkFailDedupeKey,
  loadReportedFails,
  wasPaperworkFailReported,
  markPaperworkFailReported,
  reportPaperworkFailOnce,
  fieldsFromPaperworkJob,
  REPORT_PAPERWORK_FAIL_CMD,
  PAPERWORK_FAIL_TAG,
} from "../src/lib/paperworkFailReport.js";

describe("paperworkFailReport", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("builds a report payload with tag + caps", () => {
    const p = buildPaperworkFailPayload({
      kind: "create_case",
      error: "stage failed: session_expired",
      jobId: "job-1",
      paperworkJobId: "pj-abc",
      address: "555 Kingston Ave",
    });
    expect(p.kind).toBe("create_case");
    expect(p.tag).toBe(PAPERWORK_FAIL_TAG);
    expect(p.source).toBe("le-pro");
    expect(p.error).toContain("session_expired");
    expect(p.paperworkJobId).toBe("pj-abc");
  });

  it("dedupes by kind+job+paperwork+error", () => {
    const a = buildPaperworkFailPayload({
      kind: "create_case",
      error: "boom",
      jobId: "j1",
      paperworkJobId: "p1",
    });
    const b = buildPaperworkFailPayload({
      kind: "create_case",
      error: "boom",
      jobId: "j1",
      paperworkJobId: "p1",
    });
    expect(paperworkFailDedupeKey(a)).toBe(paperworkFailDedupeKey(b));
  });

  it("marks reported and skips second enqueue within window", async () => {
    const enqueue = vi.fn(async () => ({}));
    const first = await reportPaperworkFailOnce(
      { kind: "create_case", error: "submit failed", jobId: "j1", paperworkJobId: "pj1" },
      enqueue
    );
    expect(first.ok).toBe(true);
    expect(first.queued).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0]).toBe(REPORT_PAPERWORK_FAIL_CMD);
    expect(enqueue.mock.calls[0][3]).toBe("deterministic");

    const second = await reportPaperworkFailOnce(
      { kind: "create_case", error: "submit failed", jobId: "j1", paperworkJobId: "pj1" },
      enqueue
    );
    expect(second.ok).toBe(true);
    expect(second.deduped).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("force re-reports even if already seen", async () => {
    const enqueue = vi.fn(async () => ({}));
    await reportPaperworkFailOnce(
      { kind: "create_case", error: "x", jobId: "j", paperworkJobId: "p" },
      enqueue
    );
    const again = await reportPaperworkFailOnce(
      { kind: "create_case", error: "x", jobId: "j", paperworkJobId: "p", force: true },
      enqueue
    );
    expect(again.queued).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it("fieldsFromPaperworkJob pulls address + error", () => {
    const f = fieldsFromPaperworkJob(
      {
        id: "pj-9",
        type: "create_case",
        error: "stage failed",
        jobId: "job-9",
        payload: {
          answers: { ownerFirst: "Shalom", ownerLast: "R", serviceAddress: "1 Main" },
          requestType: "no_add_load",
        },
      },
      { id: "job-9", customerName: "Goodness" }
    );
    expect(f.paperworkJobId).toBe("pj-9");
    expect(f.address).toBe("1 Main");
    expect(f.error).toBe("stage failed");
    expect(f.customer).toMatch(/Shalom/);
  });

  it("loadReportedFails drops stale entries", () => {
    const key = "old";
    markPaperworkFailReported(key);
    expect(wasPaperworkFailReported(key)).toBe(true);
    expect(loadReportedFails().some((r) => r.key === key)).toBe(true);
  });
});
