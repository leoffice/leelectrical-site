// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import PayLanding from "../src/views/PayLanding.jsx";
import { encodePayLanding } from "../src/lib/payLanding.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const estimatePayload = {
  k: "e",
  j: "local-est-1",
  i: "25499",
  en: "25499",
  a: 2000,
  t: "$2,000.00",
  d: "$2,000.00",
  c: "Mendy Test",
  e: "mendy@example.com",
  w: "Service upgrade",
  sa: "100 Test Ave, Brooklyn, NY",
  ba: "100 Test Ave, Brooklyn, NY",
  sl: "blzelectric",
  dp: 50,
  lines: [{ itemName: "Service", description: "Service upgrade", qty: 1, unitPrice: 2000 }],
  as: "2026-07-22",
};

function renderPay(token) {
  return render(
    <MemoryRouter initialEntries={[`/pay/${token}`]}>
      <Routes>
        <Route path="/pay/:token" element={<PayLanding />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("PayLanding estimate mode", () => {
  it("shows Approve and 50% deposit buttons and estimate PDF panel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        // PDF availability check — pretend PDF is ready
        if (String(url).includes("/docs")) {
          return {
            ok: true,
            headers: { get: () => "application/pdf" },
          };
        }
        return { ok: true, json: async () => ({ ok: true }) };
      })
    );

    const token = encodePayLanding(estimatePayload);
    renderPay(token);

    await waitFor(() => {
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { level: 1, name: /Estimate.*25499/ })).toBeInTheDocument();
    expect(screen.getByTestId("estimate-approve")).toHaveTextContent("Approve");
    expect(screen.getByTestId("estimate-deposit")).toHaveTextContent(/50% Deposit/);
    expect(screen.getByTestId("estimate-pdf-panel")).toBeInTheDocument();
    // No card pay form on estimate page
    expect(screen.queryByTestId("pay-cta")).not.toBeInTheDocument();
    expect(screen.queryByText("Pay by card")).not.toBeInTheDocument();
  });

  it("calls approve action on Approve", async () => {
    const fetchMock = vi.fn(async (url, opts) => {
      if (String(url).includes("estimate-action")) {
        const body = JSON.parse(opts.body);
        expect(body.action).toBe("approve");
        return {
          ok: true,
          json: async () => ({
            ok: true,
            action: "approve",
            message: "Thank you — approved.",
          }),
        };
      }
      if (String(url).includes("/docs")) {
        return { ok: true, headers: { get: () => "application/pdf" } };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const token = encodePayLanding(estimatePayload);
    renderPay(token);
    await waitFor(() => expect(screen.getByTestId("estimate-approve")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId("estimate-approve"));
    await waitFor(() => {
      expect(screen.getByTestId("estimate-success")).toHaveTextContent(/approved/i);
    });
    expect(screen.getByTestId("estimate-approve")).toHaveTextContent(/Approved/);
  });

  it("builds estimate PDF on the page when docs store has no file (test / miss)", async () => {
    // Mimic fake test estimate #99001 — docs 404, no stored PDF.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).includes("/docs")) {
          return {
            ok: false,
            status: 404,
            headers: { get: () => "application/json" },
          };
        }
        return { ok: true, json: async () => ({ ok: true }) };
      })
    );
    // jsdom has no real createObjectURL in some environments — stub it.
    const createUrl = vi.fn(() => "blob:estimate-local-pdf");
    const revokeUrl = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: createUrl,
      revokeObjectURL: revokeUrl,
    });

    const token = encodePayLanding(estimatePayload);
    renderPay(token);

    await waitFor(() => {
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId("estimate-pdf-frame")).toBeInTheDocument();
    });
    expect(screen.getByTestId("estimate-pdf-frame")).toHaveAttribute("src", "blob:estimate-local-pdf");
    expect(createUrl).toHaveBeenCalled();
    expect(screen.queryByText(/not available yet/i)).not.toBeInTheDocument();
  });
});
