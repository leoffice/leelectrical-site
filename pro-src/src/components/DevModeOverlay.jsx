// Developer mode overlay — tap Open/Edit + drag-to-highlight + live style resize.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useLiveEdit } from "./LiveEditProvider.jsx";
import LiveEditActionMenu from "./LiveEditActionMenu.jsx";
import LiveEditChooser from "./LiveEditChooser.jsx";
import LiveEditStylePanel from "./LiveEditStylePanel.jsx";
import StyleResizeHandles from "./StyleResizeHandles.jsx";
import { applyDomLabels, autoEditKey, buildStyleRules } from "../lib/liveEdit.js";

const IGNORE_SEL =
  "input, textarea, select, [contenteditable], [data-sheet], [data-floating-panel], [data-dev-overlay-ignore], [data-testid='live-edit-bar'], [data-testid='suggest-changes'], [data-testid='live-edit-style'], [data-testid='live-edit-chooser'], [data-testid='style-resize-handles']";

function findEditable(target) {
  let el = target;
  while (el && el !== document.body) {
    if (el.matches?.(IGNORE_SEL)) return null;
    if (el.dataset?.liveEditKey) return el;
    if (el.matches?.("button, a[href], [role='button'], .btn, .btn-brand")) {
      const text = (el.textContent || "").trim();
      if (text.length > 0 && text.length < 240) return el;
    }
    el = el.parentElement;
  }
  return null;
}

function labelFromEl(el, labelFor, key) {
  const raw = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
  return labelFor(key, raw || "Element");
}

export default function DevModeOverlay() {
  const loc = useLocation();
  const {
    devMode,
    merged,
    menu,
    setMenu,
    chooser,
    setChooser,
    styleTarget,
    setStyleTarget,
    hideElement,
    relabelElement,
    openSuggest,
    previewStyle,
    addAreaHighlight,
    sessionHighlights,
    labelFor,
    isHidden,
  } = useLiveEdit();

  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const bypassRef = useRef(false);
  const tapRef = useRef(null);
  dragRef.current = drag;

  // Apply saved/pending UI edits to the live page (styles, hide, relabel).
  useEffect(() => {
    const id = "lepro-live-edit-styles";
    let tag = document.getElementById(id);
    if (!tag) {
      tag = document.createElement("style");
      tag.id = id;
      document.head.appendChild(tag);
    }
    applyDomLabels(loc.pathname, merged);
    tag.textContent = buildStyleRules(merged);
    return () => {
      if (tag) tag.textContent = "";
    };
  }, [merged, loc.pathname]);

  const openMenuFor = useCallback(
    (el, e) => {
      const key = autoEditKey(el, loc.pathname);
      el.dataset.liveEditKey = key;
      if (isHidden(key)) return;
      const rect = el.getBoundingClientRect();
      const label = labelFromEl(el, labelFor, key);
      setMenu({
        key,
        label,
        anchor: { x: rect.left, y: rect.bottom + 6 },
        element: el,
      });
      e?.preventDefault?.();
      e?.stopPropagation?.();
    },
    [isHidden, labelFor, loc.pathname, setMenu]
  );

  const openChooserFor = useCallback(
    (el, e) => {
      const key = autoEditKey(el, loc.pathname);
      el.dataset.liveEditKey = key;
      if (isHidden(key)) return;
      const rect = el.getBoundingClientRect();
      const label = labelFromEl(el, labelFor, key);
      setChooser({
        key,
        label,
        anchor: { x: rect.left, y: rect.bottom + 6 },
        element: el,
      });
      e?.preventDefault?.();
      e?.stopPropagation?.();
    },
    [isHidden, labelFor, loc.pathname, setChooser]
  );

  // Live edit — tap any button: Open or Edit.
  useEffect(() => {
    if (devMode !== "live") return undefined;

    const onDown = (e) => {
      if (bypassRef.current) return;
      if (e.target.closest?.("[data-dev-overlay]")) return;
      const el = findEditable(e.target);
      if (!el) return;
      tapRef.current = { el, x0: e.clientX, y0: e.clientY };
    };

    const onUp = (e) => {
      if (bypassRef.current) {
        bypassRef.current = false;
        tapRef.current = null;
        return;
      }
      const tap = tapRef.current;
      tapRef.current = null;
      if (!tap?.el) return;
      const dx = Math.abs(e.clientX - tap.x0);
      const dy = Math.abs(e.clientY - tap.y0);
      if (dx > 12 || dy > 12) return;
      e.preventDefault();
      e.stopPropagation();
      openChooserFor(tap.el, e);
    };

    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
    return () => {
      tapRef.current = null;
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
    };
  }, [devMode, openChooserFor]);

  // Highlight area — drag rectangle.
  const onHighlightDown = (e) => {
    if (devMode !== "highlight") return;
    const x = e.clientX;
    const y = e.clientY;
    setDrag({ x0: x, y0: y, x1: x, y1: y });
  };

  const onHighlightMove = (e) => {
    if (!dragRef.current) return;
    setDrag((d) => (d ? { ...d, x1: e.clientX, y1: e.clientY } : null));
  };

  const onHighlightUp = () => {
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    const left = Math.min(d.x0, d.x1);
    const top = Math.min(d.y0, d.y1);
    const width = Math.abs(d.x1 - d.x0);
    const height = Math.abs(d.y1 - d.y0);
    if (width < 24 || height < 24) return;
    const note = window.prompt("What should change in this area?", "");
    if (note == null) return;
    addAreaHighlight({
      scope: loc.pathname,
      rect: { left, top, width, height },
      text: note.trim(),
    });
  };

  if (!devMode) return null;

  const pageAreas = sessionHighlights.filter((h) => h.rect && h.scope === loc.pathname);
  const activeStyle = styleTarget ? merged[styleTarget.key]?.style || {} : {};

  return (
    <div data-dev-overlay className="fixed inset-0 z-[75] pointer-events-none" aria-hidden={devMode === "live"}>
      {devMode === "live" ? (
        <div className="fixed top-0 inset-x-0 z-[76] bg-purple-900/90 text-white text-center text-xs font-semibold py-2 px-4 pointer-events-none">
          Developer mode — tap any button: Open or Edit
        </div>
      ) : null}

      {devMode === "highlight" ? (
        <div
          className="fixed inset-0 z-[76] cursor-crosshair pointer-events-auto"
          data-testid="highlight-area-overlay"
          onPointerDown={onHighlightDown}
          onPointerMove={onHighlightMove}
          onPointerUp={onHighlightUp}
        >
          <div className="fixed top-0 inset-x-0 bg-amber-600/90 text-white text-center text-xs font-semibold py-2 px-4 pointer-events-none">
            Drag to highlight an area — then add your change request
          </div>
          {drag ? (
            <div
              className="fixed border-2 border-amber-500 bg-amber-400/20 pointer-events-none rounded-lg"
              style={{
                left: Math.min(drag.x0, drag.x1),
                top: Math.min(drag.y0, drag.y1),
                width: Math.abs(drag.x1 - drag.x0),
                height: Math.abs(drag.y1 - drag.y0),
              }}
            />
          ) : null}
        </div>
      ) : null}

      {pageAreas.map((h, i) => (
        <div
          key={h.ts || i}
          className="fixed border-2 border-purple-500 bg-purple-400/15 rounded-lg pointer-events-none"
          style={{
            left: h.rect.left,
            top: h.rect.top,
            width: h.rect.width,
            height: h.rect.height,
          }}
          title={h.text}
        />
      ))}

      {chooser ? (
        <div className="pointer-events-auto">
          <LiveEditChooser
            anchor={chooser.anchor}
            label={chooser.label}
            onOpen={() => {
              const el = chooser.element;
              setChooser(null);
              if (!el) return;
              bypassRef.current = true;
              el.click();
            }}
            onEdit={() => {
              const el = chooser.element;
              setChooser(null);
              if (el) openMenuFor(el);
            }}
            onClose={() => setChooser(null)}
          />
        </div>
      ) : null}

      {menu ? (
        <div className="pointer-events-auto">
          <LiveEditActionMenu
            anchor={menu.anchor}
            label={menu.label}
            onEdit={() => relabelElement(menu.key, menu.label)}
            onStyle={() => setStyleTarget({ key: menu.key, label: menu.label, element: menu.element })}
            onDelete={() => {
              if (window.confirm(`Hide "${menu.label}"? You can revert from the bar below.`)) {
                hideElement(menu.key);
              }
            }}
            onSuggest={() => openSuggest({ key: menu.key, label: menu.label })}
            onClose={() => setMenu(null)}
          />
        </div>
      ) : null}

      {styleTarget?.element ? (
        <StyleResizeHandles
          element={styleTarget.element}
          style={activeStyle}
          onResize={(dims) => {
            previewStyle(styleTarget.key, { ...activeStyle, ...dims });
          }}
        />
      ) : null}

      <LiveEditStylePanel
        target={styleTarget}
        currentStyle={activeStyle}
        onChange={(style) => previewStyle(styleTarget?.key, style)}
        onClose={() => setStyleTarget(null)}
      />
    </div>
  );
}