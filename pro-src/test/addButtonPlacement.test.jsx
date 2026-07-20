// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

// useIsDesktop() reads matchMedia("(min-width: 1024px)"); jsdom reports false by
// default, so the desktop branch never renders unless we say so explicitly.
function setViewport(desktop) {
  vi.stubGlobal("matchMedia", (query) => ({
    matches: desktop && query.includes("1024px"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

// Levi's requirement: the add control must sit at the TOP of the screen, right
// beside the search bar — never a floating bubble and never squeezed into the
// bottom-nav corner (where it "almost disappeared to the right" on mobile).
// These assert PLACEMENT, not mere existence — a test that only looked for
// `fab-add` would still pass against the old floating FAB and is worthless here.
describe("Add control lives in the top bar, beside the search input", () => {
  it.each([
    ["mobile", false],
    ["desktop", true],
  ])("%s: on the Jobs list, add sits in the same row as the search input", async (_l, desktop) => {
    setViewport(desktop);
    mockServer({});
    renderApp("#/");
    await screen.findByText("Peretz Chein");

    const search = screen.getByLabelText("Search jobs");
    const add = screen.getByTestId("fab-add");

    // Same immediate flex row — the search input and the add button share a
    // parent, i.e. the button is docked beside search, not elsewhere.
    expect(add.parentElement).toBe(search.parentElement);
    expect(within(add.parentElement).getByLabelText("Search jobs")).toBe(search);
  });

  it.each([
    ["mobile", false],
    ["desktop", true],
  ])("%s: add is at the top, above the job list — not pinned to the viewport", async (_l, desktop) => {
    setViewport(desktop);
    mockServer({});
    renderApp("#/");
    const firstCard = await screen.findByText("Peretz Chein");
    const add = screen.getByTestId("fab-add");

    // Ordered before the first job card (top of the screen).
    expect(
      add.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    // No viewport-pinned positioning anywhere on the control or its row.
    for (const el of [add, add.parentElement]) {
      expect(el.className).not.toMatch(/\bfixed\b/);
      expect(el.className).not.toMatch(/\bbottom-\d/);
    }
  });

  it("mobile: add is NOT in the bottom nav cluster anymore", async () => {
    setViewport(false);
    mockServer({});
    renderApp("#/");
    await screen.findByText("Peretz Chein");

    const bottomNav = screen.getByTestId("bottom-nav");
    const add = screen.getByTestId("fab-add");
    expect(bottomNav).not.toContainElement(add); // the squeezed corner is gone
  });

  it.each([
    ["mobile", false],
    ["desktop", true],
  ])("%s: exactly one add control on the Jobs list (no double-render)", async (_l, desktop) => {
    setViewport(desktop);
    mockServer({});
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    expect(screen.getAllByTestId("fab-add")).toHaveLength(1);
  });

  it("still opens the add flow — behaviour unchanged", async () => {
    setViewport(false);
    mockServer({});
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");

    await user.click(screen.getByTestId("fab-add"));
    expect(await screen.findByText("Add a job")).toBeInTheDocument();
  });

  it("stays hidden on Archive, as before", async () => {
    setViewport(false);
    mockServer({});
    renderApp("#/archive");
    expect(screen.queryByTestId("fab-add")).toBeNull();
  });

  // Non-Jobs routes keep an add control (contextual add), now in a top bar
  // rather than a floating bubble. Exactly one, at the top, not pinned.
  it.each([
    ["job detail", "#/job/J-1"],
    ["today", "#/today"],
  ])("non-Jobs route %s: single top-bar add, not floating", async (_l, route) => {
    setViewport(false);
    mockServer({});
    renderApp(route);

    const adds = screen.getAllByTestId("fab-add");
    expect(adds).toHaveLength(1);
    const add = adds[0];
    expect(screen.getByTestId("top-add-bar")).toContainElement(add);
    expect(add.className).not.toMatch(/\bfixed\b/);
  });
});
