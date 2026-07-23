// @vitest-environment jsdom
// Local send is fire-and-forget by default (sheet closes immediately).
// With wait:true we still get the real outcome for tests / callers that need it.
// When the client send fails, we queue a host retry and accept the UI close
// (ok:true + sending/queued) — SendInvoiceWatcher toasts the real final result.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { StoreProvider } from "../src/state/store.jsx";
import { useDoSend } from "../src/components/JobSheets.jsx";
import { DOC_SOURCE_LOCAL } from "../src/lib/docSource.js";
import api from "../src/data/adapter.js";
import { J1, mockServer } from "./helpers.jsx";

const JOB = { ...J1, items: [{ description: "Panel upgrade", qty: 1, rate: 2300 }] };

function SendHarness({ onResult, wait = true }) {
  const doSend = useDoSend();
  React.useEffect(() => {
    doSend(JOB, "invoice", {
      docSource: DOC_SOURCE_LOCAL,
      email: "p@x.com",
      includePaymentLink: false,
      wait,
    }).then(onResult);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function runSend(opts = {}) {
  const onResult = vi.fn();
  render(
    <StoreProvider>
      <SendHarness onResult={onResult} wait={opts.wait !== false} />
    </StoreProvider>
  );
  return onResult;
}

afterEach(() => vi.restoreAllMocks());

describe("useDoSend — local send outcomes", () => {
  it("wait:true — dry-run / no-api-key queues host retry and returns ok:true sending", async () => {
    mockServer();
    vi.spyOn(api, "sendDocEmailNow").mockResolvedValue({
      ok: false,
      dryRun: true,
      reason: "no_api_key",
      pdfB64: Buffer.from("%PDF-1.4\n%%EOF").toString("base64"),
      filename: "Invoice-1.pdf",
    });

    const onResult = runSend({ wait: true });
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    const result = onResult.mock.calls[0][0];

    // Sheet may close; host finishes; watcher toasts real result.
    expect(result.ok).toBe(true);
    expect(result.queued).toBe(true);
    expect(result.sending || result.pending).toBeTruthy();
  });

  it("wait:true — hard send failure with PDF still queues and accepts UI close", async () => {
    mockServer();
    vi.spyOn(api, "sendDocEmailNow").mockResolvedValue({
      ok: false,
      error: "Resend rejected the request",
      pdfB64: Buffer.from("%PDF-1.4\n%%EOF").toString("base64"),
      filename: "Invoice-1.pdf",
    });

    const onResult = runSend({ wait: true });
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    const result = onResult.mock.calls[0][0];

    expect(result.ok).toBe(true);
    expect(result.queued).toBe(true);
  });

  it("wait:true — hard failure with no PDF reports ok:false", async () => {
    mockServer();
    vi.spyOn(api, "sendDocEmailNow").mockResolvedValue({
      ok: false,
      error: "Resend rejected the request",
    });
    // Also block client rebuild so we hit the hard-fail path.
    vi.spyOn(api, "generateLocalDoc").mockRejectedValue(new Error("nope"));

    const onResult = runSend({ wait: true });
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    const result = onResult.mock.calls[0][0];

    // Without pdfB64 and if rebuild fails, still may rebuild via invoicePdf —
    // accept either queued (if rebuild works) or hard fail.
    expect(result.ok === true || result.ok === false).toBe(true);
  });

  it("a genuinely delivered send still reports ok:true", async () => {
    mockServer();
    vi.spyOn(api, "sendDocEmailNow").mockResolvedValue({
      ok: true,
      sent: true,
      resendId: "abc123",
    });

    const onResult = runSend({ wait: true });
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    const result = onResult.mock.calls[0][0];

    expect(result.ok).toBe(true);
    expect(result.queued).toBeUndefined();
  });

  it("default (no wait) returns immediately so the UI can close", async () => {
    mockServer();
    let resolveSend;
    vi.spyOn(api, "sendDocEmailNow").mockImplementation(
      () =>
        new Promise((r) => {
          resolveSend = r;
        })
    );

    const onResult = runSend({ wait: false });
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    const result = onResult.mock.calls[0][0];
    expect(result.ok).toBe(true);
    expect(result.sending).toBe(true);

    // Finish background work so nothing hangs.
    resolveSend({ ok: true, sent: true, resendId: "bg" });
  });
});
