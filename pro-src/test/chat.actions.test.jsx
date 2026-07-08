// @vitest-environment jsdom
// Task #64 — bubble scroll preservation + in-chat actions (dev task, job, appt).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp, J1 } from "./helpers.jsx";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("chat scroll — history stays put while polling", () => {
  it("does not jump to bottom when scrolled up and a new reply arrives", async () => {
    const many = Array.from({ length: 24 }, (_, i) => ({
      id: "m" + i,
      who: i % 2 ? "claude" : "you",
      text: "line " + i,
      status: i % 2 ? "" : "Read",
      ts: i,
    }));
    const srv = mockServer({ messages: many });
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    await waitFor(() => expect(screen.getByText("line 0")).toBeInTheDocument());

    const log = screen.getByTestId("chat-log");
    Object.defineProperty(log, "scrollHeight", { value: 2400, configurable: true });
    Object.defineProperty(log, "clientHeight", { value: 200, configurable: true });
    log.scrollTop = 0;
    fireEvent.scroll(log);
    const before = log.scrollTop;

    srv.state.messages.push({ id: "r-new", who: "claude", text: "fresh reply", status: "", ts: 99 });
    await waitFor(() => expect(screen.getByText("fresh reply")).toBeInTheDocument(), { timeout: 8000 });
    expect(log.scrollTop).toBe(before);
  }, 15000);
});

describe("chat actions — dev task", () => {
  it("creates a dev task from the Dev task chip", async () => {
    const srv = mockServer({ messages: [] });
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    fireEvent.change(screen.getByLabelText("Chat message"), { target: { value: "Fix bubble scroll" } });
    fireEvent.click(screen.getByTestId("chat-action-task"));
    await waitFor(() => expect(srv.posts("devtasks", (b) => b.op === "add").length).toBe(1));
    expect(srv.posts("devtasks", (b) => b.op === "add")[0].body.task.desc).toBe("Fix bubble scroll");
  }, 12000);

  it("handles /task slash without posting to chat", async () => {
    const srv = mockServer({ messages: [] });
    renderApp("#/");
    fireEvent.click(screen.getByTestId("chat-fab"));
    fireEvent.change(screen.getByLabelText("Chat message"), { target: { value: "/task Add export button" } });
    fireEvent.click(screen.getByLabelText("Send message"));
    await waitFor(() => expect(srv.posts("devtasks", (b) => b.op === "add").length).toBe(1));
    expect(srv.posts("chat", (b) => b.op === "msg").length).toBe(0);
  }, 12000);
});

describe("chat actions — job detail", () => {
  const openJobChat = async () => {
    mockServer({ messages: [], jobs: [JSON.parse(JSON.stringify(J1))] });
    renderApp("#/job/J-1");
    await screen.findByTestId("detail-pane");
    await screen.findByTestId("customer-card");
    fireEvent.click(screen.getByTestId("chat-fab"));
    await screen.findByTestId("chat-panel");
  };

  it("stages a job patch via /job notes", async () => {
    await openJobChat();
    fireEvent.change(screen.getByLabelText("Chat message"), { target: { value: "/job notes Call tomorrow AM" } });
    fireEvent.click(screen.getByLabelText("Send message"));
    await waitFor(() => expect(screen.getByTestId("savebar")).toBeInTheDocument());
  }, 12000);

  it("shows Update job and Appointment chips on a job", async () => {
    await openJobChat();
    expect(screen.getByTestId("chat-action-job")).toBeInTheDocument();
    expect(screen.getByTestId("chat-action-appt")).toBeInTheDocument();
  }, 12000);
});