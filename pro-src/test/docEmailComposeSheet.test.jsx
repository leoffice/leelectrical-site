// @vitest-environment jsdom
// Email sheet owns its own state so typing does not re-render the parent builder.
import React, { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import DocEmailComposeSheet from "../src/components/DocEmailComposeSheet.jsx";

function Parent({ onSend }) {
  const [parentRenders, setParentRenders] = useState(0);
  // Expose render count for assertion.
  return (
    <div data-testid="parent" data-renders={parentRenders}>
      <button type="button" data-testid="bump" onClick={() => setParentRenders((n) => n + 1)}>
        bump
      </button>
      <DocEmailComposeSheet
        kind="invoice"
        jobEmail="saved@x.com"
        initialEmail="saved@x.com"
        initialMessage="Hi there"
        qboOn={false}
        onClose={() => {}}
        onSend={onSend}
      />
    </div>
  );
}

describe("DocEmailComposeSheet", () => {
  it("typing in To does not require parent state updates", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<Parent onSend={onSend} />);
    const input = screen.getByTestId("doc-send-emails");
    await user.clear(input);
    await user.type(input, "new@customer.com");
    expect(input).toHaveValue("new@customer.com");
    // Parent still at 0 renders-from-state unless bumped — typing stayed local.
    expect(screen.getByTestId("parent")).toHaveAttribute("data-renders", "0");
    await user.click(screen.getByTestId("doc-email-once"));
    await user.click(screen.getByTestId("doc-send-local"));
    expect(onSend).toHaveBeenCalled();
    expect(onSend.mock.calls[0][0].email).toBe("new@customer.com");
  });

  it("shows keep/once when email differs from customer", async () => {
    const user = userEvent.setup();
    render(
      <DocEmailComposeSheet
        kind="invoice"
        jobEmail="saved@x.com"
        initialEmail="saved@x.com"
        initialMessage=""
        qboOn={false}
        onClose={() => {}}
        onSend={() => {}}
      />
    );
    const input = screen.getByTestId("doc-send-emails");
    await user.clear(input);
    await user.type(input, "other@x.com");
    expect(screen.getByTestId("doc-email-policy")).toBeInTheDocument();
  });
});
