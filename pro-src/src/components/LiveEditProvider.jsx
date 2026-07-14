// Context for live UI edits — hide/relabel/suggest on long-press; revert or keep.
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useStore } from "../state/store.jsx";
import {
  effectiveLabel,
  formatSyncDescription,
  hasPendingWork,
  isHidden,
  loadHighlights,
  loadSavedEdits,
  mergeEdits,
  saveHighlights,
  saveSavedEdits,
} from "../lib/liveEdit.js";

const LiveEditCtx = createContext(null);

export function useLiveEdit() {
  const ctx = useContext(LiveEditCtx);
  if (!ctx) throw new Error("useLiveEdit must be inside LiveEditProvider");
  return ctx;
}

export function LiveEditProvider({ children }) {
  const { addDevTask, showToast } = useStore();
  const [savedEdits, setSavedEdits] = useState(() => loadSavedEdits());
  const [pendingEdits, setPendingEdits] = useState({});
  const [sessionHighlights, setSessionHighlights] = useState([]);
  const [devMode, setDevMode] = useState(null);
  const [highlightMode, setHighlightMode] = useState(false);
  const [menu, setMenu] = useState(null);
  const [chooser, setChooser] = useState(null);
  const [suggestTarget, setSuggestTarget] = useState(null);
  const [styleTarget, setStyleTarget] = useState(null);

  const merged = useMemo(() => mergeEdits(savedEdits, pendingEdits), [savedEdits, pendingEdits]);
  const dirty = useMemo(() => hasPendingWork(pendingEdits, sessionHighlights), [pendingEdits, sessionHighlights]);

  const patchPending = useCallback((key, patch) => {
    setPendingEdits((p) => {
      const next = { ...p };
      if (!patch) delete next[key];
      else next[key] = { ...(next[key] || {}), ...patch };
      return next;
    });
  }, []);

  const startDevMode = useCallback(
    (mode) => {
      setDevMode(mode);
      if (mode === "highlight") setHighlightMode(true);
      showToast(mode === "live" ? "Live edit on — tap any button: Open or Edit" : "Drag to highlight an area");
    },
    [showToast]
  );

  const exitDevMode = useCallback(() => {
    setDevMode(null);
    setHighlightMode(false);
    setMenu(null);
    setChooser(null);
    setSuggestTarget(null);
    setStyleTarget(null);
    showToast("Developer mode off");
  }, [showToast]);

  const hideElement = useCallback(
    (key) => {
      patchPending(key, { hidden: true });
      setMenu(null);
      showToast("Button hidden — Revert or Keep at the bottom");
    },
    [patchPending, showToast]
  );

  const relabelElement = useCallback(
    (key, currentLabel) => {
      const next = window.prompt("New label:", currentLabel || "");
      if (next == null) return;
      const trimmed = next.trim();
      if (!trimmed) return;
      patchPending(key, { label: trimmed });
      setMenu(null);
      showToast("Label updated — Revert or Keep at the bottom");
    },
    [patchPending, showToast]
  );

  const previewStyle = useCallback(
    (key, style) => {
      if (!key) return;
      patchPending(key, { style: style || {} });
    },
    [patchPending]
  );

  const patchStyle = useCallback(
    (key, style) => {
      if (!key) return;
      previewStyle(key, style);
      setStyleTarget(null);
      setMenu(null);
      showToast("Style updated — Revert or Keep at the bottom");
    },
    [previewStyle, showToast]
  );

  const openSuggest = useCallback((target) => {
    setMenu(null);
    setSuggestTarget(target);
  }, []);

  const submitSuggestion = useCallback(
    (text) => {
      if (!suggestTarget?.key || !text?.trim()) return;
      patchPending(suggestTarget.key, { suggestion: text.trim() });
      setSuggestTarget(null);
      showToast("Suggestion saved — Revert or Keep at the bottom");
    },
    [patchPending, showToast, suggestTarget]
  );

  const addHighlight = useCallback(
    ({ scope, excerpt, text }) => {
      if (!excerpt?.trim()) return;
      setSessionHighlights((h) => [
        ...h,
        { scope, excerpt: excerpt.trim(), text: (text || "").trim(), ts: Date.now() },
      ]);
      showToast("Highlight added — Revert or Keep at the bottom");
    },
    [showToast]
  );

  const addAreaHighlight = useCallback(
    ({ scope, rect, text }) => {
      if (!rect || !text?.trim()) return;
      setSessionHighlights((h) => [
        ...h,
        { scope, rect, text: text.trim(), ts: Date.now() },
      ]);
      showToast("Area highlighted — Revert or Keep at the bottom");
    },
    [showToast]
  );

  const revertPending = useCallback(() => {
    setPendingEdits({});
    setSessionHighlights([]);
    setHighlightMode(false);
    setMenu(null);
    setChooser(null);
    setSuggestTarget(null);
    setStyleTarget(null);
    showToast("Changes reverted");
  }, [showToast]);

  const keepChanges = useCallback(async () => {
    const nextSaved = mergeEdits(savedEdits, pendingEdits);
    setSavedEdits(nextSaved);
    saveSavedEdits(nextSaved);

    let allHighlights = loadHighlights();
    if (sessionHighlights.length) {
      allHighlights = [...allHighlights, ...sessionHighlights].slice(-50);
      saveHighlights(allHighlights);
    }

    const desc = formatSyncDescription(pendingEdits, sessionHighlights);
    if (desc.trim()) {
      await addDevTask({
        title: "UI live edit",
        desc,
        status: "approved",
        source: "levi-live-edit",
      });
    }

    setPendingEdits({});
    setSessionHighlights([]);
    setHighlightMode(false);
    setDevMode(null);
    setMenu(null);
    setChooser(null);
    setSuggestTarget(null);
    setStyleTarget(null);
    showToast("Changes kept — synced to build board");
  }, [addDevTask, pendingEdits, savedEdits, sessionHighlights, showToast]);

  const value = useMemo(
    () => ({
      merged,
      dirty,
      devMode,
      startDevMode,
      exitDevMode,
      highlightMode,
      setHighlightMode,
      menu,
      setMenu,
      chooser,
      setChooser,
      suggestTarget,
      setSuggestTarget,
      styleTarget,
      setStyleTarget,
      sessionHighlights,
      hideElement,
      relabelElement,
      patchStyle,
      previewStyle,
      openSuggest,
      submitSuggestion,
      addHighlight,
      addAreaHighlight,
      revertPending,
      keepChanges,
      isHidden: (key) => isHidden(merged, key),
      labelFor: (key, fallback) => effectiveLabel(merged, key, fallback),
    }),
    [
      addAreaHighlight,
      addHighlight,
      dirty,
      devMode,
      exitDevMode,
      hideElement,
      highlightMode,
      keepChanges,
      chooser,
      menu,
      merged,
      openSuggest,
      patchStyle,
      previewStyle,
      relabelElement,
      revertPending,
      sessionHighlights,
      startDevMode,
      styleTarget,
      submitSuggestion,
      suggestTarget,
    ]
  );

  return <LiveEditCtx.Provider value={value}>{children}</LiveEditCtx.Provider>;
}