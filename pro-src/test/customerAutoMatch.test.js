// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyOrangeAutoLinks,
  applyStrongAutoMerges,
  findOrangeAutoLinkTargets,
  findStrongAutoMergePairs,
  findUniqueStrongQboMatch,
  isStrongCustomerMatch,
  matchCustomerFields,
} from "../src/lib/customerAutoMatch.js";
import { findMergeSuggestion } from "../src/lib/customers.js";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("matchCustomerFields", () => {
  it("counts exact name phone email billing matches", () => {
    const a = {
      name: "Acme LLC",
      phone: "(718) 555-0100",
      email: "A@Acme.com",
      billingAddress: "100 Main St, Apt 2",
    };
    const b = {
      name: "Acme LLC",
      phone: "718-555-0100",
      email: "a@acme.com",
      billingAddress: "100 Main St Apartment 2",
    };
    const m = matchCustomerFields(a, b);
    expect(m.matchCount).toBe(4);
    expect(m.matches.name).toBe(true);
    expect(m.matches.phone).toBe(true);
    expect(m.matches.email).toBe(true);
    expect(m.matches.billing).toBe(true);
    expect(isStrongCustomerMatch(a, b, 3)).toBe(true);
  });

  it("is not strong with only two fields", () => {
    const a = { name: "Acme", phone: "7185550100", email: "", billingAddress: "" };
    const b = { name: "Acme", phone: "7185550100", email: "x@y.com", billingAddress: "Other" };
    expect(matchCustomerFields(a, b).matchCount).toBe(2);
    expect(isStrongCustomerMatch(a, b, 3)).toBe(false);
  });
});

describe("findStrongAutoMergePairs", () => {
  it("finds pairs with 3 exact field matches", () => {
    const jobs = [
      {
        id: "1",
        customer: "Same Co",
        phone: "7185551111",
        email: "a@same.com",
        billingAddress: "1 Oak St",
      },
      {
        id: "2",
        customer: "Same Co Inc",
        phone: "7185551111",
        email: "a@same.com",
        billingAddress: "1 Oak St",
      },
    ];
    // names differ so different client keys; phone+email+billing = 3
    const pairs = findStrongAutoMergePairs(jobs);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].score.matchCount).toBeGreaterThanOrEqual(3);
  });

  it("skips pairs already in same clientGroup", () => {
    const jobs = [
      {
        id: "1",
        customer: "A",
        clientGroup: "g1",
        phone: "7185551111",
        email: "a@x.com",
        billingAddress: "1 Oak",
      },
      {
        id: "2",
        customer: "B",
        clientGroup: "g1",
        phone: "7185551111",
        email: "a@x.com",
        billingAddress: "1 Oak",
      },
    ];
    expect(findStrongAutoMergePairs(jobs)).toHaveLength(0);
  });
});

describe("findUniqueStrongQboMatch", () => {
  const qbo = [
    {
      id: "99",
      name: "Bob Builder",
      businessName: "Bob Builder",
      phone: "3475559999",
      email: "bob@build.com",
      billingAddress: "9 Pine Rd",
    },
    {
      id: "100",
      name: "Other Guy",
      phone: "1111111111",
      email: "o@x.com",
      billingAddress: "1 Z St",
    },
  ];

  it("returns unique strong match", () => {
    const profile = {
      name: "Bob Builder",
      phone: "347-555-9999",
      email: "bob@build.com",
      billingAddress: "9 Pine Rd",
    };
    const hit = findUniqueStrongQboMatch(profile, qbo);
    expect(hit?.id).toBe("99");
  });

  it("returns null when ambiguous", () => {
    const twin = [
      ...qbo,
      {
        id: "101",
        name: "Bob Builder",
        phone: "3475559999",
        email: "bob@build.com",
        billingAddress: "9 Pine Rd",
      },
    ];
    const profile = {
      name: "Bob Builder",
      phone: "3475559999",
      email: "bob@build.com",
      billingAddress: "9 Pine Rd",
    };
    expect(findUniqueStrongQboMatch(profile, twin)).toBeNull();
  });
});

describe("applyStrongAutoMerges", () => {
  it("groups jobs and dismisses the pair", async () => {
    const jobs = [
      {
        id: "1",
        customer: "Same Co",
        phone: "7185551111",
        email: "a@same.com",
        billingAddress: "1 Oak St",
      },
      {
        id: "2",
        customer: "Same Co Inc",
        phone: "7185551111",
        email: "a@same.com",
        billingAddress: "1 Oak St",
      },
    ];
    const patches = [];
    const n = await applyStrongAutoMerges(jobs, {
      patchAndSave: async (id, p) => {
        patches.push({ id, ...p });
      },
    });
    expect(n).toBe(1);
    expect(patches).toHaveLength(2);
    expect(patches[0].clientGroup).toBe(patches[1].clientGroup);
  });
});

describe("applyOrangeAutoLinks", () => {
  it("links unlinked customer to unique QBO match", async () => {
    const jobs = [
      {
        id: "j1",
        customer: "Bob Builder",
        phone: "3475559999",
        email: "bob@build.com",
        billingAddress: "9 Pine Rd",
      },
    ];
    const qbo = [
      {
        id: "99",
        name: "Bob Builder",
        businessName: "Bob Builder",
        phone: "3475559999",
        email: "bob@build.com",
        billingAddress: "9 Pine Rd",
      },
    ];
    expect(findOrangeAutoLinkTargets(jobs, qbo)).toHaveLength(1);
    const patches = [];
    const n = await applyOrangeAutoLinks(jobs, qbo, {
      patchAndSave: async (id, p) => patches.push({ id, ...p }),
    });
    expect(n).toBe(1);
    expect(patches[0].qboCustomerId).toBe("99");
  });
});

describe("findMergeSuggestion skips strong pairs", () => {
  it("does not prompt for 3-of-4 exact matches", () => {
    const jobs = [
      {
        id: "1",
        customer: "Same Co",
        phone: "7185551111",
        email: "a@same.com",
        billingAddress: "1 Oak St",
      },
      {
        id: "2",
        customer: "Same Co Inc",
        phone: "7185551111",
        email: "a@same.com",
        billingAddress: "1 Oak St",
      },
    ];
    // near-duplicate name + contact would normally prompt; strong match auto path wins
    expect(findMergeSuggestion(jobs)).toBeNull();
  });

  it("still prompts for fuzzy name-only pairs without 3 exact fields", () => {
    const jobs = [
      { id: "1", customer: "Arthur koptiv" },
      { id: "2", customer: "Arthur Koptive" },
    ];
    const s = findMergeSuggestion(jobs);
    expect(s).toBeTruthy();
    expect(s.reason).toBe("name");
  });
});
