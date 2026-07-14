// @vitest-environment jsdom
// E2E — Zelle screenshot attach → vision → reconcile → record_payment on Save
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

function mockPaymentVision(srv, extracted) {
  const origFetch = global.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, o = {}) => {
      const path = String(url).split("/functions/")[1]?.split("?")[0];
      if ((path === "payment-vision" || path === "zelle-vision") && o.method === "POST") {
        srv.calls.push({ path, method: "POST", body: JSON.parse(o.body) });
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, extracted, model: "test" }),
        };
      }
      return origFetch(url, o);
    })
  );
}

async function openZellePayment(user) {
  renderApp("#/job/J-1");
  const pane = await screen.findByTestId("detail-pane");
  await user.click(within(pane).getByTestId("tab-payment"));
  await user.click(screen.getByText("Record a payment"));
  await user.click(screen.getByText("Zelle"));
  return pane;
}

async function attachScreenshot(user) {
  const input = screen.getByTestId("zelle-screenshot-input");
  const file = new File(["fake-png"], "zelle-proof.png", { type: "image/png" });
  await user.upload(input, file);
}

describe("Zelle screenshot reconciliation flow", () => {
  it("full match auto-fills ref and shows verified badge", async () => {
    const srv = mockServer();
    mockPaymentVision(srv, {
      amount: 2300,
      confirmationNumber: "JPM99cnf72cg",
      date: "2026-07-09",
      memo: "#251841",
      confidence: "high",
    });
    const user = userEvent.setup();
    await openZellePayment(user);
    await attachScreenshot(user);
    await user.click(screen.getByTestId("record-payment"));

    await waitFor(() => expect(screen.getByTestId("savebar")).toBeInTheDocument());
    expect(screen.queryByText("Payment reconciliation")).not.toBeInTheDocument();

    await user.click(screen.getByText("Save & sync"));
    await waitFor(() => expect(srv.enqueued("record_payment")).toHaveLength(1));
    const cmd = srv.enqueued("record_payment")[0];
    expect(cmd.payload).toMatchObject({
      invoiceNo: "251841",
      amount: "2300",
      method: "Zelle",
      ref: "JPM99cnf72cg",
    });
    expect(srv.state.ov["J-1"].payments[0].zelleVerified).toBe(true);
  });

  it("amount mismatch modal → use screenshot amount", async () => {
    const srv = mockServer();
    mockPaymentVision(srv, {
      amount: 2200,
      confirmationNumber: "JPMdiff",
      memo: "#251841",
      confidence: "high",
    });
    const user = userEvent.setup();
    await openZellePayment(user);
    await attachScreenshot(user);
    await user.click(screen.getByTestId("record-payment"));

    await waitFor(() => expect(screen.getByText("Payment reconciliation")).toBeInTheDocument());
    await user.click(screen.getByTestId("zelle-action-use_screenshot_amount"));

    await user.click(await screen.findByText("Save & sync"));
    await waitFor(() => expect(srv.enqueued("record_payment")).toHaveLength(1));
    expect(srv.enqueued("record_payment")[0].payload.amount).toBe("2200");
    expect(srv.enqueued("record_payment")[0].payload.ref).toBe("JPMdiff");
  });

  it("invoice mismatch → move payment to correct invoice", async () => {
    const srv = mockServer({
      jobs: [
        {
          id: "J-1",
          customer: "Peretz Chein",
          amount: "$2,300",
          invoiceNo: "251841",
          serviceAddress: "123 Main St",
          paid: false,
        },
        {
          id: "J-2",
          customer: "Golan Chakov",
          amount: "$1,000",
          invoiceNo: "231315",
          serviceAddress: "55 Elm St",
          paid: false,
        },
      ],
    });
    mockPaymentVision(srv, {
      amount: 1000,
      confirmationNumber: "JPMmove",
      memo: "#231315",
      confidence: "high",
    });
    const user = userEvent.setup();
    await openZellePayment(user);
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "1000");
    await attachScreenshot(user);
    await user.click(screen.getByTestId("record-payment"));

    await waitFor(() => expect(screen.getByText("Payment reconciliation")).toBeInTheDocument());
    await user.click(screen.getByTestId("zelle-action-move_invoice"));

    await user.click(await screen.findByText("Save & sync"));
    await waitFor(() => expect(srv.enqueued("record_payment")).toHaveLength(1));
    const cmd = srv.enqueued("record_payment")[0];
    expect(cmd.jobId).toBe("J-2");
    expect(cmd.payload.invoiceNo).toBe("231315");
    expect(srv.state.ov["J-2"].payments[0].ref).toBe("JPMmove");
    expect(srv.state.ov["J-1"]?.payments).toBeFalsy();
  });

  it("unreadable screenshot → enter manually", async () => {
    const srv = mockServer();
    mockPaymentVision(srv, {
      amount: null,
      confirmationNumber: "",
      memo: "",
      confidence: "low",
    });
    const user = userEvent.setup();
    await openZellePayment(user);
    await attachScreenshot(user);
    await user.type(screen.getByPlaceholderText("Reference #"), "MANUAL1");
    await user.click(screen.getByTestId("record-payment"));

    await waitFor(() => expect(screen.getByText("Screenshot unreadable")).toBeInTheDocument());
    await user.click(screen.getByTestId("zelle-action-manual"));

    await user.click(await screen.findByText("Save & sync"));
    await waitFor(() => expect(srv.enqueued("record_payment")).toHaveLength(1));
    expect(srv.enqueued("record_payment")[0].payload.ref).toBe("MANUAL1");
  });

  it("check autofill button fills fields and record skips second vision call", async () => {
    const srv = mockServer();
    const fetchMock = global.fetch;
    let visionCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, o = {}) => {
        const path = String(url).split("/functions/")[1]?.split("?")[0];
        if (path === "payment-vision" && o.method === "POST") {
          visionCalls++;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              extracted: {
                amount: 800,
                checkNumber: "5521",
                date: "2026-07-10",
                memo: "panel upgrade",
                confidence: "high",
                kind: "check",
              },
            }),
          };
        }
        return fetchMock(url, o);
      })
    );
    const user = userEvent.setup();
    renderApp("#/job/J-1");
    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByTestId("tab-payment"));
    await user.click(screen.getByText("Record a payment"));
    await user.click(screen.getByText("Check"));
    const input = screen.getByTestId("check-screenshot-input");
    await user.upload(input, new File(["x"], "check.jpg", { type: "image/jpeg" }));
    await user.click(screen.getByTestId("payment-autofill"));
    await waitFor(() => expect(screen.getByDisplayValue("5521")).toBeInTheDocument());
    expect(screen.getByDisplayValue("panel upgrade")).toBeInTheDocument();
    expect(visionCalls).toBe(2);
    await user.click(screen.getByTestId("record-payment"));
    await waitFor(() => expect(screen.getByTestId("savebar")).toBeInTheDocument());
    expect(visionCalls).toBe(2);
    await user.click(screen.getByText("Save & sync"));
    await waitFor(() => expect(srv.enqueued("record_payment")).toHaveLength(1));
    expect(srv.enqueued("record_payment")[0].payload).toMatchObject({
      amount: "800",
      method: "Check",
      ref: "5521",
      note: "Check #5521 · Deposit: Martin Dorkin · panel upgrade",
      depositTo: "Martin Dorkin",
    });
  });

  it("check payment form shows deposit-to picker", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    renderApp("#/job/J-1");
    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByTestId("tab-payment"));
    await user.click(screen.getByText("Record a payment"));
    await user.click(screen.getByText("Check"));
    expect(screen.getByTestId("payment-deposit")).toBeInTheDocument();
    await user.selectOptions(screen.getByTestId("payment-deposit"), "Wells Fargo");
    await user.type(screen.getByPlaceholderText("Check #"), "4412");
    await user.click(screen.getByTestId("record-payment"));
    await waitFor(() => expect(screen.getByTestId("savebar")).toBeInTheDocument());
    await user.click(screen.getByText("Save & sync"));
    await waitFor(() => expect(srv.enqueued("record_payment")).toHaveLength(1));
    expect(srv.enqueued("record_payment")[0].payload).toMatchObject({
      method: "Check",
      ref: "4412",
      depositTo: "Wells Fargo",
      note: "Check #4412 · Deposit: Wells Fargo",
    });
  });
});