// @vitest-environment jsdom
// Bubble-driven invoice editing — draft, throbbing review, approve, learning.
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { J1, mockServer, renderApp } from "./helpers.jsx";

const JOB_WITH_LINES = {
  ...JSON.parse(JSON.stringify(J1)),
  invoiceLines: [
    { itemName: "Labor", description: "Electrical labor", qty: 1, unitPrice: 400 },
    { itemName: "Permit fee", description: "DOB permit", qty: 1, unitPrice: 150 },
  ],
};

afterEach(() => {
  localStorage.clear();
  window.location.hash = "#/";
});

describe("invoice agent draft — e2e flow", () => {
  it("bubble edit → throbbing invoice tab → review → approve → learning stored", async () => {
    const srv = mockServer({ messages: [], jobs: [JSON.parse(JSON.stringify(JOB_WITH_LINES))] });
    renderApp("#/job/J-1");
    await screen.findByTestId("detail-pane");

    fireEvent.click(screen.getByTestId("chat-fab"));
    await screen.findByTestId("chat-panel");
    fireEvent.change(screen.getByLabelText("Chat message"), { target: { value: "change labor to $450" } });
    fireEvent.click(screen.getByLabelText("Send message"));

    await waitFor(() => expect(screen.getByTestId("tab-invoice")).toHaveClass("animate-pulse"));
    expect(screen.getByTestId("tab-invoice")).toHaveTextContent(/Review/i);

    fireEvent.click(screen.getByTestId("tab-invoice"));
    await screen.findByTestId("invoice-review-banner");
    expect(screen.getByTestId("review-total")).toHaveTextContent("$600");

    // Levi corrects agent amount before approve
    const rateInput = screen.getAllByLabelText("Rate line 1")[0];
    fireEvent.change(rateInput, { target: { value: "475" } });

    fireEvent.click(screen.getByTestId("invoice-approve"));
    await waitFor(() => expect(screen.queryByTestId("invoice-review-banner")).not.toBeInTheDocument());
    expect(screen.getByTestId("tab-invoice")).not.toHaveClass("animate-pulse");

    const statePosts = srv.posts("state", () => true);
    const learningPost = statePosts.find((p) => {
      const ov = p.body?.ov || {};
      return Array.isArray(ov._invoiceEditLearning) && ov._invoiceEditLearning.length > 0;
    });
    expect(learningPost).toBeTruthy();
    const entry = learningPost.body.ov._invoiceEditLearning[0];
    expect(entry.delta?.some((d) => d.field === "unitPrice")).toBe(true);
  }, 20000);
});