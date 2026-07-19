// @vitest-environment jsdom
// Regression: a send that failed and fell back to the retry queue must NOT
// report success. It used to return { ok: true, queued: true }, which closed
// the confirm sheet as if the document had gone out — while the status line
// still read "Never sent" because logSend never ran.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { StoreProvider } from "../src/state/store.jsx";
import { useDoSend } from "../src/components/JobSheets.jsx";
import { DOC_SOURCE_LOCAL } from "../src/lib/docSource.js";
import api from "../src/data/adapter.js";
import { J1, mockServer } from "./helpers.jsx";

const JOB = { ...J1, items: [{ description: "Panel upgrade", qty: 1, rate: 2300 }] };

function SendHarness({ onResult }) {
  const doSend = useDoSend();
  React.useEffect(() => {
    doSend(JOB, "invoice", {
      docSource: DOC_SOURCE_LOCAL,
      email: "p@x.com",
      includePaymentLink: false,
    }).then(onResult);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function runSend() {
  const onResult = vi.fn();
  render(
    <StoreProvider>
      <SendHarness onResult={onResult} />
    </StoreProvider>
  );
  return onResult;
}

afterEach(() => vi.restoreAllMocks());

describe("useDoSend — queued is not success", () => {
  it("a dry-run / no-api-key response reports ok:false with a not-sent message", async () => {
    mockServer();
    vi.spyOn(api, "sendDocEmailNow").mockResolvedValue({
      ok: false,
      dryRun: true,
      reason: "no_api_key",
    });

    const onResult = runSend();
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    const result = onResult.mock.calls[0][0];

    expect(result.ok).toBe(false); // <- the bug: this used to be true
    expect(result.queued).toBe(true);
    expect(result.pending).toBe(true);
    expect(String(result.error)).toMatch(/not sent/i);
  });

  it("a hard send failure also reports ok:false", async () => {
    mockServer();
    vi.spyOn(api, "sendDocEmailNow").mockResolvedValue({
      ok: false,
      error: "Resend rejected the request",
    });

    const onResult = runSend();
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    const result = onResult.mock.calls[0][0];

    expect(result.ok).toBe(false);
    expect(String(result.error)).toMatch(/not sent/i);
  });

  it("a genuinely delivered send still reports ok:true", async () => {
    mockServer();
    vi.spyOn(api, "sendDocEmailNow").mockResolvedValue({
      ok: true,
      sent: true,
      resendId: "abc123",
    });

    const onResult = runSend();
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    const result = onResult.mock.calls[0][0];

    expect(result.ok).toBe(true);
    expect(result.queued).toBeUndefined();
  });
});
