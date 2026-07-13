// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import DescriptionField from "../src/components/DescriptionField.jsx";
import { buildDescriptionPdf } from "../src/lib/descriptionPdf.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DescriptionField", () => {
  it("renders a multi-line auto-growing textarea by default", () => {
    render(<DescriptionField value={"line one\nline two"} onChange={() => {}} />);
    const ta = screen.getByTestId("description-field");
    expect(ta.tagName).toBe("TEXTAREA");
    expect(ta).toHaveValue("line one\nline two");
    expect(Number.parseInt(ta.style.minHeight, 10)).toBeGreaterThanOrEqual(96);
  });

  it("opens a full-screen PDF preview from description text", () => {
    URL.createObjectURL = vi.fn(() => "blob:desc-pdf");
    URL.revokeObjectURL = vi.fn();
    render(
      <DescriptionField
        value={"Panel upgrade\nNew circuits"}
        onChange={() => {}}
        context={{ jobTitle: "Rewire", address: "10 Broadway" }}
        testId="scope-desc"
      />
    );
    fireEvent.click(screen.getByTestId("scope-desc-view-pdf-btn"));
    expect(screen.getByTestId("scope-desc-pdf-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("scope-desc-pdf-frame")).toHaveAttribute("src", "blob:desc-pdf");
    fireEvent.click(screen.getByTestId("scope-desc-pdf-close"));
    expect(screen.queryByTestId("scope-desc-pdf-overlay")).toBeNull();
  });
});

describe("descriptionPdf", () => {
  it("builds a valid PDF blob with scope text", async () => {
    const blob = buildDescriptionPdf({
      title: "LE Electrical",
      subtitle: "Rewire · 10 Broadway",
      body: "Panel upgrade and new circuits.",
    });
    expect(blob.type).toBe("application/pdf");
    const head = await blob.slice(0, 8).text();
    expect(head).toBe("%PDF-1.4");
  });
});