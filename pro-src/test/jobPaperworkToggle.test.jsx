// @vitest-environment jsdom
// Job Information: Paperwork enable above Transaction history; Con Ed + DOB
// cards under payment history when on (Levi 2026-08-05).
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
  });

  it("turning Paperwork on shows Con Edison + DOB cards under job history area", async () => {
    mockServer({ jobs });
    const user = userEvent.setup();
    renderApp("#/job/J-pw");
    const card = await screen.findByTestId("job-info-card");
    expect(screen.queryByTestId("job-paperwork-tracks")).not.toBeInTheDocument();

    await user.click(within(card).getByRole("switch", { name: /Enable paperwork/i }));

    const tracks = await screen.findByTestId("job-paperwork-tracks");
    expect(within(tracks).getByTestId("job-paperwork-track-coned")).toBeInTheDocument();
    expect(within(tracks).getByTestId("job-paperwork-track-dob")).toBeInTheDocument();
    expect(within(tracks).getByTestId("job-paperwork-track-coned")).toHaveTextContent(/Con Edison/i);
    expect(within(tracks).getByTestId("job-paperwork-track-dob")).toHaveTextContent(/DOB/i);

    // Cards sit after Job Information (and payment history when open).
    const jobInfo = screen.getByTestId("job-info-anchor");
    expect(jobInfo.compareDocumentPosition(tracks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("expanding a track shows Permits link", async () => {
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
    const coned = await screen.findByTestId("job-paperwork-track-coned");
    await user.click(within(coned).getByText("Con Edison"));
    await waitFor(() => {
      expect(within(coned).getByText(/Open Permits tab/i)).toBeInTheDocument();
    });
  });
});
