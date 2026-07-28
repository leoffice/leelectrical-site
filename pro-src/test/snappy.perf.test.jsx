// @vitest-environment jsdom
// Responsiveness is a hard requirement (Levi 2026-07-27). Two things used to
// make the app feel slow:
//   1. dragging a floating card re-rendered the card and everything inside it
//      on every pointermove;
//   2. background polls replaced jobs/commands/events wholesale every few
//      seconds, so the whole tree re-rendered while idle.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { HashRouter } from "react-router-dom";
import FloatingPanel from "../src/components/FloatingPanel.jsx";
import { StoreProvider, useStoreData } from "../src/state/store.jsx";
import { mockServer } from "./helpers.jsx";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

function RenderCounter({ countRef }) {
  countRef.current += 1;
  return <p>panel body</p>;
}

/** pointer events jsdom doesn't construct on its own. */
function pointer(type, { x = 0, y = 0 } = {}) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: 1, button: 0, clientX: x, clientY: y });
  return e;
}

function flushFrames() {
  return act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r()));
    await new Promise((r) => requestAnimationFrame(() => r()));
  });
}

function StoreProbe({ seen }) {
  seen.value = useStoreData();
  return <span data-testid="probe">probe</span>;
}

describe("idle background polls", () => {
  it("an unchanged snapshot keeps the same jobs/commands/events objects", async () => {
    mockServer();
    const seen = { value: null };
    // Fake timers must be in place before the provider schedules its polls.
    vi.useFakeTimers();
    render(
      <HashRouter>
        <StoreProvider>
          <StoreProbe seen={seen} />
        </StoreProvider>
      </HashRouter>
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    const before = seen.value;
    expect(before.jobs.length).toBeGreaterThan(0);

    // Commands poll at 8s, events/dev at 30s, jobs/sas/insights at 60s —
    // every one of them fires inside this window and returns identical data.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    const after = seen.value;

    // Same references → React (and every useMemo keyed on them) bails out.
    for (const key of ["jobs", "commands", "events", "devTasks", "sasCalls", "emailInsights"]) {
      expect(after[key], `${key} was replaced by an idle poll`).toBe(before[key]);
    }
  });
});

describe("floating card drag", () => {
  it("moves without re-rendering its contents", async () => {
    const countRef = { current: 0 };
    render(
      <FloatingPanel title="🔔 Reminder" onClose={() => {}} testId="perf-panel">
        <RenderCounter countRef={countRef} />
      </FloatingPanel>
    );
    const card = screen.getByTestId("perf-panel");
    const handle = card.firstChild; // drag header
    card.setPointerCapture = () => {};
    handle.setPointerCapture = () => {};
    handle.releasePointerCapture = () => {};

    const before = countRef.current;
    expect(before).toBeGreaterThan(0);

    act(() => {
      handle.dispatchEvent(pointer("pointerdown", { x: 100, y: 100 }));
    });
    for (let i = 1; i <= 40; i++) {
      act(() => {
        handle.dispatchEvent(pointer("pointermove", { x: 100 + i * 3, y: 100 + i * 2 }));
      });
    }
    await flushFrames();

    // 40 pointer moves, zero extra renders of the card body.
    expect(countRef.current).toBe(before);
    // …and the card actually moved (one transform write per frame).
    expect(card.style.transform).toMatch(/translate3d/);

    act(() => {
      handle.dispatchEvent(pointer("pointerup", { x: 220, y: 180 }));
    });
    // The single commit render doesn't reach the body either — the transform is
    // just folded into left/top on the card itself.
    expect(countRef.current).toBe(before);
    expect(card.style.transform).toBe("");
    expect(parseInt(card.style.left, 10)).toBeGreaterThan(8);
  });

  it("a drag that lands on the minimized pill does not restore it", async () => {
    render(
      <FloatingPanel title="Reminder" onClose={() => {}} testId="perf-panel" minimizable>
        <p>body</p>
      </FloatingPanel>
    );
    const card = screen.getByTestId("perf-panel");
    card.setPointerCapture = () => {};
    card.firstChild.setPointerCapture = () => {};
    card.firstChild.releasePointerCapture = () => {};
    fireEvent.click(screen.getByTestId("perf-panel-minimize"));
    const pill = screen.getByTestId("perf-panel-minimized");
    pill.setPointerCapture = () => {};
    pill.releasePointerCapture = () => {};

    act(() => {
      pill.dispatchEvent(pointer("pointerdown", { x: 50, y: 50 }));
      pill.dispatchEvent(pointer("pointermove", { x: 160, y: 90 }));
      pill.dispatchEvent(pointer("pointerup", { x: 160, y: 90 }));
    });
    fireEvent.click(pill);
    // Still minimized — the click that ends a drag isn't a tap.
    expect(screen.getByTestId("perf-panel-minimized")).toBeInTheDocument();
  });
});
