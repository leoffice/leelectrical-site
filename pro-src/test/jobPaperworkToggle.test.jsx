// @vitest-environment jsdom
// Job Information: Paperwork enable above Transaction history; Con Ed + DOB
// peer tabs under Job Information when on (Levi 2026-08-05).
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.location.hash = "#/";
});

const jobs = [
  {
    id: "J-pw",
    customer: "Paperwork Co",
    qboCustomerId: "77",
    invoiceNo: "7701",
    billingAddress: "1 Main St",
    serviceAddress: "503 Schenectady Ave",
    title: "Service upgrade",
    paid: false,
    amount: "$500",
  },
];

describe("job detail — Paperwork enable on Job Information", () => {
  it("shows Paperwork toggle above Transaction history on Job Information", async () => {
    mockServer({ jobs });
    renderApp("#/job/J-pw");
    const card = await screen.findByTestId("job-info-card");
    const paperRow = within(card).getByTestId("job-paperwork-toggle-row");
    const txnRow = within(card).getByTestId("job-txn-history-toggle");
    expect(paperRow.compareDocumentPosition(txnRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(paperRow).getByRole("switch", { name: /Enable paperwork/i })).toBeInTheDocument();
    // Not on the customer card
    expect(screen.queryByTestId("customer-paperwork-toggle-row")).not.toBeInTheDocument();
    // Label sits tight next to the toggle (not a full-width solo row)
    expect(within(paperRow).getByText("Paperwork")).toBeInTheDocument();
  });

  it("turning Paperwork on shows Con Edison + DOB peer tabs on Job Information", async () => {
    mockServer({ jobs });
    const user = userEvent.setup();
    renderApp("#/job/J-pw");
    const card = await screen.findByTestId("job-info-card");
    expect(screen.queryByTestId("job-doc-tabs-paperwork")).not.toBeInTheDocument();

    await user.click(within(card).getByRole("switch", { name: /Enable paperwork/i }));

    const paperTabs = await screen.findByTestId("job-doc-tabs-paperwork");
    expect(within(paperTabs).getByTestId("tab-coned")).toBeInTheDocument();
    expect(within(paperTabs).getByTestId("tab-dob")).toBeInTheDocument();
    expect(within(paperTabs).getByTestId("tab-coned")).toHaveTextContent(/Con Edison/i);
    expect(within(paperTabs).getByTestId("tab-dob")).toHaveTextContent(/DOB/i);

    // Peer tabs live on the Job Information card.
    const jobInfo = screen.getByTestId("job-info-card");
    expect(jobInfo.contains(paperTabs)).toBe(true);
  });

  it("opening Con Edison tab shows to-dos panel with Permits link", async () => {
    mockServer({
      jobs: [
        {
          ...jobs[0],
          permitTracker: true,
          paperwork: {
            coned: { enabled: true, stageLabel: "On tracker", nextAction: "Submit application" },
            dob: { enabled: true, stageLabel: "On tracker" },
          },
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-pw");
    const paperTabs = await screen.findByTestId("job-doc-tabs-paperwork");
    await user.click(within(paperTabs).getByTestId("tab-coned"));
    const panel = await screen.findByTestId("job-paperwork-track-panel");
    expect(within(panel).getByText(/Permits tab/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(within(panel).getByText(/To-do list/i)).toBeInTheDocument();
    });
  });
});
