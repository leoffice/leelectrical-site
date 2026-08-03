import { describe, it, expect, vi } from "vitest";
import {
  parseNycAddressParts,
  parsePlutoOwnerName,
  applyNycLookupToAnswers,
  lookupNycProperty,
} from "../src/lib/agencyForms/nycPropertyLookup.js";

describe("parseNycAddressParts", () => {
  it("expands st/ave and strips city/zip", () => {
    const p = parseNycAddressParts("1349 president st, brooklyn new york 11213");
    expect(p.house).toBe("1349");
    expect(p.street).toContain("PRESIDENT");
    expect(p.street).toContain("STREET");
    expect(p.boroughHint).toBe("BK");
  });

  it("expands E/W cardinals and ordinals to PLUTO form (607 E 53rd St)", () => {
    const p = parseNycAddressParts("607 E 53rd St, Brooklyn, NY 11203");
    expect(p.house).toBe("607");
    expect(p.boroughHint).toBe("BK");
    // PLUTO stores "607 EAST 53 STREET" — not "E 53RD STREET"
    expect(p.street).toBe("EAST 53 STREET");
  });
});

describe("parsePlutoOwnerName", () => {
  it("parses LAST, FIRSTMIDDLE glued names", () => {
    const o = parsePlutoOwnerName("RUBASHKIN, YITZCHOKDOVID");
    expect(o.last).toBe("Rubashkin");
    expect(o.first.toLowerCase()).toContain("yitzchok");
    expect(o.first.toLowerCase()).toContain("dovid");
  });
});

describe("applyNycLookupToAnswers", () => {
  it("fills empty BIN and empty owner", () => {
    const next = applyNycLookupToAnswers(
      { bin: "", ownerFirst: "", ownerLast: "" },
      {
        ok: true,
        bin: "3033369",
        ownerFirst: "Yitzchok Dovid",
        ownerLast: "Rubashkin",
        ownerRaw: "RUBASHKIN, YITZCHOKDOVID",
        source: "test",
      }
    );
    expect(next.bin).toBe("3033369");
    expect(next.ownerFirst).toBe("Yitzchok Dovid");
    expect(next.ownerLast).toBe("Rubashkin");
  });

  it("does not overwrite existing owner from customer card", () => {
    const next = applyNycLookupToAnswers(
      { bin: "", ownerFirst: "Aaron", ownerLast: "Cohen" },
      { ok: true, bin: "3033369", ownerFirst: "Yitzchok", ownerLast: "Rubashkin" }
    );
    expect(next.bin).toBe("3033369");
    expect(next.ownerFirst).toBe("Aaron");
    expect(next.ownerLast).toBe("Cohen");
  });
});

describe("lookupNycProperty (mocked)", () => {
  it("returns BIN + owner from public open data shape", async () => {
    const fetchImpl = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("64uk-42ks")) {
        return {
          ok: true,
          json: async () => [
            {
              address: "1349 PRESIDENT STREET",
              ownername: "RUBASHKIN, YITZCHOKDOVID",
              bbl: "3012780066.00000000",
              unitsres: "1",
              numfloors: "2.75",
              zipcode: "11213",
            },
          ],
        };
      }
      if (u.includes("5zhs-2jue")) {
        return { ok: true, json: async () => [{ bin: "3033369" }] };
      }
      return { ok: false, status: 404, json: async () => [] };
    });
    const hit = await lookupNycProperty("1349 President St, Brooklyn NY 11213", { fetchImpl });
    expect(hit.ok).toBe(true);
    expect(hit.bin).toBe("3033369");
    expect(hit.ownerLast).toBe("Rubashkin");
    expect(hit.bbl).toBe("3012780066");
  });
});

describe("lookupNycProperty fuzzy path", () => {
  it("fuzzy match escapes SQL quotes without breaking delimiters", async () => {
    const urls = [];
    const fetchImpl = vi.fn(async (url) => {
      urls.push(String(url));
      const u = String(url);
      if (u.includes("64uk-42ks") && u.includes("like")) {
        return {
          ok: true,
          json: async () => [
            {
              address: "100 O'CONNOR STREET",
              ownername: "SMITH, JOHN",
              bbl: "1000010001",
              borough: "BK",
            },
          ],
        };
      }
      if (u.includes("64uk-42ks")) {
        return { ok: true, json: async () => [] };
      }
      if (u.includes("5zhs-2jue")) {
        return { ok: true, json: async () => [{ bin: "1000001" }] };
      }
      return { ok: false, status: 404, json: async () => [] };
    });
    // Force fuzzy by returning empty exact match first
    const hit = await lookupNycProperty("100 O'Connor St, Brooklyn", { fetchImpl });
    expect(hit.ok).toBe(true);
    const fuzzyUrl = urls.find((u) => u.includes("like"));
    expect(fuzzyUrl).toBeTruthy();
    // Value quotes doubled; SoQL delimiters remain single
    expect(decodeURIComponent(fuzzyUrl)).toMatch(/like '100 %O''Connor%'/i);
    // Borough pinned so Manhattan same-house matches cannot win
    expect(decodeURIComponent(fuzzyUrl)).toMatch(/borough='BK'/);
  });

  it("does not fuzzy-match on cardinal E alone (607 E 53rd vs 607 East 11 MN)", async () => {
    const urls = [];
    const fetchImpl = vi.fn(async (url) => {
      urls.push(String(url));
      const u = String(url);
      if (u.includes("64uk-42ks") && !u.includes("like")) {
        // exact "607 EAST 53 STREET" would hit in prod; force empty for fuzzy test
        return { ok: true, json: async () => [] };
      }
      if (u.includes("64uk-42ks") && u.includes("like")) {
        return {
          ok: true,
          json: async () => [
            {
              address: "607 EAST 53 STREET",
              ownername: "CHARLES SHAW JR",
              bbl: "3047640040",
              borough: "BK",
              zipcode: "11203",
            },
          ],
        };
      }
      if (u.includes("5zhs-2jue")) {
        return { ok: true, json: async () => [{ bin: "3105450" }] };
      }
      return { ok: false, status: 404, json: async () => [] };
    });
    const hit = await lookupNycProperty("607 E 53rd St, Brooklyn, NY 11203", { fetchImpl });
    expect(hit.ok).toBe(true);
    expect(hit.bin).toBe("3105450");
    const fuzzyUrl = urls.find((u) => u.includes("like"));
    const decoded = decodeURIComponent(fuzzyUrl || "");
    // Must search on "53", not bare "E" (which matched Manhattan 607 EAST 11)
    expect(decoded).toMatch(/607 %53%/i);
    expect(decoded).not.toMatch(/like '607 E%'/i);
    expect(decoded).toMatch(/borough='BK'/);
  });
});
