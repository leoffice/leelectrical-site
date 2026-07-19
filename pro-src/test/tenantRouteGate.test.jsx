// @vitest-environment jsdom
// Integration — the GOLDEN RULE, exercised against the real App tree.
//
// Unit tests in tenantConfig.test.js prove the allow-list logic. This file
// proves the thing that actually matters: a disabled module's URL, typed
// directly into the address bar, does not render that module. Hiding the nav
// link is not enough and is not what is being tested here.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { mockServer, renderAppAsTenant } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = "#/";
});

/** A paying tenant: Pro tier, no crew add-on, NOT internal. */
const proTenant = {
  profile: {},
  features: {},
  tenant: {
    tenantId: "acme",
    internal: false,
    plan: { tier: "pro", crewAddon: false },
    branding: { companyName: "Acme Electric" },
  },
};

/** A Free-tier tenant — most modules off. */
const freeTenant = {
  profile: {},
  features: {},
  tenant: {
    tenantId: "starter",
    internal: false,
    plan: { tier: "free", crewAddon: false },
    branding: { companyName: "Starter Co" },
  },
};

const notFound = () => screen.findByText("That page doesn’t exist.");

describe("disabled modules are unreachable by URL", () => {
  it("Free tenant typing /projects (requisitions) gets Not found", async () => {
    mockServer({ settings: freeTenant });
    renderAppAsTenant("#/projects");
    expect(await notFound()).toBeInTheDocument();
  });

  it("Free tenant typing the requisition DETAIL url also gets Not found", async () => {
    // The detail route is a separate path — stripping only the list route
    // would leave this one reachable.
    mockServer({ settings: freeTenant });
    renderAppAsTenant("#/projects/baez-place");
    expect(await notFound()).toBeInTheDocument();
  });

  it("Free tenant typing /company (reports) gets Not found", async () => {
    mockServer({ settings: freeTenant });
    renderAppAsTenant("#/company");
    expect(await notFound()).toBeInTheDocument();
  });

  it("tenant without the crew add-on typing /time gets Not found", async () => {
    mockServer({ settings: proTenant });
    renderAppAsTenant("#/time");
    expect(await notFound()).toBeInTheDocument();
  });

  it("Pro tenant CAN reach /projects — gating is not blanket denial", async () => {
    mockServer({ settings: proTenant });
    renderAppAsTenant("#/projects");
    await waitFor(() => expect(screen.queryByText("That page doesn’t exist.")).not.toBeInTheDocument());
  });
});

describe("dev tooling is unreachable for non-internal tenants", () => {
  it("typing /dev gets Not found even on the top tier", async () => {
    mockServer({
      settings: {
        ...proTenant,
        tenant: { ...proTenant.tenant, plan: { tier: "full", crewAddon: true } },
      },
    });
    renderAppAsTenant("#/dev");
    expect(await notFound()).toBeInTheDocument();
  });

  it("typing /progress (the Build tab) gets Not found", async () => {
    mockServer({ settings: proTenant });
    renderAppAsTenant("#/progress");
    expect(await notFound()).toBeInTheDocument();
  });

  it("no Build or Dev nav link is rendered", async () => {
    mockServer({ settings: proTenant });
    renderAppAsTenant("#/");
    await waitFor(() => expect(screen.queryByTestId("tenant-boot")).not.toBeInTheDocument());
    expect(screen.queryByText("Build")).not.toBeInTheDocument();
    expect(screen.queryByText("Dev")).not.toBeInTheDocument();
  });
});

describe("the LE flagship keeps everything", () => {
  const le = {
    profile: {},
    features: {},
    tenant: {
      tenantId: "le",
      internal: true,
      plan: { tier: "full", crewAddon: true },
    },
  };

  it("reaches /dev", async () => {
    mockServer({ settings: le });
    renderAppAsTenant("#/dev");
    await waitFor(() => expect(screen.queryByText("That page doesn’t exist.")).not.toBeInTheDocument());
  });

  it("reaches /progress", async () => {
    mockServer({ settings: le });
    renderAppAsTenant("#/progress");
    await waitFor(() => expect(screen.queryByText("That page doesn’t exist.")).not.toBeInTheDocument());
  });

  it("reaches /projects, /company and /time", async () => {
    for (const path of ["#/projects", "#/company", "#/time"]) {
      mockServer({ settings: le });
      const { unmount } = renderAppAsTenant(path);
      await waitFor(() =>
        expect(screen.queryByText("That page doesn’t exist.")).not.toBeInTheDocument()
      );
      unmount();
    }
  });

  it("renders Build and Dev nav links", async () => {
    mockServer({ settings: le });
    renderAppAsTenant("#/");
    // Both the desktop sidebar and the mobile bottom bar render the tabs, so
    // each label legitimately appears more than once.
    await waitFor(() => expect(screen.getAllByText("Build").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Dev").length).toBeGreaterThan(0);
  });
});

describe("tenant branding replaces LE chrome", () => {
  it("shows the tenant's company name, not LE Electric", async () => {
    mockServer({ settings: proTenant });
    renderAppAsTenant("#/");
    await waitFor(() => expect(screen.queryByTestId("tenant-boot")).not.toBeInTheDocument());
    const logo = screen.getByTestId("app-logo");
    expect(logo).toHaveAttribute("alt", "Acme Electric");
    expect(screen.queryByText(/LE Electric ·/)).not.toBeInTheDocument();
  });
});
