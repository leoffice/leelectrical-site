import { afterEach, describe, expect, it, vi } from "vitest";
import {
  awaitCommandTerminal,
  isSendTracked,
  markSendTracked,
  releaseSendTracked,
  reportSendFailure,
  __resetSendReports,
} from "../src/lib/sendTracking.js";

afterEach(() => {
  __resetSendReports();
  vi.restoreAllMocks();
});

describe("send tracking", () => {
  it("marks/releases tracked command ids (watcher suppression)", () => {
    markSendTracked("cmd-1");
    expect(isSendTracked("cmd-1")).toBe(true);
    releaseSendTracked("cmd-1");
    expect(isSendTracked("cmd-1")).toBe(false);
  });

  it("awaitCommandTerminal resolves when the command reaches done", async () => {
    let calls = 0;
    const api = {
      listCommands: async () => {
        calls += 1;
        return [{ id: "c9", status: calls < 2 ? "working" : "done" }];
      },
    };
    const term = await awaitCommandTerminal(api, "c9", { timeoutMs: 5000, intervalMs: 1 });
    expect(term.status).toBe("done");
  });

  it("awaitCommandTerminal returns failed with the error", async () => {
    const api = { listCommands: async () => [{ id: "c9", status: "failed", error: "Resend 502" }] };
    const term = await awaitCommandTerminal(api, "c9", { timeoutMs: 100, intervalMs: 1 });
    expect(term.status).toBe("failed");
    expect(term.error).toBe("Resend 502");
  });

  it("awaitCommandTerminal times out to pending when never terminal", async () => {
    const api = { listCommands: async () => [{ id: "c9", status: "working" }] };
    const term = await awaitCommandTerminal(api, "c9", { timeoutMs: 3, intervalMs: 1 });
    expect(term.status).toBe("pending");
  });

  it("reportSendFailure posts one Dispatch dev-task with the details, deduped", async () => {
    const addDevTask = vi.fn().mockResolvedValue(true);
    const args = {
      kind: "invoice",
      no: "251825",
      email: "tfass@bethrivkah.edu",
      reason: "HTTP 502",
      jobId: "J1",
      at: "2026-07-25T00:00:00Z",
    };
    await reportSendFailure(addDevTask, args);
    await reportSendFailure(addDevTask, args); // duplicate — must not re-post
    expect(addDevTask).toHaveBeenCalledTimes(1);
    const task = addDevTask.mock.calls[0][0];
    expect(task.title).toMatch(/251825/);
    expect(task.desc).toMatch(/tfass@bethrivkah\.edu/);
    expect(task.desc).toMatch(/HTTP 502/);
    expect(task.priority).toBe("high");
  });
});
