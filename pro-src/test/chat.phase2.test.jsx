// @vitest-environment jsdom
// Phase 2 chat-bubble upgrades + the liveness/robustness fix:
//   - Dispatch replies render inline as their own (left-aligned) bubbles.
//   - Own-message delivery statuses render (Sent -> Delivered -> Read -> Working).
//   - An unread notification DOT appears on the FAB when a reply lands while closed.
//   - Liveness: a recent Dispatch REPLY marks the header "online" even when the
//     "dispatch-heartbeat" presence ping is stale (the prod bug — heartbeat lagged
//     ~16h while the responder kept replying in seconds, so it always read "away").
//   - A long-running "Working on it" softens its copy instead of spinning forever.
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  localStorage.clear();
  window.location.hash = "#/";
});

describe("Phase 2 — inline reply buttons", () => {
  it("renders parallel tap buttons on Israel replies with ---BUTTONS---", async () => {
    mockServer({
      messages: [
        {
          id: "r1",
          who: "israel",
          text: "Pick one:\n\n---BUTTONS---\nRecord payment | pay\nOpen job | open\nCancel | cancel",
          status: "",
          ts: 2,
        },
      ],
    });
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    await waitFor(() => expect(screen.getByTestId("chat-reply-buttons")).toBeInTheDocument());
    expect(screen.getByTestId("chat-reply-btn-0")).toHaveTextContent("Record payment");
    expect(screen.getByTestId("chat-reply-btn-1")).toHaveTextContent("Open job");
    expect(screen.queryByText(/---BUTTONS---/)).not.toBeInTheDocument();
  });
});

describe("Phase 2 — inline Dispatch replies", () => {
  it("renders a claude/dispatch reply inline in the thread", async () => {
    mockServer({
      messages: [
        { id: "m1", who: "you", text: "hey Dispatch", status: "Read", ts: 1 },
        { id: "r1", who: "claude", text: "On it — sending the estimate now", status: "", ts: 2 },
      ],
    });
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    await waitFor(() => expect(screen.getByText("On it — sending the estimate now")).toBeInTheDocument());
    // The reply carries the "Dispatch" meta label, not a delivery status.
    const meta = screen.getAllByTestId("msg-meta").map((n) => n.textContent);
    expect(meta).toContain("Israel");
  });
});

describe("Phase 2 — per-message delivery statuses", () => {
  it("shows Read ✓✓ on an own message the responder has read", async () => {
    mockServer({ messages: [{ id: "m1", who: "you", text: "hi", status: "Read", ts: 1 }] });
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    await waitFor(() => expect(screen.getByTestId("msg-meta")).toHaveTextContent("Read ✓✓"));
  });

  it("defaults to Sent when no status is present", async () => {
    mockServer({ messages: [{ id: "m1", who: "you", text: "hi", status: "", ts: 1 }] });
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    await waitFor(() => expect(screen.getByTestId("msg-meta")).toHaveTextContent("Sent"));
  });
});

describe("Phase 2 — unread notification dot", () => {
  it("shows the dot on the FAB when a reply lands while the panel is closed", async () => {
    const srv = mockServer({
      messages: [{ id: "m0", who: "you", text: "old", status: "Sent", ts: 1 }],
    });
    renderApp("#/");
    // baseline first (own history must not badge)
    await waitFor(() => expect(srv.calls.some((c) => c.path === "chat" && c.method === "GET")).toBe(true));
    expect(screen.queryByTestId("chat-unread-dot")).not.toBeInTheDocument();
    srv.state.messages.push({ id: "r1", who: "claude", text: "reply", status: "", ts: Date.now() });
    await waitFor(() => expect(screen.getByTestId("chat-unread-dot")).toBeInTheDocument(), { timeout: 8000 });
    expect(screen.getByTestId("chat-unread-dot")).toHaveTextContent("1");
  }, 12000);
});

describe("liveness — recent reply implies online even with a stale heartbeat", () => {
  it("reads online when the last reply is fresh but dispatch-heartbeat is stale", async () => {
    mockServer({
      presence: { "dispatch-heartbeat": { lastSeen: Date.now() - 60 * 60_000, view: "responder" } },
      messages: [{ id: "r1", who: "claude", text: "just replied", status: "", ts: Date.now() - 30_000 }],
    });
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    await waitFor(() => expect(screen.getByTestId("presence-line")).toHaveTextContent("online"));
  });

  it("still reads away with a stale heartbeat and an old reply", async () => {
    mockServer({
      presence: { "dispatch-heartbeat": { lastSeen: Date.now() - 60 * 60_000, view: "responder" } },
      messages: [{ id: "r1", who: "claude", text: "old reply", status: "", ts: Date.now() - 60 * 60_000 }],
    });
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    await waitFor(() => expect(screen.getByTestId("presence-line")).toHaveTextContent("away"));
  });
});
