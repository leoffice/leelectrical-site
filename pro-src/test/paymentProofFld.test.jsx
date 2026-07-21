// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import "@testing-library/jest-dom/vitest";
import PaymentProofFld from "../src/components/PaymentProofFld.jsx";

describe("PaymentProofFld", () => {
  it("offers Take photo and Choose from files (not camera-only)", () => {
    const inputRef = { current: null };
    render(
      <PaymentProofFld
        label="Check attachment"
        file={null}
        inputRef={inputRef}
        onFile={() => {}}
        emphasize
        testId="check-screenshot-input"
      />
    );
    expect(screen.getByTestId("check-screenshot-input-take-photo")).toHaveTextContent(/Take photo/i);
    expect(screen.getByTestId("check-screenshot-input-choose-file")).toHaveTextContent(
      /Choose from files/i
    );
    // Files input accepts images + PDF; camera input has capture.
    const files = screen.getByTestId("check-screenshot-input");
    const camera = screen.getByTestId("check-screenshot-input-camera");
    expect(files.getAttribute("accept")).toMatch(/pdf/i);
    expect(camera.getAttribute("capture")).toBe("environment");
    expect(files.hasAttribute("capture")).toBe(false);
  });

  it("wires parent ref to the files input so auto-open never forces camera", () => {
    const inputRef = { current: null };
    render(
      <PaymentProofFld
        label="Proof"
        file={null}
        inputRef={inputRef}
        onFile={() => {}}
        testId="proof"
      />
    );
    expect(inputRef.current).toBeTruthy();
    expect(inputRef.current.getAttribute("data-testid")).toBe("proof");
    expect(inputRef.current.hasAttribute("capture")).toBe(false);
  });

  it("disables Autofill for non-image attachments (e.g. PDF)", () => {
    render(
      <PaymentProofFld
        label="Check attachment"
        file={{ name: "scan.pdf", type: "application/pdf" }}
        inputRef={{ current: null }}
        onFile={() => {}}
        onAutofill={vi.fn()}
        testId="check-screenshot-input"
      />
    );
    expect(screen.getByTestId("payment-autofill")).toBeDisabled();
  });

  it("enables Autofill for image attachments", () => {
    render(
      <PaymentProofFld
        label="Check attachment"
        file={{ name: "check.jpg", type: "image/jpeg" }}
        inputRef={{ current: null }}
        onFile={() => {}}
        onAutofill={vi.fn()}
        testId="check-screenshot-input"
      />
    );
    expect(screen.getByTestId("payment-autofill")).not.toBeDisabled();
  });

  it("Take photo clicks the camera input", () => {
    const onFile = vi.fn();
    render(
      <PaymentProofFld
        label="Check"
        file={null}
        inputRef={{ current: null }}
        onFile={onFile}
        emphasize
        testId="check-screenshot-input"
      />
    );
    const camera = screen.getByTestId("check-screenshot-input-camera");
    const clickSpy = vi.spyOn(camera, "click");
    fireEvent.click(screen.getByTestId("check-screenshot-input-take-photo"));
    expect(clickSpy).toHaveBeenCalled();
  });
});
