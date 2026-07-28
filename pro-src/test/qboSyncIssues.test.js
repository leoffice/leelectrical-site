/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  QBO_SYNC_ISSUE_TITLE,
  QBO_SYNC_ISSUE_TAG,
  shortErrorBullet,
  typeLabel,
  isRecentFailedQboCommand,
  collectQboSyncIssues,
  buildReportPayload,
  dismissIssueIds,
  loadDismissedIds,
} from "../src/lib/qboSyncIssues.js";

describe("qboSyncIssues", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("shortErrorBullet maps common failures to plain bullets", () => {
    expect(shortErrorBullet("local send needs PDF from app (pdfB64 missing)")).toMatch(/PDF missing/i);
    expect(shortErrorBullet("no_customer for job")).toMatch(/not linked/i);
    expect(shortErrorBullet("QBO HTTP 400 code=6240: Duplicate Name")).toMatch(/Duplicate/i);
    expect(shortErrorBullet("Stale Object Error 5010")).toMatch(/busy|stale/i);
    expect(shortErrorBullet("")).toMatch(/Unknown/i);
  });

  it("typeLabel is human-readable", () => {
    expect(typeLabel("create_invoice")).toBe("Creating invoice");
    expect(typeLabel("import_customer")).toMatch(/Import/i);
  });

  it("collectQboSyncIssues only keeps recent failed QBO commands", () => {
    const now = Date.now();
    const cmds = [
      {
        id: "c1",
        type: "create_invoice",
        status: "failed",
        error: "pdfB64 missing",
        jobId: "local-1",
        updatedAt: now - 1000,
        payload: { invoiceNo: "251843" },
      },
      {
        id: "c2",
        type: "create_invoice",
        status: "done",
        error: null,
        updatedAt: now,
      },
      {
        id: "c3",
        type: "calendar_upsert",
        status: "failed",
        error: "HTTP 400",
        updatedAt: now,
      },
      {
        id: "c4",
        type: "record_payment",
        status: "failed",
        error: "token expired unauthorized",
        updatedAt: now - 500,
      },
      {
        id: "c5",
        type: "create_customer",
        status: "failed",
        error: "old",
        updatedAt: now - 50 * 60 * 60 * 1000, // > 48h
      },
    ];
    const out = collectQboSyncIssues(cmds, { now });
    expect(out.totalFailed).toBe(2);
    expect(out.commandIds).toContain("c1");
    expect(out.commandIds).toContain("c4");
    expect(out.commandIds).not.toContain("c3");
    expect(out.commandIds).not.toContain("c5");
    expect(out.bullets.length).toBeGreaterThanOrEqual(2);
    expect(out.bullets.some((b) => /invoice/i.test(b) && /251843/.test(b))).toBe(true);
    expect(out.bullets.some((b) => /login|token|auth/i.test(b) || /Recording payment/.test(b))).toBe(true);
  });

  it("dismissed ids are excluded", () => {
    const now = Date.now();
    const cmds = [
      { id: "c1", type: "create_invoice", status: "failed", error: "x", updatedAt: now },
      { id: "c2", type: "fetch_payments", status: "failed", error: "y", updatedAt: now },
    ];
    const out = collectQboSyncIssues(cmds, { now, dismissedIds: new Set(["c1"]) });
    expect(out.commandIds).toEqual(["c2"]);
  });

  it("buildReportPayload includes troubleshooting tag", () => {
    const p = buildReportPayload({
      bullets: ["Creating invoice — PDF missing"],
      commandIds: ["c1", "c2"],
      totalFailed: 2,
    });
    expect(p.tag).toBe(QBO_SYNC_ISSUE_TAG);
    expect(p.source).toBe("le-pro");
    expect(p.bullets).toHaveLength(1);
    expect(p.commandIds).toEqual(["c1", "c2"]);
  });

  it("dismissIssueIds persists to localStorage", () => {
    dismissIssueIds(["a", "b"]);
    const loaded = loadDismissedIds();
    expect(loaded.has("a")).toBe(true);
    expect(loaded.has("b")).toBe(true);
  });

  it("title is the user-facing sentence", () => {
    expect(QBO_SYNC_ISSUE_TITLE).toMatch(/QuickBooks backend is having issues synchronizing/);
  });

  it("isRecentFailedQboCommand rejects non-failed", () => {
    expect(
      isRecentFailedQboCommand({ id: "1", type: "create_invoice", status: "queued", updatedAt: Date.now() })
    ).toBe(false);
  });

  it("dedupes identical type+cause bullets but keeps ids", () => {
    const now = Date.now();
    const cmds = [
      { id: "c1", type: "create_invoice", status: "failed", error: "pdfB64 missing", updatedAt: now },
      { id: "c2", type: "create_invoice", status: "failed", error: "needs pdf from app", updatedAt: now - 1 },
    ];
    const out = collectQboSyncIssues(cmds, { now });
    expect(out.bullets.length).toBe(1);
    expect(out.commandIds).toContain("c1");
    expect(out.commandIds).toContain("c2");
  });
});
