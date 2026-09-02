// @vitest-environment jsdom
// TenantProvider must paint children immediately (no tenant-boot gate) so
// unlock → Jobs is not serialized behind getSettings (perf Batch E).
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("../src/state/store.jsx", () => ({
  useStore: () => ({
    getSettings: () =>
      new Promise(() => {
        /* never resolves — proves we do not wait */
      }),
  }),
}));

import { TenantProvider } from "../src/state/tenant.jsx";

describe("TenantProvider first paint", () => {
  it("renders children without waiting on getSettings", () => {
    render(
      <TenantProvider>
        <div data-testid="child">hello</div>
      </TenantProvider>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByTestId("tenant-boot")).not.toBeInTheDocument();
  });
});
