// @vitest-environment jsdom
// Board-wide rule (Levi 2026-07-27): the ✕ on a suggestion opens a
// 5-minute-to-5-hour "remind me later" picker instead of dropping the card.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import PromptSurface from "../src/components/PromptSurface.jsx";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("PromptSurface ✕ → remind me later", () => {
  it("swaps the card for the picker and reports the chosen minutes", async () => {
    const onSnooze = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <PromptSurface title="🔔 Reminder" onClose={onClose} onSnooze={onSnooze}>
        <p>Call Bob about the panel</p>
      </PromptSurface>
    );

    expect(screen.getByText("Call Bob about the panel")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Close"));

    // The suggestion is not gone — it's asking when to come back.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText("Call Bob about the panel")).not.toBeInTheDocument();
    const panel = screen.getByTestId("dismiss-snooze-panel");
    expect(screen.getByText("Remind me later")).toBeInTheDocument();

    const slider = within(panel).getByTestId("dismiss-snooze-slider");
    expect(slider).toHaveAttribute("min", "5");
    expect(slider).toHaveAttribute("max", "300");

    await user.click(within(panel).getByTestId("dismiss-snooze-preset-30"));
    expect(onSnooze).toHaveBeenCalledWith(30);
  });

  it("the slider commits whatever duration is dialled in", async () => {
    const onSnooze = vi.fn();
    const user = userEvent.setup();
    render(
      <PromptSurface title="Payment" onClose={() => {}} onSnooze={onSnooze}>
        <p>body</p>
      </PromptSurface>
    );
    await user.click(screen.getByLabelText("Close"));
    const panel = screen.getByTestId("dismiss-snooze-panel");
    const slider = within(panel).getByTestId("dismiss-snooze-slider");
    fireEvent.change(slider, { target: { value: "150" } });
    expect(within(panel).getByTestId("dismiss-snooze-label")).toHaveTextContent("2½ hours");
    await user.click(within(panel).getByTestId("dismiss-snooze-apply"));
    expect(onSnooze).toHaveBeenCalledWith(150);
  });

  it("Back returns to the card; Don't remind me is the real dismiss", async () => {
    const onNeverRemind = vi.fn();
    const user = userEvent.setup();
    render(
      <PromptSurface
        title="Unsent estimate"
        onClose={() => {}}
        onSnooze={() => {}}
        onNeverRemind={onNeverRemind}
      >
        <p>Estimate #E-9</p>
      </PromptSurface>
    );
    await user.click(screen.getByLabelText("Close"));
    await user.click(screen.getByTestId("dismiss-snooze-cancel"));
    expect(screen.getByText("Estimate #E-9")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Close"));
    await user.click(screen.getByTestId("dismiss-snooze-never"));
    expect(onNeverRemind).toHaveBeenCalled();
  });

  it("a prompt with nothing to come back to still closes outright", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <PromptSurface title="Move reminder" onClose={onClose}>
        <p>form</p>
      </PromptSurface>
    );
    await user.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByTestId("dismiss-snooze-panel")).not.toBeInTheDocument();
  });
});
