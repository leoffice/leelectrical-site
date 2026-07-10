import { describe, expect, it } from "vitest";
import { draftJobFromFabContext, paymentFabStep } from "../src/lib/fabPrefill.js";

describe("fabPrefill", () => {
  it("draftJobFromFabContext maps customer page context", () => {
    const draft = draftJobFromFabContext({
      _customerContext: true,
      customer: "Drizin Properties",
      businessName: "Drizin Properties",
      phone: "718-555-0100",
      billingAddress: "500 Lefferts",
      serviceAddress: "502 Lefferts Ave",
    });
    expect(draft.customer).toBe("Drizin Properties");
    expect(draft.serviceAddress).toBe("502 Lefferts Ave");
    expect(draft.phone).toBe("718-555-0100");
  });

  it("draftJobFromFabContext maps job page context with address", () => {
    const draft = draftJobFromFabContext({
      id: "J-1",
      customer: "Peretz Chein",
      businessName: "Peretz Chein",
      serviceAddress: "123 Main St",
      invoiceNo: "251808",
    });
    expect(draft.serviceAddress).toBe("123 Main St");
    expect(draft.invoiceNo).toBe("251808");
  });

  it("paymentFabStep opens job directly when on invoice job", () => {
    const next = paymentFabStep({ id: "J-1", invoiceNo: "251808", customer: "X" }, []);
    expect(next.step).toBe("pickPayment");
    expect(next.job.invoiceNo).toBe("251808");
  });

  it("paymentFabStep uses paymentIntro on general page", () => {
    expect(paymentFabStep(null, []).step).toBe("paymentIntro");
  });
});