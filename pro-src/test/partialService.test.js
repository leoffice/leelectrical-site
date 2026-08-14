// Partial Service invoice preset (Levi 2026-08-14): two generated visit
// lines (emergency + follow-up), ticket # embedded in the description,
// editable per-visit rates ($265/hr emergency, $225/hr follow-up — Levi
// confirmed) — and the Con Ed refund block in the EMAIL body only, never on
// the invoice PDF.
import { describe, expect, it } from "vitest";
import {
  CONED_REFUND_INSTRUCTIONS,
  CONED_REFUND_MARKER,
  PARTIAL_SERVICE_FOLLOWUP_RATE,
  PARTIAL_SERVICE_INITIAL_HOURS,
  PARTIAL_SERVICE_INITIAL_RATE,
  buildPartialServiceLines,
  hasPartialServiceLines,
  isPartialServiceProduct,
  jobHasPartialService,
  withConedRefundInstructions,
} from "../src/lib/partialService.js";
import { defaultDocEmailBody, buildSendDocConfirm } from "../src/lib/sendDocConfirm.js";
import { mapJobToQbDocData } from "../src/lib/jobToQbDoc.js";

const partialJob = () => ({
  id: "J-PS-1",
  customer: "419 Kingston Realty",
  email: "mgmt@example.com",
  invoiceNo: "251900",
  invoiceLines: buildPartialServiceLines({
    serviceDate: "2026-08-10",
    ticketNo: "CE-4821",
  }),
});

const normalJob = () => ({
  id: "J-N-1",
  customer: "Peretz Chein",
  email: "p@x.com",
  invoiceNo: "251841",
  title: "Panel upgrade",
  invoiceLines: [
    { itemName: "General electrical work", description: "Panel upgrade", qty: 1, unitPrice: 2300 },
  ],
});

describe("partial-service preset lines", () => {
  it("matches the catalog item name (and only it)", () => {
    expect(isPartialServiceProduct("Partial Service")).toBe(true);
    expect(isPartialServiceProduct("partial service")).toBe(true);
    expect(isPartialServiceProduct("Service call:Service call")).toBe(false);
    expect(isPartialServiceProduct("")).toBe(false);
  });

  it("builds BOTH visits: 1.5h @ $265 initial + 1h @ $225 follow-up", () => {
    const [initial, follow] = buildPartialServiceLines({
      serviceDate: "2026-08-10",
      ticketNo: "CE-4821",
    });
    expect(initial.qty).toBe(PARTIAL_SERVICE_INITIAL_HOURS); // Levi: "an hour and a half"
    expect(initial.unitPrice).toBe(PARTIAL_SERVICE_INITIAL_RATE); // $265 — Levi confirmed, NOT $2.25
    expect(PARTIAL_SERVICE_INITIAL_RATE).toBe(265);
    expect(follow.qty).toBe(1);
    expect(follow.unitPrice).toBe(PARTIAL_SERVICE_FOLLOWUP_RATE); // $225 — Levi confirmed
    expect(PARTIAL_SERVICE_FOLLOWUP_RATE).toBe(225);
    // 1.5 × 265 = 397.50, + 1 × 225 = 622.50
    expect(initial.qty * initial.unitPrice).toBe(397.5);
    expect(initial.qty * initial.unitPrice + follow.qty * follow.unitPrice).toBe(622.5);
  });

  it("embeds the date and Con Ed ticket # in the emergency-visit description", () => {
    const [initial] = buildPartialServiceLines({ serviceDate: "2026-08-10", ticketNo: "CE-4821" });
    expect(initial.description).toContain("8/10/2026");
    expect(initial.description).toContain("Ticket # CE-4821");
    expect(initial.description).toMatch(/emergency service for power outage/i);
    expect(initial.description).toMatch(/temporary bridge/i);
  });

  it("omits the ticket clause when there is no ticket yet", () => {
    const [initial] = buildPartialServiceLines({ serviceDate: "2026-08-10" });
    expect(initial.description).not.toContain("Ticket #");
    expect(initial.description).toMatch(/emergency ticket with Con Ed\./i);
  });

  it("keeps Levi's follow-up wording on line 2", () => {
    const [, follow] = buildPartialServiceLines({});
    expect(follow.description).toMatch(/verifying power restoration/i);
    expect(follow.description).toMatch(/removal of temporary bridge wiring/i);
    expect(follow.description).toMatch(/restoring service to safe conditions/i);
  });

  it("honors edited rates and hours (both rates editable — never hardcoded)", () => {
    const [initial, follow] = buildPartialServiceLines({
      initialHours: 2,
      rate: 300,
      followUpRate: 240,
    });
    expect(initial.qty).toBe(2);
    expect(initial.unitPrice).toBe(300);
    expect(follow.unitPrice).toBe(240);
  });

  it("detects partial-service jobs from flags OR wording", () => {
    expect(jobHasPartialService(partialJob())).toBe(true);
    expect(jobHasPartialService(normalJob())).toBe(false);
    expect(hasPartialServiceLines([{ itemName: "Partial Service" }])).toBe(true);
    expect(
      hasPartialServiceLines([{ description: "Installation of temporary bridge connection." }])
    ).toBe(true);
    expect(hasPartialServiceLines([])).toBe(false);
  });
});

describe("Con Ed refund block in the customer email", () => {
  it("partial-service invoice email body carries the exact refund block near the top", () => {
    const body = defaultDocEmailBody(partialJob(), "invoice");
    expect(body).toContain(CONED_REFUND_INSTRUCTIONS);
    // Prominent: before the boilerplate tail, right after the intro line.
    expect(body.indexOf(CONED_REFUND_MARKER)).toBeLessThan(body.indexOf("The PDF is attached"));
    // Verbatim address / fax / checklist from #251839 & #251797.
    expect(body).toContain("30 Flatbush Ave 11217");
    expect(body).toContain("Or fax to: 718-643-6943");
    expect(body).toContain("• A request for a refund");
  });

  it("normal invoice email body has NO refund block", () => {
    expect(defaultDocEmailBody(normalJob(), "invoice")).not.toContain(CONED_REFUND_MARKER);
  });

  it("estimates never get the refund block, even with partial lines around", () => {
    const j = { ...partialJob(), estimateNo: "25500" };
    expect(defaultDocEmailBody(j, "estimate")).not.toContain(CONED_REFUND_MARKER);
  });

  it("confirm-sheet model (resend path) carries the block by default", () => {
    const m = buildSendDocConfirm({ job: partialJob(), kind: "invoice", docSource: "local" });
    expect(m.message).toContain(CONED_REFUND_MARKER);
  });

  it("withConedRefundInstructions inserts after the intro and is idempotent", () => {
    const base = "Hi there,\n\nYour invoice #1 is ready.\n\nThank you";
    const once = withConedRefundInstructions(base);
    expect(once.indexOf(CONED_REFUND_MARKER)).toBeGreaterThan(once.indexOf("is ready"));
    expect(once.indexOf(CONED_REFUND_MARKER)).toBeLessThan(once.indexOf("Thank you"));
    const twice = withConedRefundInstructions(once);
    expect(twice).toBe(once);
    expect(withConedRefundInstructions("")).toBe(CONED_REFUND_INSTRUCTIONS);
  });
});

describe("the invoice PDF never carries the refund block", () => {
  it("the PDF's doc-model for a partial-service invoice has no refund text", () => {
    // The client PDF renders exclusively from mapJobToQbDocData — if the
    // refund wording is absent here, it cannot appear on the printed invoice.
    const data = mapJobToQbDocData(partialJob(), "invoice");
    const flat = JSON.stringify(data);
    expect(flat).not.toContain(CONED_REFUND_MARKER);
    expect(flat).not.toContain("Flatbush");
    expect(flat).not.toContain("718-643-6943");
    // …while the actual visit lines DID make it onto the PDF.
    expect(flat).toMatch(/temporary bridge/i);
    expect(flat).toContain("Ticket # CE-4821");
  });

  it("generated line descriptions themselves never contain refund wording", () => {
    for (const ln of buildPartialServiceLines({ ticketNo: "123" })) {
      expect(ln.description).not.toContain(CONED_REFUND_MARKER);
      expect(ln.description).not.toContain("refund");
    }
  });
});
