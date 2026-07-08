// @vitest-environment jsdom
// Integration (#56) — the Jobs-tab search also surfaces existing QBO customers
// that aren't in the app yet; tapping one prompts to import them with their
// open invoices, which enqueues an import_customer command.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";
import { PENDING_IMPORT_LS } from "../src/lib/customers.js";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("#56 Jobs search — QBO customer matches + import prompt", () => {
  it("typing a name not in the app shows QBO matches; import enqueues import_customer", async () => {
    const srv = mockServer({ customers: [{ name: "Avraham Drizin", id: "34" }] });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");

    await user.type(screen.getByLabelText("Search jobs"), "Drizin");
    // local jobs don't match -> the QBO customer surfaces instead
    const match = await screen.findByTestId("qbo-customer-match");
    expect(match).toHaveTextContent("Avraham Drizin");

    await user.click(match);
    expect(await screen.findByTestId("import-prompt")).toHaveTextContent(
      /Import\s+Avraham Drizin\s+with all their open invoices/
    );

    await user.click(screen.getByText("Yes, import customer + open invoices"));
    await waitFor(() => expect(srv.enqueued("import_customer")).toHaveLength(1));
    await waitFor(() => expect(window.location.hash).toMatch(/#\/customer\//));
    const pending = JSON.parse(sessionStorage.getItem(PENDING_IMPORT_LS) || "{}");
    expect(pending.name).toBe("Avraham Drizin");
    const cmd = srv.enqueued("import_customer")[0];
    expect(cmd.payload).toEqual({ name: "Avraham Drizin", qboId: "34" });
    expect(cmd.idempotencyKey).toBe("import_customer|34");
  });

  it("does not surface a customer that already exists as a job", async () => {
    mockServer({ customers: [{ name: "Peretz Chein", id: "1" }] });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await user.type(screen.getByLabelText("Search jobs"), "Peretz");
    // Peretz Chein is already a job -> no QBO import row for them
    await waitFor(() => {
      expect(screen.queryByTestId("qbo-customer-match")).not.toBeInTheDocument();
    });
  });
});
