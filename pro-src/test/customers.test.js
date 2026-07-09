// @vitest-environment jsdom
// Unit — customer identity helpers (bug #1 grouping key, bug #2 detector +
// permanent dismissal memory).
import { beforeEach, describe, expect, it } from "vitest";
import {
  clientKey,
  customerProfileFromJobs,
  dismissPair,
  findMergeSuggestion,
  isDismissed,
  levenshtein,
  namesNearDuplicate,
  normalizeCustomer,
  pairId,
} from "../src/lib/customers.js";
import { customerProfileComplete, customerSyncCardClass } from "../src/lib/customerSync.js";

beforeEach(() => localStorage.clear());

describe("normalizeCustomer", () => {
  it("lowercases, trims, collapses spaces, strips trailing punctuation", () => {
    expect(normalizeCustomer("  Meir   KABAKOV. ")).toBe("meir kabakov");
    expect(normalizeCustomer("meir kabakov ")).toBe("meir kabakov");
    expect(normalizeCustomer("Bob,")).toBe("bob");
    expect(normalizeCustomer("A. B. Cohen Jr.!")).toBe("a. b. cohen jr");
    expect(normalizeCustomer("")).toBe("");
    expect(normalizeCustomer(null)).toBe("");
  });
});

describe("clientKey", () => {
  it("clientGroup wins, then qbo id, then normalized name, then job id", () => {
    expect(clientKey({ id: "a", clientGroup: "grp1", customer: "X Y" })).toBe("g:grp1");
    expect(clientKey({ id: "a", customer: "Meir Kabakov", qboCustomerId: "246" })).toBe("q:246");
    expect(clientKey({ id: "a", customer: "Meir Kabakov" })).toBe("c:meir kabakov");
    expect(clientKey({ id: "a", customer: "meir kabakov " })).toBe("c:meir kabakov");
    expect(clientKey({ id: "a" })).toBe("j:a");
  });
});

describe("levenshtein", () => {
  it("computes edit distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("", "ab")).toBe(2);
    expect(levenshtein("arthur koptiv", "arthur koptive")).toBe(1);
  });
});

describe("namesNearDuplicate", () => {
  it("positive pairs", () => {
    expect(namesNearDuplicate("Arthur koptiv", "Arthur Koptive")).toBe(true); // lev 1
    expect(namesNearDuplicate("Meir Kabakov", "Meir Kabakow")).toBe(true); // lev 1
    expect(namesNearDuplicate("Meir Kabakov", "Mier Kabakov")).toBe(true); // lev 2 (swap)
    expect(namesNearDuplicate("Meir Kabakov", "Kabakov")).toBe(true); // contains, 7-char overlap
    expect(namesNearDuplicate("PERETZ CHEIN", "Peretz Chein LLC")).toBe(true); // contains
  });
  it("negative pairs", () => {
    expect(namesNearDuplicate("Meir Kabakov", "Meir Kabakov")).toBe(false); // identical = same key
    expect(namesNearDuplicate("Meir Kabakov", "meir kabakov ")).toBe(false); // identical after normalize
    expect(namesNearDuplicate("Joe", "Moe")).toBe(false); // too short for lev rule
    expect(namesNearDuplicate("Dan", "Dana")).toBe(false); // <=4 chars, overlap <5
    expect(namesNearDuplicate("Al", "Albert")).toBe(false); // overlap <5
    expect(namesNearDuplicate("Arthur koptiv", "Miriam Stern")).toBe(false);
    expect(namesNearDuplicate("", "Someone")).toBe(false);
  });
});

describe("dismissal memory (lepro_nomerge)", () => {
  it("pairId is order-independent and persisted dismissals stick", () => {
    expect(pairId("Arthur Koptive", "Arthur koptiv")).toBe("arthur koptiv|arthur koptive");
    expect(isDismissed("Arthur koptiv", "Arthur Koptive")).toBe(false);
    dismissPair("Arthur koptiv", "Arthur Koptive");
    expect(isDismissed("Arthur koptiv", "Arthur Koptive")).toBe(true);
    expect(isDismissed("Arthur Koptive", "Arthur koptiv")).toBe(true); // reversed
    expect(JSON.parse(localStorage.getItem("lepro_nomerge"))).toEqual(["arthur koptiv|arthur koptive"]);
    dismissPair("Arthur Koptive", "Arthur koptiv"); // no dupes
    expect(JSON.parse(localStorage.getItem("lepro_nomerge"))).toHaveLength(1);
  });
});

describe("customerProfileFromJobs", () => {
  it("aggregates contact fields and job lines from a customer's jobs", () => {
    const p = customerProfileFromJobs(
      [
        {
          id: "1",
          customer: "Arthur koptiv",
          businessName: "Arthur koptiv",
          personName: "Art",
          phone: "718-111-2222",
          email: "a@k.com",
          billingAddress: "10 Main",
          serviceAddress: "20 Oak",
          title: "Meter bank",
          amount: "$100",
        },
        {
          id: "2",
          customer: "Arthur koptiv",
          title: "Riser",
          invoiceNo: "251900",
          amount: "$200",
          serviceAddress: "30 Pine",
        },
      ],
      "Arthur koptiv"
    );
    expect(p.name).toBe("Arthur koptiv");
    expect(p.personName).toBe("Art");
    expect(p.phone).toBe("718-111-2222");
    expect(p.jobCount).toBe(2);
    expect(p.jobLines).toHaveLength(2);
    expect(p.jobLines[1]).toContain("251900");
    expect(p.serviceAddresses).toEqual(["20 Oak", "30 Pine"]);
  });
});

describe("findMergeSuggestion", () => {
  const jobs = () => [
    { id: "1", customer: "Arthur koptiv" },
    { id: "2", customer: "Arthur Koptive" },
    { id: "3", customer: "Zed Corp" },
  ];

  it("finds the near-duplicate pair with their jobs", () => {
    const s = findMergeSuggestion(jobs());
    expect(s).toBeTruthy();
    expect([s.a.name, s.b.name].sort()).toEqual(["Arthur Koptive", "Arthur koptiv"]);
    expect(s.a.jobs).toHaveLength(1);
    expect(s.b.jobs).toHaveLength(1);
  });

  it("same-key variants are NOT a pair; archived/deleted jobs are ignored", () => {
    expect(
      findMergeSuggestion([
        { id: "1", customer: "Meir Kabakov" },
        { id: "2", customer: "meir kabakov " },
      ])
    ).toBeNull();
    expect(
      findMergeSuggestion([
        { id: "1", customer: "Arthur koptiv" },
        { id: "2", customer: "Arthur Koptive", _archived: true },
      ])
    ).toBeNull();
  });

  it("dismissed pairs are never suggested again", () => {
    dismissPair("Arthur koptiv", "Arthur Koptive");
    expect(findMergeSuggestion(jobs())).toBeNull();
  });

  it("jobs already sharing a clientGroup are one key — no prompt", () => {
    expect(
      findMergeSuggestion([
        { id: "1", customer: "Arthur koptiv", clientGroup: "g1" },
        { id: "2", customer: "Arthur Koptive", clientGroup: "g1" },
      ])
    ).toBeNull();
  });

  it("expanded scan: same phone across different names triggers contact match", () => {
    const s = findMergeSuggestion([
      { id: "1", customer: "Joe Smith", phone: "(718) 555-1234" },
      { id: "2", customer: "Joseph S", phone: "718-555-1234" },
    ]);
    expect(s).toBeTruthy();
    expect(s.reason).toBe("contact");
  });
});

describe("customerProfileComplete", () => {
  it("requires name, phone, email, and billing address", () => {
    expect(
      customerProfileComplete({
        name: "Acme",
        phone: "718-555-1111",
        email: "a@acme.com",
        billingAddress: "1 Main St",
      })
    ).toBe(true);
    expect(customerProfileComplete({ name: "Acme", email: "a@acme.com" })).toBe(false);
    expect(customerSyncCardClass({ name: "Acme", email: "a@acme.com" })).toContain("orange");
    expect(
      customerSyncCardClass({
        name: "Acme",
        phone: "718",
        email: "a@acme.com",
        billingAddress: "1 Main",
      })
    ).toContain("emerald");
  });
});
