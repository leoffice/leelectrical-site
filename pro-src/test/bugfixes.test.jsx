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
    expect(prompt).toHaveTextContent("Same customer?");
    expect(prompt).toHaveTextContent(/Combine “Arthur koptiv” and “Arthur Koptive” — their jobs will group together/);

    await user.click(within(prompt).getByText("Combine"));
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

  it("'Not the same' dismisses permanently (lepro_nomerge) — never re-asks", async () => {
    mockServer({ jobs: koptivs() });
    const user = userEvent.setup();
    const first = renderApp("#/");
    const prompt = await screen.findByTestId("merge-prompt");
    await user.click(within(prompt).getByText("Not the same"));
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
    expect(reply).toHaveTextContent("Dispatch"); // labeled as the other side
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
      "Dispatch usually replies within a couple of minutes"
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
