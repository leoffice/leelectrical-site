// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import PayLanding from "../src/views/PayLanding.jsx";
import { buildPayLandingPayload, encodePayLanding } from "../src/lib/payLanding.js";

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
  it("shows invoice summary and View & Pay CTA", () => {
    const token = encodePayLanding(
      buildPayLandingPayload({
        job: {
          customer: "Rae Klein",
          title: "Panel",
          amount: "$652",
          invoiceNo: "251839",
        },
        cardknoxUrl: "https://secure.cardknox.com/lepaymentsdev?xamount=652&xinvoice=251839",
        linkAmount: "652",
        inv: "251839",
      })
    );
    renderPay(token);
    expect(screen.getByText("#251839")).toBeInTheDocument();
    expect(screen.getByText("Rae Klein")).toBeInTheDocument();
    expect(screen.getByTestId("pay-cta")).toHaveAttribute(
      "href",
      "https://secure.cardknox.com/lepaymentsdev?xamount=652&xinvoice=251839"
    );
  });

  it("shows invalid state for bad token", () => {
    renderPay("bad-token");
    expect(screen.getByText("Link not valid")).toBeInTheDocument();
  });
});