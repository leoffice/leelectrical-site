// @vitest-environment jsdom
// Mobile (iPhone / Android / Samsung Fold): no broken iframe — Open invoice on tap.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import LocalDocViewer from "../src/components/LocalDocViewer.jsx";
import { stubPdfOpen } from "./helpers.jsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => "blob:test-local-doc");
  } else {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-local-doc");
  }
  if (!URL.revokeObjectURL) {
    URL.revokeObjectURL = vi.fn();
  } else {
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  }
});

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const SAMSUNG_FOLD_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-F946U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

describe("LocalDocViewer mobile", () => {
  it("iPhone: skips iframe, no auto-open, Open invoice works on tap", async () => {
    vi.stubGlobal("navigator", {
      userAgent: IPHONE_UA,
      platform: "iPhone",
      maxTouchPoints: 5,
    });
    const click = stubPdfOpen();
    const blob = new Blob(["%PDF-1.4 invoice"], { type: "application/pdf" });

    render(
      <LocalDocViewer
        blob={blob}
        title="Invoice #251825"
        filename="Invoice-251825.pdf"
        onClose={() => {}}
      />
    );

    const viewer = screen.getByTestId("local-doc-viewer");
    expect(viewer).toHaveAttribute("data-inline-pdf", "0");
    expect(screen.queryByTestId("local-doc-frame")).toBeNull();
    expect(screen.getByTestId("local-doc-native-panel")).toBeInTheDocument();
    expect(screen.getByTestId("local-doc-open-native")).toHaveTextContent(/Open invoice/i);
    // No auto-open — phones block it without a gesture.
    expect(click).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("local-doc-open-native"));
    // openPdfForNativeView opens tab + download (2 clicks).
    expect(click.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("Samsung Fold Android: same native Open path (no blank iframe)", async () => {
    vi.stubGlobal("navigator", {
      userAgent: SAMSUNG_FOLD_UA,
      platform: "Linux armv8l",
      maxTouchPoints: 10,
    });
    const click = stubPdfOpen();
    const blob = new Blob(["%PDF-1.4 invoice"], { type: "application/pdf" });

    render(
      <LocalDocViewer
        blob={blob}
        title="Invoice #251825"
        filename="Invoice-251825.pdf"
        onClose={() => {}}
      />
    );

    expect(screen.getByTestId("local-doc-viewer")).toHaveAttribute("data-inline-pdf", "0");
    expect(screen.queryByTestId("local-doc-frame")).toBeNull();
    expect(screen.getByTestId("local-doc-native-panel")).toBeInTheDocument();
    expect(click).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("local-doc-open-native-footer"));
    expect(click.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("desktop keeps the in-app iframe preview", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      platform: "MacIntel",
      maxTouchPoints: 0,
    });
    const blob = new Blob(["%PDF-1.4 invoice"], { type: "application/pdf" });
    render(
      <LocalDocViewer
        blob={blob}
        title="Invoice #251825"
        filename="Invoice-251825.pdf"
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId("local-doc-viewer")).toHaveAttribute("data-inline-pdf", "1");
    expect(screen.getByTestId("local-doc-frame")).toBeInTheDocument();
    expect(screen.queryByTestId("local-doc-native-panel")).toBeNull();
  });
});
