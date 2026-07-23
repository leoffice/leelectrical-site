/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HashRouter } from "react-router-dom";
import QboSyncIssueWatcher from "../src/components/QboSyncIssueWatcher.jsx";
import { TenantProvider } from "../src/state/tenant.jsx";

const retryCommand = vi.fn(async () => {});
const enqueue = vi.fn(async () => ({ id: "report-1" }));
const showToast = vi.fn();
const refreshCommands = vi.fn();

let mockCommands = [];

vi.mock("../src/state/store.jsx", () => ({
  useStoreData: () => ({
    commands: mockCommands,
    retryCommand,
    enqueue,
    showToast,
    refreshCommands,
  }),
  useStore: () => ({}),
}));

function renderWatcher() {
  return render(
    <HashRouter>
      <TenantProvider>
        <QboSyncIssueWatcher />
      </TenantProvider>
    </HashRouter>
  );
}

describe("QboSyncIssueWatcher", () => {
  beforeEach(() => {
    localStorage.clear();
    mockCommands = [];
    retryCommand.mockClear();
    enqueue.mockClear();
    showToast.mockClear();
    refreshCommands.mockClear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("shows panel with bullets when QBO commands failed", async () => {
    mockCommands = [
      {
        id: "fail-1",
        type: "create_invoice",
        status: "failed",
        error: "pdfB64 missing",
        payload: { invoiceNo: "999" },
        updatedAt: Date.now(),
      },
    ];
    renderWatcher();
    expect(await screen.findByTestId("qbo-sync-issue-panel")).toBeTruthy();
    expect(screen.getByTestId("qbo-sync-issue-title").textContent).toMatch(
      /QuickBooks backend is having issues synchronizing/
    );
    const bullets = screen.getByTestId("qbo-sync-issue-bullets");
    expect(bullets.textContent).toMatch(/invoice/i);
    expect(screen.getByTestId("qbo-sync-issue-dismiss")).toBeTruthy();
    expect(screen.getByTestId("qbo-sync-issue-retry")).toBeTruthy();
    expect(screen.getByTestId("qbo-sync-issue-report")).toBeTruthy();
  });

  it("Dismiss hides the panel", async () => {
    mockCommands = [
      {
        id: "fail-2",
        type: "record_payment",
        status: "failed",
        error: "network error",
        updatedAt: Date.now(),
      },
    ];
    renderWatcher();
    await screen.findByTestId("qbo-sync-issue-panel");
    fireEvent.click(screen.getByTestId("qbo-sync-issue-dismiss"));
    await waitFor(() => {
      expect(screen.queryByTestId("qbo-sync-issue-panel")).toBeNull();
    });
  });

  it("Try again retries failed command ids", async () => {
    mockCommands = [
      {
        id: "fail-3",
        type: "import_customer",
        status: "failed",
        error: "timeout",
        updatedAt: Date.now(),
      },
    ];
    renderWatcher();
    await screen.findByTestId("qbo-sync-issue-panel");
    fireEvent.click(screen.getByTestId("qbo-sync-issue-retry"));
    await waitFor(() => {
      expect(retryCommand).toHaveBeenCalledWith("fail-3");
    });
    expect(showToast).toHaveBeenCalled();
  });

  it("Report to developers enqueues report_qbo_sync_issue", async () => {
    mockCommands = [
      {
        id: "fail-4",
        type: "create_customer",
        status: "failed",
        error: "Duplicate Name Exists Error",
        updatedAt: Date.now(),
      },
    ];
    renderWatcher();
    await screen.findByTestId("qbo-sync-issue-panel");
    fireEvent.click(screen.getByTestId("qbo-sync-issue-report"));
    await waitFor(() => {
      expect(enqueue).toHaveBeenCalled();
    });
    const [type, jobId, payload, lane] = enqueue.mock.calls[0];
    expect(type).toBe("report_qbo_sync_issue");
    expect(jobId).toBe("qbo-sync-issues");
    expect(payload.tag).toMatch(/Levi app troubleshooting/);
    expect(payload.commandIds).toContain("fail-4");
    expect(payload.bullets.length).toBeGreaterThan(0);
    expect(lane).toBe("deterministic");
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/developers/i));
  });

  it("renders nothing when there are no failed QBO commands", () => {
    mockCommands = [{ id: "ok", type: "create_invoice", status: "done", updatedAt: Date.now() }];
    renderWatcher();
    expect(screen.queryByTestId("qbo-sync-issue-panel")).toBeNull();
  });
});
