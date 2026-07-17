// @vitest-environment jsdom
// LockGate (task #39) — gating behaviour: app content is hidden behind the
// lock overlay until an unlock succeeds, then revealed. The lock lib is mocked
// so we test the component's flow, not WebAuthn/Supabase themselves.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

const lock = vi.hoisted(() => ({
  isSessionUnlocked: vi.fn(() => false),
  markUnlocked: vi.fn(),
  touchUnlocked: vi.fn(),
  hasEnrolledCredential: vi.fn(() => false),
  biometricSupported: vi.fn(async () => false),
  biometricUnlock: vi.fn(async () => true),
  passwordUnlock: vi.fn(async () => ({ access_token: "tok" })),
  mediaPermissionDenied: vi.fn(async () => false),
  shouldAutoBiometric: vi.fn(async () => false),
}));
vi.mock("../src/lib/lock.js", () => lock);

import LockGate, { BIOMETRIC_TIMEOUT_MS } from "../src/components/LockGate.jsx";

afterEach(() => {
  vi.clearAllMocks();
  lock.isSessionUnlocked.mockReturnValue(false);
  lock.biometricSupported.mockResolvedValue(false);
  lock.shouldAutoBiometric.mockResolvedValue(false);
  lock.mediaPermissionDenied.mockResolvedValue(false);
  lock.hasEnrolledCredential.mockReturnValue(false);
  lock.biometricUnlock.mockImplementation(async () => true);
});

describe("LockGate", () => {
  it("hides app content and shows the lock overlay on a fresh open", async () => {
    render(
      <LockGate>
        <div data-testid="app">SECRET APP</div>
      </LockGate>
    );
    expect(screen.getByTestId("lock-gate")).toBeInTheDocument();
    expect(screen.queryByTestId("app")).not.toBeInTheDocument();
    // Biometric unavailable → falls back to the password form.
    await waitFor(() => expect(screen.getByTestId("lock-password-form")).toBeInTheDocument());
  });

  it("reveals the app immediately when already unlocked (mid-session reload)", () => {
    lock.isSessionUnlocked.mockReturnValue(true);
    render(
      <LockGate>
        <div data-testid="app">SECRET APP</div>
      </LockGate>
    );
    expect(screen.getByTestId("app")).toBeInTheDocument();
    expect(screen.queryByTestId("lock-gate")).not.toBeInTheDocument();
  });

  it("password unlock reveals the app and records the grace timestamp", async () => {
    const user = userEvent.setup();
    render(
      <LockGate>
        <div data-testid="app">SECRET APP</div>
      </LockGate>
    );
    await waitFor(() => expect(screen.getByTestId("lock-password-form")).toBeInTheDocument());
    await user.type(screen.getByTestId("lock-email"), "me@le.us");
    await user.type(screen.getByTestId("lock-pass"), "pw");
    await user.click(screen.getByTestId("lock-submit"));

    await waitFor(() => expect(screen.getByTestId("app")).toBeInTheDocument());
    expect(lock.passwordUnlock).toHaveBeenCalledWith("me@le.us", "pw");
    expect(lock.markUnlocked).toHaveBeenCalled();
  });

  it("shows an error and stays locked on a bad password", async () => {
    lock.passwordUnlock.mockRejectedValueOnce(new Error("Invalid email or password"));
    const user = userEvent.setup();
    render(
      <LockGate>
        <div data-testid="app">SECRET APP</div>
      </LockGate>
    );
    await waitFor(() => expect(screen.getByTestId("lock-password-form")).toBeInTheDocument());
    await user.type(screen.getByTestId("lock-email"), "me@le.us");
    await user.type(screen.getByTestId("lock-pass"), "bad");
    await user.click(screen.getByTestId("lock-submit"));

    await waitFor(() => expect(screen.getByTestId("lock-error")).toHaveTextContent("Invalid"));
    expect(screen.queryByTestId("app")).not.toBeInTheDocument();
    expect(lock.markUnlocked).not.toHaveBeenCalled();
  });

  it("auto-triggers biometric when a platform authenticator is available", async () => {
    lock.biometricSupported.mockResolvedValue(true);
    lock.shouldAutoBiometric.mockResolvedValue(true);
    render(
      <LockGate>
        <div data-testid="app">SECRET APP</div>
      </LockGate>
    );
    await waitFor(() => expect(lock.biometricUnlock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("app")).toBeInTheDocument());
    expect(lock.markUnlocked).toHaveBeenCalled();
  });

  it("does not auto-trigger biometric on a page reload", async () => {
    lock.biometricSupported.mockResolvedValue(true);
    lock.shouldAutoBiometric.mockResolvedValue(false);
    render(
      <LockGate>
        <div data-testid="app">SECRET APP</div>
      </LockGate>
    );
    await waitFor(() => expect(screen.getByTestId("lock-password-form")).toBeInTheDocument());
    expect(lock.biometricUnlock).not.toHaveBeenCalled();
  });

  it("does not auto-trigger biometric when camera permission is blocked", async () => {
    lock.biometricSupported.mockResolvedValue(true);
    lock.shouldAutoBiometric.mockResolvedValue(false);
    lock.mediaPermissionDenied.mockResolvedValue(true);
    render(
      <LockGate>
        <div data-testid="app">SECRET APP</div>
      </LockGate>
    );
    await waitFor(() => expect(screen.getByTestId("lock-password-form")).toBeInTheDocument());
    expect(lock.biometricUnlock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("lock-use-biometric")).not.toBeInTheDocument();
  });

  it("falls back to password after biometric cancel without requiring a tap first", async () => {
    lock.biometricSupported.mockResolvedValue(true);
    lock.shouldAutoBiometric.mockResolvedValue(true);
    lock.biometricUnlock.mockRejectedValueOnce({ name: "NotAllowedError" });
    render(
      <LockGate>
        <div data-testid="app">SECRET APP</div>
      </LockGate>
    );
    await waitFor(() => expect(lock.biometricUnlock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("lock-password-form")).toBeInTheDocument());
    expect(screen.queryByTestId("app")).not.toBeInTheDocument();
  });

  // --- Regression: the biometric prompt must never trap the user (le-pro-v166).
  // A pending navigator.credentials.get() used to eat every click because there
  // was no AbortController and no timeout — the escape hatches were unreachable.

  // Arrange a cold open where biometric auto-fires and the native prompt hangs
  // (biometricUnlock never resolves). Returns the captured abort signal.
  function renderWithHangingBiometric() {
    lock.biometricSupported.mockResolvedValue(true);
    lock.shouldAutoBiometric.mockResolvedValue(true);
    lock.hasEnrolledCredential.mockReturnValue(true);
    const captured = {};
    lock.biometricUnlock.mockImplementation((opts) => {
      captured.signal = opts?.signal;
      return new Promise(() => {}); // pending forever, like a device that never answers
    });
    render(
      <LockGate>
        <div data-testid="app">SECRET APP</div>
      </LockGate>
    );
    return captured;
  }

  it("keeps 'Use password instead' clickable while a WebAuthn request is pending and aborts it", async () => {
    const user = userEvent.setup();
    const captured = renderWithHangingBiometric();

    // The prompt is in flight: spinner text shown, biometric call issued.
    await waitFor(() => expect(lock.biometricUnlock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Waiting for device…")).toBeInTheDocument());

    // The fallback control must be present AND enabled during the pending call.
    const usePassword = screen.getByTestId("lock-use-password");
    expect(usePassword).toBeEnabled();
    expect(captured.signal?.aborted).toBe(false);

    // Clicking it switches views immediately and aborts the pending WebAuthn call.
    await user.click(usePassword);
    await waitFor(() => expect(screen.getByTestId("lock-password-form")).toBeInTheDocument());
    expect(captured.signal?.aborted).toBe(true);
  });

  it("keeps 'Have an agent code?' clickable while a WebAuthn request is pending and aborts it", async () => {
    const user = userEvent.setup();
    const captured = renderWithHangingBiometric();

    await waitFor(() => expect(lock.biometricUnlock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Waiting for device…")).toBeInTheDocument());

    const useAgent = screen.getByTestId("lock-use-agent");
    expect(useAgent).toBeEnabled();

    await user.click(useAgent);
    await waitFor(() => expect(screen.getByTestId("lock-agent-form")).toBeInTheDocument());
    expect(captured.signal?.aborted).toBe(true);
  });

  it("times out a hung 'Waiting for device…' and drops to the password view", async () => {
    vi.useFakeTimers();
    try {
      const captured = renderWithHangingBiometric();

      // Flush the async availability checks + auto-fire effect.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(lock.biometricUnlock).toHaveBeenCalled();
      expect(screen.getByText("Waiting for device…")).toBeInTheDocument();

      // Advance past the watchdog window → the prompt is abandoned safely.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(BIOMETRIC_TIMEOUT_MS + 10);
      });

      expect(screen.getByTestId("lock-password-form")).toBeInTheDocument();
      expect(screen.getByTestId("lock-error")).toHaveTextContent(/timed out/i);
      expect(captured.signal?.aborted).toBe(true);
      expect(screen.queryByTestId("app")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
