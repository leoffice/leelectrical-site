import { describe, expect, it } from "vitest";
import { docSendInFlight, docSendStatusLine, docSendSucceeded, lastDocSend } from "../src/lib/docSendStatus.js";

describe("docSendStatus", () => {
  it("returns Never sent when no delivered history", () => {
    const job = { id: "J-1", invoiceHistory: [{ date: "2026-07-14", kind: "Invoice #1 send queued", to: "a@x.com" }] };
    expect(docSendStatusLine(job, "invoice", []).text).toBe("Never sent");
  });

  it("shows last delivered invoice send", () => {
    const job = {
      id: "J-1",
      invoiceHistory: [
        { date: "2026-07-10", kind: "Invoice #99 emailed", to: "old@x.com" },
        { date: "2026-07-14", kind: "Invoice #100 emailed", to: "new@x.com" },
      ],
    };
    expect(lastDocSend(job, "invoice")?.to).toBe("new@x.com");
    expect(docSendStatusLine(job, "invoice", []).text).toBe("Last sent 2026-07-14 to new@x.com");
  });

  it("separates estimate vs invoice history", () => {
    const job = {
      id: "J-1",
      invoiceHistory: [{ date: "2026-07-12", kind: "Estimate #55 emailed", to: "e@x.com" }],
    };
    expect(docSendStatusLine(job, "estimate", []).text).toContain("2026-07-12");
    expect(docSendStatusLine(job, "invoice", []).text).toBe("Never sent");
  });

  it("detects in-flight send commands", () => {
    const cmds = [{ type: "send_invoice", jobId: "J-1", status: "working" }];
    expect(docSendInFlight(cmds, "J-1", "invoice")).toBe(true);
    expect(docSendStatusLine({ id: "J-1", invoiceHistory: [] }, "invoice", cmds).text).toBe("Sending now…");
  });

  it("detects successful send commands even without history", () => {
    const job = { id: "J-1", invoiceNo: "251900", invoiceHistory: [] };
    const cmds = [
      { type: "send_invoice", jobId: "J-1", status: "failed", payload: { invoiceNo: "251900" } },
      { type: "send_invoice", jobId: "J-1", status: "done", payload: { invoiceNo: "251900", email: "a@x.com" } },
    ];
    expect(docSendSucceeded(cmds, job, "invoice")).toBe(true);
  });

  it("matches delivered history to the current doc number only", () => {
    const job = {
      id: "J-1",
      invoiceNo: "200",
      invoiceHistory: [{ date: "2026-07-01", kind: "Invoice #100 emailed", to: "old@x.com" }],
    };
    expect(lastDocSend(job, "invoice")).toBe(null);
    job.invoiceHistory.push({ date: "2026-07-14", kind: "Invoice #200 emailed", to: "new@x.com" });
    expect(lastDocSend(job, "invoice")?.to).toBe("new@x.com");
  });
});