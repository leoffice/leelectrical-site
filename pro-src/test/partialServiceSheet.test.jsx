// @vitest-environment jsdom
// Partial Service questionnaire sheet — per-visit rate defaults confirmed by
// Levi 2026-08-14 (1.5h @ $265 emergency, $225 follow-up, both editable),
// ticket optional, confirm hands back the answers that build both lines.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import PartialServiceSheet from "../src/components/PartialServiceSheet.jsx";

describe("PartialServiceSheet", () => {
  it("defaults to 1.5h @ $265 and follow-up $225, with the rates flagged for confirmation", () => {
    render(<PartialServiceSheet onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByTestId("partial-hours")).toHaveValue("1.5");
    expect(screen.getByTestId("partial-rate")).toHaveValue("265");
    expect(screen.getByTestId("partial-followup-rate")).toHaveValue("225");
    expect(screen.getByTestId("partial-rate-note").textContent).toMatch(/\$265\.00/);
    expect(screen.getByTestId("partial-rate-note").textContent).toMatch(/\$225\.00/);
    expect(screen.getByTestId("partial-date")).toHaveValue(); // seeded to today
  });

  it("previews BOTH visits (1.5 × $265 = $397.50; 1 × $225 = $225.00) and confirms the answers", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<PartialServiceSheet onClose={() => {}} onConfirm={onConfirm} />);

    await user.clear(screen.getByTestId("partial-date"));
    await user.type(screen.getByTestId("partial-date"), "2026-08-10");
    await user.type(screen.getByTestId("partial-ticket"), "CE-4821");

    const preview = screen.getByTestId("partial-preview");
    expect(preview.textContent).toContain("Emergency visit — 1.5 × $265.00 = $397.50");
    expect(preview.textContent).toContain("Follow-up visit — 1 × $225.00 = $225.00");
    expect(preview.textContent).toContain("Ticket # CE-4821");
    expect(preview.textContent).toContain("Total $622.50");

    await user.click(screen.getByTestId("partial-confirm"));
    expect(onConfirm).toHaveBeenCalledWith({
      serviceDate: "2026-08-10",
      ticketNo: "CE-4821",
      initialHours: 1.5,
      rate: 265,
      followUpRate: 225,
    });
  });

  it("edited rates flow through to the confirm payload", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<PartialServiceSheet onClose={() => {}} onConfirm={onConfirm} />);
    await user.clear(screen.getByTestId("partial-rate"));
    await user.type(screen.getByTestId("partial-rate"), "300");
    await user.clear(screen.getByTestId("partial-followup-rate"));
    await user.type(screen.getByTestId("partial-followup-rate"), "240");
    await user.click(screen.getByTestId("partial-confirm"));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ rate: 300, followUpRate: 240 })
    );
  });

  it("re-opens with BOTH lines' saved answers (edit path)", () => {
    render(
      <PartialServiceSheet
        line={{
          partialService: true,
          partialServiceRole: "initial",
          partialServiceDate: "2026-08-01",
          conedTicketNo: "CE-1",
          qty: 2,
          unitPrice: 300,
        }}
        followUpLine={{
          partialService: true,
          partialServiceRole: "followup",
          qty: 1,
          unitPrice: 240,
        }}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(screen.getByTestId("partial-date")).toHaveValue("2026-08-01");
    expect(screen.getByTestId("partial-ticket")).toHaveValue("CE-1");
    expect(screen.getByTestId("partial-hours")).toHaveValue("2");
    expect(screen.getByTestId("partial-rate")).toHaveValue("300");
    expect(screen.getByTestId("partial-followup-rate")).toHaveValue("240");
  });
});
