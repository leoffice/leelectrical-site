// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import PayThanks from "../src/views/PayThanks.jsx";
import { buildPayLandingPayload, encodePayLanding } from "../src/lib/payLanding.js";
import { solaPayUrlFromLanding } from "../src/lib/solaPayUrl.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderThanks(query) {
  return render(
    <MemoryRouter initialEntries={[`/pay/thanks?${query}`]}>
      <Routes>
        <Route path="/pay/thanks" element={<PayThanks />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("PayThanks view", () => {
  it("centers logo and company name on the same axis", () => {
    renderThanks("ok=1&inv=9&amt=500&bal=0");
    const header = screen.getByTestId("pay-thanks-header");
    expect(header).toHaveClass("items-center");
    expect(header).toHaveClass("text-center");
    expect(screen.getByTestId("pay-thanks-logo")).toHaveClass("mx-auto");
    expect(screen.getByText("BLZ Electric")).toBeInTheDocument();
  });

  it("shows receipt with amount paid and balance now from redirect params", () => {
    renderThanks("ok=1&inv=231315&amt=10000&bal=1000");
    expect(screen.getByText("Payment received")).toBeInTheDocument();
    expect(screen.getByTestId("pay-receipt")).toBeInTheDocument();
    expect(screen.getByText("Amount paid")).toBeInTheDocument();
    expect(screen.getByText("$10,000")).toBeInTheDocument();
    expect(screen.getByText("Balance now")).toBeInTheDocument();
    expect(screen.getByTestId("balance-now")).toHaveTextContent("$1,000");
  });

  it("shows Paid in full when balance is zero", () => {
    renderThanks("ok=1&inv=251839&amt=652&bal=0");
    expect(screen.getByTestId("balance-now")).toHaveTextContent("Paid in full");
  });

  it("payment link → Sola redirect chain includes invoice and principal for balance calc", () => {
    const token = encodePayLanding(
      buildPayLandingPayload({
        job: {
          id: "J-42",
          customer: "Rae Klein",
          amount: "$1,652",
          openBalance: 652,
          invoiceNo: "251839",
          billingAddress: "55 Elm St, Brooklyn, NY 11201",
          serviceAddress: "55 Elm St, Brooklyn, NY 11201",
        },
        cardknoxUrl: "https://secure.cardknox.com/blzelectric?xAmount=652&xinvoice=251839",
        linkAmount: "652",
        inv: "251839",
        siteSlug: "blzelectric",
      })
    );
    const data = buildPayLandingPayload({
      job: {
        id: "J-42",
        amount: "$1,652",
        openBalance: 652,
        invoiceNo: "251839",
        billingAddress: "55 Elm St, Brooklyn, NY 11201",
        serviceAddress: "55 Elm St, Brooklyn, NY 11201",
      },
      cardknoxUrl: "https://secure.cardknox.com/blzelectric?xAmount=652&xinvoice=251839",
      linkAmount: "652",
      inv: "251839",
      siteSlug: "blzelectric",
    });
    const payUrl = solaPayUrlFromLanding(data, 674.82, 652, true);
    expect(payUrl).toContain("xinvoice=251839");
    expect(payUrl).toContain("xCustom01=652");
    expect(payUrl).toContain("xCustom02=J-42");
    expect(payUrl).toContain("sola-payment");
    expect(token).toBeTruthy();
  });
});