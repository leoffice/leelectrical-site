// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PaymentImageZoom from "../src/components/PaymentImageZoom.jsx";

describe("PaymentImageZoom", () => {
  it("renders zoom controls and scales on zoom in", () => {
    render(<PaymentImageZoom src="blob:test" alt="check" />);
    const box = screen.getByTestId("payment-image-zoom").querySelector(".touch-none");
    fireEvent.click(screen.getByTestId("zoom-in"));
    expect(box.firstChild.style.transform).toMatch(/scale\(1\.5\)/);
    fireEvent.pointerDown(box, { pointerId: 1, clientX: 50, clientY: 50, pointerType: "touch" });
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 80, clientY: 70, pointerType: "touch" });
    expect(box.firstChild.style.transform).toMatch(/translate\(30px, 20px\)/);
  });
});