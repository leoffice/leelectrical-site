/**
 * Pay-link refresh-on-open (Levi 2026-08-12, invoice 251854): a stored short
 * link is a snapshot from send time — resolving it must rebuild balance and
 * content from the LIVE job (jobsdata ⊕ ov overlay) so a customer can never
 * see a stale amount, the dictation-garbage billing address, or another
 * customer's invoice (251854 is shared by two customers).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const paylinks = new Map();

const jobsDoc = {
  jobs: [
    {
      id: "qbo-est-25435",
      customer: "Gabriel development.",
      invoiceNo: "251854",
      amount: "$2,800",
      openBalance: 0,
      paid: true,
      email: "gabriel@example.com",
      payments: [{ id: "g1", amount: "$2800", method: "Check", date: "2026-07-31" }],
    },
    {
      id: "local-1785688750694",
      customer: "Goodness and kindness",
      invoiceNo: "251854",
      amount: "$4,600",
      openBalance: 0,
      paid: true,
      email: "goodness@example.com",
      phone: "917-755-2477",
      serviceAddress: "1337 President St, Brooklyn, NY",
      address: "1337 President St, Brooklyn, NY",
      billingAddress: "1349 President St, Brooklyn, NY 11213",
      invoiceLines: [
        {
          itemName: "Service Upgrade:1 Meter",
          description: "Electrical services — 200A 3-phase meter package (50% progress)",
          qty: 0.5,
          unitPrice: 9200,
          progressBilling: true,
        },
      ],
      payments: [{ id: "p0", amount: "$1800", date: "2026-08-06" }],
    },
    {
      id: "qbo-777",
      customer: "Solo Customer",
      invoiceNo: "251900",
      amount: "$1,000",
      openBalance: "$1,000",
      email: "solo@example.com",
      serviceAddress: "9 Main St, Brooklyn, NY",
    },
  ],
};

// ov overlay: office edits win at render time. Levi's edit raised the invoice
// and poisoned the addresses with a dictation leftover.
const ovDoc = {
  ov: {
    "local-1785688750694": {
      amount: "$9,200",
      openBalance: 2300,
      invoiceProgressBilling: true,
      paymentBaseline: 2300,
      amountWhenBaselined: 4600,
      billingAddress: "1349 president st\nBrooklyn New York 11213\n\n\nWe are going to in",
      serviceAddress: "1337 President St, Brooklyn, NY\n\n\nWe are going to in",
      payments: [
        { id: "p0", amount: "$1800", date: "2026-08-06" },
        { id: "p1", amount: "$2800", date: "2026-08-09" },
      ],
    },
  },
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
      return { get: async () => jobsDoc, set: async () => {} };
    }
    if (name === "jobstate") {
      return { get: async () => ovDoc, set: async () => {} };
    }
    return { get: async () => null, set: async () => {} };
  },
  bindStorageEnv: () => {},
}));

const handler = (await import("../../netlify/functions/pay-link.mjs")).default;
const { refreshedInvoicePayload, loadLiveInvoiceJob } = await import(
  "../../netlify/functions/lib/payLinkRefresh.mjs"
);

function jsonGet(code, extra = "") {
  return handler(
    new Request(`https://leelectrical.us/.netlify/functions/pay-link?code=${code}${extra}`, {
      headers: { accept: "application/json" },
    })
  );
}

const STALE_GOODNESS = {
  j: "local-1785688750694",
  i: "251854",
  a: 2300,
  fe: 1,
  c: "Goodness and kindness",
  w: "old snapshot text",
  t: "$2,300.00",
  d: "$2,300.00",
  p: "",
  ps: [],
  e: "goodness@example.com",
  sa: "1337 President St, Brooklyn, NY",
  ba: "1349 president st\nBrooklyn New York 11213\n\n\nWe are going to in",
  sl: "blzelectric",
  pay: "https://secure.cardknox.com/blzelectric?xAmount=2300",
  as: "2026-08-02",
  k: "i",
};

beforeEach(() => {
  paylinks.clear();
});

describe("refresh-on-open", () => {
  it("stored stale snapshot resolves to the LIVE balance (ov overlay wins)", async () => {
    paylinks.set(
      "pl-251854-upcx",
      JSON.stringify({ payload: STALE_GOODNESS, createdAt: Date.now(), invoiceNo: "251854" })
    );
    const res = await jsonGet("251854-upcx");
    const body = await res.json();
    expect(body.ok).toBe(true);
    // ov overlay: amount $9,200, openBalance 2300, ledger $4,600 → due $2,300
    expect(body.payload.a).toBe(2300);
    expect(body.payload.d).toBe("$2,300.00");
    expect(body.payload.t).toBe("$9,200.00");
    expect(body.payload.p).toBe("$4,600.00");
    expect(body.payload.ps).toHaveLength(2);
    // link-intent fields survive as minted
    expect(body.payload.pay).toBe(STALE_GOODNESS.pay);
    expect(body.payload.e).toBe("goodness@example.com");
    expect(body.payload.fe).toBe(1);
  });

  it("strips the dictation garbage from billing + service addresses", async () => {
    paylinks.set(
      "pl-251854-upcx",
      JSON.stringify({ payload: STALE_GOODNESS, createdAt: Date.now(), invoiceNo: "251854" })
    );
    const res = await jsonGet("251854-upcx");
    const body = await res.json();
    expect(body.payload.ba).toBe("1349 president st\nBrooklyn New York 11213");
    expect(body.payload.sa).toBe("1337 President St, Brooklyn, NY");
    expect(JSON.stringify(body.payload)).not.toMatch(/we are going to/i);
  });

  it("rf is sticky: a second open after the refresh persisted still avoids the stale PDF", async () => {
    paylinks.set(
      "pl-251854-upcx",
      JSON.stringify({ payload: STALE_GOODNESS, createdAt: Date.now(), invoiceNo: "251854" })
    );
    await jsonGet("251854-upcx"); // first open: refresh + persist (money changed → rf)
    const res = await jsonGet("251854-upcx"); // second open: stored is already fresh
    const body = await res.json();
    expect(body.payload.rf).toBe(1); // stored PDF is STILL from the mint — keep rebuilding
  });

  it("flags rf and persists the refreshed payload back to the store", async () => {
    paylinks.set(
      "pl-251854-upcx",
      JSON.stringify({ payload: STALE_GOODNESS, createdAt: Date.now(), invoiceNo: "251854" })
    );
    const res = await jsonGet("251854-upcx");
    const body = await res.json();
    expect(body.payload.rf).toBe(1); // money changed → client rebuilds the PDF
    const stored = JSON.parse(paylinks.get("pl-251854-upcx"));
    expect(stored.payload.d).toBe("$2,300.00");
    expect(stored.refreshedAt).toBeGreaterThan(0);
    expect(stored.createdAt).toBeLessThanOrEqual(stored.refreshedAt);
  });

  it("duplicate invoiceNo: matches by job id, never the other customer", async () => {
    paylinks.set(
      "pl-251854-upcx",
      JSON.stringify({ payload: STALE_GOODNESS, createdAt: Date.now(), invoiceNo: "251854" })
    );
    const res = await jsonGet("251854-upcx");
    const body = await res.json();
    expect(body.payload.c).toBe("Goodness and kindness");
    expect(body.payload.j).toBe("local-1785688750694");
  });

  it("duplicate invoiceNo without id falls back to the customer-name match", async () => {
    const job = await loadLiveInvoiceJob({ invoiceNo: "251854", customer: "Gabriel development." });
    expect(job?.id).toBe("qbo-est-25435");
    const none = await loadLiveInvoiceJob({ invoiceNo: "251854", customer: "" });
    expect(none).toBeNull(); // ambiguous with no name — refuse, never guess
  });

  it("keeps the stored snapshot when the job cannot be resolved", async () => {
    const orphan = { ...STALE_GOODNESS, i: "999999", j: "gone", c: "Nobody" };
    paylinks.set(
      "pl-999999-abcd",
      JSON.stringify({ payload: orphan, createdAt: Date.now(), invoiceNo: "999999" })
    );
    const res = await jsonGet("999999-abcd");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.payload.a).toBe(2300); // unchanged snapshot beats a dead link
  });

  it("estimate landings are never refreshed", () => {
    const est = { i: "201963", k: "e", a: 9200, lines: [] };
    expect(refreshedInvoicePayload(est, jobsDoc.jobs[1])).toBeNull();
  });

  it("deliberate partial link keeps its amount while still owed", () => {
    const partial = { ...STALE_GOODNESS, a: 500, d: "$2,300.00" };
    const job = { ...jobsDoc.jobs[2] }; // $1,000 open
    const fresh = refreshedInvoicePayload(partial, job);
    expect(fresh.a).toBe(500);
    expect(fresh.d).toBe("$1,000.00");
  });

  it("paid-in-full invoice resolves to $0 with Paid in full", async () => {
    const staleGabriel = {
      j: "qbo-est-25435",
      i: "251854",
      a: 2800,
      c: "Gabriel development.",
      t: "$2,800.00",
      d: "$2,800.00",
      e: "gabriel@example.com",
      sl: "blzelectric",
      k: "i",
      as: "2026-07-31",
    };
    paylinks.set(
      "pl-251854-jen9",
      JSON.stringify({ payload: staleGabriel, createdAt: Date.now(), invoiceNo: "251854" })
    );
    const res = await jsonGet("251854-jen9");
    const body = await res.json();
    expect(body.payload.a).toBe(0);
    expect(body.payload.d).toBe("Paid in full");
    expect(body.payload.p).toBe("$2,800.00");
  });

  it("bare invoice code heals against the live job (unique invoiceNo)", async () => {
    const res = await jsonGet("251900");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.payload.c).toBe("Solo Customer");
    expect(body.payload.a).toBe(1000);
    expect(body.payload.d).toBe("$1,000.00");
  });

  it("bare invoice code with duplicate invoiceNo refuses instead of guessing", async () => {
    const res = await jsonGet("251854");
    expect(res.status).toBe(404);
  });

  it("bare invoice code with a job-id hint resolves the right customer", async () => {
    const res = await jsonGet("251854", "&j=local-1785688750694");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.payload.c).toBe("Goodness and kindness");
    expect(body.payload.d).toBe("$2,300.00");
  });
});
