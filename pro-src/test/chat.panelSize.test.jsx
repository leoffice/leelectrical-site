// @vitest-environment jsdom
// Chat bubble expand / smaller / minimize (✕).
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";
import { getChatPanelSize } from "../src/lib/appSettings.js";

afterEach(() => {
  localStorage.clear();
  window.location.hash = "#/";
});

describe("chat panel size", () => {
  it("starts normal, expands, shrinks, and minimizes with ✕", async () => {
    mockServer({ messages: [] });
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    await waitFor(() => expect(screen.getByTestId("chat-panel")).toBeInTheDocument());
    expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-size", "normal");
    expect(getChatPanelSize()).toBe("normal");

    fireEvent.click(screen.getByTestId("chat-size-toggle"));
    await waitFor(() =>
      expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-size", "expanded")
    );
    expect(getChatPanelSize()).toBe("expanded");

    fireEvent.click(screen.getByTestId("chat-size-toggle"));
    await waitFor(() =>
      expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-size", "normal")
    );

    fireEvent.click(screen.getByTestId("chat-minimize"));
    await waitFor(() => expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument());
  });
});
