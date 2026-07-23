// Isolation guarantee for the white-label TEST TENANT.
//
// The whole point of demo mode is that a demo build can NEVER reach a real
// backend. These tests fail loudly if the fetch interceptor ever lets a
// /.netlify/functions/* call through to the network — the exact regression that
// would leak production data into the demo.
import { describe, it, expect, vi, beforeAll } from "vitest";
import { installDemoBackend } from "../src/demo/demoBackend.js";
import { isDemoCredential, DEMO_CREDENTIALS } from "../src/lib/demoMode.js";

let realFetch;

beforeAll(() => {
  // The browser has localStorage; node does not. Stub a memory-backed one so the
  // demo store can persist writes exactly as it does in the app.
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear(),
  };
  // A spy standing in for the real network. If the interceptor ever calls it
  // for a functions URL, the isolation is broken.
  realFetch = vi.fn(async () => new Response(JSON.stringify({ leaked: true }), { status: 200 }));
  globalThis.fetch = realFetch;
  installDemoBackend();
});

const FN = "https://leelectrical.us/.netlify/functions/";

describe("demo backend isolation", () => {
  it("serves the settings endpoint synthetically, never over the network", async () => {
    const res = await fetch(FN + "settings?cb=1");
    const doc = await res.json();
    expect(doc.tenant.tenantId).toBe("demo");
    // A demo tenant must never be internal — no dev tooling, no escalation.
    expect(doc.tenant.internal).toBe(false);
    expect(doc.profile.companyName).toBe("Ace Plumbing Co.");
    expect(realFetch).not.toHaveBeenCalled();
  });

  it("serves jobs / customers / items synthetically", async () => {
    const jobs = await (await fetch(FN + "jobsdata?cb=1")).json();
    expect(jobs.jobs.length).toBeGreaterThan(0);
    expect(jobs.jobs.every((j) => /example|austin/i.test(JSON.stringify(j)))).toBe(true);

    const cust = await (await fetch(FN + "customers?id=cust-2")).json();
    expect(cust.customer.name).toBe("Blue Ridge Cafe");

    const items = await (await fetch(FN + "items?cb=1")).json();
    expect(items.items.length).toBeGreaterThan(0);
    expect(realFetch).not.toHaveBeenCalled();
  });

  it("answers an UNMODELED functions endpoint with a benign body, never the network", async () => {
    const res = await fetch(FN + "some-endpoint-that-does-not-exist?cb=1");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(realFetch).not.toHaveBeenCalled();
  });

  it("intercepts the same-origin functions path too (not just the apex URL)", async () => {
    await fetch("/.netlify/functions/state?cb=1");
    expect(realFetch).not.toHaveBeenCalled();
  });

  it("persists a state write and reads it back", async () => {
    await fetch(FN + "state", {
      method: "POST",
      body: JSON.stringify({ ov: { "job-x": { _new: true, customer: "Demo Only" } } }),
    });
    const back = await (await fetch(FN + "state?cb=1")).json();
    expect(back.ov["job-x"].customer).toBe("Demo Only");
    expect(realFetch).not.toHaveBeenCalled();
  });

  it("lets NON-functions URLs through to the real fetch", async () => {
    realFetch.mockClear();
    await fetch("https://example.com/not-a-backend-call");
    expect(realFetch).toHaveBeenCalledTimes(1);
  });
});

describe("demo credentials", () => {
  it("accepts the pre-loaded demo login and rejects anything else", () => {
    expect(isDemoCredential(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password)).toBe(true);
    expect(isDemoCredential(DEMO_CREDENTIALS.email.toUpperCase(), DEMO_CREDENTIALS.password)).toBe(true);
    expect(isDemoCredential("someone@else.com", "hunter2")).toBe(false);
    expect(isDemoCredential(DEMO_CREDENTIALS.email, "wrong")).toBe(false);
  });
});
