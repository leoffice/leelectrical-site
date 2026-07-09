import { describe, expect, it } from "vitest";
import {
  businessNameTakenInQbo,
  createNewCustomerDisabled,
  customerFormDiffersFromBaseline,
  resolveAddCustomerAction,
  snapshotCustomerForm,
} from "../src/lib/addCustomerFlow.js";

const QBO = [
  { id: "34", name: "Drizin Properties", businessName: "Drizin Properties", personName: "Avraham" },
  { id: "49", name: "Chanan Sheleg", businessName: "Chanan Sheleg" },
];

describe("addCustomerFlow", () => {
  it("snapshotCustomerForm trims all fields", () => {
    expect(
      snapshotCustomerForm({
        businessName: "  Acme ",
        phone: "718-555-0100 ",
        email: "",
      })
    ).toEqual({
      businessName: "Acme",
      personName: "",
      phone: "718-555-0100",
      email: "",
      billingAddress: "",
      serviceAddress: "",
      apartment: "",
    });
  });

  it("customerFormDiffersFromBaseline detects edits", () => {
    const base = snapshotCustomerForm({ businessName: "Drizin", phone: "718" });
    expect(customerFormDiffersFromBaseline({ businessName: "Drizin", phone: "718" }, base)).toBe(false);
    expect(customerFormDiffersFromBaseline({ businessName: "Drizin", phone: "917" }, base)).toBe(true);
  });

  it("businessNameTakenInQbo matches business or display name", () => {
    expect(businessNameTakenInQbo("Drizin Properties", QBO)).toBe(true);
    expect(businessNameTakenInQbo("drizin properties", QBO)).toBe(true);
    expect(businessNameTakenInQbo("Brand New LLC", QBO)).toBe(false);
  });

  it("resolveAddCustomerAction — brand new", () => {
    expect(resolveAddCustomerAction({ baseline: null, matchedQboId: "", formChanged: false, syncAction: "update" })).toBe(
      "create"
    );
  });

  it("resolveAddCustomerAction — matched unchanged links", () => {
    const base = snapshotCustomerForm({ businessName: "Drizin" });
    expect(
      resolveAddCustomerAction({
        baseline: base,
        matchedQboId: "34",
        formChanged: false,
        syncAction: "update",
      })
    ).toBe("link");
  });

  it("resolveAddCustomerAction — matched edited update vs create", () => {
    const base = snapshotCustomerForm({ businessName: "Drizin" });
    expect(
      resolveAddCustomerAction({
        baseline: base,
        matchedQboId: "34",
        formChanged: true,
        syncAction: "update",
      })
    ).toBe("update");
    expect(
      resolveAddCustomerAction({
        baseline: base,
        matchedQboId: "34",
        formChanged: true,
        syncAction: "create",
      })
    ).toBe("create");
  });

  it("createNewCustomerDisabled when business name exists in QBO", () => {
    expect(createNewCustomerDisabled("Drizin Properties", QBO)).toBe(true);
    expect(createNewCustomerDisabled("Totally New Co", QBO)).toBe(false);
  });
});