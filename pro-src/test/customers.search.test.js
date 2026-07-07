// Unit — customer smart-search plumbing for the New Job form (#49/#55) and the
// Jobs-tab QBO import (#56): the adapter's /customers call, the pick->prefill
// patch, and the "not in the app yet" filter. Pure logic + mocked fetch (node
// env), so this runs fast and independently of the jsdom UI suites.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNetlifyAdapter } from "../src/data/netlifyAdapter.js";
import { customerPickPatch, unknownCustomers } from "../src/lib/customers.js";

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
    expect(p.serviceAddress).toBe("10 Main St"); // maps into the service address field
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
    expect(p.serviceAddress).toBe("9 St");
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
});

describe("unknownCustomers (#56 not-in-app filter)", () => {
  const jobs = [
    { id: "j1", customer: "Peretz Chein" },
    { id: "j2", customer: "second guy " },
    { id: "j3", customer: "Gone", _deleted: true },
  ];

  it("keeps only customers not already present as an active job (by normalized name)", () => {
    const list = [
      { name: "Peretz Chein", id: "1" }, // already in app -> dropped
      { name: "SECOND GUY", id: "2" }, // normalized match -> dropped
      { name: "Avraham Drizin", id: "34" }, // new -> kept
    ];
    const out = unknownCustomers(list, jobs);
    expect(out.map((c) => c.name)).toEqual(["Avraham Drizin"]);
  });

  it("handles empty / non-array input", () => {
    expect(unknownCustomers(null, jobs)).toEqual([]);
    expect(unknownCustomers([{ name: "New" }], [])).toEqual([{ name: "New" }]);
  });
});
