// @vitest-environment jsdom
// Approval sheet — customer_sync must be RESOLVED client-side (done +
// concrete follow-up command), never requeued with an `approval` patch:
// the host listener ignores that field and would loop needs_approval forever.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

const syncCmd = (over = {}) => ({
  id: "c-sync-1",
  type: "customer_sync",
  jobId: "J-1",
  lane: "deterministic",
  status: "needs_approval",
  payload: { name: "TEST Guy", email: "", phone: "718-555-0142", addr: "" },
  result: {
    action: "candidates",
    candidates: [{ id: "678", name: "Gabi Blezinski", email: "g@x.com", phone: "", addr: "" }],
    proposed: { name: "TEST Guy", email: "t@x.com", phone: "718-555-0142", addr: "" },
  },
  createdAt: Date.now(),
  ...over,
});

describe("customer_sync approval resolution", () => {
  it("Create new: marks the sync done (user chose create) + enqueues create_customer with proposed info", async () => {
    const srv = mockServer({ commands: [syncCmd()] });
    const user = userEvent.setup();
    renderApp("#/");

    await user.click(await screen.findByText(/Create new customer in QuickBooks/));

    await waitFor(() => {
      const updates = srv.posts("command", (b) => b.op === "update" && b.id === "c-sync-1");
      expect(updates).toHaveLength(1);
      expect(updates[0].body.patch.status).toBe("done");
      expect(updates[0].body.note).toMatch(/user chose create/);
    });
    // never requeued (the listener would just re-run the fuzzy search)
    expect(
      srv.posts("command", (b) => b.op === "update" && b.id === "c-sync-1" && b.patch.status === "queued")
    ).toHaveLength(0);

    const created = srv.enqueued("create_customer");
    expect(created).toHaveLength(1);
    expect(created[0].jobId).toBe("J-1");
    expect(created[0].payload).toEqual({
      name: "TEST Guy",
      businessName: "TEST Guy",
      personName: "",
      email: "t@x.com",
      phone: "718-555-0142",
      billingAddr: "405 Lefferts Ave",
      addr: "405 Lefferts Ave",
    });
    expect(created[0].lane).toBe("deterministic");
  });

  it("Pick a candidate: marks done (user chose update) + enqueues update_customer with the match id", async () => {
    const srv = mockServer({ commands: [syncCmd()] });
    const user = userEvent.setup();
    renderApp("#/");

    await user.click(await screen.findByText("Gabi Blezinski"));

    await waitFor(() => {
      const updates = srv.posts("command", (b) => b.op === "update" && b.id === "c-sync-1");
      expect(updates).toHaveLength(1);
      expect(updates[0].body.patch.status).toBe("done");
      expect(updates[0].body.note).toMatch(/user chose update/);
    });
    const upd = srv.enqueued("update_customer");
    expect(upd).toHaveLength(1);
    expect(upd[0].payload).toEqual({
      id: "678",
      name: "TEST Guy",
      businessName: "TEST Guy",
      personName: "",
      email: "t@x.com",
      phone: "718-555-0142",
      billingAddr: "405 Lefferts Ave",
      addr: "405 Lefferts Ave",
    });
  });

  it("recommend_update shape ({customer,diffs}): shows the update option + diffs, enqueues update_customer", async () => {
    const srv = mockServer({
      commands: [
        syncCmd({
          result: {
            action: "recommend_update",
            customer: { id: "1600", name: "TEST Guy", email: "", phone: "718-555-0142", addr: "" },
            diffs: { phone: "718-555-0199", email: "test1@leelectrical.us" },
            proposed: { name: "TEST Guy", email: "test1@leelectrical.us", phone: "718-555-0199", addr: "" },
          },
        }),
      ],
    });
    const user = userEvent.setup();
    renderApp("#/");

    // diff box renders old -> new
    expect(await screen.findByText("718-555-0199")).toBeInTheDocument();
    expect(screen.getByText("718-555-0142")).toBeInTheDocument();

    await user.click(screen.getByText(/LE Pro is correct/));
    await waitFor(() => {
      const updates = srv.posts("command", (b) => b.op === "update" && b.id === "c-sync-1");
      expect(updates).toHaveLength(1);
      expect(updates[0].body.patch.status).toBe("done");
      expect(updates[0].body.note).toMatch(/user chose update/);
    });
    const upd = srv.enqueued("update_customer");
    expect(upd).toHaveLength(1);
    expect(upd[0].payload).toEqual({
      id: "1600",
      name: "TEST Guy",
      businessName: "TEST Guy",
      personName: "",
      email: "test1@leelectrical.us",
      phone: "718-555-0199",
      billingAddr: "405 Lefferts Ave",
      addr: "405 Lefferts Ave",
    });
  });

  it("QuickBooks is correct: pulls QBO customer into the job overlay", async () => {
    const srv = mockServer({
      commands: [
        syncCmd({
          result: {
            action: "recommend_update",
            customer: {
              id: "1600",
              name: "TEST Guy",
              email: "qb@leelectrical.us",
              phone: "718-555-0142",
              addr: "100 QB Street",
            },
            diffs: { email: "test1@leelectrical.us" },
            proposed: { name: "TEST Guy", email: "test1@leelectrical.us", phone: "718-555-0142", addr: "" },
          },
        }),
      ],
    });
    const user = userEvent.setup();
    renderApp("#/");

    await user.click(await screen.findByText(/QuickBooks is correct/));
    await waitFor(() => {
      const saves = srv.posts("state", (b) => b.ov && b.ov["J-1"]);
      expect(saves.length).toBeGreaterThan(0);
      expect(saves[saves.length - 1].body.ov["J-1"].email).toBe("qb@leelectrical.us");
      expect(saves[saves.length - 1].body.ov["J-1"].billingAddress).toBe("100 QB Street");
    });
    expect(srv.enqueued("update_customer")).toHaveLength(0);
  });

  it("Skip: closes the command out without enqueueing anything", async () => {
    const srv = mockServer({ commands: [syncCmd()] });
    const user = userEvent.setup();
    renderApp("#/");

    await user.click(await screen.findByText("Skip for now"));

    await waitFor(() => {
      const updates = srv.posts("command", (b) => b.op === "update" && b.id === "c-sync-1");
      expect(updates).toHaveLength(1);
      expect(updates[0].body.patch.status).toBe("done");
    });
    expect(srv.enqueued("create_customer")).toHaveLength(0);
    expect(srv.enqueued("update_customer")).toHaveLength(0);
  });
});
