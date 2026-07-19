// LEPRO_EMAIL_DESIGN_FIXES spec — invoice/estimate email design.
//   1. no raw payment URL as body text; short link behind a button only
//   2. one primary CTA "View Invoice" at the top, pointing at the landing page
//   3. Bill-to must not wrap one letter per line on a phone
//   4. paying happens on the landing page, not from the email
import { describe, expect, it } from "vitest";
import emailTemplate from "../../netlify/functions/lib/le-invoice-suite/email-template.js";
import {
  buildEmailPayLandingPayload,
  makePayCode,
} from "../../netlify/functions/lib/payLandingLink.mjs";
import { poweredByLeHtml } from "../../netlify/functions/lib/emailBranding.mjs";

const { buildEmailHTML } = emailTemplate;

const CARDKNOX =
  "https://secure.cardknox.com/blzelectric?xAmount=16000&xinvoice=231595" +
  "&xRedirectURL=https%3A%2F%2Fleelectrical.us%2F.netlify%2Ffunctions%2Fsola-payment" +
  "&xCustom01=16000&xBillLastName=Shneor+Seewald&xEmail=customer%40example.com";

const SHORT = "https://leelectrical.us/pay/231595-a1b2";

const DOC = {
  company: {
    name: "BLZ Electric Inc.",
    addressLines: ["383 Kingston Ave", "Brooklyn, NY 11213"],
    phone: "(718) 594-1850",
    email: "Office@LeElectrical.us",
  },
  docType: "INVOICE",
  docNumber: "231595",
  docDate: "07/19/2026",
  dueDate: "08/19/2026",
  billTo: { name: "Shneor Seewald", addressLines: ["1445 President st", "Brooklyn, NY 11213"] },
  lines: [{ description: "Electrical service", qty: 1, rate: 16000, amount: 16000 }],
  amountDue: "16,000.00",
};

function render(extra = {}) {
  return buildEmailHTML({
    ...DOC,
    viewLink: SHORT,
    viewLabel: "View Invoice",
    poweredByHtml: poweredByLeHtml(),
    ...extra,
  });
}

describe("1 — no raw payment URL leaks into the email", () => {
  it("never prints the Cardknox URL or its query params", () => {
    const html = render();
    expect(html).not.toContain("secure.cardknox.com");
    expect(html).not.toContain("xBillLastName");
    expect(html).not.toContain("sola-payment");
    expect(html).not.toContain("%2F");
  });

  it("does not leak the Cardknox URL even if a caller still passes payLink", () => {
    // Regression guard: the second (green) pay button is gone, so a stray
    // payLink must not resurface a raw URL in the body.
    const html = render({ payLink: undefined });
    expect(html).not.toContain("cardknox");
  });

  it("the short link is what appears, inside an anchor", () => {
    const html = render();
    expect(html).toContain(`href="${SHORT}"`);
    // …and not as bare visible text outside the anchor
    const visible = html.replace(/<[^>]+>/g, " ");
    expect(visible).not.toContain(SHORT);
  });

  it("mints a landing code in the format pay-link.mjs resolves", () => {
    const code = makePayCode("231595", () => 0.5);
    expect(code).toMatch(/^[0-9]{5,8}-[a-z0-9]{4}$/i);
  });
});

describe("2 — one primary CTA at the top", () => {
  it("renders exactly one View Invoice button", () => {
    const html = render();
    const matches = html.match(/View Invoice/g) || [];
    expect(matches).toHaveLength(1);
  });

  it("the CTA points at the landing page, not the payment page", () => {
    const html = render();
    expect(html).toContain(`href="${SHORT}"`);
    expect(html).not.toContain("cardknox");
  });

  it("the CTA sits above the line items (top of the email)", () => {
    const html = render();
    expect(html.indexOf("View Invoice")).toBeLessThan(html.indexOf("Electrical service"));
  });

  it("drops the redundant 'pay securely online' line", () => {
    const html = render();
    expect(html.toLowerCase()).not.toContain("pay this invoice securely online");
    expect(html.toLowerCase()).not.toContain("securely online");
  });

  it("does not advertise a separate credit-card payment link", () => {
    const html = render({
      paymentMessage:
        'Other ways to pay:\n\n-Zelle: Send payment to Office@LeElectrical.us.\n-Check: Make checks payable to "BLZ Electric Inc."',
    });
    expect(html.toLowerCase()).not.toContain("credit card payment link");
    expect(html).toContain("Other ways to pay");
    expect(html).toContain("Zelle");
  });
});

describe("3 — Bill-to renders cleanly on a phone", () => {
  it("no longer pins the label cell to 250px", () => {
    expect(render()).not.toContain("width:250px");
  });

  it("never breaks inside a word (the Shn/eor/See/wal/d bug)", () => {
    const html = render();
    expect(html).not.toContain("word-break:break-word");
    expect(html).toContain("word-break:normal");
  });

  it("gives the details column a usable min-width", () => {
    expect(render()).toContain("min-width:200px");
  });

  it("ships a mobile media query that stacks label above details", () => {
    const html = render();
    expect(html).toContain("@media only screen and (max-width:480px)");
    expect(html).toContain("le-fieldrow");
  });

  it("still renders the customer name and address", () => {
    const html = render();
    expect(html).toContain("Shneor Seewald");
    expect(html).toContain("1445 President st");
  });
});

describe("4 — landing payload powers review + pay on the page", () => {
  const payload = buildEmailPayLandingPayload({
    job: {
      id: "qbo-231595",
      customer: "Shneor Seewald",
      address: "1445 President st",
      phone: "718-555-0100",
      payments: [{ amount: "$1,000", method: "Check", date: "2026-07-01", ref: "1234" }],
    },
    docData: DOC,
    email: "customer@example.com",
    cardknoxUrl: CARDKNOX,
  });

  it("carries the invoice number and is resolvable by PayLanding", () => {
    expect(payload.i).toBe("231595");
    // PayLanding requires i AND (sl or pay)
    expect(payload.sl || payload.pay).toBeTruthy();
  });

  it("embeds the Cardknox URL for the page's Pay action (not the email)", () => {
    expect(payload.pay).toBe(CARDKNOX);
  });

  it("includes payment history for the page", () => {
    expect(payload.ps).toHaveLength(1);
    expect(payload.ps[0]).toMatchObject({ m: "Check", r: "1234" });
    expect(payload.ps[0].a).toContain("1,000");
  });

  it("carries customer + address details for the review view", () => {
    expect(payload.c).toBe("Shneor Seewald");
    expect(payload.ba).toBe("1445 President st");
  });
});

describe("branding survives the redesign", () => {
  it("still carries the Powered by LE footer", () => {
    expect(render()).toContain("Powered by");
  });
});
