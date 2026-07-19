// @vitest-environment jsdom
// Regression: auto-opening prompts must never stack on an open sheet.
// Every Sheet is a full-screen dimmer, so a stack made the lower sheet's
// buttons unreachable — the "popups swallow clicks" report.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const SUG = {
  id: "acme-pair",
  reason: "contact",
  a: { name: "Acme Electric", jobs: [{ id: "j1", customer: "Acme Electric", phone: "718-555-0100" }] },
  b: { name: "Acme Electric Inc", jobs: [{ id: "j2", customer: "Acme Electric Inc", phone: "718-555-0100" }] },
};

// Isolate the stacking behaviour from the suggestion heuristics + daily cap,
// both of which have their own dedicated tests.
vi.mock("../src/lib/promptQueueCap.js", () => ({
  canShowNameSortPrompt: () => true,
  claimReminderSlots: () => {},
  consumeNameSortSlot: () => {},
  applyPromptQueueCap: (q) => q,
  nameSortSlotsRemaining: () => 5,
}));
vi.mock("../src/lib/customers.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, findMergeSuggestion: () => SUG };
});

import Sheet from "../src/components/Sheet.jsx";
import MergePrompt from "../src/components/MergePrompt.jsx";
import { StoreProvider } from "../src/state/store.jsx";
import { mockServer } from "./helpers.jsx";
import { __resetSheetRegistry, anySheetOpen, openSheetCount } from "../src/lib/sheetRegistry.js";

afterEach(() => {
  vi.clearAllMocks();
  __resetSheetRegistry();
});

describe("Sheet registry wiring", () => {
  it("a mounted Sheet registers, and unmounting releases it", async () => {
    expect(anySheetOpen()).toBe(false);
    const { unmount } = render(
      <Sheet title="Blocking sheet" onClose={() => {}}>
        <div>body</div>
      </Sheet>
    );
    await waitFor(() => expect(anySheetOpen()).toBe(true));
    expect(openSheetCount()).toBe(1);
    unmount();
    await waitFor(() => expect(anySheetOpen()).toBe(false));
  });
});

describe("MergePrompt never stacks on an open sheet", () => {
  it("stays closed while another sheet is open", async () => {
    mockServer();
    render(
      <StoreProvider>
        <Sheet title="Action sheet" onClose={() => {}}>
          <div data-testid="other-sheet-body">busy</div>
        </Sheet>
        <MergePrompt />
      </StoreProvider>
    );

    // The blocking sheet is up...
    await waitFor(() => expect(screen.getByTestId("other-sheet-body")).toBeInTheDocument());
    // ...so the merge prompt must not have opened on top of it.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("merge-prompt")).not.toBeInTheDocument();
  });

  it("opens once the blocking sheet closes", async () => {
    mockServer();
    function Harness() {
      const [showOther, setShowOther] = React.useState(true);
      return (
        <StoreProvider>
          {showOther ? (
            <Sheet title="Action sheet" onClose={() => {}}>
              <button data-testid="close-other" onClick={() => setShowOther(false)}>
                close
              </button>
            </Sheet>
          ) : null}
          <MergePrompt />
        </StoreProvider>
      );
    }
    render(<Harness />);

    await waitFor(() => expect(screen.getByTestId("close-other")).toBeInTheDocument());
    expect(screen.queryByTestId("merge-prompt")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("close-other"));

    // Screen cleared → the prompt is now allowed to open.
    await waitFor(() => expect(screen.getByTestId("merge-prompt")).toBeInTheDocument());
  });

  it("opens immediately when nothing else is on screen", async () => {
    mockServer();
    render(
      <StoreProvider>
        <MergePrompt />
      </StoreProvider>
    );
    await waitFor(() => expect(screen.getByTestId("merge-prompt")).toBeInTheDocument());
  });
});
