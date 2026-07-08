import { describe, expect, it } from "vitest";
import {
  buildPayLandingPayload,
  buildPayLandingUrl,
  decodePayLanding,
  encodePayLanding,
} from "../src/lib/payLanding.js";

const job = {
  customer: "Golan Chakov",
  title: "Panel upgrade",
  amount: "$41,000",
  openBalance: 10000,
  invoiceNo: "231315",
  email: "golan@x.com",
  phone: "718-555-1",
  address: "405 Lefferts Ave, Brooklyn, NY 11225",
  billingAddress: "405 Lefferts Ave, Brooklyn, NY 11225",
};

const cardknox = "https://secure.cardknox.com/blzelectric?xAmount=10000&xinvoice=231315";

describe("payLanding", () => {
  it("round-trips encode/decode with billing fields", () => {
    const payload = buildPayLandingPayload({
      job,
      cardknoxUrl: cardknox,
      linkAmount: "10000",
      inv: "231315",
      siteSlug: "blzelectric",
    });
    const token = encodePayLanding(payload);
    const decoded = decodePayLanding(token);
    expect(decoded.i).toBe("231315");
    expect(decoded.c).toBe("Golan Chakov");
    expect(decoded.sl).toBe("blzelectric");
    expect(decoded.e).toBe("golan@x.com");
    expect(decoded.ba).toContain("Brooklyn");
    expect(decoded.a).toBe(10000);
  });

  it("builds a customer-facing landing URL", () => {
    const url = buildPayLandingUrl({ job, cardknoxUrl: cardknox, linkAmount: "10000", inv: "231315" });
    expect(url).toMatch(/\/app\/pro\/#\/pay\//);
    const token = url.split("/pay/")[1];
    expect(decodePayLanding(token).sl).toBe("blzelectric");
  });

  it("accepts legacy tokens that only carry pay URL", () => {
    const token = encodePayLanding({
      i: "231315",
      a: 10000,
      pay: cardknox,
    });
    expect(decodePayLanding(token).pay).toBe(cardknox);
  });

  it("rejects invalid tokens", () => {
    expect(decodePayLanding("")).toBeNull();
    expect(decodePayLanding("not-valid-base64!!!")).toBeNull();
    expect(decodePayLanding(encodePayLanding({ i: "1" }))).toBeNull();
  });
});