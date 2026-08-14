// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  CHECKMAKER_ACCOUNTS_KEY,
  defaultCheckmakerAccounts,
  getCheckmakerAccounts,
  setCheckmakerAccounts,
  hydrateCheckmakerAccountsFromCloud,
} from "../src/lib/appSettings.js";

afterEach(() => {
  try {
    localStorage.removeItem(CHECKMAKER_ACCOUNTS_KEY);
  } catch {
    /* ignore */
  }
});

describe("checkmaker accounts store", () => {
  it("seeds the BLZ Chase account with the current address", () => {
    const seed = defaultCheckmakerAccounts();
    expect(seed).toHaveLength(1);
    expect(seed[0]).toMatchObject({
      id: "blz-chase",
      name: "BLZ Electric Inc.",
      addr1: "1243 E 15th Street",
      addr2: "Brooklyn, NY 11230",
      bank: "JPMorgan Chase Bank, N.A.",
      account: "606031220",
      routing: "021000021",
    });
  });

  it("returns the seed when nothing is stored", () => {
    localStorage.removeItem(CHECKMAKER_ACCOUNTS_KEY);
    expect(getCheckmakerAccounts()[0].id).toBe("blz-chase");
  });

  it("round-trips add / edit / remove through localStorage", () => {
    const two = [
      ...defaultCheckmakerAccounts(),
      {
        id: "acct-second-6789",
        label: "Second — WF",
        name: "Second Co LLC",
        addr1: "1 Test Ave",
        addr2: "Queens, NY 11000",
        phone: "",
        bank: "Wells Fargo Bank, N.A.",
        account: "123456789",
        routing: "021000021",
        fractional: "",
        startCheckNo: "500",
      },
    ];
    setCheckmakerAccounts(two);
    expect(getCheckmakerAccounts()).toHaveLength(2);
    expect(getCheckmakerAccounts()[1].account).toBe("123456789");

    // remove the second → back to one
    setCheckmakerAccounts(getCheckmakerAccounts().filter((a) => a.id !== "acct-second-6789"));
    expect(getCheckmakerAccounts()).toHaveLength(1);
  });

  it("hydrates from cloud but ignores an empty cloud list", () => {
    setCheckmakerAccounts(defaultCheckmakerAccounts());
    // empty cloud must not wipe local
    hydrateCheckmakerAccountsFromCloud([]);
    expect(getCheckmakerAccounts()).toHaveLength(1);
    // non-empty cloud wins
    hydrateCheckmakerAccountsFromCloud([
      { id: "x", label: "X", name: "X Co", addr1: "", addr2: "", phone: "", bank: "B", account: "999888777", routing: "021000021", fractional: "", startCheckNo: "1" },
    ]);
    expect(getCheckmakerAccounts()).toHaveLength(1);
    expect(getCheckmakerAccounts()[0].id).toBe("x");
  });
});
