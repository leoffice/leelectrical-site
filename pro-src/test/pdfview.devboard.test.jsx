// @vitest-environment jsdom
// Live PDF viewing (docs store + fetch_pdf command) and the Dev-board
// archived section / Mark complete / Unarchive controls.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp, stubPdfOpen } from "./helpers.jsx";
import { todayStr } from "../src/lib/format.js";

afterEach(() => {
  cleanup(); // unmount between tests — this harness runs without globals:true,
  vi.unstubAllGlobals(); // so RTL's auto-cleanup isn't registered.
  localStorage.clear();
  window.location.hash = "#/";
});

const openInvoiceSheet = async (user) => {
  renderApp("#/job/J-1");
  const pane = await screen.findByTestId("detail-pane");
  await within(pane).findByText("Peretz Chein");
  await user.click(within(pane).getByTestId("tab-invoice"));
  return screen.getByRole("dialog");
};

describe("invoice/estimate quick view — View PDF", () => {
  it("opens the stored PDF in the native viewer immediately when docs already has it", async () => {
    const click = stubPdfOpen();
    const srv = mockServer({ docs: { "inv-251841": "%PDF-1.4 stored" } });
    const user = userEvent.setup();
    const sheet = await openInvoiceSheet(user);

    await user.click(within(sheet).getByText("View PDF"));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(document.querySelector("[data-fullscreen-pdf]")).toBeNull();
    expect(screen.queryByText("⛶ Full screen")).toBeNull();
    expect(srv.enqueued("fetch_pdf")).toHaveLength(0); // no command when already stored
  });

  it("on a miss: enqueues fetch_pdf (judgment, pdf:<no>:<date>), shows fetching, then opens after a poll", async () => {
    const click = stubPdfOpen();
    const srv = mockServer(); // docs empty -> 404
    const user = userEvent.setup();
    const sheet = await openInvoiceSheet(user);

    await user.click(within(sheet).getByText("View PDF"));
    await screen.findByText("Fetching from QuickBooks — a few seconds…");
    await waitFor(() => expect(srv.enqueued("fetch_pdf")).toHaveLength(1));
    const cmd = srv.enqueued("fetch_pdf")[0];
    expect(cmd.lane).toBe("judgment");
    expect(cmd.idempotencyKey).toBe("pdf:251841:" + todayStr());
    expect(cmd.payload).toEqual({ kind: "invoice", no: "251841", docKey: "inv-251841" });

    // Host uploads it -> the 4s poll picks it up and opens natively.
    srv.state.docs["inv-251841"] = "%PDF-1.4 fetched";
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1), { timeout: 7000 });
  }, 12000);
});

describe("dev board — archived section + always-available Mark complete", () => {
  const TASKS = [
    { id: "a1", num: 1, title: "Open thing", desc: "", status: "new", priority: "Normal", ts: 3 },
    { id: "a2", num: 2, title: "Done+archived", desc: "", status: "done", archived: true, priority: "Normal", ts: 2 },
    { id: "a3", num: 3, title: "Old done", desc: "", status: "done", archived: true, priority: "Normal", ts: 1 },
  ];

  it("hides archived tasks under a collapsed 'Archived (N)' section with Unarchive", async () => {
    const srv = mockServer({ tasks: JSON.parse(JSON.stringify(TASKS)) });
    const user = userEvent.setup();
    renderApp("#/dev");

    await screen.findByText("Open thing");
    expect(screen.queryByText("Done+archived")).toBeNull(); // collapsed by default

    await user.click(screen.getByText("Archived (2)"));
    expect(await screen.findByText("Done+archived")).toBeInTheDocument();
    expect(screen.getByText("Old done")).toBeInTheDocument();

    await user.click(screen.getAllByText("📤 Unarchive")[0]);
    await waitFor(() =>
      expect(srv.posts("devtasks", (b) => b.op === "patch" && b.id === "a2" && b.patch.archived === false)).toHaveLength(1)
    );
    await screen.findByText("Archived (1)"); // list refreshed, one left
  });

  it("every open task card has ✓ Mark complete -> patches status done + archived true", async () => {
    const srv = mockServer({ tasks: JSON.parse(JSON.stringify(TASKS)) });
    const user = userEvent.setup();
    renderApp("#/dev");

    await screen.findByText("Open thing");
    await user.click(screen.getByText("✓ Mark complete"));
    await waitFor(() =>
      expect(
        srv.posts(
          "devtasks",
          (b) => b.op === "patch" && b.id === "a1" && b.patch.status === "done" && b.patch.archived === true
        )
      ).toHaveLength(1)
    );
    // card moves into the archived section after refresh
    await screen.findByText("Archived (3)");
    expect(screen.queryByText("Open thing")).toBeNull();
  });
});
