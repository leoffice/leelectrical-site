// @vitest-environment jsdom
// Cross-device bubble sync — one stable server-side convo id (pro-levi), not per-device localStorage.
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { LE_PRO_CONVO } from "../src/lib/chatConvo.js";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  localStorage.clear();
  window.location.hash = "#/";
});

describe("cross-device chat sync", () => {
  it("uses the stable shared convo id on every device", async () => {
    const srv = mockServer({
      messages: [{ id: "m1", who: "you", text: "shared thread", status: "Sent", ts: 1 }],
    });
    renderApp("#/");
    await waitFor(() => expect(srv.posts("chat", (b) => b.op === "presence").length).toBe(1));
    expect(srv.posts("chat", (b) => b.op === "presence")[0].body.convo).toBe(LE_PRO_CONVO);
    fireEvent.click(screen.getByTestId("chat-fab"));
    await waitFor(() => expect(screen.getByText("shared thread")).toBeInTheDocument());
    expect(srv.calls.some((c) => c.path === "chat" && c.method === "GET")).toBe(true);
  });

  it("migrates a legacy per-device localStorage thread into the shared convo", async () => {
    localStorage.setItem("le_pro_convo", "pro-old-device");
    const srv = mockServer({
      legacyMessages: {
        "pro-old-device": [{ id: "m-old", who: "you", text: "from my phone", status: "Read", ts: 1 }],
      },
      messages: [{ id: "m-web", who: "you", text: "from desktop", status: "Sent", ts: 2 }],
    });
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    await waitFor(() => expect(srv.posts("chat", (b) => b.op === "migrate")).toHaveLength(1));
    const mig = srv.posts("chat", (b) => b.op === "migrate")[0].body;
    expect(mig).toEqual({ op: "migrate", from: "pro-old-device", to: LE_PRO_CONVO });
    await waitFor(() => expect(screen.getByText("from my phone")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("from desktop")).toBeInTheDocument());
    expect(localStorage.getItem("le_pro_convo")).toBeNull();
  });

  it("two fresh devices load the same server thread (no local convo id)", async () => {
    const shared = [
      { id: "m1", who: "you", text: "synced hello", status: "Read", ts: 1 },
      { id: "r1", who: "israel", text: "synced reply", status: "", ts: 2 },
    ];
    const srv1 = mockServer({ messages: shared });
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    await waitFor(() => expect(screen.getByText("synced hello")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("synced reply")).toBeInTheDocument());
    expect(srv1.posts("chat", (b) => b.op === "presence")[0].body.convo).toBe(LE_PRO_CONVO);

    cleanup();
    localStorage.clear();
    const srv2 = mockServer({ messages: shared });
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    await waitFor(() => expect(screen.getByText("synced hello")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("synced reply")).toBeInTheDocument());
    expect(srv2.posts("chat", (b) => b.op === "presence")[0].body.convo).toBe(LE_PRO_CONVO);
  });
});