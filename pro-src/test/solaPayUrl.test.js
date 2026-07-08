import { describe, expect, it } from "vitest";
import { buildSolaPayUrl, parseUSAddress } from "../src/lib/solaPayUrl.js";

describe("solaPayUrl", () => {
  it("parses a US address", () => {
    expect(parseUSAddress("405 Lefferts Ave, Brooklyn, NY 11225")).toEqual({
      street: "405 Lefferts Ave",
      city: "Brooklyn",
      state: "NY",
      zip: "11225",
    });
  });

  it("builds a pre-filled Cardknox URL with xAmount and billing fields", () => {
    const url = buildSolaPayUrl({
      slug: "blzelectric",
      amount: 10350,
      invoiceNo: "231315",
      customer: "Golan Chakov",
      email: "g@x.com",
      phone: "718-555-1",
      billingAddress: "405 Lefferts Ave, Brooklyn, NY 11225",
    });
    expect(url).toContain("blzelectric?");
    expect(url).toContain("xAmount=10350");
    expect(url).toContain("xinvoice=231315");
    expect(url).toContain("xBillLastName=Golan");
    expect(url).toContain("xBillStreet=405");
    expect(url).toContain("xBillCity=Brooklyn");
    expect(url).toContain("xBillZip=11225");
  });
});