// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  SIDEBAR_COLLAPSED,
  SIDEBAR_EXPANDED,
  effectiveListWidth,
  effectiveSidebarWidth,
  listPaneCompact,
  loadListPaneLayout,
  loadSidebarLayout,
  saveListPaneLayout,
  saveSidebarLayout,
  sidebarIconOnly,
} from "../src/lib/desktopLayout.js";

afterEach(() => {
  localStorage.clear();
});

describe("desktopLayout", () => {
  it("defaults to expanded sidebar", () => {
    const s = loadSidebarLayout();
    expect(s.collapsed).toBe(false);
    expect(effectiveSidebarWidth(s)).toBe(SIDEBAR_EXPANDED);
    expect(sidebarIconOnly(s)).toBe(false);
  });

  it("collapsed sidebar is icon-only width", () => {
    saveSidebarLayout({ width: 256, collapsed: true });
    const s = loadSidebarLayout();
    expect(effectiveSidebarWidth(s)).toBe(SIDEBAR_COLLAPSED);
    expect(sidebarIconOnly(s)).toBe(true);
  });

  it("persists list pane width and compact mode", () => {
    saveListPaneLayout({ width: 120, collapsed: false });
    const s = loadListPaneLayout();
    expect(effectiveListWidth(s)).toBe(120);
    expect(listPaneCompact(s)).toBe(true);
  });

  it("collapsed list uses minimum width", () => {
    saveListPaneLayout({ width: 360, collapsed: true });
    expect(effectiveListWidth(loadListPaneLayout())).toBe(72);
  });
});
