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

  /** Seewald-style progress invoice — richer desc, progress %, payment ledger. */
  const seewald = {
    id: "qbo-231595",
    invoiceNo: "231595",
    invoiceDate: "2024-11-20",
    customer: "Shneor Seewald",
    businessName: "Shneor Seewald",
    title: "Installation of the electrical wiring in the house including sub-panels.\n\nPrice Includes:",
    amount: 32700,
    openBalance: 16700,
    invoiceProgressPct: 76.4,
    invoiceLines: [
      {
        description:
          "Installation of the electrical wiring in the house including sub-panels and low-voltage LED work.\n\nProgress billing: 75% of $40,000 = $30,000.",
        qty: 0.75,
        rate: 40000,
        amount: 30000,
        progressBilling: true,
      },
      {
        description: "Change Order #01 - First floor lighting: Installed 45 lights.",
        qty: 1,
        rate: 2700,
        amount: 2700,
      },
    ],
    payments: [
      { id: "p1", amount: 5000, date: "2024-12-05", method: "ACH", ref: "Morgan Cash" },
      { id: "p2", amount: 5000, date: "2026-07-18", method: "Zelle", ref: "JPM99cpprhp9" },
      { id: "p3", amount: 5000, date: "2026-07-24", method: "Zelle", ref: "JPM99cqgpzj7" },
      { id: "p4", amount: 1000, date: "2026-07-26", method: "Zelle", ref: "JPM99cqnaprn" },
    ],
  };

  it("uses invoice-line description + progress + CO (not choppy title)", () => {
    const items = listStatementItems([seewald]);
    expect(items).toHaveLength(1);
    expect(items[0].description).toMatch(/Installation of the electrical wiring/i);
    expect(items[0].description).not.toMatch(/Price Includes/i);
    expect(items[0].description).toMatch(/Change Order #01/i);
    expect(items[0].progressLabel).toMatch(/Progress 75%/);
  });

  it("activity expands payment transaction history as ledger rows", () => {
    const m = buildStatementModel({
      jobs: [seewald],
      type: "activity",
      customerName: "Shneor Seewald",
    });
    expect(m.paymentLines.length).toBe(4);
    const payRows = m.rows.filter((r) => r.kind === "payment");
    const invRows = m.rows.filter((r) => r.kind === "invoice");
    expect(invRows).toHaveLength(1);
    expect(payRows).toHaveLength(4);
    expect(payRows.some((r) => /Zelle.*JPM99cqnaprn/i.test(r.description))).toBe(true);
    // Running balance: 32700 - 16000 = 16700
    expect(m.rows[m.rows.length - 1].runningBalance).toBeCloseTo(16700, 0);
    expect(m.totalDue).toBeCloseTo(16700, 0);
    expect(m.totalPaid).toBeCloseTo(16000, 0);
  });

  it("open_items still invoice-centric but exposes paymentLines", () => {
    const m = buildStatementModel({ jobs: [seewald], type: "open_items" });
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].kind).toBeUndefined();
    expect(m.paymentLines.length).toBe(4);
    expect(m.totalDue).toBeCloseTo(16700, 0);
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
    m.payRows = (m.invoiceRows || m.rows)
      .filter((r) => r.isOpen)
      .map((r) => ({ inv: r.invoiceNo, amount: r.balance, url: "https://leelectrical.us/pay/test-" + r.invoiceNo }));
    const blob = buildQbStatementPdf(m);
    const text = new TextDecoder("latin1").decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text).toContain("/Subtype /Link");
    expect(text).toContain("leelectrical.us/pay/test-");
  });

  it("activity PDF includes payment history text", async () => {
    const seewaldJob = {
      id: "qbo-231595",
      invoiceNo: "231595",
      invoiceDate: "2024-11-20",
      customer: "Shneor Seewald",
      amount: 32700,
      openBalance: 16700,
      title: "Install",
      invoiceLines: [
        {
          description: "Installation of the electrical wiring in the house including sub-panels.",
          qty: 0.75,
          rate: 40000,
          amount: 30000,
          progressBilling: true,
        },
      ],
      payments: [{ id: "p1", amount: 5000, date: "2026-07-18", method: "Zelle", ref: "JPM99cpprhp9" }],
    };
    const m = buildStatementModel({ jobs: [seewaldJob], type: "activity" });
    const blob = buildQbStatementPdf(m);
    const text = new TextDecoder("latin1").decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text).toContain("Payment");
    expect(text).toContain("Zelle");
    expect(text).toContain("Progress 75%");
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
