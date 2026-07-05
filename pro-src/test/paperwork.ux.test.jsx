// @vitest-environment jsdom
// Integration — paperwork branch sub-item UX rework: greyed-by-default items
// with an Enable action, Complete/Undo once enabled, ✕ remove to a collapsed
// "Removed items" list with Restore. All staged via patchJob (schema-additive:
// paperwork[k].active / paperwork[k].removed — steps/dates keys unchanged).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

const openConEd = async (user, pane) => {
  await user.click(within(pane).getByRole("button", { name: /📑/ })); // Paperwork phase
  const sw = within(pane).queryByRole("switch", { name: "🔌 Con Ed paperwork" });
  if (sw && sw.getAttribute("aria-checked") === "false") await user.click(sw);
};

const openDetail = async () => {
  renderApp("#/job/J-1");
  const pane = await screen.findByTestId("detail-pane");
  await within(pane).findByText("Peretz Chein");
  return pane;
};

describe("sub-item enable flow", () => {
  it("defaults greyed out; tap offers Enable (not Undo); enabled items get Complete then Undo", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    const pane = await openDetail();
    await openConEd(user, pane);

    const label = () => within(pane).getByRole("button", { name: /^(✓ )?Application submitted$/ });
    // greyed by default
    expect(label().closest("div").className).toContain("opacity-50");

    // tap -> Enable action, never Undo
    await user.click(label());
    expect(within(pane).getByText("Enable")).toBeInTheDocument();
    expect(within(pane).queryByText("↩ Undo")).toBeNull();
    await user.click(within(pane).getByText("Enable"));

    // enabled: no longer greyed, tap -> Complete
    expect(label().closest("div").className).not.toContain("opacity-50");
    await user.click(label());
    await user.click(within(pane).getByText("✓ Complete"));
    expect(within(pane).getByText(/✓ Application submitted/)).toBeInTheDocument();

    // done: tap -> Undo; undoing keeps the item enabled (not back to greyed)
    await user.click(label());
    await user.click(within(pane).getByText("↩ Undo"));
    expect(label().closest("div").className).not.toContain("opacity-50");

    // everything was staged, schema-additive
    await user.click(screen.getByText("Save & sync"));
    await waitFor(() => {
      const br = srv.state.ov["J-1"].paperwork.coned;
      expect(br.active["Application submitted"]).toBe(true);
      expect(br.steps["Application submitted"]).toBe(false); // undone, key kept
    });
  });

  it("existing saved data renders unchanged: a done step shows ✓ + Undo, never Enable", async () => {
    mockServer({
      ov: {
        "J-1": {
          paperwork: { coned: { enabled: true, steps: { "POE scheduled": true }, dates: {} } },
        },
      },
    });
    const user = userEvent.setup();
    const pane = await openDetail();
    await user.click(within(pane).getByRole("button", { name: /📑/ }));

    const row = within(pane).getByRole("button", { name: /^✓ POE scheduled$/ });
    expect(row).toHaveTextContent("✓ POE scheduled");
    expect(row.closest("div").className).not.toContain("opacity-50");
    await user.click(row);
    expect(within(pane).getByText("↩ Undo")).toBeInTheDocument();
    expect(within(pane).queryByText("Enable")).toBeNull();
    // the completion toggle is still there, as before
    expect(within(pane).getByRole("switch", { name: "POE scheduled" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("sub-item remove / restore", () => {
  it("✕ stages removed:true; item folds into 'Removed items (N)'; Restore flips it back", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    const pane = await openDetail();
    await openConEd(user, pane);

    // every sub-item has its own ✕
    expect(within(pane).getAllByLabelText(/from list$/).length).toBe(7); // Con Ed has 7 steps
    await user.click(within(pane).getByLabelText("Remove Interim checklist from list"));

    // gone from the list, collapsed removed-row appears
    expect(within(pane).queryByText("Interim checklist")).toBeNull();
    const removedRow = within(pane).getByText("Removed items (1)");
    await user.click(screen.getByText("Save & sync"));
    await waitFor(() =>
      expect(srv.state.ov["J-1"].paperwork.coned.removed["Interim checklist"]).toBe(true)
    );

    // expand -> Restore (staged as removed:false — the key is never deleted)
    await user.click(removedRow);
    expect(within(pane).getByText("Interim checklist")).toBeInTheDocument(); // shown in removed list
    await user.click(within(pane).getByText("Restore"));
    expect(within(pane).queryByText(/Removed items/)).toBeNull();
    expect(within(pane).getByRole("switch", { name: "Interim checklist" })).toBeInTheDocument();
    await user.click(screen.getByText("Save & sync"));
    await waitFor(() =>
      expect(srv.state.ov["J-1"].paperwork.coned.removed["Interim checklist"]).toBe(false)
    );
    // untouched sibling keys survived both saves
    expect(srv.state.ov["J-1"].paperwork.coned.enabled).toBe(true);
  });

  it("removed items render per branch (DOB removal doesn't touch Con Ed)", async () => {
    mockServer({
      ov: {
        "J-1": {
          paperwork: {
            coned: { enabled: true, steps: {} },
            dob: { enabled: true, steps: {}, removed: { "Self certification": true, "PAA complete": true } },
          },
        },
      },
    });
    const user = userEvent.setup();
    const pane = await openDetail();
    await user.click(within(pane).getByRole("button", { name: /📑/ }));
    expect(within(pane).getByText("Removed items (2)")).toBeInTheDocument(); // DOB only
    expect(within(pane).queryByText("Self certification")).toBeNull();
    expect(within(pane).getByText("Final checklist")).toBeInTheDocument(); // Con Ed intact
  });
});
