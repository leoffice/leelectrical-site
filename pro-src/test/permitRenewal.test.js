import { describe, expect, it } from "vitest";
import {
  PHASE_A_HAMPTON_SCENARIO,
  RENEW_HAMPTON_SCENARIO,
  RENEW_HACKNER_SCENARIO,
  REAL_TEST_HACKNER_SCENARIO,
  READY_RENEW_SCENARIOS,
  LEVI_TESTER,
  PERMIT_RENEW_FEE,
  assertPhaseARecipient,
  assertRenewComposeRecipient,
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
  listPendingRenewCards,
  listPaidUpdatePermitCards,
  listRenewApplications,
  permitAbandonedFromExpires,
  permitExpiresFromIssued,
  permitRenewByDate,
  permitRenewStageLabel,
  permitRenewStatusSentence,
  permitRenewStatusTone,
  preparePhaseAMock,
  prepareRenewNotice,
  prepareRenewScenario,
  canSendRenewNotice,
  buildRenewNoticeCtaUrl,
  buildRenewNoticeSentPatch,
  materializeRenewInvoicePatch,
  listRenewSendHistory,
} from "../src/lib/permitRenewal.js";
import {
  ensurePermitCacheSeeded,
  loadPermitCache,
  reservePlaceholderInvoiceNo,
  listRenewSendHistory as listCacheHistory,
  permitCacheKey,
} from "../src/lib/permitCache.js";
import {
  isBalanceExemptOffer,
  openBalance,
  customerAmountSummary,
} from "../src/lib/customers.js";

describe("permitRenewal Phase A mock", () => {
  it("defaults fee to $365 and Hampton L1 expired scenario facts", () => {
    expect(PERMIT_RENEW_FEE).toBe(365);
    expect(PHASE_A_HAMPTON_SCENARIO.address).toMatch(/Hampton/i);
    // Levi: expired is L1 issued 10/11/2024 — not S1
    expect(PHASE_A_HAMPTON_SCENARIO.permitNo).toMatch(/B01126007-L1/i);
    expect(PHASE_A_HAMPTON_SCENARIO.permitNo).not.toMatch(/S1/i);
    expect(PHASE_A_HAMPTON_SCENARIO.issuedDate).toBe("2024-10-11");
    expect(LEVI_TESTER.email).toMatch(/levikumer@gmail\.com/i);
  });

  it("allows any real To address for renew send (on-file or new)", () => {
    expect(isBlockedRenewRecipient("yossi6886@gmail.com")).toBe(false);
    expect(isLeviTesterEmail("levikumer@gmail.com")).toBe(true);
    expect(assertPhaseARecipient("yossi6886@gmail.com").ok).toBe(true);
    expect(assertPhaseARecipient("random@example.com").ok).toBe(true);
    expect(assertPhaseARecipient("levikumer@gmail.com").ok).toBe(true);
    expect(assertPhaseARecipient("").email).toMatch(/yossi6886/);
    expect(assertRenewComposeRecipient("new-owner@example.com").ok).toBe(true);
  });

  it("builds $365 renew invoice lines with address + permit", () => {
    const lines = buildPermitRenewInvoiceLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].unitPrice).toBe(365);
    expect(lines[0].description).toMatch(/40 Hampton/i);
    expect(lines[0].description).toMatch(/B01126007/);
  });

  it("createJob fields use person name + LE-#### + service address (not billing)", () => {
    const fields = buildPermitRenewJobFields({ jobs: [] });
    // Bill-to is the real person's name on the invoice (not "levi tester")
    expect(fields.customer).toMatch(/Yosef|Beshari/i);
    expect(fields.personName).toMatch(/Yosef|Beshari/i);
    // Real Bashari path — email is the customer
    expect(fields.email).toMatch(/yossi6886@gmail\.com/i);
    expect(fields.serviceAddress).toMatch(/Hampton/i);
    expect(fields.address).toMatch(/Hampton/i);
    // Bill-to is contact block (email/phone) — not the service street
    expect(fields.billingAddress).toMatch(/yossi6886@gmail\.com/i);
    expect(fields.billingAddress).not.toMatch(/Hampton/i);
    expect(fields.billingAddress).not.toBe(fields.serviceAddress);
    expect(fields.amount).toBe(365);
    expect(fields.invoiceNo).toMatch(/^LE-\d+/);
    expect(fields.invoiceLines[0].unitPrice).toBe(365);
    expect(fields.invoiceLines[0].description).toMatch(/City electrical permit renewal/);
    expect(fields.invoiceLines[0].description).toMatch(/B01126007/);
    expect(fields.invoiceLines[0].description).toMatch(/Service location/);
    expect(fields.invoiceLines[0].description.split("\n")).toHaveLength(3);
    expect(fields.title).toMatch(/permit renewal/i);
    expect(fields._invoiceConfirmed).toBe(true);
  });

  it("meta patch marks real Bashari renew and keeps autoEmail off", () => {
    const meta = buildPermitRenewMetaPatch();
    expect(meta.permitRenew.realTest).toBe(true);
    expect(meta.permitRenew.mock).toBe(false);
    expect(meta.permitRenew.fullPayOnly).toBe(true);
    expect(meta.permitRenew.autoEmail).toBe(false);
    expect(meta.permitRenew.provisional).toBe(true);
    expect(meta.permitRenew.excludeFromBalanceDue).toBe(true);
    expect(meta.excludeFromBalanceDue).toBe(true);
    expect(meta.paperwork.dob.renewSchedule.autoEmail).toBe(false);
    expect(meta.email).toMatch(/yossi6886@gmail\.com/i);
    expect(meta.openBalance).toBe(365);
    expect(meta.permitRenew.gradedDate).toBe(PHASE_A_HAMPTON_SCENARIO.issuedDate);
    expect(meta.permitRenew.expiresDate).toBe(
      permitExpiresFromIssued(PHASE_A_HAMPTON_SCENARIO.issuedDate)
    );
    expect(meta.serviceAddress).toMatch(/Hampton/i);
    expect(meta.billingAddress).toMatch(/yossi6886@gmail\.com/i);
    expect(meta.billingAddress).not.toMatch(/Hampton/i);
  });

  it("permitExpiresFromIssued adds one year", () => {
    expect(permitExpiresFromIssued("2026-02-06")).toBe("2027-02-06");
    expect(permitExpiresFromIssued("2024-10-11")).toBe("2025-10-11");
    expect(permitExpiresFromIssued("")).toBe("");
  });

  it("formatPermitDateUs is Month D, YYYY", () => {
    expect(formatPermitDateUs("2026-02-06")).toBe("February 6, 2026");
    expect(formatPermitDateUs("2027-02-06")).toBe("February 6, 2027");
    expect(formatPermitDateUs("2024-10-11")).toBe("October 11, 2024");
    expect(formatPermitDateUs("")).toBe("");
  });

  it("status tone auto-switches by date vs expiry (5 stages)", () => {
    expect(permitRenewStatusTone("2027-02-06", { todayIso: "2026-08-10" })).toBe(
      "upcoming"
    );
    expect(permitRenewStatusTone("2027-02-06", { todayIso: "2026-12-20" })).toBe(
      "soon"
    );
    expect(permitRenewStatusTone("2025-10-11", { todayIso: "2026-08-10" })).toBe(
      "expired"
    );
    expect(permitRenewStatusTone("2025-10-11", { todayIso: "2025-10-11" })).toBe(
      "expired"
    );
    // Abandoned 2026-10-11 → near_abandon ~within 2 months before that
    expect(permitRenewStatusTone("2025-10-11", { todayIso: "2026-09-01" })).toBe(
      "near_abandon"
    );
    // On/after abandoned date → must re-apply
    expect(permitRenewStatusTone("2025-10-11", { todayIso: "2026-10-11" })).toBe(
      "abandoned"
    );
    expect(permitRenewStatusTone("2025-10-11", { todayIso: "2027-01-01" })).toBe(
      "abandoned"
    );
    expect(permitRenewStageLabel("near_abandon")).toMatch(/Near abandoned/i);
    expect(permitRenewStageLabel("abandoned")).toMatch(/re-apply/i);
  });

  it("status sentence uses Permit wording for each tone", () => {
    expect(
      permitRenewStatusSentence("40 Hampton Pl", "February 6, 2027", "upcoming")
    ).toMatch(/coming up for renewal/);
    expect(
      permitRenewStatusSentence("40 Hampton Pl", "February 6, 2027", "soon")
    ).toMatch(/expires soon/);
    expect(
      permitRenewStatusSentence("40 Hampton Pl", "October 11, 2025", "expired")
    ).toMatch(/expired on October 11, 2025/);
    expect(
      permitRenewStatusSentence("40 Hampton Pl", "October 11, 2025", "expired")
    ).toMatch(/12-month abandoned clock/);
    expect(
      permitRenewStatusSentence(
        "40 Hampton Pl",
        "October 11, 2025",
        "near_abandon",
        "October 11, 2026"
      )
    ).toMatch(/about to go into abandoned status on October 11, 2026/);
    expect(
      permitRenewStatusSentence(
        "40 Hampton Pl",
        "October 11, 2025",
        "abandoned",
        "October 11, 2026"
      )
    ).toMatch(/is now abandoned \(as of October 11, 2026\)/);
    expect(
      permitRenewStatusSentence(
        "40 Hampton Pl",
        "October 11, 2025",
        "abandoned",
        "October 11, 2026"
      )
    ).toMatch(/apply for a brand-new permit/);
  });

  it("abandoned date is expiration + 12 months", () => {
    expect(permitAbandonedFromExpires("2025-10-11")).toBe("2026-10-11");
  });

  it("renew-by date is ~7 days before expire when still active", () => {
    expect(permitRenewByDate("2027-02-06", { todayIso: "2026-08-10" })).toBe(
      "2027-01-30"
    );
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

  it("partial payment on renew stops balance-exempt so invoice + pay show in records", () => {
    const partial = {
      id: "r-partial",
      invoiceNo: "LE-2701",
      amount: 365,
      openBalance: 364,
      paid: false,
      excludeFromBalanceDue: true,
      permitRenew: { mock: true, phase: "A", provisional: true, excludeFromBalanceDue: true },
      payments: [
        {
          id: "sola-11005049154",
          amount: "$1",
          method: "Credit card",
          ref: "11005049154",
          date: "2026-08-10",
          source: "sola",
        },
      ],
    };
    expect(isBalanceExemptOffer(partial)).toBe(false);
    expect(openBalance(partial)).toBe(364);
    const sum = customerAmountSummary([partial]);
    expect(sum.due).toBe(364);
    expect(sum.openInvoices).toBe(1);
  });

  it("listRenewApplications lists open / paid / wants-renew with dates", () => {
    const open = {
      id: "r1",
      customer: "Yosef Beshari",
      email: "yossi6886@gmail.com",
      invoiceNo: "LE-2710",
      amount: 365,
      openBalance: 365,
      serviceAddress: "40 Hampton Pl",
      permitRenew: {
        realTest: true,
        scenarioId: "hampton-yossi",
        address: "40 Hampton Pl",
        permitNo: "B01126007-L1-EL",
        issuedDate: "2024-10-11",
        gradedDate: "2024-10-11",
        expiresDate: "2025-10-11",
        fee: 365,
      },
    };
    const paid = {
      ...open,
      id: "r2",
      paid: true,
      openBalance: 0,
      permitRenew: { ...open.permitRenew, paid: true, nextStep: "update_permit" },
    };
    const notice = {
      id: "r3",
      customer: "Other",
      serviceAddress: "99 Test St",
      paperwork: { dob: { renewSchedule: { on: true } } },
    };
    const rows = listRenewApplications([open, paid, notice]);
    expect(rows.length).toBe(3);
    expect(rows.find((r) => r.id === "r1").status).toBe("Pending send");
    expect(rows.find((r) => r.id === "r1").pendingSend).toBe(true);
    expect(rows.find((r) => r.id === "r2").status).toBe("Paid — update permit");
    expect(rows.find((r) => r.id === "r2").deployUpdate).toBe(true);
    expect(rows.find((r) => r.id === "r2").nextStep).toBe("update_permit");
    expect(rows.find((r) => r.id === "r2").nextStepLabel).toMatch(/update|Deploy/i);
    expect(rows.find((r) => r.id === "r3").status).toMatch(/Pending send|Wants renew/i);
    expect(rows.find((r) => r.id === "r1").expiresDate).toBe("2025-10-11");
    expect(rows.find((r) => r.id === "r1").gradedDate).toBe("2024-10-11");

    // After notice email sent: leave pending list until full pay
    const emailed = {
      ...open,
      id: "r1-sent",
      permitRenew: { ...open.permitRenew, noticeSent: true, emailSentAt: "2026-08-10T12:00:00Z" },
    };
    const afterSend = listRenewApplications([emailed, paid]);
    expect(afterSend.find((r) => r.id === "r1-sent")).toBeUndefined();
    expect(afterSend.find((r) => r.id === "r2")?.deployUpdate).toBe(true);
  });

  it("real Bashari $1 card pay shows Paid + update-permit next step on renew list", () => {
    const dollar = {
      id: "r-dollar",
      customer: "Yosef Beshari",
      email: "yossi6886@gmail.com",
      invoiceNo: "LE-2701",
      amount: 365,
      openBalance: 0,
      paid: true,
      serviceAddress: "40 Hampton Pl",
      payments: [
        {
          id: "sola-11005049154",
          amount: "$1",
          method: "Credit card",
          ref: "11005049154",
          date: "2026-08-10",
          source: "sola",
        },
      ],
      permitRenew: {
        realTest: true,
        scenarioId: "hampton-yossi",
        paid: true,
        nextStep: "update_permit",
        permitNo: "B01126007-L1-EL",
        issuedDate: "2024-10-11",
        expiresDate: "2025-10-11",
        fee: 365,
      },
    };
    const rows = listRenewApplications([dollar]);
    expect(rows).toHaveLength(1);
    expect(rows[0].paid).toBe(true);
    expect(rows[0].status).toBe("Paid — update permit");
    expect(rows[0].nextStepLabel).toMatch(/Payment received|Deploy queue/i);
  });

  it("email matches Levi draft: Permit only, L1 facts, auto status, pay CTA", () => {
    const payUrl = "https://leelectrical.us/app/pro/#/pay/abcTOKEN";
    const { subject, body, htmlBody, to, ctaLabel, ctaUrl, tone } = buildPermitRenewEmail({
      payUrl,
      invoiceNo: "LE-2701",
      todayIso: "2026-08-10",
    });
    expect(to).toMatch(/yossi6886@gmail\.com/i);
    expect(ctaLabel).toBe("Renew Permit");
    expect(ctaLabel).not.toMatch(/View\/Pay|View and Pay/i);
    expect(ctaUrl).toBe(payUrl);
    expect(ctaUrl).not.toMatch(/renewCta=phaseA/);
    // L1 expired today → expired tone + subject
    expect(tone).toBe("expired");
    expect(subject).toMatch(/permit has expired|Time to renew/i);
    expect(subject).toMatch(/40 Hampton/i);
    expect(body).toMatch(/40 Hampton/i);
    expect(body).toMatch(/B01126007-L1/i);
    expect(body).not.toMatch(/S1/i);
    expect(body).toMatch(/\$365\.00|365/);
    // Call it Permit only — never Application / issue number
    expect(body).toMatch(/Permit number:/i);
    expect(body).not.toMatch(/Application \/ issue number/i);
    expect(body).not.toMatch(/Permit Application/i);
    expect(body).toMatch(/Issued:/i);
    expect(body).toMatch(/October 11, 2024/);
    expect(body).toMatch(/October 11, 2025/);
    expect(body).toMatch(/expired on October 11, 2025/i);
    expect(body).toMatch(/12-month abandoned clock|abandoned/i);
    expect(body).toMatch(/\$2,300|2300|filing fees/);
    expect(body).toMatch(/Invoice: #LE-2701|Invoice #LE-2701|#LE-2701/);
    expect(body).toMatch(/click Renew Permit|Renew Permit/i);
    expect(body).not.toContain("Update or Renew Permit:");
    expect(body).not.toMatch(/View\/Pay Invoice/i);
    expect(body).not.toMatch(/yossi6886@gmail\.com/i);
    // HTML table labels
    expect(htmlBody).toMatch(/Permit number/i);
    expect(htmlBody).not.toMatch(/Application \/ issue number/i);
    expect(htmlBody).toMatch(/B01126007-L1/);
    expect(htmlBody).toMatch(/Renewal fee/i);
    expect(htmlBody).toMatch(/\$2,300 plus filing fees/i);
  });

  it("email upcoming tone uses draft subject when not yet expired", () => {
    const upcoming = {
      ...PHASE_A_HAMPTON_SCENARIO,
      permitNo: "B01126007-S1-EL",
      issuedDate: "2026-02-06",
      expiresDate: "2027-02-06",
    };
    const { subject, body, tone } = buildPermitRenewEmail({
      scenario: upcoming,
      invoiceNo: "LE-2701",
      todayIso: "2026-08-10",
    });
    expect(tone).toBe("upcoming");
    expect(subject).toBe("Time to renew your electrical permit — 40 Hampton Pl");
    expect(body).toMatch(/coming up for renewal/i);
    expect(body).toMatch(/Permit number: B01126007-S1-EL/);
    expect(body).toMatch(/February 6, 2026/);
    expect(body).toMatch(/February 6, 2027/);
    expect(body).toMatch(/Please renew by January 30, 2027/i);
  });

  it("email near_abandon + abandoned stages use re-apply wording", () => {
    const near = buildPermitRenewEmail({
      invoiceNo: "LE-2701",
      todayIso: "2026-09-01", // expires 2025-10-11 → abandon 2026-10-11
    });
    expect(near.tone).toBe("near_abandon");
    expect(near.subject).toMatch(/about to be abandoned/i);
    expect(near.ctaLabel).toBe("Renew Permit");
    expect(near.body).toMatch(/about to go into abandoned status/i);
    expect(near.body).toMatch(/brand-new permit/i);

    const gone = buildPermitRenewEmail({
      invoiceNo: "LE-2701",
      todayIso: "2026-10-12",
    });
    expect(gone.tone).toBe("abandoned");
    expect(gone.subject).toMatch(/is abandoned/i);
    expect(gone.ctaLabel).toBe("Apply for new permit");
    expect(gone.body).toMatch(/is now abandoned/i);
    expect(gone.body).toMatch(/can no longer be renewed|brand-new permit/i);
    expect(gone.stageLabel).toMatch(/re-apply/i);
  });

  it("Phase A CTA pay payload: full bill-to contact + service address", () => {
    const p = buildPhaseACtaPayPayload();
    expect(p.a).toBe(365);
    expect(p.c).toMatch(/Yosef|Beshari/i);
    expect(p.sa).toMatch(/Hampton/i);
    // Bill-to is contact (email), not the service street alone
    expect(p.ba).toMatch(/yossi6886@gmail\.com/i);
    expect(p.ba).not.toMatch(/Hampton/i);
    expect(String(p.w).split("\n")).toHaveLength(3);
    expect(p.k).toBe("i");
    expect(p.renewCta).toBe("phaseA");
    expect(p.i).toBeTruthy();
    expect(Array.isArray(p.lines) && p.lines.length).toBeTruthy();
    expect(p.lines[0].description.split("\n")).toHaveLength(3);
  });

  it("mailto builds for any real To address", () => {
    const ok = buildPermitRenewMailto({
      to: LEVI_TESTER.email,
      subject: "hi",
      body: "body",
    });
    expect(ok.ok).toBe(true);
    expect(ok.href).toMatch(/^mailto:/);
    expect(ok.href).toContain(encodeURIComponent(LEVI_TESTER.email));

    const real = buildPermitRenewMailto({
      to: "yossi6886@gmail.com",
      subject: "hi",
      body: "body",
    });
    expect(real.ok).toBe(true);
    expect(real.href).toMatch(/^mailto:/);

    const any = buildPermitRenewMailto({
      to: "random@example.com",
      subject: "hi",
      body: "body",
    });
    expect(any.ok).toBe(true);
    expect(any.href).toMatch(/^mailto:/);

    // Empty To falls back to Hampton on-file email
    const empty = buildPermitRenewMailto({ to: "", subject: "hi", body: "body" });
    expect(empty.ok).toBe(true);
    expect(empty.email).toMatch(/yossi6886/);
  });

  it("listPendingRenewCards always shows Hampton + Schenectady until emailed", () => {
    expect(READY_RENEW_SCENARIOS).toHaveLength(2);
    expect(RENEW_HAMPTON_SCENARIO.address).toMatch(/Hampton/i);
    expect(RENEW_HACKNER_SCENARIO.address).toMatch(/Schenectady/i);

    const empty = listPendingRenewCards([]);
    expect(empty).toHaveLength(2);
    expect(empty.map((c) => c.scenarioId).sort()).toEqual([
      "hampton-yossi",
      "schenectady-hackner",
    ]);

    const open = {
      id: "r-ham",
      customer: "Yosef Beshari",
      email: "yossi6886@gmail.com",
      invoiceNo: "LE-2710",
      amount: 365,
      openBalance: 365,
      serviceAddress: "40 Hampton Pl",
      permitRenew: {
        realTest: true,
        scenarioId: "hampton-yossi",
        address: "40 Hampton Pl",
        permitNo: "B01126007-L1-EL",
        issuedDate: "2024-10-11",
        expiresDate: "2025-10-11",
        fee: 365,
      },
    };
    const paid = {
      ...open,
      id: "r-paid",
      paid: true,
      openBalance: 0,
      permitRenew: { ...open.permitRenew, paid: true, nextStep: "update_permit" },
    };
    const sent = {
      ...open,
      id: "r-sent",
      permitRenew: { ...open.permitRenew, noticeSent: true },
    };

    // Open Hampton still pending; Schenectady still ready from cache
    const mid = listPendingRenewCards([open]);
    expect(mid.find((c) => c.scenarioId === "hampton-yossi")?.pendingSend).toBe(true);
    expect(mid.find((c) => c.scenarioId === "schenectady-hackner")?.pendingSend).toBe(true);

    // After email, Hampton drops; Schenectady remains
    const after = listPendingRenewCards([sent]);
    expect(after.find((c) => c.scenarioId === "hampton-yossi")).toBeUndefined();
    expect(after.find((c) => c.scenarioId === "schenectady-hackner")).toBeTruthy();

    // Paid → update permit box
    const paidBox = listPaidUpdatePermitCards([paid]);
    expect(paidBox.length).toBe(1);
    expect(paidBox[0].deployUpdate).toBe(true);

    // Cache always carries permit # + expiration (never blank main card)
    const fromCache = listPendingRenewCards([]);
    const ham = fromCache.find((c) => c.scenarioId === "hampton-yossi");
    expect(ham?.permitNo).toMatch(/B01126007/);
    expect(ham?.expiresDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ham?.expiresDate).toBe("2025-10-11");

    // Thin job row (missing permitRenew facts) still fills from scenario
    const thin = {
      id: "r-thin",
      customer: "Yosef Beshari",
      serviceAddress: "40 Hampton Pl",
      invoiceNo: "LE-2799",
      amount: 365,
      openBalance: 365,
      permitRenew: { realTest: true, scenarioId: "hampton-yossi" },
    };
    const filled = listPendingRenewCards([thin]).find((c) => c.scenarioId === "hampton-yossi");
    expect(filled?.permitNo).toMatch(/B01126007/);
    expect(filled?.expiresDate).toBe("2025-10-11");
  });

  it("detects renew jobs and reuses open Bashari invoice", () => {
    const open = {
      id: "local-1",
      customer: "Yosef Beshari",
      email: "yossi6886@gmail.com",
      invoiceNo: "LE-2705",
      amount: 365,
      openBalance: 365,
      permitRenew: { realTest: true, phase: "A", scenarioId: "hampton-yossi" },
      title: "City electrical permit renewal — B01126007-L1-EL",
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
    expect(fresh.meta.permitRenew.realTest).toBe(true);
    expect(fresh.meta.permitRenew.mock).toBe(false);
  });

  it("Hackner real-test seeds 364 Schenectady service address + compose gate", () => {
    expect(REAL_TEST_HACKNER_SCENARIO.displayCustomer).toMatch(/Hackner/i);
    expect(REAL_TEST_HACKNER_SCENARIO.address).toMatch(/364 Schenectady/i);
    expect(REAL_TEST_HACKNER_SCENARIO.businessName).toMatch(/234 Schenectady/i);
    expect(REAL_TEST_HACKNER_SCENARIO.realEmail).toBe("yhackner@gmail.com");

    const fields = buildPermitRenewJobFields({
      jobs: [],
      scenario: REAL_TEST_HACKNER_SCENARIO,
    });
    // Sub-company is the job customer; parent Hackner is linked for billing
    expect(fields.customer).toMatch(/234 Schenectady/i);
    expect(fields.businessName).toMatch(/234 Schenectady/i);
    expect(fields.personName).toMatch(/Yossi Hackner/i);
    expect(fields.parentCustomerName).toMatch(/Yossi Hackner/i);
    expect(fields.parentQboCustomerId).toBe("336");
    expect(fields.serviceAddress).toMatch(/364 Schenectady/i);
    expect(fields.email).toBe("yhackner@gmail.com");
    expect(fields.billingAddress).toMatch(/yhackner@gmail\.com/);
    expect(fields.billingAddress).not.toMatch(/Schenectady/i);

    const meta = buildPermitRenewMetaPatch(REAL_TEST_HACKNER_SCENARIO);
    expect(meta.permitRenew.realTest).toBe(true);
    expect(meta.permitRenew.mock).toBe(false);
    expect(meta.permitRenew.scenarioId).toBe("schenectady-hackner");

    const draft = buildPermitRenewEmail({
      scenario: REAL_TEST_HACKNER_SCENARIO,
      invoiceNo: "LE-2800",
      payUrl: "https://example.com/pay",
    });
    expect(draft.to).toBe("yhackner@gmail.com");
    expect(draft.subject).toMatch(/364 Schenectady/i);
    expect(draft.body).toMatch(/Yossi/i);

    expect(assertRenewComposeRecipient("yhackner@gmail.com", { realTest: true }).ok).toBe(
      true
    );
    // Real customers allowed even when realTest flag is false (allow-list)
    expect(assertRenewComposeRecipient("yhackner@gmail.com", { realTest: false }).ok).toBe(
      true
    );
    expect(assertRenewComposeRecipient("levikumer@gmail.com", { realTest: true }).ok).toBe(
      true
    );

    const prep = prepareRenewScenario({ jobs: [], scenario: REAL_TEST_HACKNER_SCENARIO });
    expect(prep.reuse).toBe(false);
    expect(prep.fields.serviceAddress).toMatch(/364/);
    // Notice-only by default — no real invoice until Renew tap
    expect(prep.noticeOnly).toBe(true);
    expect(prep.fields.invoiceNo).toBe("");
    expect(prep.placeholderInvoiceNo).toMatch(/^LE-/);

    const rows = listRenewApplications([
      {
        id: "hack-1",
        ...fields,
        ...meta,
        openBalance: 0,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].customer).toMatch(/Hackner|Schenectady/i);
    // Real DOB # required for send — empty until cache lookup fills it
    expect(rows[0].permitNo || "").not.toMatch(/LLC/i);
    expect(rows[0].address).toMatch(/364/);
    expect(rows[0].realTest).toBe(true);
    expect(canSendRenewNotice(REAL_TEST_HACKNER_SCENARIO).ok).toBe(false);
    expect(canSendRenewNotice(RENEW_HAMPTON_SCENARIO).ok).toBe(true);
  });

  it("notice-only: reserves placeholder, no real invoice until materialize", () => {
    const prep = prepareRenewNotice({
      jobs: [],
      scenario: RENEW_HAMPTON_SCENARIO,
    });
    expect(prep.noticeOnly).toBe(true);
    expect(prep.fields.invoiceNo).toBe("");
    expect(prep.fields._invoiceConfirmed).toBe(false);
    expect(prep.placeholderInvoiceNo).toMatch(/^LE-\d+/);
    expect(prep.meta.permitRenew.noticeOnly).toBe(true);
    expect(prep.meta.permitRenew.invoiceMaterialized).toBe(false);
    expect(prep.meta.permitRenew.placeholderInvoiceNo).toBe(prep.placeholderInvoiceNo);
    expect(prep.meta.openBalance).toBe(0);

    const draft = buildPermitRenewEmail({
      scenario: RENEW_HAMPTON_SCENARIO,
      invoiceNo: prep.placeholderInvoiceNo,
      noticeOnly: true,
      todayIso: "2026-08-10",
    });
    expect(draft.noticeOnly).toBe(true);
    expect(draft.body).toMatch(/Reference:/i);
    expect(draft.body).toMatch(/reserved/i);
    expect(draft.ctaUrl).toMatch(/renewCta=phaseA/);
    expect(draft.ctaUrl).toMatch(/scenario=hampton-yossi/);
    expect(draft.ctaUrl).toMatch(/inv=LE-/);

    const noticeJob = {
      id: "notice-1",
      ...prep.fields,
      ...prep.meta,
      permitRenew: {
        ...prep.meta.permitRenew,
        noticeSent: false,
      },
    };
    // Not an open balance-due invoice
    expect(parseFloat(String(noticeJob.openBalance || 0)) || 0).toBe(0);

    const mat = materializeRenewInvoicePatch(noticeJob);
    expect(mat.invoiceNo).toBe(prep.placeholderInvoiceNo);
    expect(mat._invoiceConfirmed).toBe(true);
    expect(mat.amount).toBe(365);
    expect(mat.permitRenew.invoiceMaterialized).toBe(true);
    expect(mat.permitRenew.noticeOnly).toBe(false);
  });

  it("CTA url + payload use scenario + reserved inv; separate invoices per address", () => {
    const url = buildRenewNoticeCtaUrl({
      scenarioId: "schenectady-hackner",
      invoiceNo: "LE-2910",
    });
    expect(url).toMatch(/renewCta=phaseA/);
    expect(url).toMatch(/scenario=schenectady-hackner/);
    expect(url).toMatch(/inv=LE-2910/);

    const ham = prepareRenewNotice({ jobs: [], scenario: RENEW_HAMPTON_SCENARIO });
    const hack = prepareRenewNotice({
      jobs: [{ invoiceNo: ham.placeholderInvoiceNo }],
      scenario: RENEW_HACKNER_SCENARIO,
    });
    // Separate reserved numbers for each permit/address
    expect(ham.placeholderInvoiceNo).not.toBe(hack.placeholderInvoiceNo);
    expect(ham.meta.permitRenew.scenarioId).toBe("hampton-yossi");
    expect(hack.meta.permitRenew.scenarioId).toBe("schenectady-hackner");
  });

  it("send history records every notice send", () => {
    const job = {
      id: "hist-1",
      customer: "Yosef Beshari",
      serviceAddress: "40 Hampton Pl",
      permitRenew: {
        realTest: true,
        noticeOnly: true,
        scenarioId: "hampton-yossi",
        permitNo: "B01126007-L1-EL",
        address: "40 Hampton Pl",
        displayCustomer: "Yosef Beshari",
        placeholderInvoiceNo: "LE-2990",
        invoiceMaterialized: false,
        sendHistory: [],
      },
    };
    const p1 = buildRenewNoticeSentPatch(job, {
      to: "yossi6886@gmail.com",
      subject: "Time to renew",
      placeholderInvoiceNo: "LE-2990",
    });
    expect(p1.permitRenew.noticeSent).toBe(true);
    expect(p1.permitRenew.sendHistory).toHaveLength(1);
    expect(p1.permitRenew.sendHistory[0].to).toMatch(/yossi6886/);
    expect(p1.permitRenew.invoiceMaterialized).toBe(false);

    const after = {
      ...job,
      permitRenew: p1.permitRenew,
    };
    const p2 = buildRenewNoticeSentPatch(after, {
      to: "other@example.com",
      subject: "Reminder",
      placeholderInvoiceNo: "LE-2990",
    });
    expect(p2.permitRenew.sendHistory.length).toBeGreaterThanOrEqual(2);

    const hist = listRenewSendHistory([
      { ...after, permitRenew: p2.permitRenew },
    ]);
    expect(hist.length).toBeGreaterThanOrEqual(1);
    expect(hist[0].permitNo).toMatch(/B01126007/);
    expect(hist.some((h) => h.placeholderInvoiceNo === "LE-2990")).toBe(true);
  });

  it("permit cache seeds ready addresses with customer + email", () => {
    ensurePermitCacheSeeded(READY_RENEW_SCENARIOS);
    const cache = loadPermitCache();
    expect(cache.length).toBeGreaterThanOrEqual(2);
    const ham = cache.find((e) => e.scenarioId === "hampton-yossi" || /Hampton/i.test(e.address));
    expect(ham?.permitNo).toMatch(/B01126007/);
    expect(ham?.email).toMatch(/yossi6886/);
    expect(ham?.customer).toMatch(/Beshari|Yosef/i);
    expect(ham?.issuedDate).toBe("2024-10-11");
    expect(permitCacheKey({ scenarioId: "hampton-yossi" })).toBe("sc:hampton-yossi");

    const reserved = reservePlaceholderInvoiceNo([], {
      scenarioId: "hampton-yossi",
      permitNo: ham.permitNo,
    });
    expect(reserved).toMatch(/^LE-\d+/);
    void listCacheHistory;
  });
});
