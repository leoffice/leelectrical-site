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
};

const cardknox = "https://secure.cardknox.com/lepaymentsdev?xamount=10000&xinvoice=231315";

describe("payLanding", () => {
  it("round-trips encode/decode", () => {
    const payload = buildPayLandingPayload({ job, cardknoxUrl: cardknox, linkAmount: "10000", inv: "231315" });
    const token = encodePayLanding(payload);
    const decoded = decodePayLanding(token);
    expect(decoded.i).toBe("231315");
    expect(decoded.c).toBe("Golan Chakov");
    expect(decoded.pay).toBe(cardknox);
    expect(decoded.a).toBe(10000);
  });

  it("builds a customer-facing landing URL", () => {
    const url = buildPayLandingUrl({ job, cardknoxUrl: cardknox, linkAmount: "10000", inv: "231315" });
    expect(url).toMatch(/\/app\/pro\/#\/pay\//);
    const token = url.split("/pay/")[1];
    expect(decodePayLanding(token).pay).toBe(cardknox);
  });

  it("rejects invalid tokens", () => {
    expect(decodePayLanding("")).toBeNull();
    expect(decodePayLanding("not-valid-base64!!!")).toBeNull();
    expect(decodePayLanding(encodePayLanding({ i: "1" }))).toBeNull();
  });
});