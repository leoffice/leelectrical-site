/**
 * Pay-link self-heal: when a short code is missing from KV (migration wipe),
 * rebuild payload from jobsdata under the same code so emailed URLs still open.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const paylinks = new Map();
const jobs = {
  jobs: [
    {
      id: "qbo-251849",
      customer: "Avi Loschak",
      email: "AviLoschak@gmail.com",
      phone: "805-636-3148",
      invoiceNo: "251849",
      amount: "$675",
      openBalance: "$675",
      paid: false,
      address: "542 Montgomery St, Brooklyn, NY",
      serviceAddress: "542 Montgomery St, Brooklyn, NY",
      invoiceLines: [
        {
          description: "Service call — junction box repair",
          itemName: "Service call:Service call",
          qty: 3,
          unitPrice: 225,
        },
      ],
    },
  ],
};

vi.mock("../../netlify/functions/lib/storage/index.mjs", () => ({
  getStore: (name) => {
    if (name === "paylinks") {
      return {
        get: async (k) => paylinks.get(k) || null,
        set: async (k, v) => void paylinks.set(k, typeof v === "string" ? v : JSON.stringify(v)),
      };
    }
    if (name === "jobsdata") {
      return {
        get: async () => jobs,
        set: async () => {},
      };
    }
    return { get: async () => null, set: async () => {} };
  },
  bindStorageEnv: () => {},
}));

const payLinkMod = await import("../../netlify/functions/pay-link.mjs");
const handler = payLinkMod.default;
const { makeCode, randomSuffix, healMissingPayLink } = payLinkMod;

describe("pay-link code format", () => {
  it("randomSuffix always yields 4 chars (CODE_RE)", () => {
    for (let i = 0; i < 20; i++) {
      expect(randomSuffix()).toMatch(/^[a-z0-9]{4}$/i);
    }
    // tiny random still pads
    expect(randomSuffix(() => 0)).toMatch(/^[a-z0-9]{4}$/i);
  });

  it("makeCode is 5-8 digits + hyphen + 4", () => {
    const code = makeCode("251849", () => 0.5);
    expect(code).toMatch(/^[0-9]{5,8}-[a-z0-9]{4}$/i);
    expect(code.startsWith("251849-")).toBe(true);
  });
});

describe("pay-link self-heal", () => {
  beforeEach(() => {
    paylinks.clear();
  });

  afterEach(() => {
    paylinks.clear();
  });

  it("heals missing code from jobsdata under the same code", async () => {
    const code = "251849-1tmm";
    const record = await healMissingPayLink(
      {
        get: async (k) => paylinks.get(k) || null,
        set: async (k, v) => void paylinks.set(k, typeof v === "string" ? v : JSON.stringify(v)),
      },
      code
    );
    expect(record).toBeTruthy();
    expect(record.healed).toBe(true);
    expect(record.payload.i).toBe("251849");
    expect(record.payload.c).toBe("Avi Loschak");
    expect(paylinks.has(`pl-${code}`)).toBe(true);
  });

  it("GET missing code self-heals and returns payload", async () => {
    const code = "251849-abcd";
    const req = new Request(`https://leelectrical.us/.netlify/functions/pay-link?code=${code}`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    const res = await handler(req, {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.code).toBe(code);
    expect(body.payload.i).toBe("251849");
    expect(body.healed).toBe(true);
    expect(paylinks.has(`pl-${code}`)).toBe(true);
  });

  it("GET still 404s when invoice is unknown", async () => {
    const req = new Request(
      "https://leelectrical.us/.netlify/functions/pay-link?code=999991-zzzz",
      { method: "GET", headers: { accept: "application/json" } }
    );
    const res = await handler(req, {});
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("link not found");
  });

  it("POST can re-bind a preferred code matching the invoice", async () => {
    const req = new Request("https://leelectrical.us/.netlify/functions/pay-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "251849-1tmm",
        payload: {
          i: "251849",
          a: 675,
          c: "Avi Loschak",
          sl: "blzelectric",
          k: "i",
        },
      }),
    });
    const res = await handler(req, {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.code).toBe("251849-1tmm");
    expect(body.url).toContain("/pay/251849-1tmm");
    expect(paylinks.has("pl-251849-1tmm")).toBe(true);
  });

  it("POST rejects preferred code that does not match invoice", async () => {
    const req = new Request("https://leelectrical.us/.netlify/functions/pay-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "111111-abcd",
        payload: { i: "251849", a: 675, sl: "blzelectric", k: "i" },
      }),
    });
    const res = await handler(req, {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/match/i);
  });
});
