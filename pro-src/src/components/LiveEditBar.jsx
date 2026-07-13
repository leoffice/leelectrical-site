// Bottom bar — Revert or Keep live UI changes; highlight mode on desktop.
import React from "react";
import { useLiveEdit } from "./LiveEditProvider.jsx";
import SuggestChangesPanel from "./SuggestChangesPanel.jsx";

export default function LiveEditBar() {
  const {
    dirty,
    highlightMode,
    setHighlightMode,
    revertPending,
    keepChanges,
    suggestTarget,
    setSuggestTarget,
    submitSuggestion,
  } = useLiveEdit();

  const isDesktop =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(min-width: 1024px)").matches;

  return (
    <>
      {dirty ? (
        <div
          className="fixed inset-x-0 bottom-0 z-[80] bg-purple-900 text-white px-4 py-3 pb-safe flex flex-wrap items-center justify-center gap-2 shadow-2xl"
          data-testid="live-edit-bar"
        >
          <span className="text-sm font-medium mr-1">Unsaved UI tweaks</span>
          {isDesktop ? (
            <button
              type="button"
              className={`btn text-sm !py-2 ${highlightMode ? "bg-purple-200 text-purple-900" : "bg-purple-700 text-white"}`}
              onClick={() => setHighlightMode((v) => !v)}
              data-testid="live-edit-highlight"
            >
              🖍️ {highlightMode ? "Highlight on" : "Add highlight"}
            </button>
          ) : null}
          <button type="button" className="btn bg-white/15 text-white text-sm !py-2" onClick={revertPending} data-testid="live-edit-revert">
            Revert changes
          </button>
          <button type="button" className="btn bg-white text-purple-900 text-sm font-bold !py-2" onClick={keepChanges} data-testid="live-edit-keep">
            Keep changes
          </button>
        </div>
      ) : null}
      <SuggestChangesPanel
        target={suggestTarget}
        onSubmit={submitSuggestion}
        onClose={() => setSuggestTarget(null)}
      />
    </>
  );
}