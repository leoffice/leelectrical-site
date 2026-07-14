import { describe, expect, it, vi } from "vitest";
import { waitForCommandDone } from "../src/lib/commandWait.js";

describe("waitForCommandDone", () => {
  it("resolves when the matching command reaches done", async () => {
    const cmds = [{ idempotencyKey: "import_customer|34|1", status: "queued" }];
    const api = {
      listCommands: vi.fn(async () => cmds),
    };
    const p = waitForCommandDone(api, "import_customer|34|1", { maxMs: 200, intervalMs: 20 });
    setTimeout(() => {
      cmds[0].status = "done";
    }, 40);
    const out = await p;
    expect(out.ok).toBe(true);
    expect(out.cmd.status).toBe("done");
  });
});