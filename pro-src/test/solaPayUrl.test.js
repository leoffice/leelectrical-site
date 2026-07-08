import { describe, expect, it } from "vitest";
import { buildSolaPayUrl, parseUSAddress } from "../src/lib/solaPayUrl.js";

describe("solaPayUrl", () => {
  it("parses addresses with zip (comma and space before zip)", () => {
    expect(parseUSAddress("405 Lefferts Ave, Brooklyn, NY 11225")).toEqual({
      street: "405 Lefferts Ave",
      city: "Brooklyn",
      state: "NY",
      zip: "11225",
    });
    expect(parseUSAddress("1 Main St, Brooklyn, NY 11201")).toEqual({
      street: "1 Main St",
      city: "Brooklyn",
      state: "NY",
      zip: "11201",
    });
  });

  it("builds a pre-filled Cardknox URL with xBillZip", () => {
    const url = buildSolaPayUrl({
      slug: "blzelectric",
      amount: 10350,
      invoiceNo: "231315",
      customer: "Golan Chakov",
      email: "g@x.com",
      phone: "718-555-1",
      billingAddress: "405 Lefferts Ave, Brooklyn, NY 11225",
    });
    expect(url).toContain("xBillZip=11225");
    expect(url).toContain("xBillState=NY");
    expect(url).toContain("xAmount=10350");
  });

  it("includes payment confirmation redirect, webhook, and principal amount", () => {
    const url = buildSolaPayUrl({
      slug: "blzelectric",
      amount: 674.82,
      principalAmount: 652,
      jobId: "J-42",
      invoiceNo: "251839",
    });
    expect(url).toContain("sola-payment");
    expect(url).toContain("xPostURL=");
    expect(url).toContain("xCustom01=652");
    expect(url).toContain("xCustom02=J-42");
  });

  it("uses explicit zip from payload when provided", () => {
    const url = buildSolaPayUrl({
      slug: "lepaymentsdev",
      amount: 674.82,
      invoiceNo: "251839",
      customer: "Rae Klein",
      billingAddress: "55 Elm St, Brooklyn, NY",
      zip: "11201",
    });
    expect(url).toContain("xBillZip=11201");
  });
});