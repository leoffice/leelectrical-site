// @vitest-environment jsdom
// Unit — customer identity helpers (bug #1 grouping key, bug #2 detector +
// permanent dismissal memory).
import { beforeEach, describe, expect, it } from "vitest";
import {
  clientKey,
  dismissPair,
  findMergeSuggestion,
  isDismissed,
  levenshtein,
  namesNearDuplicate,
  normalizeCustomer,
  pairId,
} from "../src/lib/customers.js";

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
  it("clientGroup wins, then normalized name, then job id", () => {
    expect(clientKey({ id: "a", clientGroup: "grp1", customer: "X Y" })).toBe("g:grp1");
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
});
