// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("Developer mode", () => {
  it("shows Developer mode in the + menu and opens sub-options", async () => {
    mockServer();
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");

    await user.click(screen.getByTestId("fab-add"));
    expect(screen.getByTestId("dev-mode-entry")).toBeInTheDocument();
    await user.click(screen.getByTestId("dev-mode-entry"));

    expect(screen.getByTestId("dev-mode-page-note")).toBeInTheDocument();
    expect(screen.getByTestId("dev-mode-live-edit")).toBeInTheDocument();
    expect(screen.getByTestId("dev-mode-highlight")).toBeInTheDocument();
  });

  it("page note sends to dev board with context", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    renderApp("#/job/J-1");
    await screen.findByTestId("detail-pane");

    await user.click(screen.getByTestId("fab-add"));
    await user.click(screen.getByTestId("dev-mode-entry"));
    await user.click(screen.getByTestId("dev-mode-page-note"));

    expect(screen.getByTestId("page-note-context")).toHaveTextContent("Job detail");
    await user.type(screen.getByTestId("page-note-input"), "Move payment button up");
    await user.click(screen.getByTestId("page-note-send"));

    await waitFor(() => expect(srv.posts("devtasks", (b) => b.op === "add")).toHaveLength(1));
    const task = srv.posts("devtasks", (b) => b.op === "add")[0].body.task;
    expect(task.title).toBe("Page note");
    expect(task.desc).toContain("Move payment button up");
    expect(task.desc).toContain("Job detail");
  });

  it("live edit mode shows overlay bar", async () => {
    mockServer();
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");

    await user.click(screen.getByTestId("fab-add"));
    await user.click(screen.getByTestId("dev-mode-entry"));
    await user.click(screen.getByTestId("dev-mode-live-edit"));

    const bar = screen.getByTestId("live-edit-bar");
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveTextContent(/Live edit/);
  });

  it("highlight area mode shows drag overlay", async () => {
    mockServer();
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");

    await user.click(screen.getByTestId("fab-add"));
    await user.click(screen.getByTestId("dev-mode-entry"));
    await user.click(screen.getByTestId("dev-mode-highlight"));

    expect(screen.getByTestId("highlight-area-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("live-edit-bar")).toHaveTextContent("Highlight area");
  });
});