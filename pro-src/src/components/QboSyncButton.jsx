// Always-visible QuickBooks sync button — opens scoped sync menu.
import React, { useState } from "react";
import QboSyncSheet from "./QboSyncSheet.jsx";

export default function QboSyncButton({ job, customerJobs, compact, className = "" }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={
          compact
            ? `text-[10px] font-semibold text-brand px-2 py-1 rounded-lg border border-brand/25 bg-brand-soft shrink-0 ${className}`
            : `text-xs font-bold text-brand px-3 py-1.5 rounded-xl border border-brand/30 bg-brand-soft shrink-0 ${className}`
        }
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        data-testid="qbo-sync-btn"
        aria-label="QuickBooks sync"
      >
        ↻ QB Sync
      </button>
      {open ? (
        <QboSyncSheet
          job={job}
          customerJobs={customerJobs}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}