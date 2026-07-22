import { describe, expect, it } from "vitest";
import {
  buildSendDocConfirm,
  canApproveSendConfirm,
  defaultDocEmailBody,
  defaultDocEmailSubject,
  docAttachmentName,
  docEmailGreetingName,
} from "../src/lib/sendDocConfirm.js";

const job = {
  id: "J-1",
  customer: "Peretz Chein",
  email: "p@x.com",
  invoiceNo: "251841",
  title: "Panel upgrade",
  amount: "$2,300",
};

describe("sendDocConfirm", () => {
  it("builds confirm model with recipient, subject, attachment, pay flag", () => {
    const m = buildSendDocConfirm({
      job,
      kind: "invoice",
      docSource: "local",
      withPay: true,
    });
    expect(m.email).toBe("p@x.com");
    expect(m.subject).toMatch(/251841/);
    expect(m.attachmentName).toBe("Invoice-251841.pdf");
    expect(m.withPay).toBe(true);
    expect(m.sourceLabel).toMatch(/Local/i);
    expect(canApproveSendConfirm(m)).toBe(true);
  });

  it("rejects empty email", () => {
    const m = buildSendDocConfirm({ job: { ...job, email: "" }, kind: "invoice" });
    expect(canApproveSendConfirm(m)).toBe(false);
  });

  it("names estimate attachment", () => {
    expect(docAttachmentName({ estimateNo: "E-9" }, "estimate")).toBe("Estimate-E-9.pdf");
    expect(defaultDocEmailSubject(job, "estimate")).toMatch(/Estimate/);
  });

  it("greets with full company name, not first word only", () => {
    expect(
      docEmailGreetingName({
        customer: "419 Kingston Realty",
        businessName: "419 Kingston Realty",
      })
    ).toBe("419 Kingston Realty");
  });

  it("greets people with first name only", () => {
    expect(docEmailGreetingName({ customer: "Mendel Cohen" })).toBe("Mendel");
  });

  it("email body says ready to view and pay online; never dumps a raw pay URL", () => {
    const body = defaultDocEmailBody(
      {
        customer: "Mendel Cohen",
        invoiceNo: "201762",
        title: "Electrical work",
        amount: "$4500",
      },
      "invoice",
      { withPay: true, payUrl: "https://secure.cardknox.com/blzelectric?xAmount=4500" }
    );
    expect(body).toContain("Hi Mendel,");
    expect(body).toContain("Your invoice #201762 is ready to view and pay online.");
    expect(body).not.toMatch(/end-to-end test/i);
    expect(body).not.toMatch(/real end/i);
    expect(body).toContain("The PDF is attached.");
    expect(body).not.toContain("cardknox");
    expect(body).not.toContain("xAmount");
  });
});
