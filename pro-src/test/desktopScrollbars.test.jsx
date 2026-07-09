// @vitest-environment jsdom
// Desktop layout — hide decorative scrollbars; credit-card fields must not show per-box sliders.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

const setWidth = (w) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
  window.dispatchEvent(new Event("resize"));
};

const mockCardknoxScript = () => {
  window.setAccount = vi.fn();
  window.setIfieldStyle = vi.fn();
  window.enableAutoFormatting = vi.fn();
  const orig = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag, ...args) => {
    const el = orig(tag, ...args);
    if (tag === "script") {
      queueMicrotask(() => {
        el.dataset.loaded = "1";
        el.dispatchEvent(new Event("load"));
      });
    }
    return el;
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  window.location.hash = "#/";
  delete window.setAccount;
  delete window.setIfieldStyle;
  delete window.enableAutoFormatting;
});

describe("desktop scrollbar cleanup — 1280px", () => {
  beforeEach(() => setWidth(1280));

  it("sidebar and job list pane hide scrollbar chrome on desktop", async () => {
    mockServer();
    renderApp("#/job/J-1");
    await screen.findByTestId("detail-pane");
    expect(screen.getByTestId("sidebar").className).toContain("lg-scroll-hidden");
    expect(screen.getByTestId("list-pane").className).toContain("lg-scroll-hidden");
  });

  it("opened sheets use hidden scrollbar styling on desktop", async () => {
    mockServer();
    const user = userEvent.setup();
    renderApp("#/job/J-1");
    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByText("💳 Payment history"));
    const sheetBody = await screen.findByTestId("sheet-body");
    expect(sheetBody.className).toContain("lg-scroll-hidden");
    expect(sheetBody.className).toContain("overflow-y-auto");
  });

  it("credit card payment form: inputs and secure card fields avoid overflow scrollbars", async () => {
    mockCardknoxScript();
    mockServer();
    const user = userEvent.setup();
    renderApp("#/job/J-1");
    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByTestId("tab-payment"));
    await user.click(screen.getByText("Record a payment"));
    await user.selectOptions(screen.getByLabelText("Payment method"), "Credit card");

    await waitFor(() => expect(screen.getByTestId("sola-card-form")).toBeInTheDocument());

    const sheet = screen.getByTestId("sheet-body");
    expect(sheet.className).toContain("lg-scroll-hidden");

    const amount = screen.getByLabelText("Amount");
    const exp = screen.getByLabelText("Expiration MM/YY");
    const method = screen.getByLabelText("Payment method");
    [amount, exp, method].forEach((el) => expect(el.className).toMatch(/\binput\b/));

    await user.type(exp, "1228");
    expect(exp).toHaveValue("12/28");

    const cardWrap = screen.getByTestId("sola-ifield-card-number");
    const cvvWrap = screen.getByTestId("sola-ifield-cvv");
    expect(cardWrap.className).toContain("overflow-hidden");
    expect(cvvWrap.className).toContain("overflow-hidden");

    const iframes = [screen.getByTitle("Card number"), screen.getByTitle("CVV")];
    iframes.forEach((iframe) => {
      expect(iframe.getAttribute("scrolling")).toBe("no");
      expect(iframe.className).toContain("overflow-hidden");
    });
  });
});