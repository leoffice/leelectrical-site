import { describe, expect, it } from "vitest";
import { buildPageContext, viewLabel } from "../src/lib/pageContext.js";

describe("pageContext", () => {
  it("viewLabel maps routes", () => {
    expect(viewLabel("/")).toBe("Customers");
    expect(viewLabel("/today")).toBe("Calendar");
    expect(viewLabel("/job/J-1")).toBe("Job detail");
  });

  it("buildPageContext includes job info", () => {
    const ctx = buildPageContext("/job/J-1", {
      effectiveJob: (id) =>
        id === "J-1"
          ? {
              id: "J-1",
              customer: "Peretz Chein",
              title: "Panel upgrade",
              invoiceNo: "251808",
              amount: 1200,
              address: "123 Main St",
            }
          : null,
      jobs: [],
    });
    expect(ctx).toContain("Job detail");
    expect(ctx).toContain("Peretz Chein");
    expect(ctx).toContain("Panel upgrade");
    expect(ctx).toContain("251808");
  });
});