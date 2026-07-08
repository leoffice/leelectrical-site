// @vitest-environment jsdom
// Integration — job detail features (checklist 1,2,3,5,6,7,8,9,13) against
// the real <App/> + store with a mocked Netlify-functions server.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";
import { todayStr } from "../src/lib/format.js";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

const openDetail = async () => {
  renderApp("#/job/J-1");
  const pane = await screen.findByTestId("detail-pane");
  await within(pane).findByText("Peretz Chein");
  return pane;
};

describe("1. mark-as-paid sheet -> staged -> record_payment on Save", () => {
  it("prefills amount, stages paid+payment+statuses, enqueues deterministic record_payment", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    const pane = await openDetail();

    await user.click(within(pane).getByText("💵 Record payment…"));
    const amt = screen.getByLabelText("Amount");
    expect(amt).toHaveValue("2300"); // prefilled, $/commas stripped
    await user.selectOptions(screen.getByLabelText("Payment method"), "Zelle");
    // method dropdown carries the exact list
    expect(
      within(screen.getByLabelText("Payment method")).getAllByRole("option").map((o) => o.textContent)
    ).toEqual(["— choose —", "Cash", "Wells Fargo", "Martin Dorkin", "Zelle", "Barder", "Other"]);
    await user.click(screen.getByText("✓ Record payment"));

    // staged, not sent: savebar appears, no command yet
    expect(await screen.findByTestId("savebar")).toBeInTheDocument();
    expect(srv.enqueued("record_payment")).toHaveLength(0);

    await user.click(screen.getByText("Save & sync"));
    await waitFor(() => expect(srv.enqueued("record_payment")).toHaveLength(1));
    const cmd = srv.enqueued("record_payment")[0];
    expect(cmd.lane).toBe("deterministic");
    expect(cmd.idempotencyKey).toMatch(/^record_payment:J-1:251841:/);
    expect(cmd.payload).toMatchObject({ invoiceNo: "251841", amount: "2300", method: "Zelle" });
    // overlay got paid + payment + Paid/Follow-up statuses
    const ov = srv.state.ov["J-1"];
    expect(ov.paid).toBe(true);
    expect(ov.payment.method).toBe("Zelle");
    expect(ov.status.Paid.s).toBe("done");
    expect(ov.status["Follow-up"].s).toBe("done");
    expect(ov.payments).toHaveLength(1);
  });

  it("partial payment keeps open balance and does not mark Paid done", async () => {
    const srv = mockServer({
      jobs: [
        {
          id: "J-partial",
          customer: "Golan Chakov",
          amount: "$11,000",
          invoiceNo: "231315",
          paid: false,
          notes: "Open balance $11,000.00",
        },
      ],
    });
    const user = userEvent.setup();
    renderApp("#/job/J-partial");
    const pane = await screen.findByTestId("detail-pane");
    await user.click(within(pane).getByText("💵 Record payment…"));
    const amt = screen.getByLabelText("Amount");
    await user.clear(amt);
    await user.type(amt, "1000");
    await user.selectOptions(screen.getByLabelText("Payment method"), "Zelle");
    await user.click(screen.getByText("✓ Record payment"));
    await user.click(await screen.findByText("Save & sync"));
    await waitFor(() => expect(screen.queryByTestId("savebar")).not.toBeInTheDocument());
    const ov = srv.state.ov["J-partial"];
    expect(ov.paid).toBe(false);
    expect(ov.openBalance).toBe(10000);
    expect(ov.payments).toHaveLength(1);
    expect(ov.payments[0].amount).toBe("1000");
    expect(ov.status.Paid.s).toBe("");
    expect(srv.enqueued("record_payment")[0].payload.amount).toBe("1000");
  });
});

describe("2. quick views — invoice/estimate/calendar sheets", () => {
  it("invoice sheet: open-in-QuickBooks + send -> send_invoice deterministic + history log", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    const openSpy = vi.fn();
    vi.stubGlobal("open", openSpy);
    const pane = await openDetail();

    await user.click(within(pane).getByText(/Invoice 251841/));
    expect(screen.getByText("Open in QuickBooks")).toBeInTheDocument();
    await user.click(screen.getByText("Send to p@x.com"));
    await waitFor(() => expect(srv.enqueued("send_invoice")).toHaveLength(1));
    const cmd = srv.enqueued("send_invoice")[0];
    expect(cmd.lane).toBe("deterministic");
    expect(cmd.idempotencyKey).toBe("send_invoice:251841");
    expect(cmd.payload).toEqual({ email: "p@x.com", invoiceNo: "251841" });
    // invoiceHistory logged (staged) -> Send history card shows it
    expect(await within(pane).findByText("Invoice #251841 send queued")).toBeInTheDocument();
  });

  it("estimate sheet enqueues send_estimate; calendar sheet links Google Calendar", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    const pane = await openDetail();

    await user.click(within(pane).getByText(/Estimate E-9/));
    await user.click(screen.getByText("Send to p@x.com"));
    await waitFor(() => expect(srv.enqueued("send_estimate")).toHaveLength(1));
    expect(srv.enqueued("send_estimate")[0].idempotencyKey).toBe("send_estimate:E-9");
    expect(srv.enqueued("send_estimate")[0].payload).toEqual({ email: "p@x.com", estimateNo: "E-9" });

    await user.click(within(pane).getByText("📅 Calendar"));
    expect(screen.getByText("Open Google Calendar")).toBeInTheDocument();
    expect(screen.getByText("Create appointment")).toBeInTheDocument();
    expect(screen.getByText(/No date set yet/)).toBeInTheDocument(); // no Scheduled date on J-1

    await user.click(screen.getByText("Create appointment"));
    expect(screen.getByLabelText("Appointment title")).toHaveValue("Panel upgrade — Peretz Chein");
    fireEvent.change(screen.getByLabelText("Appointment date and time"), { target: { value: "2026-08-15T14:00" } });
    await user.click(screen.getByText("Save & sync to calendar"));
    await waitFor(() => expect(srv.enqueued("calendar_upsert")).toHaveLength(1));
    const cal = srv.enqueued("calendar_upsert")[0];
    expect(cal.jobId).toBe("J-1");
    expect(cal.payload.summary).toBe("Panel upgrade — Peretz Chein");
    expect(cal.payload.start).toBe("2026-08-15T14:00");
    expect(cal.payload.description).toContain("leJobId:J-1");
    await waitFor(() => expect(srv.state.ov["J-1"]?.status?.Scheduled?.d).toBe("2026-08-15"));
  });
});

describe("3. customer edit + sync to QuickBooks", () => {
  it("stages name/phone/email/address edits; ⇄ Sync enqueues customer_sync deterministic", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    const pane = await openDetail();

    await user.click(within(pane).getByText("✏️ Edit info"));
    const name = screen.getByLabelText("Business name");
    await user.clear(name);
    await user.type(name, "Peretz B. Chein");
    await user.click(screen.getByText("Apply"));
    expect(await within(pane).findByText("Peretz B. Chein")).toBeInTheDocument();
    expect(screen.getByTestId("savebar")).toBeInTheDocument(); // staged only

    await user.click(within(pane).getByText("⇄ Sync to QuickBooks"));
    await waitFor(() => expect(srv.enqueued("customer_sync")).toHaveLength(1));
    const cmd = srv.enqueued("customer_sync")[0];
    expect(cmd.lane).toBe("deterministic");
    expect(cmd.idempotencyKey).toMatch(/^custsync:J-1:\d+$/);
    expect(cmd.payload).toEqual({
      name: "Peretz B. Chein",
      businessName: "Peretz B. Chein",
      personName: "",
      email: "p@x.com",
      phone: "718-555-1111",
      billingAddr: "405 Lefferts Ave",
      addr: "405 Lefferts Ave",
    });
  });
});

describe("5. job menu — archive / combine / delete", () => {
  it("archive flags _archived and returns to jobs", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    const pane = await openDetail();
    await user.click(within(pane).getByLabelText("More"));
    await user.click(screen.getByText("Archive job"));
    await waitFor(() => expect(srv.state.ov["J-1"]._archived).toBe(true));
    await screen.findByLabelText("Search jobs"); // navigated home
  });

  it("combine groups both jobs under one clientGroup", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    const pane = await openDetail();
    await user.click(within(pane).getByLabelText("More"));
    await user.click(screen.getByText("Combine with another customer"));
    const dlg = await screen.findByRole("dialog");
    await user.click(within(dlg).getByText("Second Guy"));
    await waitFor(() => {
      expect(srv.state.ov["J-1"].clientGroup).toMatch(/^grp\d+$/);
      expect(srv.state.ov["J-2"].clientGroup).toBe(srv.state.ov["J-1"].clientGroup);
    });
  });

  it("delete asks to confirm, then flags _deleted (never touches QBO)", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    const pane = await openDetail();
    await user.click(within(pane).getByLabelText("More"));
    await user.click(screen.getByText("Delete from dashboard"));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(srv.state.ov["J-1"]._deleted).toBe(true));
    expect(srv.enqueued()).toHaveLength(0); // no QBO command
  });
});

describe("6. progress — steps, paperwork branches, scheduled date", () => {
  it("tap step -> Complete/Skip/Undo (staged)", async () => {
    mockServer();
    const user = userEvent.setup();
    const pane = await openDetail();
    // Sales phase is auto-open (current stage = Site Visit)
    await user.click(within(pane).getByRole("button", { name: "Site Visit" }));
    await user.click(within(pane).getByText("✓ Complete"));
    expect(screen.getByTestId("savebar")).toBeInTheDocument();
    // Lead is done -> Undo offered
    await user.click(within(pane).getByRole("button", { name: /Lead/ }));
    expect(within(pane).getByText("↩ Undo")).toBeInTheDocument();
    await user.click(within(pane).getByText("↩ Undo"));
  });

  it("Con Edison / DOB branches with exact sub-steps; inspection -> calendar_upsert", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    const pane = await openDetail();

    await user.click(within(pane).getByRole("button", { name: /📑/ })); // Paperwork phase
    await user.click(within(pane).getByRole("switch", { name: "🔌 Con Ed paperwork" }));
    expect(within(pane).getByText("POE scheduled")).toBeInTheDocument();
    expect(within(pane).getByText("Meter installation date")).toBeInTheDocument();
    // jobs.html DATE_STEPS: only these two sub-steps carry a date input
    expect(screen.getByLabelText("Meter installation date date")).toBeInTheDocument();
    expect(screen.queryByLabelText("POE scheduled date")).toBeNull();

    await user.click(within(pane).getByRole("switch", { name: "🏙️ DOB / City permit" }));
    expect(within(pane).getByText("Permit issued")).toBeInTheDocument();
    // DOB list matches jobs.html: no "Application submitted" in the DOB branch
    expect(within(pane).getAllByText("Application submitted")).toHaveLength(1); // Con Ed only
    await user.click(within(pane).getByRole("switch", { name: "Inspection scheduled" }));
    // toggling on prompts for date+time
    const dtIn = await screen.findByLabelText("Inspection date and time");
    fireEvent.change(dtIn, { target: { value: "2099-07-10T09:00" } });
    await user.click(screen.getByText("Add to customer's calendar"));
    await waitFor(() => expect(srv.enqueued("calendar_upsert")).toHaveLength(1));
    const cmd = srv.enqueued("calendar_upsert")[0];
    expect(cmd.lane).toBe("judgment");
    expect(cmd.idempotencyKey).toBe("insp:J-1:2099-07-10T09:00");
    expect(cmd.payload.summary).toBe("Inspection — Peretz Chein");
    expect(cmd.payload.start).toBe("2099-07-10T09:00");
  });

  it("Scheduled step's job-date input stages the date and enqueues calendar_upsert", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    const pane = await openDetail();
    await user.click(within(pane).getByRole("button", { name: /⚡/ })); // Job phase
    fireEvent.change(within(pane).getByLabelText("Job date"), { target: { value: "2099-07-20" } });
    await waitFor(() => expect(srv.enqueued("calendar_upsert")).toHaveLength(1));
    const cmd = srv.enqueued("calendar_upsert")[0];
    expect(cmd.idempotencyKey).toBe("sched:J-1:2099-07-20");
    expect(cmd.lane).toBe("judgment");
    expect(cmd.payload.summary).toBe("Panel upgrade — Peretz Chein");
    expect(screen.getByTestId("savebar")).toBeInTheDocument(); // status staged
  });
});

describe("7. follow-up card + payment reminder + notes", () => {
  it("type dropdown has the exact list; edits stage; reminder -> send_reminder judgment", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    const pane = await openDetail();

    const sel = within(pane).getByLabelText("Follow-up type");
    expect(within(sel).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "— none —", "Acceptance", "Payment / collect", "Schedule the job",
      "Paperwork / permits", "Con Edison case", "Final inspection", "Other",
    ]);
    await user.selectOptions(sel, "Payment / collect");
    fireEvent.change(within(pane).getByLabelText("Follow-up date"), { target: { value: "2099-01-05" } });
    await user.click(within(pane).getByRole("checkbox")); // Telegram remind
    await user.type(within(pane).getByLabelText("Notes"), "gate code 4321");
    expect(screen.getByTestId("savebar")).toBeInTheDocument();

    await user.click(within(pane).getByText("🔔 Send customer a payment reminder…"));
    const msg = screen.getByLabelText("Reminder message");
    expect(msg.value).toContain("Hi Peretz");
    expect(msg.value).toContain("#251841");
    await user.click(screen.getByText("🔔 Send via Dispatch"));
    await waitFor(() => expect(srv.enqueued("send_reminder")).toHaveLength(1));
    const cmd = srv.enqueued("send_reminder")[0];
    expect(cmd.lane).toBe("judgment");
    expect(cmd.idempotencyKey).toBe("rem:J-1:" + todayStr());
    expect(cmd.payload.email).toBe("p@x.com");
    expect(cmd.payload.invoiceNo).toBe("251841");
    expect(cmd.payload.message).toContain("Hi Peretz");
    // reminder also logged to history
    expect(await within(pane).findByText("Payment reminder queued")).toBeInTheDocument();
  });
});

describe("8. attachments", () => {
  it("lists with links + remove; add with url+invoice -> attach_to_invoice deterministic", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    const pane = await openDetail();

    expect(within(pane).getByText("Old photo")).toHaveAttribute("href", "https://x/1");
    await user.click(within(pane).getByText("＋ Add attachment"));
    await user.type(screen.getByLabelText("Attachment name"), "Panel photo");
    await user.type(screen.getByLabelText("Attachment link"), "https://x/2");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(srv.enqueued("attach_to_invoice")).toHaveLength(1));
    const cmd = srv.enqueued("attach_to_invoice")[0];
    expect(cmd.lane).toBe("deterministic");
    expect(cmd.idempotencyKey).toBe("att:J-1:Panel photo");
    expect(cmd.payload).toEqual({ invoiceNo: "251841", name: "Panel photo", url: "https://x/2" });
    expect(await within(pane).findByText("Panel photo")).toBeInTheDocument();

    await user.click(within(pane).getByLabelText("Remove Old photo"));
    await waitFor(() => expect(within(pane).queryByText("Old photo")).not.toBeInTheDocument());
  });
});

describe("9. activity feed", () => {
  it("shows command statuses and retries failed commands (op:update -> queued)", async () => {
    const srv = mockServer({
      commands: [
        { id: "f1", type: "send_invoice", jobId: "J-1", status: "failed", error: "SMTP boom", createdAt: 2, idempotencyKey: "k1" },
        { id: "q1", type: "record_payment", jobId: "J-1", status: "done", createdAt: 3, idempotencyKey: "k2" },
      ],
    });
    const user = userEvent.setup();
    const pane = await openDetail();
    expect(await within(pane).findByText("failed")).toBeInTheDocument();
    expect(within(pane).getByText("done")).toBeInTheDocument();
    expect(within(pane).getByText(/SMTP boom/)).toBeInTheDocument();
    await user.click(within(pane).getByText("Retry"));
    await waitFor(() =>
      expect(
        srv.posts("command", (b) => b.op === "update" && b.id === "f1" && b.patch.status === "queued" && b.patch.attempts === 0)
      ).toHaveLength(1)
    );
  });
});

describe("13. savebar + leave guard + crash-safe draft", () => {
  it("guards nav away from a dirty detail page; draft survives in localStorage; beforeunload blocked", async () => {
    mockServer();
    const user = userEvent.setup();
    const pane = await openDetail();
    await user.type(within(pane).getByLabelText("Notes"), "abc");
    // crash-safe draft
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("lepro_draft_v1"))["J-1"].notes).toContain("abc")
    );
    // beforeunload guard
    const ev = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);

    // leave sheet: Stay keeps us here, Discard leaves + clears
    await user.click(within(pane).getByText("‹ Jobs"));
    expect(await screen.findByText("Unsaved changes")).toBeInTheDocument();
    await user.click(screen.getByText("Stay here"));
    expect(screen.getByTestId("detail-pane")).toBeInTheDocument();
    await user.click(within(pane).getByText("‹ Jobs"));
    const dlg = await screen.findByRole("dialog");
    await user.click(within(dlg).getByText("Discard"));
    await screen.findByLabelText("Search jobs");
    expect(screen.queryByTestId("savebar")).not.toBeInTheDocument();
    expect(localStorage.getItem("lepro_draft_v1")).toBeNull();
  });

  it("Save & continue saves then navigates", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    const pane = await openDetail();
    await user.type(within(pane).getByLabelText("Notes"), "keep me");
    await user.click(within(pane).getByText("‹ Jobs"));
    await user.click(await screen.findByText("Save & continue"));
    await waitFor(() => expect(srv.state.ov["J-1"].notes).toContain("keep me"));
    await screen.findByLabelText("Search jobs");
  });
});
