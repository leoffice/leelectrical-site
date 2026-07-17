import { describe, expect, it } from "vitest";
import {
  buildSendDocConfirm,
  canApproveSendConfirm,
  defaultDocEmailSubject,
  docAttachmentName,
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
});
