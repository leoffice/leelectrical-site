import { describe, expect, it } from "vitest";
import {
  STATEMENT_TYPES,
  buildStatementModel,
  defaultSelectedIds,
  listStatementItems,
  statementFilename,
} from "../src/lib/statementDoc.js";
import { buildQbStatementPdf } from "../src/lib/statementPdf.js";
import {
  buildSendDocConfirm,
  canApproveSendConfirm,
  docAttachmentName,
  EMAIL_POLICY_KEEP,
  EMAIL_POLICY_ONCE,
} from "../src/lib/sendDocConfirm.js";

const jobs = [
  {
    id: "j1",
    invoiceNo: "231595",
    invoiceDate: "2026-01-10",
    customer: "Morgan Cash Inc",
    businessName: "Morgan Cash Inc",
    email: "morgan@example.com",
    billingAddress: "1 Main St",
    title: "Service upgrade",
    amount: "20000",
    openBalance: "5000",
    payments: [{ id: "p1", amount: 15000, date: "2026-02-01", method: "Zelle" }],
  },
  {
    id: "j2",
    invoiceNo: "231600",
    invoiceDate: "2026-03-15",
    customer: "Morgan Cash Inc",
    amount: "3000",
    openBalance: "3000",
    title: "Panel work",
    paid: false,
  },
  {
    id: "j3",
    invoiceNo: "230100",
    invoiceDate: "2025-06-01",
    customer: "Morgan Cash Inc",
    amount: "1000",
    openBalance: "0",
    paid: true,
    title: "Old paid invoice",
  },
  {
    id: "est1",
    estimateNo: "E-9",
    amount: "99999",
    title: "Should not count",
  },
];

describe("statementDoc", () => {
  it("lists only invoices, chronological", () => {
    const items = listStatementItems(jobs);
    expect(items.map((r) => r.invoiceNo)).toEqual(["230100", "231595", "231600"]);
    expect(items.every((r) => r.invoiceNo)).toBe(true);
  });

  it("open_items defaults to open balances only", () => {
    const items = listStatementItems(jobs);
    const ids = defaultSelectedIds(items, "open_items");
    const selected = items.filter((r) => ids.includes(r.id));
    expect(selected.every((r) => r.isOpen)).toBe(true);
    expect(selected.length).toBe(2);
  });

  it("buildStatementModel open_items totals balance due", () => {
    const m = buildStatementModel({ jobs, type: "open_items", customerName: "Morgan Cash Inc" });
    expect(m.type).toBe("open_items");
    expect(m.rows.length).toBe(2);
    expect(m.totalDue).toBeCloseTo(8000, 0);
    expect(m.customerName).toBe("Morgan Cash Inc");
  });

  it("respects selectedIds for selectable content", () => {
    const items = listStatementItems(jobs);
    const only = [items[0].id]; // paid one
    const m = buildStatementModel({ jobs, type: "activity", selectedIds: only });
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].invoiceNo).toBe("230100");
  });

  it("balance_forward carries prior balance before dateFrom", () => {
    const m = buildStatementModel({
      jobs,
      type: "balance_forward",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      selectedIds: listStatementItems(jobs)
        .filter((r) => r.dateIso >= "2026-01-01")
        .map((r) => r.id),
    });
    expect(m.priorBalance).toBeCloseTo(0, 0); // 230100 is paid
    expect(m.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("has three statement types", () => {
    expect(STATEMENT_TYPES.map((t) => t.id)).toEqual([
      "open_items",
      "activity",
      "balance_forward",
    ]);
  });

  it("filename is statement-safe", () => {
    const m = buildStatementModel({ jobs, customerName: "Morgan Cash Inc" });
    expect(statementFilename(m)).toMatch(/^Statement-Morgan-Cash-Inc-/);
    expect(statementFilename(m)).toMatch(/\.pdf$/);
  });
});

describe("statementPdf", () => {
  it("builds a PDF blob with STATEMENT bytes", async () => {
    const m = buildStatementModel({ jobs, type: "open_items" });
    const blob = buildQbStatementPdf(m);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(500);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const head = String.fromCharCode(...buf.slice(0, 8));
    expect(head.startsWith("%PDF")).toBe(true);
    // Statement title appears in stream
    const text = new TextDecoder("latin1").decode(buf);
    expect(text).toContain("STATEMENT");
  });

  it("embeds link annotations when pay rows present", async () => {
    const m = buildStatementModel({
      jobs,
      type: "open_items",
      includePayLinks: true,
    });
    // Force a pay url on rows for annotation count (buildPayLandingUrl may yield empty in test)
    m.payRows = m.rows
      .filter((r) => r.isOpen)
      .map((r) => ({ inv: r.invoiceNo, amount: r.balance, url: "https://leelectrical.us/pay/test-" + r.invoiceNo }));
    const blob = buildQbStatementPdf(m);
    const text = new TextDecoder("latin1").decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text).toContain("/Subtype /Link");
    expect(text).toContain("leelectrical.us/pay/test-");
  });
});

describe("statement send confirm parity", () => {
  it("supports kind=statement with keep/once policy", () => {
    const job = {
      id: "j1",
      customer: "Morgan Cash Inc",
      email: "old@example.com",
      _statementModel: { totalDue: 8000, customerName: "Morgan Cash Inc" },
    };
    const m = buildSendDocConfirm({
      job,
      kind: "statement",
      email: "new@example.com",
      emailPolicy: EMAIL_POLICY_ONCE,
    });
    expect(m.kind).toBe("statement");
    expect(m.emailDiffers).toBe(true);
    expect(m.attachmentName).toMatch(/Statement/i);
    expect(m.subject).toMatch(/Statement/i);
    expect(canApproveSendConfirm(m)).toBe(true);

    const needPolicy = buildSendDocConfirm({
      job,
      kind: "statement",
      email: "new@example.com",
    });
    expect(needPolicy.emailDiffers).toBe(true);
    expect(canApproveSendConfirm(needPolicy)).toBe(false);

    const keep = buildSendDocConfirm({
      job,
      kind: "statement",
      email: "new@example.com",
      emailPolicy: EMAIL_POLICY_KEEP,
    });
    expect(canApproveSendConfirm(keep)).toBe(true);
    expect(docAttachmentName(job, "statement")).toMatch(/Statement/);
  });
});
