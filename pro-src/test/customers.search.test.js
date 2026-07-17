// Unit — customer smart-search plumbing for the New Job form (#49/#55) and the
// Jobs-tab QBO import (#56): the adapter's /customers call, the pick->prefill
// patch, and the "not in the app yet" filter. Pure logic + mocked fetch (node
// env), so this runs fast and independently of the jsdom UI suites.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNetlifyAdapter } from "../src/data/netlifyAdapter.js";
import {
  customerNameMatches,
  customerPickPatch,
  jobsForCustomerKey,
  openDocsForCustomer,
  unknownCustomers,
} from "../src/lib/customers.js";

describe("adapter.searchCustomers", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(routes) {
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        const path = String(url).split("/functions/")[1].split("?")[0];
        calls.push({ url: String(url), path });
        const h = routes[path];
        const data = typeof h === "function" ? h(String(url)) : h;
        return { ok: true, status: 200, json: async () => data };
      })
    );
    return calls;
  }

  it("hits /customers with the q param and returns the array", async () => {
    const calls = stub({
      customers: { customers: [{ name: "Avraham Drizin", id: "34" }], ts: 1 },
    });
    const api = createNetlifyAdapter();
    const out = await api.searchCustomers("drizin");
    expect(out).toEqual([{ name: "Avraham Drizin", id: "34" }]);
    expect(calls[0].url).toMatch(/q=drizin/);
  });

  it("no query -> plain index request", async () => {
    const calls = stub({ customers: { customers: [{ name: "Alex", id: "15" }] } });
    const api = createNetlifyAdapter();
    expect(await api.searchCustomers()).toHaveLength(1);
    expect(calls[0].url).not.toMatch(/q=/);
  });

  it("returns [] on a network error (search must never break the form)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    const api = createNetlifyAdapter();
    expect(await api.searchCustomers("x")).toEqual([]);
  });

  it("getCustomer fetches the full row by id", async () => {
    stub({
      customers: (url) => {
        if (String(url).includes("id=34"))
          return {
            customer: {
              id: "34",
              name: "Avraham Drizin",
              phone: "718-555-0100",
              email: "a@d.com",
              billingAddress: "12 Bill St",
            },
            ts: 1,
          };
        return { customers: [], ts: 1 };
      },
    });
    const api = createNetlifyAdapter();
    const c = await api.getCustomer("34");
    expect(c.phone).toBe("718-555-0100");
    expect(c.billingAddress).toBe("12 Bill St");
  });

  it("returns [] when the payload has no customers array", async () => {
    stub({ customers: {} });
    const api = createNetlifyAdapter();
    expect(await api.searchCustomers("x")).toEqual([]);
  });
});

describe("customerPickPatch (#55 prefill on pick)", () => {
  const jobs = [
    { id: "j1", customer: "Meir Kabakov", phone: "718-1", email: "m@x.com", address: "10 Main St" },
    { id: "j2", customer: "meir kabakov ", phone: "718-2" }, // same normalized name
    { id: "jarch", customer: "Meir Kabakov", phone: "999", _archived: true }, // ignored
    { id: "j3", customer: "Someone Else", phone: "000" },
  ];

  it("existing match: fills name + qboCustomerId + contact from the customer's jobs", () => {
    const p = customerPickPatch({ name: "Meir Kabakov", id: 246 }, jobs);
    expect(p.customer).toBe("Meir Kabakov");
    expect(p.qboCustomerId).toBe("246"); // coerced to string
    expect(p.phone).toBe("718-1"); // first non-empty across the customer's jobs
    expect(p.email).toBe("m@x.com");
    expect("serviceAddress" in p).toBe(false); // per invoice/estimate — not copied from other jobs
  });

  it("omits contact keys when the customer has no jobs yet (only name + id)", () => {
    const p = customerPickPatch({ name: "Brand New Guy", id: "500" }, jobs);
    expect(p).toEqual({ customer: "Brand New Guy", businessName: "Brand New Guy", qboCustomerId: "500" });
    expect("phone" in p).toBe(false); // nothing to clobber existing input with
  });

  it("matches jobs by qboCustomerId when the display name differs", () => {
    const byId = [
      { id: "j9", customer: "A. Drizin", phone: "718-9", email: "a@d.com", address: "9 St", qboCustomerId: "34" },
    ];
    const p = customerPickPatch({ name: "Avraham Drizin", id: "34" }, byId);
    expect(p.phone).toBe("718-9");
    expect(p.email).toBe("a@d.com");
    expect("serviceAddress" in p).toBe(false);
  });

  it("_newCustomer pick contributes just the typed name, no id", () => {
    const p = customerPickPatch({ name: "Typed Name", _newCustomer: true }, jobs);
    expect(p).toEqual({ customer: "Typed Name", businessName: "Typed Name", qboCustomerId: "" });
  });

  it("direct fields on the match take precedence and map correctly", () => {
    const p = customerPickPatch(
      { name: "Meir Kabakov", id: "9", phone: "917-DIRECT", address: "Direct Addr", apartment: "4B", billingAddress: "PO Box 1" },
      jobs
    );
    expect(p.phone).toBe("917-DIRECT");
    expect(p.serviceAddress).toBe("Direct Addr");
    expect(p.apartment).toBe("4B");
    expect(p.billingAddress).toBe("PO Box 1");
  });

  it("maps legacy addr from QBO host rows to billingAddress", () => {
    const p = customerPickPatch(
      { name: "Beth Rivkah Crown Street", id: "341", phone: "347-386-9397", email: "ops@x.com", addr: "405 lefferts ave" },
      jobs
    );
    expect(p.billingAddress).toBe("405 lefferts ave");
    expect(p.phone).toBe("347-386-9397");
  });
});

describe("openDocsForCustomer (job title picker)", () => {
  const jobs = [
    { id: "j1", customer: "Meir Kabakov", invoiceNo: "251841", title: "Panel", paid: false },
    { id: "j2", customer: "Meir Kabakov", estimateNo: "E-9", title: "Kitchen", paid: false },
    { id: "j3", customer: "Meir Kabakov", invoiceNo: "999", paid: true },
    { id: "j4", customer: "Other", invoiceNo: "1", paid: false },
  ];

  it("lists open unpaid invoices and open estimates for the customer", () => {
    const out = openDocsForCustomer({ name: "Meir Kabakov", id: "9" }, jobs);
    expect(out.map((d) => d.label)).toEqual([
      "Estimate #E-9 — Kitchen",
      "Invoice #251841 — Panel",
    ]);
  });
});

describe("customerNameMatches + jobsForCustomerKey", () => {
  const jobs = [
    { id: "a", customer: "izzy Ben shimon", invoiceNo: "251842", clientGroup: "grp1", paid: true },
    { id: "b", customer: "izzy Ben shimon", invoiceNo: "251787", clientGroup: "grp1", paid: false },
  ];

  it("izzy matches izzy ben shimon for loose customer URLs", () => {
    expect(customerNameMatches({ customer: "izzy Ben shimon" }, "izzy")).toBe(true);
    expect(jobsForCustomerKey(jobs, "c:izzy").map((j) => j.id).sort()).toEqual(["a", "b"]);
    expect(jobsForCustomerKey(jobs, "g:grp1").map((j) => j.id).sort()).toEqual(["a", "b"]);
  });
});

describe("unknownCustomers (#56 not-in-app filter)", () => {
  const jobs = [
    { id: "j1", customer: "Peretz Chein" },
    { id: "j2", customer: "second guy " },
    { id: "j3", customer: "Gone", _deleted: true },
  ];

  it("hides only when qboCustomerId is already linked — name-only jobs still offer import", () => {
    const list = [
      { name: "Peretz Chein", id: "1" },
      { name: "SECOND GUY", id: "2" },
      { name: "Avraham Drizin", id: "34" },
    ];
    expect(unknownCustomers(list, jobs).map((c) => c.name)).toEqual(["Peretz Chein", "SECOND GUY", "Avraham Drizin"]);
    const linked = [
      { id: "j1", customer: "Peretz Chein", qboCustomerId: "1" },
      { id: "j2", customer: "second guy ", qboCustomerId: "2" },
    ];
    expect(unknownCustomers(list, linked).map((c) => c.name)).toEqual(["Avraham Drizin"]);
  });

  it("drops QBO customers already linked by qboCustomerId even when display name differs", () => {
    const linked = [
      { id: "j1", customer: "Gabriel development.", personName: "Arthur koptiv", qboCustomerId: "1432" },
    ];
    const list = [{ name: "Arthur koptiv", id: "1432" }];
    expect(unknownCustomers(list, linked)).toEqual([]);
  });

  it("keeps QBO customers when jobs match by name but lack qboCustomerId (re-link)", () => {
    const orphan = [{ id: "j1", customer: "Arthur koptiv" }];
    const list = [{ name: "Arthur koptiv", id: "1432", businessName: "Gabriel development." }];
    expect(unknownCustomers(list, orphan)).toEqual(list);
  });

  it("jobsForCustomerKey q: falls back to import hints when qboCustomerId missing on jobs", () => {
    const jobs = [{ id: "qbo-1", customer: "Arthur koptiv", invoiceNo: "231596" }];
    expect(jobsForCustomerKey(jobs, "q:1432", { name: "Arthur koptiv" }).map((j) => j.id)).toEqual(["qbo-1"]);
  });

  it("handles empty / non-array input", () => {
    expect(unknownCustomers(null, jobs)).toEqual([]);
    expect(unknownCustomers([{ name: "New" }], [])).toEqual([{ name: "New" }]);
  });

  it("skips void-named QBO cards — not uploadable", () => {
    const list = [
      { name: "Void Yossi Hackner", id: "258" },
      { name: "Real Customer", id: "99" },
    ];
    expect(unknownCustomers(list, []).map((c) => c.name)).toEqual(["Real Customer"]);
  });
});
