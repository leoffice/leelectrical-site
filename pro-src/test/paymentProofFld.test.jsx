// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import "@testing-library/jest-dom/vitest";
import PaymentProofFld from "../src/components/PaymentProofFld.jsx";

describe("PaymentProofFld", () => {
  it("offers one seamless attach control (OS handles camera vs files)", () => {
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
    expect(screen.getByTestId("check-screenshot-input-pick")).toBeInTheDocument();
    expect(screen.getByTestId("check-screenshot-input-attach-label")).toHaveTextContent(
      /Attach check or payment/i
    );
    // No dual Take photo / Choose from files buttons.
    expect(screen.queryByTestId("check-screenshot-input-take-photo")).toBeNull();
    expect(screen.queryByTestId("check-screenshot-input-choose-file")).toBeNull();
    // Single input accepts images + PDF; no capture so OS offers camera + files.
    const files = screen.getByTestId("check-screenshot-input");
    expect(files.getAttribute("accept")).toMatch(/pdf/i);
    expect(files.hasAttribute("capture")).toBe(false);
  });

  it("wires parent ref to the files input so auto-open never forces camera", () => {
    const inputRef = { current: null };
    render(
      <PaymentProofFld
        label="Proof"
        file={null}
        inputRef={{ current: null }}
        onFile={() => {}}
        testId="proof"
      />
    );
    // Re-render with working ref
    const ref = { current: null };
    render(
      <PaymentProofFld label="Proof" file={null} inputRef={ref} onFile={() => {}} testId="proof2" />
    );
    expect(ref.current).toBeTruthy();
    expect(ref.current.getAttribute("data-testid")).toBe("proof2");
    expect(ref.current.hasAttribute("capture")).toBe(false);
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

  it("attach button clicks the file input", () => {
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
    const input = screen.getByTestId("check-screenshot-input");
    const clickSpy = vi.spyOn(input, "click");
    fireEvent.click(screen.getByTestId("check-screenshot-input-pick"));
    expect(clickSpy).toHaveBeenCalled();
  });
});
