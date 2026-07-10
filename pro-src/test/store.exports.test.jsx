// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { StoreProvider, useStore } from "../src/state/store.jsx";
import { mockServer } from "./helpers.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function StoreProbe() {
  const { refreshJobs } = useStore();
  return <span data-testid="refresh-jobs-type">{typeof refreshJobs}</span>;
}

describe("store context exports", () => {
  it("exposes refreshJobs so card payments can reload job balances", () => {
    mockServer();
    render(
      <StoreProvider>
        <StoreProbe />
      </StoreProvider>
    );
    expect(screen.getByTestId("refresh-jobs-type")).toHaveTextContent("function");
  });
});