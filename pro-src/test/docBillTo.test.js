import { describe, expect, it } from "vitest";
import {
  buildContactBillingAddress,
  isPermitRenewDoc,
  resolveBillToAddress,
} from "../src/lib/docBillTo.js";
import { mapJobToQbDocData } from "../src/lib/jobToQbDoc.js";
import { mapJobToInvoicePdfData } from "../src/lib/invoicePdf.js";
import { buildPayLandingPayload } from "../src/lib/payLanding.js";
import { buildInvoiceJobFromPayload } from "../src/lib/estimateLanding.js";
import { buildPhaseACtaPayPayload } from "../src/lib/permitRenewal.js";

describe("docBillTo — renew bill-to vs service", () => {
  const renewShell = {
    customer: "Yosef Beshari",
    email: "yossi6886@gmail.com",
    phone: "",
    address: "40 Hampton Pl",
    serviceAddress: "40 Hampton Pl",
    billingAddress: "",
    title: "City electrical permit renewal — B01126007-L1-EL",
    permitRenew: { realTest: true, phase: "real" },
    invoiceNo: "LE-2701",
    amount: 365,
    invoiceLines: [
      {
        itemName: "City electrical permit renewal",
        description:
          "City electrical permit renewal\nPermit # B01126007-L1-EL\nService location: 40 Hampton Pl",
        qty: 1,
        unitPrice: 365,
      },
    ],
  };

  it("isPermitRenewDoc detects renew jobs", () => {
    expect(isPermitRenewDoc(renewShell)).toBe(true);
    expect(isPermitRenewDoc({ title: "Panel upgrade" })).toBe(false);
  });

  it("resolveBillToAddress uses email — never Forty Hampton alone", () => {
    const ba = resolveBillToAddress(renewShell);
    expect(ba).toMatch(/yossi6886@gmail\.com/i);
    expect(ba).not.toMatch(/Hampton/i);
  });

  it("buildContactBillingAddress skips service street", () => {
    const ba = buildContactBillingAddress({
      billingAddress: "40 Hampton Pl",
      email: "yossi6886@gmail.com",
      serviceAddress: "40 Hampton Pl",
    });
    expect(ba).toBe("yossi6886@gmail.com");
  });

  it("QB PDF map puts contact under Bill To + service field", () => {
    const d = mapJobToQbDocData(renewShell, "invoice");
    expect(d.billTo.name).toMatch(/Beshari/i);
    expect(d.billTo.addressLines.join("\n")).toMatch(/yossi6886@gmail\.com/i);
    expect(d.billTo.addressLines.join("\n")).not.toMatch(/Hampton/i);
    const svc = (d.customFields || []).find((f) => /service/i.test(f.label));
    expect(svc?.value).toMatch(/Hampton/i);
  });

  it("legacy invoicePdf map matches", () => {
    const d = mapJobToInvoicePdfData(renewShell);
    expect(d.billTo.address).toMatch(/yossi6886@gmail\.com/i);
    expect(d.billTo.address).not.toMatch(/Hampton/i);
    expect(d.serviceAddress).toMatch(/Hampton/i);
  });

  it("pay landing ba is contact; sa is site", () => {
    const p = buildPayLandingPayload({
      job: renewShell,
      linkAmount: "365",
      inv: "LE-2701",
      siteSlug: "blzelectric",
    });
    expect(p.ba).toMatch(/yossi6886@gmail\.com/i);
    expect(p.ba).not.toMatch(/Hampton/i);
    expect(p.sa).toMatch(/Hampton/i);
  });

  it("pay payload → PDF job never falls ba back to sa for renew", () => {
    const p = buildPhaseACtaPayPayload();
    expect(p.ba).toMatch(/yossi6886@gmail\.com/i);
    expect(p.ba).not.toMatch(/Hampton/i);
    expect(p.sa).toMatch(/Hampton/i);
    expect(String(p.w).split("\n").length).toBeGreaterThanOrEqual(3);
    const job = buildInvoiceJobFromPayload(p);
    expect(job.billingAddress).toMatch(/yossi6886@gmail\.com/i);
    expect(job.billingAddress).not.toMatch(/Hampton/i);
    expect(job.serviceAddress).toMatch(/Hampton/i);
    expect(job.invoiceLines[0].description.split("\n")).toHaveLength(3);
  });
});
