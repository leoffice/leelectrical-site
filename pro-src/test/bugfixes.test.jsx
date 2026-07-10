// @vitest-environment jsdom
// Integration — the three reported bugs: duplicate customers in the Jobs
// list (grouping), the "Same customer?" combine prompt, and the Dispatch
// chat panel (reply rendering, optimistic send, retry, hint).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { groupSub, mockServer, renderApp } from "./helpers.jsx";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

const job = (id, customer, title, amount, extra = {}) => ({
  id,
  customer,
  title,
  amount,
  paid: false,
  status: {},
  ...extra,
});

describe("bug 1 — duplicate customers collapse into ONE group row", () => {
  it("name variants (case/trailing space) share a row; zero standalone cards; expand shows 2", async () => {
    mockServer({
      jobs: [
        job("K-1", "Meir Kabakov", "Panel swap", "$1,000"),
        job("K-2", "meir kabakov ", "EV charger", "$900"),
        job("O-1", "Other Person", "Outlet fix", "$100"),
      ],
    });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Other Person"); // list loaded

    // exactly ONE group row, and it's Kabakov's (name + count + total + unpaid)
    const rows = screen.getAllByTestId("client-group");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("Meir Kabakov")).toBeInTheDocument();
    expect(within(rows[0]).getByTestId("client-group-meta")).toHaveTextContent(/2 jobs/);
    expect(within(rows[0]).getByTestId("client-group-amount")).toHaveTextContent("$1,900");

    // zero standalone Kabakov cards — the name renders exactly once (the row)
    expect(screen.getAllByText(/meir kabakov/i)).toHaveLength(1);
    expect(screen.queryByText("Panel swap")).not.toBeInTheDocument();

    // expanding shows both job cards, no third copy anywhere
    await user.click(within(rows[0]).getByTestId("client-group-toggle"));
    expect(screen.getByText("Panel swap")).toBeInTheDocument();
    expect(screen.getByText("EV charger")).toBeInTheDocument();
  });

  it("clientGroup jobs + same-name loose jobs fold into one row (no double listing)", async () => {
    mockServer({
      jobs: [
        job("A-1", "Meir Kabakov", "T1", "$100"),
        job("A-2", "Meir Kabakov", "T2", "$200"),
        job("A-3", "Meir Kabakov.", "T3", "$300"), // no clientGroup, punctuation variant
      ],
      ov: { "A-1": { clientGroup: "grpZ" }, "A-2": { clientGroup: "grpZ" } },
    });
    renderApp("#/");
    const row = await screen.findByTestId("client-group");
    expect(screen.getAllByTestId("client-group")).toHaveLength(1);
    expect(within(row).getByTestId("client-group-meta")).toHaveTextContent(/3 jobs/);
    expect(within(row).getByTestId("client-group-amount")).toHaveTextContent("$600");
    // no job card escaped the group
    ["T1", "T2", "T3"].forEach((t) => expect(screen.queryByText(t)).not.toBeInTheDocument());
  });

  it("expanded group auto-collapses after ~10s idle", async () => {
    mockServer({
      jobs: [job("K-1", "Meir Kabakov", "Panel swap", "$1,000"), job("K-2", "meir kabakov", "EV charger", "$900")],
    });
    renderApp("#/");
    const row = await screen.findByTestId("client-group"); // load with real timers
    vi.useFakeTimers();
    fireEvent.click(within(row).getByTestId("client-group-toggle"));
    expect(screen.getByText("Panel swap")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(10_500);
    });
    expect(screen.queryByText("Panel swap")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe("parent customer cards — tap anywhere to show subs", () => {
  const parentJobs = () => [
    job("P-1", "LLC Alpha", "Job A", "$400", {
      parentQboCustomerId: "100",
      parentCustomerName: "Mgmt Holdings",
      qboCustomerId: "201",
    }),
    job("P-2", "LLC Beta", "Job B", "$600", {
      parentQboCustomerId: "100",
      parentCustomerName: "Mgmt Holdings",
      qboCustomerId: "202",
    }),
  ];

  it("tapping anywhere on the parent card expands sub-companies", async () => {
    mockServer({ jobs: parentJobs() });
    const user = userEvent.setup();
    renderApp("#/");
    const card = await screen.findByTestId("parent-group-card");
    expect(screen.queryByTestId("parent-sub-list")).not.toBeInTheDocument();

    await user.click(card);
    const subs = screen.getByTestId("parent-sub-list");
    expect(within(subs).getByText("LLC Alpha")).toBeInTheDocument();
    expect(within(subs).getByText("LLC Beta")).toBeInTheDocument();
  });

  it("expanded parent subs auto-collapse after ~30s idle", async () => {
    mockServer({ jobs: parentJobs() });
    renderApp("#/");
    const card = await screen.findByTestId("parent-group-card");
    vi.useFakeTimers();
    fireEvent.click(card);
    expect(screen.getByText("LLC Alpha")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(29_500);
    });
    expect(screen.getByText("LLC Alpha")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1_500);
    });
    expect(screen.queryByTestId("parent-sub-list")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("second tap on expanded parent opens parent customer view with sub companies", async () => {
    mockServer({ jobs: parentJobs() });
    const user = userEvent.setup();
    renderApp("#/");
    const card = await screen.findByTestId("parent-group-card");
    await user.click(card);
    expect(screen.getByTestId("parent-sub-list")).toBeInTheDocument();
    await user.click(card);
    const view = await screen.findByTestId("customer-view");
    expect(view).toBeInTheDocument();
    const subs = within(view).getByTestId("customer-sub-companies");
    expect(within(subs).getByText("LLC Alpha")).toBeInTheDocument();
    expect(within(subs).getByText("LLC Beta")).toBeInTheDocument();
    expect(within(view).queryByTestId("customer-jobs-section")).not.toBeInTheDocument();
  });

  it("desktop sidebar list expands parent sub-companies like mobile", async () => {
    mockServer({ jobs: parentJobs() });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    window.dispatchEvent(new Event("resize"));
    const user = userEvent.setup();
    renderApp("#/job/P-1");
    const listPane = await screen.findByTestId("list-pane");
    const card = within(listPane).getByTestId("parent-group-card");
    expect(within(listPane).queryByTestId("parent-sub-list")).not.toBeInTheDocument();

    await user.click(card);
    const subs = within(listPane).getByTestId("parent-sub-list");
    expect(within(subs).getByText("LLC Alpha")).toBeInTheDocument();
    expect(within(subs).getByText("LLC Beta")).toBeInTheDocument();
  });

  it("parent with direct jobs does not appear twice on the customer list", async () => {
    mockServer({
      jobs: [
        ...parentJobs(),
        job("P-3", "Mgmt Holdings", "Direct parent job", "$250", {
          qboCustomerId: "100",
          businessName: "Mgmt Holdings",
        }),
      ],
    });
    renderApp("#/");
    await screen.findByTestId("parent-group-card");
    const names = screen.getAllByTestId("client-group-name").map((el) => el.textContent);
    expect(names.filter((n) => n === "Mgmt Holdings")).toHaveLength(1);
  });
});

describe("bug 2 — near-duplicate combine prompt", () => {
  const koptivs = () => [
    job("AK-1", "Arthur koptiv", "Meter bank", "$100"),
    job("AK-2", "Arthur Koptive", "Riser repair", "$200"),
  ];

  it("Combine sets one shared clientGroup on all their jobs (saved via adapter) and groups them", async () => {
    const srv = mockServer({ jobs: koptivs() });
    const user = userEvent.setup();
    renderApp("#/");
    const prompt = await screen.findByTestId("merge-prompt");
    expect(screen.getByText("Same customer?")).toBeInTheDocument();
    expect(prompt).toHaveTextContent(/look like the same person/);
    expect(within(prompt).getByTestId("merge-compare-btn")).toBeInTheDocument();
    expect(within(prompt).getByTestId("merge-separate-btn")).toBeInTheDocument();
    expect(within(prompt).getByTestId("merge-contact-compare")).toBeInTheDocument();

    await user.click(within(prompt).getByTestId("merge-combine-btn"));
    await waitFor(() => {
      expect(srv.state.ov["AK-1"]?.clientGroup).toBeTruthy();
      expect(srv.state.ov["AK-2"]?.clientGroup).toBe(srv.state.ov["AK-1"].clientGroup);
    });
    // prompt gone, list now shows one combined client row
    await waitFor(() => expect(screen.queryByTestId("merge-prompt")).not.toBeInTheDocument());
    expect(screen.getByTestId("client-group")).toBeInTheDocument();
    const grp = screen.getByTestId("client-group");
    expect(within(grp).getByTestId("client-group-meta")).toHaveTextContent(/2 jobs/);
    expect(within(grp).getByTestId("client-group-amount")).toHaveTextContent("$300");
  });

  it("'Ask me later' hides until next login (session snooze), then re-asks", async () => {
    mockServer({ jobs: koptivs() });
    const user = userEvent.setup();
    const first = renderApp("#/");
    const prompt = await screen.findByTestId("merge-prompt");
    await user.click(within(prompt).getByTestId("merge-ask-later-btn"));
    expect(screen.queryByTestId("merge-prompt")).not.toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem("lepro_merge_snooze"))).toEqual(["arthur koptiv|arthur koptive"]);
    expect(localStorage.getItem("lepro_nomerge")).toBeNull();

    // same session remount — still snoozed
    first.unmount();
    renderApp("#/");
    await screen.findByText("Meter bank");
    expect(screen.queryByTestId("merge-prompt")).not.toBeInTheDocument();

    // fresh login (session cleared) — prompt returns
    sessionStorage.clear();
    renderApp("#/");
    expect(await screen.findByTestId("merge-prompt")).toBeInTheDocument();
  });

  it("'Separate customers' dismisses permanently (lepro_nomerge) — never re-asks", async () => {
    mockServer({ jobs: koptivs() });
    const user = userEvent.setup();
    const first = renderApp("#/");
    const prompt = await screen.findByTestId("merge-prompt");
    await user.click(within(prompt).getByTestId("merge-separate-btn"));
    expect(screen.queryByTestId("merge-prompt")).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("lepro_nomerge"))).toEqual(["arthur koptiv|arthur koptive"]);

    // fresh mount (new visit) — dismissal persisted, no prompt
    first.unmount();
    renderApp("#/");
    await screen.findByText("Meter bank");
    expect(screen.queryByTestId("merge-prompt")).not.toBeInTheDocument();
  });

  it("no prompt for unrelated names", async () => {
    mockServer(); // Peretz Chein + Second Guy
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    expect(screen.queryByTestId("merge-prompt")).not.toBeInTheDocument();
  });

  it("Compare opens side-by-side profiles with contact info and jobs", async () => {
    mockServer({
      jobs: [
        job("AK-1", "Arthur koptiv", "Meter bank", "$100", {
          phone: "718-111-2222",
          email: "a@koptiv.com",
          billingAddress: "10 Main St",
          serviceAddress: "20 Oak Ave",
        }),
        job("AK-2", "Arthur Koptive", "Riser repair", "$200", {
          phone: "718-999-8888",
          email: "arthur@other.com",
          billingAddress: "99 Pine Rd",
          serviceAddress: "55 Elm St",
        }),
      ],
    });
    const user = userEvent.setup();
    renderApp("#/");
    const prompt = await screen.findByTestId("merge-prompt");
    await user.click(within(prompt).getByTestId("merge-compare-btn"));

    const compare = await screen.findByTestId("merge-compare");
    expect(compare).toBeInTheDocument();
    const left = within(compare).getByTestId("merge-compare-col-left");
    const right = within(compare).getByTestId("merge-compare-col-right");
    expect(within(left).getAllByText("Arthur koptiv").length).toBeGreaterThan(0);
    expect(within(left).getByText(/718-111-2222/)).toBeInTheDocument();
    expect(within(left).getByText(/Meter bank/)).toBeInTheDocument();
    expect(within(right).getAllByText("Arthur Koptive").length).toBeGreaterThan(0);
    expect(within(right).getByText(/55 Elm St/)).toBeInTheDocument();
    expect(screen.getByTestId("merge-compare-separate")).toBeInTheDocument();
  });

  it("Sub company tab links sub jobs to parent and queues QuickBooks sync", async () => {
    const srv = mockServer({
      jobs: [
        job("AK-1", "Mgmt Holdings", "Corp job", "$100", {
          qboCustomerId: "100",
          phone: "718-111-2222",
        }),
        job("AK-2", "Mgmt Holdngs", "LLC job", "$200", {
          qboCustomerId: "201",
          phone: "718-111-2222",
        }),
      ],
    });
    const user = userEvent.setup();
    renderApp("#/");
    const prompt = await screen.findByTestId("merge-prompt");
    await user.click(within(prompt).getByTestId("merge-tab-sub"));
    expect(within(prompt).getByTestId("merge-contact-compare-col-left")).toHaveTextContent(/Parent company/);

    await user.click(within(prompt).getByTestId("merge-contact-compare-col-right"));
    expect(within(prompt).getByTestId("merge-contact-compare-col-right")).toHaveTextContent(/Parent company/);
    expect(within(prompt).getByTestId("merge-contact-compare-col-left")).toHaveTextContent(/Sub company/);

    await user.click(within(prompt).getByTestId("merge-sub-save-btn"));
    await waitFor(() => {
      expect(srv.state.ov["AK-2"]?.parentQboCustomerId).toBeFalsy();
      expect(srv.state.ov["AK-1"]?.parentQboCustomerId).toBe("201");
      expect(srv.state.ov["AK-1"]?.parentCustomerName).toMatch(/Mgmt Holdngs/i);
    });
    await waitFor(() => expect(screen.queryByTestId("merge-prompt")).not.toBeInTheDocument());
    expect(srv.enqueued("update_customer").some((c) => c.jobId === "AK-1")).toBe(true);
  });

  it("tapping parent column again swaps parent/sub roles", async () => {
    mockServer({ jobs: koptivs() });
    const user = userEvent.setup();
    renderApp("#/");
    const prompt = await screen.findByTestId("merge-prompt");
    await user.click(within(prompt).getByTestId("merge-tab-sub"));

    const left = within(prompt).getByTestId("merge-contact-compare-col-left");
    expect(left).toHaveTextContent(/Parent company/);
    await user.click(left);
    expect(left).toHaveTextContent(/Sub company/);
    await user.click(left);
    expect(left).toHaveTextContent(/Parent company/);
  });
});

describe("invoice dedupe prompt", () => {
  it("Remove duplicate deletes the weaker job row", async () => {
    const srv = mockServer({
      jobs: [
        job("J-1", "Arthur koptiv", "Meter bank", "$100", { invoiceNo: "251808" }),
        job("J-2", "Arthur koptiv", "Meter bank copy", "$100", {
          invoiceNo: "251808",
          qboCustomerId: "99",
        }),
      ],
    });
    const user = userEvent.setup();
    renderApp("#/");
    const prompt = await screen.findByTestId("invoice-dedup-prompt");
    expect(prompt).toHaveTextContent("Duplicate invoice #251808");
    expect(within(prompt).getByTestId("invoice-dedup-compare")).toBeInTheDocument();
    expect(within(prompt).getByTestId("invoice-dedup-separate")).toBeInTheDocument();
    await user.click(within(prompt).getByTestId("invoice-dedup-merge"));
    await waitFor(() => expect(srv.state.ov["J-1"]?._deleted).toBe(true));
    await waitFor(() => expect(screen.queryByTestId("invoice-dedup-prompt")).not.toBeInTheDocument());
  });
});

describe("bug 3 — Dispatch chat panel", () => {
  it("replies (who:'claude') render as Dispatch bubbles, own as 'me'; hint hides once Dispatch spoke", async () => {
    mockServer({
      messages: [
        { id: "m1", who: "you", text: "hello there", status: "Sent" },
        { id: "r1", who: "claude", text: "On it — checking now", status: "" },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await user.click(screen.getByTestId("chat-fab"));

    const reply = await screen.findByText("On it — checking now");
    expect(reply).toHaveTextContent("Israel"); // labeled as the other side
    expect(reply.className).toContain("bg-slate-100"); // left/them styling
    expect(reply.className).not.toContain("ml-auto");

    const mine = screen.getByText("hello there");
    expect(mine.className).toContain("ml-auto"); // right/me styling
    expect(mine).toHaveTextContent("Sent");

    expect(screen.queryByTestId("chat-hint")).not.toBeInTheDocument();
  });

  it("shows the 'usually replies' hint while Dispatch hasn't answered yet", async () => {
    mockServer({ messages: [{ id: "m1", who: "you", text: "anyone home?", status: "Sent" }] });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await user.click(screen.getByTestId("chat-fab"));
    await screen.findByText("anyone home?");
    expect(screen.getByTestId("chat-hint")).toHaveTextContent(
      "Israel shares the same brain as @LE_Israel_bot"
    );
  });

  it("optimistic render; failed send retries once then surfaces toast + 'Not sent'", async () => {
    const srv = mockServer({ failChatPosts: 2 }); // original + retry both fail
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await user.click(screen.getByTestId("chat-fab"));
    await user.type(screen.getByLabelText("Chat message"), "are you there{Enter}");

    expect(await screen.findByText(/are you there/)).toBeInTheDocument(); // optimistic
    await waitFor(() => expect(srv.posts("chat", (b) => b.op === "msg")).toHaveLength(2)); // 1 retry
    expect(await screen.findByTestId("toast")).toHaveTextContent(/Send failed/);
    expect(await screen.findByText("Not sent")).toBeInTheDocument();
    expect(srv.posts("iterate")).toHaveLength(0); // no nudge for an unsent message
  });

  it("retry succeeds when only the first POST fails — message persists + iterate fires", async () => {
    const srv = mockServer({ failChatPosts: 1 });
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByText("Peretz Chein");
    await user.click(screen.getByTestId("chat-fab"));
    await user.type(screen.getByLabelText("Chat message"), "second try works{Enter}");

    await waitFor(() => expect(srv.posts("chat", (b) => b.op === "msg")).toHaveLength(2));
    await waitFor(() => expect(srv.state.messages).toHaveLength(1)); // round-trip stored
    expect(srv.state.messages[0].who).toBe("you");
    await waitFor(() => expect(srv.posts("iterate")).toHaveLength(1));
    expect(screen.getByText(/second try works/)).toBeInTheDocument();
    expect(screen.queryByText("Not sent")).not.toBeInTheDocument();
  });
});
