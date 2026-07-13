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
  const [highlightMode, setHighlightMode] = useState(false);
  const [menu, setMenu] = useState(null);
  const [suggestTarget, setSuggestTarget] = useState(null);

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
      const next = window.prompt("New button label:", currentLabel || "");
      if (next == null) return;
      const trimmed = next.trim();
      if (!trimmed) return;
      patchPending(key, { label: trimmed });
      setMenu(null);
      showToast("Label updated — Revert or Keep at the bottom");
    },
    [patchPending, showToast]
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

  const revertPending = useCallback(() => {
    setPendingEdits({});
    setSessionHighlights([]);
    setHighlightMode(false);
    setMenu(null);
    setSuggestTarget(null);
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
    setMenu(null);
    setSuggestTarget(null);
    showToast("Changes kept — synced to build board");
  }, [addDevTask, pendingEdits, savedEdits, sessionHighlights, showToast]);

  const value = useMemo(
    () => ({
      merged,
      dirty,
      highlightMode,
      setHighlightMode,
      menu,
      setMenu,
      suggestTarget,
      setSuggestTarget,
      hideElement,
      relabelElement,
      openSuggest,
      submitSuggestion,
      addHighlight,
      revertPending,
      keepChanges,
      isHidden: (key) => isHidden(merged, key),
      labelFor: (key, fallback) => effectiveLabel(merged, key, fallback),
    }),
    [
      addHighlight,
      dirty,
      hideElement,
      highlightMode,
      keepChanges,
      menu,
      merged,
      openSuggest,
      relabelElement,
      revertPending,
      submitSuggestion,
      suggestTarget,
    ]
  );

  return <LiveEditCtx.Provider value={value}>{children}</LiveEditCtx.Provider>;
}