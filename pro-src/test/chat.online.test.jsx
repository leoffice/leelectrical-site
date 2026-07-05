// @vitest-environment jsdom
// "Easy back-and-forth chat, online" — the panel header shows Dispatch's
// presence (responder cron pings convo "dispatch-heartbeat"), a typing line
// appears while a message is "Working on it", Notification permission is
// requested on first open, and dispatch replies notify a hidden tab. Unread
// badge counts DISPATCH replies only and baselines old history on first poll.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

function stubNotification(permission) {
  const Notif = vi.fn(function (title, opts) {
    this.title = title;
    this.opts = opts;
    this.close = vi.fn();
  });
  Notif.permission = permission;
  Notif.requestPermission = vi.fn(() => Promise.resolve("granted"));
  vi.stubGlobal("Notification", Notif);
  return Notif;
}

function setHidden(hidden) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  setHidden(false);
  window.location.hash = "#/";
});

describe("dispatch presence in the chat header", () => {
  it("shows the online dot when dispatch-heartbeat is fresh (<4 min)", async () => {
    mockServer({
      presence: { "dispatch-heartbeat": { lastSeen: Date.now() - 60_000, view: "responder" } },
    });
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    await waitFor(() => expect(screen.getByTestId("presence-line")).toHaveTextContent("online"));
  });

  it("shows away when the heartbeat is stale", async () => {
    mockServer({
      presence: { "dispatch-heartbeat": { lastSeen: Date.now() - 10 * 60_000, view: "responder" } },
    });
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    // presence GET resolves async — status must settle on "away", not flip to online
    await waitFor(() =>
      expect(screen.getByTestId("presence-line")).toHaveTextContent("away — replies in a few minutes")
    );
  });

  it("shows away when no heartbeat was ever posted", async () => {
    mockServer();
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    await waitFor(() => expect(screen.getByTestId("presence-line")).toHaveTextContent("away"));
  });
});

describe("typing / working status line", () => {
  it("renders the typing line while a message is Working on it", async () => {
    mockServer({
      messages: [{ id: "m1", who: "you", text: "hi", status: "Working on it", ts: 1 }],
    });
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    await waitFor(() => expect(screen.getByTestId("typing-line")).toHaveTextContent("Dispatch is working on it"));
  });

  it("no typing line for plain Sent messages", async () => {
    mockServer({ messages: [{ id: "m1", who: "you", text: "hi", status: "Sent", ts: 1 }] });
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    await waitFor(() => expect(screen.getByText("hi")).toBeInTheDocument());
    expect(screen.queryByTestId("typing-line")).not.toBeInTheDocument();
  });
});

describe("browser notifications", () => {
  it("asks for Notification permission once, on first chat open", async () => {
    const Notif = stubNotification("default");
    mockServer();
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    expect(Notif.requestPermission).toHaveBeenCalledTimes(1);
    // close + reopen: permission is no longer "default" in real browsers, but
    // even if it were, asking again is the browser's no-op — we only assert
    // the first-open ask happened.
  });

  it("does not ask again when permission is already granted", async () => {
    const Notif = stubNotification("granted");
    mockServer();
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    expect(Notif.requestPermission).not.toHaveBeenCalled();
  });

  it("notifies when a dispatch reply lands while the tab is hidden", async () => {
    const Notif = stubNotification("granted");
    const srv = mockServer();
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    // wait for the first poll to baseline (empty history)
    await waitFor(() => expect(srv.calls.some((c) => c.path === "chat" && c.method === "GET")).toBe(true));
    // reply arrives while the tab is hidden
    setHidden(true);
    srv.state.messages.push({ id: "r1", who: "claude", text: "On it — sending now", status: "", ts: Date.now() });
    await waitFor(() => expect(Notif).toHaveBeenCalled(), { timeout: 6000 });
    expect(Notif.mock.calls[0][1].body).toContain("On it");
  }, 10000);
});

describe("unread badge counts dispatch replies only", () => {
  it("baselines old history, then badges a new reply while the panel is closed", async () => {
    const srv = mockServer({
      messages: [{ id: "m0", who: "you", text: "old send", status: "Sent", ts: 1 }],
    });
    renderApp("#/");
    // first poll baselines — the old own-message must NOT badge
    await waitFor(() => expect(srv.calls.some((c) => c.path === "chat" && c.method === "GET")).toBe(true));
    expect(screen.getByTestId("chat-fab")).not.toHaveTextContent("1");
    srv.state.messages.push({ id: "r1", who: "claude", text: "reply", status: "", ts: Date.now() });
    await waitFor(() => expect(screen.getByTestId("chat-fab")).toHaveTextContent("1"), { timeout: 8000 });
  }, 12000);
});
