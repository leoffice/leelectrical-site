// @vitest-environment jsdom
// Remote invoice/estimate change login card — approve / edit / deny / 15-min X snooze.
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { J1, mockServer, renderApp } from "./helpers.jsx";
import { DOC_CHANGE_SNOOZE_MINUTES } from "../src/lib/invoiceAgentDraft.js";
import { isSuggestionSnoozed } from "../src/lib/dismissSnooze.js";

const PENDING_JOB = {
  ...JSON.parse(JSON.stringify(J1)),
  customer: "Goodness and kindness",
  personName: "Sholom Rubashkin",
  address: "1337 President St, Brooklyn, NY 11213",
  serviceAddress: "1337 President St, Brooklyn, NY 11213",
  invoiceNo: "251841",
  amount: "$550",
  invoiceLines: [
    { itemName: "Labor", description: "Electrical labor", qty: 1, unitPrice: 400 },
    { itemName: "Permit fee", description: "DOB permit", qty: 1, unitPrice: 150 },
  ],
  invoiceAgentDraft: {
    pendingReview: true,
    kind: "invoice",
    baselineLines: [
      { itemName: "Labor", description: "Electrical labor", qty: 1, unitPrice: 400 },
      { itemName: "Permit fee", description: "DOB permit", qty: 1, unitPrice: 150 },
    ],
    lines: [{ itemName: "Installation", description: "placeholder zero", qty: 1, unitPrice: 0 }],
    baselineAmount: 550,
    proposedAmount: 0,
    sourceText: "restored after missing",
    agent: "israel",
    appliedAt: 1_700_000_000_000,
  },
};

afterEach(() => {
  localStorage.clear();
  window.location.hash = "#/";
});

describe("DocChangeApprovalPrompts", () => {
  it("shows condensed remote change card on login", async () => {
    mockServer({ messages: [], jobs: [PENDING_JOB] });
    renderApp("#/");
    const card = await screen.findByTestId("doc-change-approval");
    expect(card).toBeInTheDocument();
    expect(screen.getByTestId("doc-change-customer")).toHaveTextContent(/Goodness/i);
    expect(screen.getByTestId("doc-change-address")).toHaveTextContent(/1337 President/i);
    expect(screen.getByTestId("doc-change-amounts")).toHaveTextContent("$550");
    expect(screen.getByTestId("doc-change-amounts")).toHaveTextContent("$0");
    expect(screen.getByTestId("doc-change-approve")).toBeInTheDocument();
    expect(screen.getByTestId("doc-change-edit")).toBeInTheDocument();
    expect(screen.getByTestId("doc-change-deny")).toBeInTheDocument();
  });

  it("deny keeps original and closes card", async () => {
    mockServer({ messages: [], jobs: [JSON.parse(JSON.stringify(PENDING_JOB))] });
    renderApp("#/");
    await screen.findByTestId("doc-change-approval");
    fireEvent.click(screen.getByTestId("doc-change-deny"));
    await waitFor(() => expect(screen.queryByTestId("doc-change-approval")).not.toBeInTheDocument());
  });

  it("X snoozes for 15 minutes", async () => {
    mockServer({ messages: [], jobs: [JSON.parse(JSON.stringify(PENDING_JOB))] });
    renderApp("#/");
    await screen.findByTestId("doc-change-approval");
    // FloatingPanel / Sheet close control
    const closeBtns = screen.getAllByRole("button", { name: /close|dismiss|✕|×/i });
    const closer = closeBtns[0] || screen.getByLabelText(/close/i);
    fireEvent.click(closer);
    await waitFor(() => expect(screen.queryByTestId("doc-change-approval")).not.toBeInTheDocument());
    const key = `doc-change:invoice:${PENDING_JOB.id}:${PENDING_JOB.invoiceAgentDraft.appliedAt}`;
    expect(isSuggestionSnoozed(key)).toBe(true);
    expect(DOC_CHANGE_SNOOZE_MINUTES).toBe(15);
  });
});
