// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("chat file attach", () => {
  it("file input accepts any file type (no image-only restriction)", async () => {
    mockServer();
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    const input = await screen.findByTestId("chat-file-input");
    expect(input).not.toHaveAttribute("accept");
    expect(screen.getByTestId("chat-attach-file")).toHaveAttribute("aria-label", "Attach file");
  });

  it("sends a non-image file to Israel", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    const input = await screen.findByTestId("chat-file-input");
    const file = new File(["%PDF"], "report.pdf", { type: "application/pdf" });
    await user.upload(input, file);
    await waitFor(() => expect(screen.getByText(/report\.pdf/)).toBeInTheDocument());
    const chatPosts = srv.posts("chat", (b) => b.op === "msg");
    expect(chatPosts.some((p) => String(p.body.text).includes("report.pdf"))).toBe(true);
    const itPosts = srv.posts("iterate");
    expect(itPosts.some((p) => p.body?.context?.hasFile)).toBe(true);
  });
});