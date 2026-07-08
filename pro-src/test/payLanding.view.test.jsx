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
  it("shows BLZ branding, fee breakdown, and Pay CTA with pre-filled Sola URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true }))
    );
    const token = encodePayLanding(
      buildPayLandingPayload({
        job: {
          customer: "Rae Klein",
          title: "Panel",
          amount: "$652",
          invoiceNo: "251839",
          email: "rae@x.com",
          phone: "555-9",
          billingAddress: "1 Main St, Brooklyn, NY 11201",
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
    expect(screen.getByText("Processing fee (3.5%)")).toBeInTheDocument();
    const cta = screen.getByTestId("pay-cta");
    expect(cta).toHaveTextContent("Pay $674.82");
    expect(cta.getAttribute("href")).toContain("xAmount=674.82");
    expect(cta.getAttribute("href")).toContain("xBillLastName=Rae");
    expect(cta.getAttribute("href")).toContain("xBillStreet=1");
  });

  it("lets the customer edit paying-today amount", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const user = userEvent.setup();
    const token = encodePayLanding(
      buildPayLandingPayload({
        job: { customer: "Ann", amount: "$500", invoiceNo: "9", billingAddress: "1 St" },
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