import { describe, expect, it } from "vitest";
import {
  PHASE_A_HAMPTON_SCENARIO,
  LEVI_TESTER,
  PERMIT_RENEW_FEE,
  assertPhaseARecipient,
  buildPermitRenewEmail,
  buildPermitRenewInvoiceLines,
  buildPermitRenewJobFields,
  buildPermitRenewMailto,
  buildPermitRenewMetaPatch,
  buildPhaseACtaPayPayload,
  findOpenMockRenewJob,
  formatPermitDateUs,
  isBlockedRenewRecipient,
  isLeviTesterEmail,
  isPermitRenewJob,
  listRenewApplications,
  permitExpiresFromIssued,
  preparePhaseAMock,
} from "../src/lib/permitRenewal.js";
import {
  isBalanceExemptOffer,
  openBalance,
  customerAmountSummary,
} from "../src/lib/customers.js";

describe("permitRenewal Phase A mock", () => {
  it("defaults fee to $365 and Hampton scenario facts", () => {
    expect(PERMIT_RENEW_FEE).toBe(365);
    expect(PHASE_A_HAMPTON_SCENARIO.address).toMatch(/Hampton/i);
    expect(PHASE_A_HAMPTON_SCENARIO.permitNo).toMatch(/B01126007/);
    expect(LEVI_TESTER.email).toMatch(/levikumer@gmail\.com/i);
  });

  it("blocks real Yossi email and only allows Levi Tester", () => {
    expect(isBlockedRenewRecipient("yossi6886@gmail.com")).toBe(true);
    expect(isLeviTesterEmail("levikumer@gmail.com")).toBe(true);
    expect(assertPhaseARecipient("yossi6886@gmail.com").ok).toBe(false);
    expect(assertPhaseARecipient("random@example.com").ok).toBe(false);
    expect(assertPhaseARecipient("levikumer@gmail.com").ok).toBe(true);
    expect(assertPhaseARecipient("").email).toBe(LEVI_TESTER.email);
  });

  it("builds $365 renew invoice lines with address + permit", () => {
    const lines = buildPermitRenewInvoiceLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].unitPrice).toBe(365);
    expect(lines[0].description).toMatch(/40 Hampton/i);
    expect(lines[0].description).toMatch(/B01126007/);
  });

  it("createJob fields use person name + LE-#### + service address (email stays tester)", () => {
    const fields = buildPermitRenewJobFields({ jobs: [] });
    // Bill-to is the real person's name on the invoice (not "levi tester")
    expect(fields.customer).toMatch(/Yosef|Beshari/i);
    expect(fields.personName).toMatch(/Yosef|Beshari/i);
    // Delivery still Levi Tester only
    expect(fields.email).toBe(LEVI_TESTER.email);
    expect(fields.serviceAddress).toMatch(/Hampton/i);
    expect(fields.address).toMatch(/Hampton/i);
    // Billing distinct so Service Address prints on PDF
    expect(fields.billingAddress).not.toBe(fields.serviceAddress);
    expect(fields.amount).toBe(365);
    expect(fields.invoiceNo).toMatch(/^LE-\d+/);
    expect(fields.invoiceLines[0].unitPrice).toBe(365);
    expect(fields.invoiceLines[0].description).toMatch(/B01126007/);
    expect(fields.title).toMatch(/permit renewal/i);
    expect(fields._invoiceConfirmed).toBe(true);
  });

  it("meta patch marks mock Phase A and keeps autoEmail off", () => {
    const meta = buildPermitRenewMetaPatch();
    expect(meta.permitRenew.mock).toBe(true);
    expect(meta.permitRenew.phase).toBe("A");
    expect(meta.permitRenew.autoEmail).toBe(false);
    expect(meta.permitRenew.provisional).toBe(true);
    expect(meta.permitRenew.excludeFromBalanceDue).toBe(true);
    expect(meta.excludeFromBalanceDue).toBe(true);
    expect(meta.paperwork.dob.renewSchedule.autoEmail).toBe(false);
    expect(meta.email).toBe(LEVI_TESTER.email);
    expect(meta.openBalance).toBe(365);
    expect(meta.permitRenew.gradedDate).toBe(PHASE_A_HAMPTON_SCENARIO.issuedDate);
    expect(meta.permitRenew.expiresDate).toBe(
      permitExpiresFromIssued(PHASE_A_HAMPTON_SCENARIO.issuedDate)
    );
    expect(meta.serviceAddress).toMatch(/Hampton/i);
  });

  it("permitExpiresFromIssued adds one year", () => {
    expect(permitExpiresFromIssued("2026-02-06")).toBe("2027-02-06");
    expect(permitExpiresFromIssued("")).toBe("");
  });

  it("formatPermitDateUs is Month D, YYYY", () => {
    expect(formatPermitDateUs("2026-02-06")).toBe("February 6, 2026");
    expect(formatPermitDateUs("2027-02-06")).toBe("February 6, 2027");
    expect(formatPermitDateUs("")).toBe("");
  });

  it("unpaid provisional renew does not count as customer balance due", () => {
    const open = {
      id: "r-exempt",
      invoiceNo: "LE-2711",
      amount: 365,
      openBalance: 365,
      paid: false,
      excludeFromBalanceDue: true,
      permitRenew: { mock: true, phase: "A", provisional: true, excludeFromBalanceDue: true },
    };
    expect(isBalanceExemptOffer(open)).toBe(true);
    expect(openBalance(open)).toBe(0);
    const sum = customerAmountSummary([open]);
    expect(sum.due).toBe(0);
    expect(sum.openInvoices).toBe(0);
    // Paid renew starts counting again
    const paid = { ...open, paid: true, openBalance: 0 };
    expect(isBalanceExemptOffer(paid)).toBe(false);
  });

  it("listRenewApplications lists open / paid / wants-renew with dates", () => {
    const open = {
      id: "r1",
      customer: "Yosef Beshari",
      invoiceNo: "LE-2710",
      amount: 365,
      openBalance: 365,
      serviceAddress: "40 Hampton Pl",
      permitRenew: {
        mock: true,
        phase: "A",
        address: "40 Hampton Pl",
        permitNo: "B01126007-S1-EL",
        issuedDate: "2026-02-06",
        gradedDate: "2026-02-06",
        expiresDate: "2027-02-06",
        fee: 365,
      },
    };
    const paid = { ...open, id: "r2", paid: true, openBalance: 0 };
    const notice = {
      id: "r3",
      customer: "Other",
      serviceAddress: "99 Test St",
      paperwork: { dob: { renewSchedule: { on: true } } },
    };
    const rows = listRenewApplications([open, paid, notice]);
    expect(rows.length).toBe(3);
    expect(rows.find((r) => r.id === "r1").status).toBe("Invoice open");
    expect(rows.find((r) => r.id === "r2").status).toBe("Paid");
    expect(rows.find((r) => r.id === "r3").status).toBe("Wants renew");
    expect(rows.find((r) => r.id === "r1").expiresDate).toBe("2027-02-06");
    expect(rows.find((r) => r.id === "r1").gradedDate).toBe("2026-02-06");
  });

  it("email has expired copy, MDY dates, bold HTML facts, and pay-link CTA", () => {
    const payUrl = "https://leelectrical.us/app/pro/#/pay/abcTOKEN";
    const { subject, body, htmlBody, to, ctaLabel, ctaUrl } = buildPermitRenewEmail({
      payUrl,
      invoiceNo: "LE-2710",
    });
    expect(to).toBe(LEVI_TESTER.email);
    expect(ctaLabel).toBe("Renew Permit");
    expect(ctaLabel).not.toMatch(/View\/Pay|View and Pay/i);
    // Real payment link — not the staff dashboard renewCta tab
    expect(ctaUrl).toBe(payUrl);
    expect(ctaUrl).not.toMatch(/renewCta=phaseA/);
    expect(subject).toMatch(/Renew|permit/i);
    expect(body).toMatch(/40 Hampton/i);
    expect(body).toMatch(/B01126007/);
    expect(body).toMatch(/\$365\.00|365/);
    expect(body).toMatch(/has expired/i);
    expect(body).not.toMatch(/year is coming up/i);
    expect(body).toMatch(/abandoned/i);
    expect(body).toMatch(/\$1,800|1800/);
    expect(body).toMatch(/February 6, 2026/);
    expect(body).toMatch(/February 6, 2027/);
    expect(body).not.toContain("Update or Renew Permit:");
    expect(body).not.toMatch(/View\/Pay Invoice/i);
    expect(body).toMatch(/Press Renew Permit/i);
    expect(body).not.toMatch(/yossi6886@gmail\.com/i);
    // Branded inner HTML — bold application / issue # / dates
    expect(htmlBody).toMatch(/<strong[^>]*>permit application<\/strong>/i);
    expect(htmlBody).toMatch(/Application \/ issue number/i);
    expect(htmlBody).toMatch(/<strong[^>]*>B01126007/);
    expect(htmlBody).toMatch(/has expired/i);
    expect(htmlBody).toMatch(/at least \$1,800/i);
    expect(htmlBody).toMatch(/February 6, 2026/);
  });

  it("Phase A CTA pay payload opens renew invoice on tap (no pre-create)", () => {
    const p = buildPhaseACtaPayPayload();
    expect(p.a).toBe(365);
    expect(p.c).toMatch(/Yosef|Beshari/i);
    expect(p.sa).toMatch(/Hampton/i);
    expect(p.k).toBe("i");
    expect(p.renewCta).toBe("phaseA");
    expect(p.i).toBeTruthy();
    expect(Array.isArray(p.lines) && p.lines.length).toBeTruthy();
  });

  it("mailto only builds for Levi Tester", () => {
    const ok = buildPermitRenewMailto({
      to: LEVI_TESTER.email,
      subject: "hi",
      body: "body",
    });
    expect(ok.ok).toBe(true);
    expect(ok.href).toMatch(/^mailto:/);
    expect(ok.href).toContain(encodeURIComponent(LEVI_TESTER.email));

    const bad = buildPermitRenewMailto({
      to: "yossi6886@gmail.com",
      subject: "hi",
      body: "body",
    });
    expect(bad.ok).toBe(false);
    expect(bad.href).toBe("");
  });

  it("detects renew jobs and reuses open mock invoice", () => {
    const open = {
      id: "local-1",
      customer: "levi tester",
      email: LEVI_TESTER.email,
      invoiceNo: "LE-2705",
      amount: 365,
      openBalance: 365,
      permitRenew: { mock: true, phase: "A" },
      title: "City electrical permit renewal — B01126007-S1-EL",
    };
    const paid = { ...open, id: "local-2", paid: true, openBalance: 0 };
    expect(isPermitRenewJob(open)).toBe(true);
    expect(findOpenMockRenewJob([paid, open])).toEqual(open);

    const prep = preparePhaseAMock({ jobs: [open] });
    expect(prep.reuse).toBe(true);
    expect(prep.job.invoiceNo).toBe("LE-2705");

    const fresh = preparePhaseAMock({ jobs: [] });
    expect(fresh.reuse).toBe(false);
    expect(fresh.fields.invoiceNo).toMatch(/^LE-/);
    expect(fresh.meta.permitRenew.mock).toBe(true);
  });
});
