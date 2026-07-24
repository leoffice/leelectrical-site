// @vitest-environment jsdom
// Composer send UX (Levi): clear the box immediately on send, keep typing free
// while Israel is still working, and layout as one bubble with + / send.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("chat composer — clear on send, free while AI works", () => {
  it("clears the message box as soon as Send is tapped (before chatSend resolves)", async () => {
    const srv = mockServer({ messages: [] });
    const realFetch = globalThis.fetch;
    let holdResolve;
    const hold = new Promise((r) => {
      holdResolve = r;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, opts) => {
        const u = String(url);
        if (opts?.method === "POST" && /\/chat(\?|$)/.test(u) && opts.body) {
          try {
            const b = JSON.parse(opts.body);
            if (b.op === "msg") await hold;
          } catch {
            /* ignore */
          }
        }
        return realFetch(url, opts);
      })
    );

    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    const input = await screen.findByLabelText("Chat message");
    fireEvent.change(input, { target: { value: "hey Israel fix the calendar" } });
    expect(input).toHaveValue("hey Israel fix the calendar");

    fireEvent.click(screen.getByLabelText("Send message"));

    // Box must be empty immediately — do not wait for network / AI reply.
    expect(screen.getByLabelText("Chat message")).toHaveValue("");

    // Can type a second message while the first is still in flight.
    fireEvent.change(screen.getByLabelText("Chat message"), {
      target: { value: "and also the invoice" },
    });
    expect(screen.getByLabelText("Chat message")).toHaveValue("and also the invoice");

    await act(async () => {
      holdResolve();
    });
    await waitFor(() => {
      const posts = srv.posts("chat", (b) => b.op === "msg");
      expect(posts.some((p) => String(p.body.text).includes("hey Israel fix the calendar"))).toBe(true);
    });
  }, 15000);

  it("clears on Enter without waiting for the AI reply", async () => {
    mockServer({ messages: [] });
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    const input = await screen.findByLabelText("Chat message");
    fireEvent.change(input, { target: { value: "quick question" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", shiftKey: false });
    expect(screen.getByLabelText("Chat message")).toHaveValue("");
  });
});

describe("chat composer — bubble layout + menu", () => {
  it("renders one composer bubble with + and send", async () => {
    mockServer();
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    await screen.findByTestId("chat-composer-bubble");
    expect(screen.getByTestId("chat-plus")).toBeInTheDocument();
    expect(screen.getByTestId("chat-send")).toBeInTheDocument();
  });

  it("+ opens a sort menu for emoji, attach, and voice", async () => {
    mockServer();
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    fireEvent.click(await screen.findByTestId("chat-plus"));
    expect(screen.getByTestId("chat-plus-menu")).toBeInTheDocument();
    expect(screen.getByTestId("chat-plus-emoji")).toBeInTheDocument();
    expect(screen.getByTestId("chat-attach-file")).toBeInTheDocument();
    expect(screen.getByTestId("chat-plus-voice")).toBeInTheDocument();
  });

  it("emoji pick inserts into the draft", async () => {
    mockServer();
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    fireEvent.click(await screen.findByTestId("chat-plus"));
    fireEvent.click(screen.getByTestId("chat-plus-emoji"));
    expect(screen.getByTestId("chat-emoji-picker")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Insert 👍"));
    expect(screen.getByLabelText("Chat message")).toHaveValue("👍");
  });
});
