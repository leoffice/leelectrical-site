// @vitest-environment jsdom
// Presence heartbeat — the app pings the chat fn (op:presence) on load and
// when the chat panel opens, with { convo, view } in the payload.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("presence heartbeat", () => {
  it("pings op:presence on app load with convo + current view", async () => {
    const srv = mockServer();
    renderApp("#/");
    await waitFor(() => expect(srv.posts("chat", (b) => b.op === "presence").length).toBe(1));
    const ping = srv.posts("chat", (b) => b.op === "presence")[0].body;
    expect(ping.view).toBe("jobs");
    expect(String(ping.convo)).toMatch(/^pro-/); // same convo id the bubble uses
  });

  it("pings again when the chat panel is opened", async () => {
    const srv = mockServer();
    renderApp("#/");
    await waitFor(() => expect(srv.posts("chat", (b) => b.op === "presence").length).toBe(1));
    fireEvent.click(screen.getByTestId("chat-fab"));
    await waitFor(() => expect(srv.posts("chat", (b) => b.op === "presence").length).toBe(2));
  });
});
