/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  flushAllDebouncedPatches,
  useDebouncedPatchField,
} from "../src/lib/useDebouncedPatch.js";

describe("useDebouncedPatchField", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates local value immediately and patches after delay", () => {
    const patchJob = vi.fn();
    const { result } = renderHook(() =>
      useDebouncedPatchField("j1", "old", patchJob, (v) => ({ notes: v }), 100)
    );
    expect(result.current.value).toBe("old");
    act(() => {
      result.current.onChange("hello");
    });
    expect(result.current.value).toBe("hello");
    expect(patchJob).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(patchJob).toHaveBeenCalledWith("j1", { notes: "hello" });
  });

  it("flushAllDebouncedPatches flushes pending text before save", () => {
    const patchJob = vi.fn();
    const { result } = renderHook(() =>
      useDebouncedPatchField("j1", "", patchJob, (v) => ({ notes: v }), 500)
    );
    act(() => {
      result.current.onChange("save me");
    });
    expect(patchJob).not.toHaveBeenCalled();
    act(() => {
      flushAllDebouncedPatches();
    });
    expect(patchJob).toHaveBeenCalledWith("j1", { notes: "save me" });
  });
});
