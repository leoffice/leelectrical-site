// @vitest-environment jsdom
// Settings batch (Levi 2026-07-27):
//  1. a feature category holding one switch is rendered as that switch
//  2. a "Special features" section owns QuickBooks: sync + per-document sending
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderApp } from "./helpers.jsx";
import {
  isQuickbooksDocFeatureEnabled,
  isQuickbooksFeatureEnabled,
} from "../src/lib/appSettings.js";

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.location.hash = "#/";
});

async function openFeatures(user) {
  await user.click(await screen.findByTestId("settings-toggle-features"));
  return screen.getByTestId("settings-body-features");
}

async function openSpecial(user) {
  await user.click(await screen.findByTestId("settings-toggle-special"));
  return screen.getByTestId("settings-body-special");
}

describe("Settings — single-switch categories", () => {
  it("speech to text is one toggle, not a submenu you have to open first", async () => {
    mockServer();
    const user = userEvent.setup();
    renderApp("#/settings");
    const body = await openFeatures(user);

    // No "Voice & chat" drawer wrapping the lone switch…
    expect(within(body).queryByTestId("feature-toggle-voice")).not.toBeInTheDocument();
    // …the switch itself is right there, already visible.
    expect(within(body).getByTestId("feature-flat-voice")).toBeInTheDocument();
    const row = within(body).getByTestId("settings-feature-speechToText");
    expect(within(row).getByText("Speech to text")).toBeInTheDocument();
    expect(within(row).getByRole("switch", { name: "Speech to text" })).toHaveAttribute(
      "aria-checked",
      "true"
    );

    // Categories that still hold several switches keep their drawer.
    expect(within(body).getByTestId("feature-toggle-documents")).toBeInTheDocument();
  });
});

describe("Settings — Special features › QuickBooks", () => {
  it("offers sync plus separate invoice and estimate send switches", async () => {
    mockServer();
    const user = userEvent.setup();
    renderApp("#/settings");
    const body = await openSpecial(user);
    const qb = within(body).getByTestId("special-feature-quickbooks");

    expect(within(qb).getByText("QuickBooks synchronization")).toBeInTheDocument();
    expect(within(qb).getByText("Send invoices through QuickBooks")).toBeInTheDocument();
    expect(within(qb).getByText("Send estimates through QuickBooks")).toBeInTheDocument();

    // QuickBooks no longer clutters the general Operations list.
    await user.click(screen.getByTestId("settings-toggle-features"));
    const features = screen.getByTestId("settings-body-features");
    await user.click(within(features).getByTestId("feature-toggle-operations"));
    expect(
      within(features).queryByTestId("settings-feature-quickbooks")
    ).not.toBeInTheDocument();
  });

  it("keeps syncing while sending estimates locally", async () => {
    mockServer();
    const user = userEvent.setup();
    renderApp("#/settings");
    const body = await openSpecial(user);
    const qb = within(body).getByTestId("special-feature-quickbooks");

    await user.click(
      within(qb).getByRole("switch", { name: "Send invoices through QuickBooks" })
    );
    await user.click(
      within(qb).getByRole("switch", { name: "Send estimates through QuickBooks" })
    );
    // Both were off by default; both are on now.
    expect(isQuickbooksDocFeatureEnabled("invoice")).toBe(true);
    expect(isQuickbooksDocFeatureEnabled("estimate")).toBe(true);

    // Turn estimates back off — invoices and background sync are untouched.
    await user.click(
      within(qb).getByRole("switch", { name: "Send estimates through QuickBooks" })
    );
    expect(isQuickbooksDocFeatureEnabled("estimate")).toBe(false);
    expect(isQuickbooksDocFeatureEnabled("invoice")).toBe(true);
    expect(isQuickbooksFeatureEnabled()).toBe(true);
  });

  it("turning synchronization off kills both send paths", async () => {
    mockServer();
    const user = userEvent.setup();
    renderApp("#/settings");
    const body = await openSpecial(user);
    const qb = within(body).getByTestId("special-feature-quickbooks");

    await user.click(
      within(qb).getByRole("switch", { name: "Send invoices through QuickBooks" })
    );
    expect(isQuickbooksDocFeatureEnabled("invoice")).toBe(true);

    await user.click(within(qb).getByRole("switch", { name: "QuickBooks synchronization" }));
    await waitFor(() => expect(isQuickbooksFeatureEnabled()).toBe(false));
    expect(isQuickbooksDocFeatureEnabled("invoice")).toBe(false);
    expect(isQuickbooksDocFeatureEnabled("estimate")).toBe(false);
    // The per-document switches read off while sync is off.
    expect(
      within(qb).getByRole("switch", { name: "Send invoices through QuickBooks" })
    ).toHaveAttribute("aria-checked", "false");
  });

  it("saves the split to tenant_config", async () => {
    const srv = mockServer();
    const user = userEvent.setup();
    renderApp("#/settings");
    const body = await openSpecial(user);
    const qb = within(body).getByTestId("special-feature-quickbooks");
    await user.click(
      within(qb).getByRole("switch", { name: "Send invoices through QuickBooks" })
    );
    await user.click(screen.getByTestId("settings-save"));

    await waitFor(() => {
      const post = srv.calls.find(
        (c) => c.path === "settings" && c.method === "POST" && c.body?.features
      );
      expect(post).toBeTruthy();
      expect(post.body.features.quickbooksInvoices).toBe(true);
      expect(post.body.features.quickbooksEstimates).toBe(false);
      expect(post.body.features.quickbooks).toBe(true);
    });
  });
});
