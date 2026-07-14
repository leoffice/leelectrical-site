// Bottom bar — Revert or Keep live UI changes; developer mode controls.
import React from "react";
import { useLiveEdit } from "./LiveEditProvider.jsx";
import SuggestChangesPanel from "./SuggestChangesPanel.jsx";

export default function LiveEditBar() {
  const {
    dirty,
    devMode,
    exitDevMode,
    highlightMode,
    setHighlightMode,
    startDevMode,
    revertPending,
    keepChanges,
    suggestTarget,
    setSuggestTarget,
    submitSuggestion,
  } = useLiveEdit();

  const showBar = dirty || devMode;
  if (!showBar) {
    return (
      <SuggestChangesPanel
        target={suggestTarget}
        onSubmit={submitSuggestion}
        onClose={() => setSuggestTarget(null)}
      />
    );
  }

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-[80] bg-purple-900 text-white px-4 py-3 pb-safe flex flex-wrap items-center justify-center gap-2 shadow-2xl"
        data-testid="live-edit-bar"
        data-dev-overlay-ignore
      >
        {devMode ? (
          <span className="text-sm font-medium mr-1">
            {devMode === "live" ? "✏️ Live edit" : devMode === "highlight" ? "🖍️ Highlight area" : "Developer mode"}
          </span>
        ) : (
          <span className="text-sm font-medium mr-1">Unsaved UI tweaks</span>
        )}
        {devMode === "live" ? (
          <button
            type="button"
            className={`btn text-sm !py-2 ${highlightMode ? "bg-purple-200 text-purple-900" : "bg-purple-700 text-white"}`}
            onClick={() => setHighlightMode((v) => !v)}
            data-testid="live-edit-highlight"
          >
            🖍️ {highlightMode ? "Text highlight on" : "Highlight text"}
          </button>
        ) : null}
        {devMode === "highlight" ? (
          <button
            type="button"
            className="btn bg-purple-700 text-white text-sm !py-2"
            onClick={() => startDevMode("live")}
            data-testid="live-edit-switch-live"
          >
            ✏️ Switch to live edit
          </button>
        ) : null}
        {dirty ? (
          <>
            <button type="button" className="btn bg-white/15 text-white text-sm !py-2" onClick={revertPending} data-testid="live-edit-revert">
              Revert changes
            </button>
            <button type="button" className="btn bg-white text-purple-900 text-sm font-bold !py-2" onClick={keepChanges} data-testid="live-edit-keep">
              Keep changes
            </button>
          </>
        ) : null}
        <button type="button" className="btn bg-white/10 text-white text-sm !py-2" onClick={exitDevMode} data-testid="live-edit-exit">
          Exit
        </button>
      </div>
      <SuggestChangesPanel
        target={suggestTarget}
        onSubmit={submitSuggestion}
        onClose={() => setSuggestTarget(null)}
      />
    </>
  );
}