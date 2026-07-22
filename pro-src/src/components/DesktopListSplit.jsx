// Desktop two-pane: resizable/collapsible customer list | detail.
import React, { useCallback, useEffect, useState } from "react";
import ResizeHandle from "./ResizeHandle.jsx";
import {
  LIST_MAX,
  LIST_MIN,
  effectiveListWidth,
  listPaneCompact,
  loadListPaneLayout,
  saveListPaneLayout,
} from "../lib/desktopLayout.js";

/**
 * Wraps list + detail on desktop with a draggable divider and collapse control.
 * Mobile: renders children only (list hidden by CSS as before).
 */
export default function DesktopListSplit({ list, children }) {
  const [layout, setLayout] = useState(loadListPaneLayout);
  const width = effectiveListWidth(layout);
  const compact = listPaneCompact(layout);

  useEffect(() => {
    saveListPaneLayout(layout);
  }, [layout]);

  const onResize = useCallback((dx) => {
    setLayout((prev) => {
      const base = prev.collapsed ? LIST_MIN : prev.width;
      const next = Math.min(LIST_MAX, Math.max(LIST_MIN, base + dx));
      return {
        width: next,
        collapsed: next <= LIST_MIN + 4,
      };
    });
  }, []);

  const toggleCollapse = () => {
    setLayout((prev) => {
      if (prev.collapsed || prev.width <= LIST_MIN + 4) {
        return { width: Math.max(280, prev.width > LIST_MIN ? prev.width : 360), collapsed: false };
      }
      return { ...prev, collapsed: true };
    });
  };

  return (
    <div
      className="lg:flex lg:items-start lg:gap-0"
      data-testid="desktop-list-split"
      data-list-width={String(width)}
      data-list-compact={compact ? "1" : "0"}
      data-list-collapsed={layout.collapsed ? "1" : "0"}
    >
      <div
        className="hidden lg:block sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden lg-scroll-hidden shrink-0"
        style={{ width }}
        data-testid="list-pane"
        data-compact={compact ? "1" : "0"}
      >
        <div className="flex items-center justify-end mb-1 px-0.5">
          <button
            type="button"
            className="text-[10px] font-bold text-slate-400 hover:text-slate-700 px-1.5 py-0.5 rounded-md hover:bg-slate-100"
            data-testid="list-pane-collapse"
            aria-label={layout.collapsed ? "Expand customer list" : "Collapse customer list"}
            title={layout.collapsed ? "Expand customer list" : "Collapse customer list"}
            onClick={toggleCollapse}
          >
            {layout.collapsed ? "›" : "‹"}
          </button>
        </div>
        <div className={compact ? "desktop-list-compact" : undefined}>{list}</div>
      </div>
      <ResizeHandle
        testId="list-detail-resize"
        title="Drag to resize customer list"
        onResize={onResize}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
