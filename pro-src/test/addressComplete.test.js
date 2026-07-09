import { describe, expect, it } from "vitest";
import { collectAddressSeeds, filterLocalAddressSuggestions } from "../src/lib/addressComplete.js";

describe("addressComplete", () => {
  it("collects job and calendar addresses", () => {
    const seeds = collectAddressSeeds(
      [{ serviceAddress: "123 Main St", billingAddress: "405 Lefferts Ave" }],
      [{ location: "55 Elm St", description: "visit 9 Kingston Ave" }]
    );
    expect(seeds).toEqual(expect.arrayContaining(["123 Main St", "405 Lefferts Ave", "55 Elm St", "9 Kingston Ave"]));
  });

  it("filters partial queries to full address suggestions", () => {
    const seeds = ["50 Billing Blvd, Newark, NJ 07102", "200 Service Ave, Brooklyn, NY 11201"];
    expect(filterLocalAddressSuggestions(seeds, "50 Bill")).toEqual(["50 Billing Blvd, Newark, NJ 07102"]);
  });
});