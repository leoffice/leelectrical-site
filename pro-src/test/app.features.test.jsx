// @vitest-environment jsdom
// Integration — global features (checklist 3-approvals, 4, 10, 11, 12) plus
// responsive layout checks at 390px and 1280px.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { EV, J1, J2, mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

describe("3b. needs_approval sheets (customer_sync)", () => {
  const approvalCmd = () => ({
    id: "ap1",
    type: "customer_sync",
    jobId: "J-1",
    status: "needs_approval",
    payload: { name: "Peretz Chein" },
    result: {
      message: "Found a close match in QuickBooks.",
      candidates: [{ id: "qb9", name: "P. Chein", email: "p@x.com", phone: "718", addr: "123 Main" }],
      recommend: "update",
      matchId: "qb7",
      diff: "phone: 718 -> 917",
    },
    createdAt: 1,
    idempotencyKey: "k-ap1",
  });

  it("offers update-existing / candidate / create-new / skip and resolves via op:update", async () => {
    const srv = mockServer({ commands: [approvalCmd()] });
    const user = userEvent.setup();
    renderApp("#/");
    expect(await screen.findByText("QuickBooks needs your OK")).toBeInTheDocument();
    expect(screen.getByText(/Found a close match/)).toBeInTheDocument();
    expect(screen.getByText(/phone: 718 -> 917/)).toBeInTheDocument(); // diff box
    expect(screen.getByText("P. Chein")).toBeInTheDocument(); // candidate
    expect(screen.getByText("Create new customer")).toBeInTheDocument();
    expect(screen.getByText("Skip for now")).toBeInTheDocument();
    await user.click(screen.getByText("Update existing customer"));
    await waitFor(() =>
      expect(
        srv.posts("command", (b) => b.op === "update" && b.id === "ap1" && b.patch.status === "queued" && b.patch.approval.choice === "update" && b.patch.approval.matchId === "qb7")
      ).toHaveLength(1)
    );
  });

  it("refine-search skips then re-enqueues customer_sync with payload.search", async () => {
    const srv = mockServer({ commands: [approvalCmd()] });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("QuickBooks needs your OK");
    await user.type(screen.getByLabelText("Refine search"), "Chein Brooklyn");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(srv.posts("command", (b) => b.op === "update" && b.patch.approval?.choice === "skip")).toHaveLength(1)
    );
    await waitFor(() => expect(srv.enqueued("customer_sync")).toHaveLength(1));
    const cmd = srv.enqueued("customer_sync")[0];
    expect(cmd.payload.search).toBe("Chein Brooklyn");
    expect(cmd.payload.name).toBe("Peretz Chein");
    expect(cmd.lane).toBe("deterministic");
    expect(cmd.idempotencyKey).toMatch(/^custsync:J-1:\d+$/);
  });
});

describe("4. new job flow", () => {
  it("manual form creates an overlay job (_new, local- id, full status) + calendar_upsert when dated", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await user.click(screen.getByTestId("fab-add"));
    await user.click(screen.getByText("Enter manually"));
    await user.type(screen.getByLabelText("Customer name"), "Manual Man");
    await user.type(screen.getByLabelText("Job title / scope"), "Fan install");
    await user.type(screen.getByLabelText("Amount ($)"), "450");
    fireEvent.change(screen.getByLabelText("Scheduled date"), { target: { value: "2099-08-01" } });
    await user.click(screen.getByText("Create job"));

    await waitFor(() => {
      const key = Object.keys(srv.state.ov).find((k) => k.startsWith("local-"));
      expect(key).toBeTruthy();
      const ov = srv.state.ov[key];
      expect(ov._new).toBe(true);
      expect(ov.customer).toBe("Manual Man");
      expect(ov.amount).toBe("$450");
      expect(ov.paid).toBe(false);
      expect(ov.status.Lead.s).toBe("done");
      expect(ov.status.Scheduled).toEqual({ s: "done", d: "2099-08-01" });
      expect(Object.keys(ov.status)).toHaveLength(11); // full status object
    });
    await waitFor(() => expect(srv.enqueued("calendar_upsert")).toHaveLength(1));
    const cmd = srv.enqueued("calendar_upsert")[0];
    expect(cmd.idempotencyKey).toMatch(/^njcal:local-\d+$/);
    expect(cmd.payload.summary).toBe("Fan install — Manual Man");
    expect(cmd.payload.start).toBe("2099-08-01");
    // navigated straight into the new job
    expect(await screen.findByTestId("detail-pane")).toBeInTheDocument();
  });

  it("from-calendar picker prefills customer/phone/email/address/date/calEventId", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await user.click(screen.getByTestId("fab-add"));
    await user.click(screen.getByText("Choose from calendar"));
    await user.click(await screen.findByText("Estimate — Jane Doe"));
    expect(screen.getByLabelText("Job title / scope")).toHaveValue("Estimate — Jane Doe");
    expect(screen.getByLabelText("Phone")).toHaveValue("917-555-2222");
    expect(screen.getByLabelText("Email")).toHaveValue("jane@x.com");
    expect(screen.getByLabelText("Service address")).toHaveValue("55 Elm St");
    expect(screen.getByLabelText("Scheduled date")).toHaveValue("2099-07-08");
    await user.click(screen.getByText("Create job"));
    await waitFor(() => {
      const key = Object.keys(srv.state.ov).find((k) => k.startsWith("local-"));
      expect(srv.state.ov[key].calEventId).toBe("ev1"); // carried through
    });
    const cmd = srv.enqueued("calendar_upsert")[0];
    expect(cmd.payload.calEventId).toBe("ev1");
  });
});

describe("10. chat bubble", () => {
  it("panel opens with removable context chip; send posts chat op:msg + iterate", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await user.click(screen.getByTestId("chat-fab"));
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
    expect(screen.getByTestId("ctx-chip")).toHaveTextContent("[LE Pro / jobs view]");

    await user.type(screen.getByLabelText("Chat message"), "where is the check{Enter}");
    await waitFor(() => expect(srv.posts("chat", (b) => b.op === "msg")).toHaveLength(1));
    const post = srv.posts("chat", (b) => b.op === "msg")[0].body;
    expect(post.text).toBe("[LE Pro / jobs view] — where is the check");
    expect(post.convo).toMatch(/^pro-/);
    expect(post.id).toMatch(/^m\d+$/);
    const it2 = srv.posts("iterate")[0].body;
    expect(it2.message).toBe(post.text);
    expect(it2.source).toBe("pro-bubble:" + post.convo);
    // message + status render
    expect(await screen.findByText("where is the check", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Sent")).toBeInTheDocument();
  });

  it("context chip is removable and job context is used on detail pages", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    renderApp("#/job/J-1");
    await screen.findByTestId("detail-pane");
    await user.click(screen.getByTestId("chat-fab"));
    expect(screen.getByTestId("ctx-chip")).toHaveTextContent(/Regarding Job: Peretz Chein/);
    await user.click(screen.getByLabelText("Remove context"));
    expect(screen.queryByTestId("ctx-chip")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Chat message"), "no context please{Enter}");
    await waitFor(() => expect(srv.posts("chat", (b) => b.op === "msg")).toHaveLength(1));
    expect(srv.posts("chat", (b) => b.op === "msg")[0].body.text).toBe("no context please");
  });
});

describe("11. dev board", () => {
  const tasks = [
    { id: "t1", num: 1, title: "Sync chip", desc: "d1", status: "understood", understanding: "I get it", target: { sleek: true }, ts: 1 },
    { id: "t2", num: 2, title: "Chat fix", desc: "d2", status: "verify", report: "built & deployed", target: { pro: true }, ts: 2 },
    { id: "t3", num: 3, title: "", desc: "d3", status: "question", question: "which page?", priority: "High", ts: 3 },
  ];

  it("submits with priority + Build-for targets incl. pro", async () => {
    const srv = mockServer({ tasks: [] });
    const user = userEvent.setup();
    renderApp("#/dev");
    await screen.findByLabelText("Dev request description");
    await user.type(screen.getByLabelText("Dev request description"), "Add a dark mode");
    await user.selectOptions(screen.getByLabelText("Priority"), "High");
    await user.click(screen.getByRole("checkbox", { name: /Sleek/i }));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(srv.posts("devtasks", (b) => b.op === "add")).toHaveLength(1));
    const t = srv.posts("devtasks", (b) => b.op === "add")[0].body.task;
    expect(t).toMatchObject({
      title: "",
      desc: "Add a dark mode",
      priority: "High",
      category: "build",
      target: { sleek: true, beta: false, dashboard: false, pro: true }, // pro default-on
    });
    expect(Array.isArray(t.images)).toBe(true);
    // card shows up with "New" label after refresh
    expect(await screen.findByText("New")).toBeInTheDocument();
  });

  it("status labels, boxes, Approve (understood->approved), Verified (verify->done), Edit sheet", async () => {
    const srv = mockServer({ tasks: JSON.parse(JSON.stringify(tasks)) });
    const user = userEvent.setup();
    renderApp("#/dev");
    expect(await screen.findByText("Understood")).toBeInTheDocument();
    expect(screen.getByText("Testing")).toBeInTheDocument(); // verify label
    expect(screen.getByText("Question")).toBeInTheDocument();
    expect(screen.getByText("I get it")).toBeInTheDocument(); // understanding box
    expect(screen.getByText("which page?")).toBeInTheDocument(); // question box
    expect(screen.getByText("built & deployed")).toBeInTheDocument(); // report box
    expect(screen.getByText("(untitled — I'll name it when I pick it up)")).toBeInTheDocument();

    await user.click(screen.getByText("👍 Approve"));
    await waitFor(() =>
      expect(srv.posts("devtasks", (b) => b.op === "patch" && b.id === "t1" && b.patch.status === "approved")).toHaveLength(1)
    );
    await user.click(screen.getByText("✓ Verified"));
    await waitFor(() =>
      expect(srv.posts("devtasks", (b) => b.op === "patch" && b.id === "t2" && b.patch.status === "done")).toHaveLength(1)
    );
    // Edit is always available
    await user.click(screen.getAllByText("✏️ Edit")[0]);
    const title = await screen.findByLabelText("Task title");
    await user.clear(title);
    await user.type(title, "Renamed task");
    await user.click(screen.getByText("Save task"));
    await waitFor(() =>
      expect(srv.posts("devtasks", (b) => b.op === "patch" && b.patch.title === "Renamed task")).toHaveLength(1)
    );
  });

  it("draft (desc) survives leaving and re-entering the tab", async () => {
    mockServer({ tasks: [] });
    const user = userEvent.setup();
    renderApp("#/dev");
    await user.type(await screen.findByLabelText("Dev request description"), "half-written idea");
    await user.click(screen.getAllByText("Jobs")[0]); // away…
    await screen.findByLabelText("Search jobs");
    await user.click(screen.getAllByText("Dev")[0]); // …and back
    expect(await screen.findByLabelText("Dev request description")).toHaveValue("half-written idea");
    // clean up module draft for other tests
    await user.clear(screen.getByLabelText("Dev request description"));
  });
});

describe("12. sync chip + today view + jobs list", () => {
  it("sync chip shows QBO age and tap requests a fresh pull", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    const chips = screen.getAllByTestId("sync-chip");
    expect(chips[0]).toHaveTextContent(/QBO 5m ago/);
    await user.click(chips[0]);
    await waitFor(() => expect(srv.posts("jobsdata", (b) => b.op === "request")).toHaveLength(1));
  });

  it("today: totals row, follow-ups due, appointments with + Job prefill", async () => {
    mockServer({
      jobs: [JSON.parse(JSON.stringify(J1)), JSON.parse(JSON.stringify(J2))],
      ov: { "J-1": { followUp: { text: "Collect balance", date: "2020-01-01" } } },
    });
    const user = userEvent.setup();
    renderApp("#/today");
    expect(await screen.findByText("Open jobs")).toBeInTheDocument();
    expect(screen.getByText("Unpaid invoices")).toBeInTheDocument();
    expect(screen.getByText("Outstanding")).toBeInTheDocument();
    expect(screen.getAllByText("$2,300").length).toBeGreaterThan(0); // outstanding = J-1 only
    expect(screen.getByText(/Collect balance/)).toBeInTheDocument(); // due follow-up
    expect(screen.getByText("Estimate — Jane Doe")).toBeInTheDocument();
    await user.click(screen.getByText("+ Job"));
    expect(await screen.findByLabelText("Job title / scope")).toHaveValue("Estimate — Jane Doe");
  });

  it("jobs list: search, chips, grouping, quick actions", async () => {
    mockServer({
      ov: { "J-1": { clientGroup: "grpX" }, "J-2": { clientGroup: "grpX" } },
    });
    const user = userEvent.setup();
    renderApp("#/");
    // grouped into one client row (count · total · unpaid)
    expect(await screen.findByText(/2 jobs · \$2,800 · 2 unpaid/)).toBeInTheDocument();
    await user.click(screen.getByText(/2 jobs · \$2,800 · 2 unpaid/));
    expect(screen.getByText("Panel upgrade")).toBeInTheDocument();
    expect(screen.getByText("Outlet swap")).toBeInTheDocument();
    // quick actions present on cards
    expect(screen.getAllByText("💵 Paid?").length).toBeGreaterThan(0);
    expect(screen.getByText("📤 Invoice")).toBeInTheDocument(); // only J-1 has invoice
    // chips filter
    await user.click(screen.getByRole("button", { name: "Unpaid" }));
    expect(screen.getByText("Panel upgrade")).toBeInTheDocument();
    expect(screen.queryByText("Outlet swap")).not.toBeInTheDocument(); // no invoice
    // search
    await user.click(screen.getByRole("button", { name: "All" }));
    await user.type(screen.getByLabelText("Search jobs"), "outlet");
    expect(screen.queryByText("Panel upgrade")).not.toBeInTheDocument();
    expect(screen.getByText("Outlet swap")).toBeInTheDocument();
  });

  it("archive view restores archived jobs", async () => {
    const srv = mockServer({ ov: { "J-2": { _archived: true } } });
    const user = userEvent.setup();
    renderApp("#/archive");
    expect(await screen.findByText("Archived jobs (1)")).toBeInTheDocument();
    expect(screen.getByText("Second Guy")).toBeInTheDocument();
    await user.click(screen.getByText("Restore"));
    await waitFor(() => expect(srv.state.ov["J-2"]._archived).toBe(false));
  });
});

describe("responsive layout — 390px and 1280px", () => {
  const setWidth = (w) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
    window.dispatchEvent(new Event("resize"));
  };

  it("390px (phone): bottom nav + FAB + chat fab; sidebar is lg-only", async () => {
    mockServer();
    setWidth(390);
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    const nav = screen.getByTestId("bottom-nav");
    expect(nav).toBeInTheDocument();
    expect(nav.className).toContain("lg:hidden"); // phone-only element
    expect(nav.className).toContain("fixed");
    expect(nav.className).toContain("bottom-0");
    expect(screen.getByTestId("fab-add")).toBeInTheDocument();
    expect(screen.getByTestId("chat-fab")).toBeInTheDocument();
    const sidebar = screen.getByTestId("sidebar");
    expect(sidebar.className).toContain("hidden"); // hidden on phone…
    expect(sidebar.className).toContain("lg:flex"); // …sidebar on desktop
    // all four tabs present in the bottom nav
    ["Jobs", "Today", "Dev", "Archive"].forEach((t) => expect(within(nav).getByText(t)).toBeInTheDocument());
  });

  it("1280px (desktop): sidebar nav with sync chip; detail becomes two-pane", async () => {
    mockServer();
    setWidth(1280);
    renderApp("#/job/J-1");
    await screen.findByTestId("detail-pane");
    const sidebar = screen.getByTestId("sidebar");
    ["Jobs", "Today", "Dev", "Archive"].forEach((t) => expect(within(sidebar).getByText(t)).toBeInTheDocument());
    expect(within(sidebar).getByTestId("sync-chip")).toBeInTheDocument();
    const listPane = screen.getByTestId("list-pane");
    expect(listPane.className).toContain("lg:block"); // job list beside detail
    expect(within(listPane).getByLabelText("Search jobs")).toBeInTheDocument();
    // sheets center on desktop
    const user = userEvent.setup();
    await user.click(within(screen.getByTestId("detail-pane")).getByText("💵 Mark as paid…"));
    const dlg = screen.getByRole("dialog");
    expect(dlg.className).toContain("lg:items-center");
  });

  it("savebar sits above the bottom nav on phone and clears the sidebar on desktop", async () => {
    mockServer();
    const user = userEvent.setup();
    renderApp("#/job/J-1");
    const pane = await screen.findByTestId("detail-pane");
    await user.type(within(pane).getByLabelText("Notes"), "x");
    const savebar = screen.getByTestId("savebar");
    expect(savebar.className).toContain("bottom-16"); // above phone tab bar
    expect(savebar.className).toContain("lg:left-60"); // clears the 240px sidebar
  });
});
