// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import PayLanding from "../src/views/PayLanding.jsx";
import { buildPayLandingPayload, encodePayLanding } from "../src/lib/payLanding.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPay(token) {
  return render(
    <MemoryRouter initialEntries={[`/pay/${token}`]}>
      <Routes>
        <Route path="/pay/:token" element={<PayLanding />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("PayLanding view", () => {
  it("shows invoice details, View invoice button, and Pay CTA with zip in Sola URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
    const open = vi.fn();
    vi.stubGlobal("open", open);

    const token = encodePayLanding(
      buildPayLandingPayload({
        job: {
          customer: "Rae Klein",
          title: "Panel upgrade",
          amount: "$652",
          invoiceNo: "251839",
          email: "rae@x.com",
          phone: "555-9",
          serviceAddress: "55 Elm St, Brooklyn, NY 11201",
          billingAddress: "55 Elm St, Brooklyn, NY 11201",
        },
        cardknoxUrl: "https://secure.cardknox.com/blzelectric?xAmount=652&xinvoice=251839",
        linkAmount: "652",
        inv: "251839",
        siteSlug: "blzelectric",
      })
    );
    renderPay(token);
    expect(screen.getByText("BLZ Electric")).toBeInTheDocument();
    expect(screen.getByText("#251839")).toBeInTheDocument();
    expect(screen.getByText("Billing address")).toBeInTheDocument();
    expect(screen.getByText("Service address")).toBeInTheDocument();
    const billing = screen.getByText("Billing address");
    const service = screen.getByText("Service address");
    expect(
      billing.compareDocumentPosition(service) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByText("Panel upgrade")).toBeInTheDocument();
    expect(screen.getByTestId("view-invoice")).toHaveTextContent("View invoice");
    expect(screen.getByText("Rae Klein")).toBeInTheDocument();
    const cta = screen.getByTestId("pay-cta");
    expect(cta).toHaveTextContent("Pay $674.82");
    expect(cta.getAttribute("href")).toContain("xBillZip=11201");
    expect(cta.getAttribute("href")).toContain("xCustom01=652");
    expect(cta.getAttribute("href")).toContain("sola-payment");
  });

  it("lets the customer edit paying-today amount", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const user = userEvent.setup();
    const token = encodePayLanding(
      buildPayLandingPayload({
        job: {
          customer: "Ann",
          amount: "$500",
          invoiceNo: "9",
          billingAddress: "1 St, Brooklyn, NY 11201",
          serviceAddress: "1 St, Brooklyn, NY 11201",
        },
        cardknoxUrl: "https://secure.cardknox.com/blzelectric?xAmount=500&xinvoice=9",
        linkAmount: "500",
        inv: "9",
        siteSlug: "blzelectric",
      })
    );
    renderPay(token);
    await user.click(screen.getByTestId("edit-amount"));
    const input = screen.getByLabelText("Payment amount");
    await user.clear(input);
    await user.type(input, "250");
    await user.click(screen.getByText("Done"));
    expect(screen.getByTestId("pay-cta")).toHaveTextContent("Pay $258.75");
  });

  it("shows invalid state for bad token", () => {
    renderPay("bad-token");
    expect(screen.getByText("Link not valid")).toBeInTheDocument();
  });
});