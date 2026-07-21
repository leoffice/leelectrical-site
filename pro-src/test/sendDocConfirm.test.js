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

  it("email body restores design-fixes total/balance lines and never dumps a raw pay URL", () => {
    const body = defaultDocEmailBody(
      {
        customer: "419 Kingston Realty",
        businessName: "419 Kingston Realty",
        invoiceNo: "251850",
        title: "Change order",
        amount: "$4500",
        changeOrder: true,
      },
      "invoice",
      { withPay: true, payUrl: "https://secure.cardknox.com/blzelectric?xAmount=4500" }
    );
    expect(body).toContain("Hi 419 Kingston Realty,");
    expect(body).toMatch(/Your invoice #251850 for Change order is ready/);
    expect(body).toMatch(/Invoice total:/i);
    expect(body).toMatch(/Balance due:/i);
    expect(body).toContain("A secure payment link is included with this email.");
    expect(body).toContain("The PDF is attached.");
    expect(body).not.toContain("cardknox");
    expect(body).not.toContain("xAmount");
  });
});
