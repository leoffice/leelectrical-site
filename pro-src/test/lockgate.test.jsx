// @vitest-environment jsdom
// LockGate (task #39) — gating behaviour: app content is hidden behind the
// lock overlay until an unlock succeeds, then revealed. The lock lib is mocked
// so we test the component's flow, not WebAuthn/Supabase themselves.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

const lock = vi.hoisted(() => ({
  isSessionUnlocked: vi.fn(() => false),
  markUnlocked: vi.fn(),
  hasEnrolledCredential: vi.fn(() => false),
  biometricSupported: vi.fn(async () => false),
  biometricUnlock: vi.fn(async () => true),
  passwordUnlock: vi.fn(async () => ({ access_token: "tok" })),
}));
vi.mock("../src/lib/lock.js", () => lock);

import LockGate from "../src/components/LockGate.jsx";

afterEach(() => {
  vi.clearAllMocks();
  lock.isSessionUnlocked.mockReturnValue(false);
  lock.biometricSupported.mockResolvedValue(false);
  lock.hasEnrolledCredential.mockReturnValue(false);
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

  it("uses the biometric button when a platform authenticator is available", async () => {
    lock.biometricSupported.mockResolvedValue(true);
    const user = userEvent.setup();
    render(
      <LockGate>
        <div data-testid="app">SECRET APP</div>
      </LockGate>
    );
    await waitFor(() => expect(screen.getByTestId("lock-biometric")).toBeInTheDocument());
    await user.click(screen.getByTestId("lock-biometric"));
    await waitFor(() => expect(screen.getByTestId("app")).toBeInTheDocument());
    expect(lock.biometricUnlock).toHaveBeenCalled();
    expect(lock.markUnlocked).toHaveBeenCalled();
  });
});
