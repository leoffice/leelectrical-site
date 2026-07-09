import { describe, expect, it } from "vitest";
import {
  digitsOnly,
  scoreCustomer,
  searchCustomerIndex,
} from "../../netlify/functions/lib/customerSearch.mjs";

const SAMPLE = [
  {
    id: "34",
    name: "Avraham Drizin",
    businessName: "Drizin Properties",
    personName: "Avraham",
    phone: "718-555-0100",
    email: "az@drizin.com",
    billingAddress: "500 Lefferts Ave",
  },
  {
    id: "49",
    name: "Chanan Sheleg",
    businessName: "Chanan Sheleg",
    personName: "",
    phone: "3474448520",
    email: "hanan770@gmail.com",
    billingAddress: "499 schenectedy ave",
  },
  {
    id: "900",
    name: "1325 Union St",
    businessName: "NMF Properties Llc.",
    personName: "1325 St",
    phone: "(917) 755-4762",
    email: "theperfectmanagement@gmail.com",
  },
];

describe("customerSearch.mjs", () => {
  it("matches business name tokens", () => {
    const out = searchCustomerIndex(SAMPLE, "drizin");
    expect(out[0].id).toBe("34");
  });

  it("matches person name", () => {
    const out = searchCustomerIndex(SAMPLE, "Avraham");
    expect(out[0].id).toBe("34");
  });

  it("matches phone digits", () => {
    expect(scoreCustomer(SAMPLE[1], "3474448520")).toBeGreaterThan(0);
    const out = searchCustomerIndex(SAMPLE, "347-444-8520");
    expect(out[0].id).toBe("49");
  });

  it("matches email and local-part", () => {
    const out = searchCustomerIndex(SAMPLE, "hanan770@gmail.com");
    expect(out[0].id).toBe("49");
    expect(searchCustomerIndex(SAMPLE, "hanan770")[0].id).toBe("49");
  });

  it("digitsOnly strips formatting", () => {
    expect(digitsOnly("(917) 755-4762")).toBe("9177554762");
  });

  it("matches billing address tokens", () => {
    const out = searchCustomerIndex(SAMPLE, "schenectedy");
    expect(out[0].id).toBe("49");
    const leff = searchCustomerIndex(SAMPLE, "500 Lefferts");
    expect(leff[0].id).toBe("34");
  });
});