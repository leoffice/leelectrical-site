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

  it("lists each polish style on its own line", () => {
    render(<DescriptionField value="panel swap" onChange={() => {}} />);
    fireEvent.click(screen.getByTestId("description-field-polish-btn"));
    const menu = screen.getByTestId("description-field-polish-menu");
    expect(menu.className).toContain("flex-col");
    expect(screen.getByTestId("description-field-polish-professional")).toBeInTheDocument();
    expect(screen.getByTestId("description-field-polish-invoice")).toBeInTheDocument();
    expect(screen.queryByTestId("description-field-polish-commercial")).toBeNull();
  });

  it("shows revert after polish and restores the previous text", () => {
    let text = "panel swap and new circuits";
    const onChange = vi.fn((next) => {
      text = next;
    });
    const { rerender } = render(<DescriptionField value={text} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("description-field-polish-btn"));
    fireEvent.click(screen.getByTestId("description-field-polish-brief"));
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByTestId("description-field-polish-revert-btn")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("description-field-polish-revert-btn"));
    expect(onChange).toHaveBeenLastCalledWith("panel swap and new circuits");
    rerender(<DescriptionField value={text} onChange={onChange} />);
    expect(screen.queryByTestId("description-field-polish-revert-btn")).toBeNull();
  });

  it("lists revert at the top of the polish menu after a style is applied", () => {
    let text = "rough notes";
    const onChange = vi.fn((next) => {
      text = next;
    });
    const { rerender } = render(<DescriptionField value={text} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("description-field-polish-btn"));
    fireEvent.click(screen.getByTestId("description-field-polish-brief"));
    rerender(<DescriptionField value={text} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("description-field-polish-btn"));
    expect(screen.getByTestId("description-field-polish-revert")).toBeInTheDocument();
  });

  it("can hide polish when polish sits next to amount", () => {
    render(<DescriptionField value="panel" onChange={() => {}} showPolish={false} />);
    expect(screen.queryByTestId("description-field-polish-btn")).toBeNull();
    expect(screen.queryByTestId("description-field-view-pdf-btn")).toBeNull();
  });
});

describe("descriptionPdf", () => {
  it("builds a valid PDF blob with scope text", async () => {
    const blob = buildDescriptionPdf({
      title: "BLZ Electric",
      subtitle: "Rewire · 10 Broadway",
      body: "Panel upgrade and new circuits.",
    });
    expect(blob.type).toBe("application/pdf");
    const head = await blob.slice(0, 8).text();
    expect(head).toBe("%PDF-1.4");
  });
});