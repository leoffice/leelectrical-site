// When QuickBooks backend sync hits failures, show a plain popup with short
// bullets + Dismiss / Try again / Report to developers.
import React, { useEffect, useMemo, useRef, useState } from "react";
import FloatingPanel from "./FloatingPanel.jsx";
import { useStoreData } from "../state/store.jsx";
import {
  QBO_SYNC_ISSUE_TITLE,
  buildReportPayload,
  collectQboSyncIssues,
  dismissIssueIds,
  loadDismissedIds,
  markReportedIds,
} from "../lib/qboSyncIssues.js";
import { isQuickbooksEnabled } from "../lib/qboEnabled.js";
import { useTenantConfig } from "../state/tenant.jsx";
import { useAppSettings } from "../lib/appSettings.js";

export default function QboSyncIssueWatcher() {
  const { commands, retryCommand, enqueue, showToast, refreshCommands } = useStoreData();
  const config = useTenantConfig();
  const appSettings = useAppSettings();
  void appSettings.quickbooks;
  const qboOn = isQuickbooksEnabled(config);

  const [dismissed, setDismissed] = useState(() => loadDismissedIds());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Avoid flashing the panel on every tiny commands array rebuild
  const lastKey = useRef("");

  const issues = useMemo(
    () => collectQboSyncIssues(commands, { dismissedIds: dismissed }),
    [commands, dismissed]
  );

  useEffect(() => {
    if (!qboOn) {
      setOpen(false);
      return;
    }
    if (!issues.bullets.length) {
      setOpen(false);
      lastKey.current = "";
      return;
    }
    const key = issues.commandIds.slice().sort().join(",");
    if (key !== lastKey.current) {
      lastKey.current = key;
      setOpen(true);
    }
  }, [issues.bullets.length, issues.commandIds, qboOn]);

  if (!qboOn || !open || !issues.bullets.length) return null;

  const close = () => setOpen(false);

  const onDismiss = () => {
    setDismissed(dismissIssueIds(issues.commandIds, dismissed));
    close();
  };

  const onRetry = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ids = issues.commandIds;
      for (const id of ids) {
        await retryCommand?.(id);
      }
      // Don't re-show these until they fail again
      setDismissed(dismissIssueIds(ids, dismissed));
      close();
      showToast?.(
        ids.length > 1
          ? "Retrying " + ids.length + " QuickBooks items…"
          : "Retrying QuickBooks sync…"
      );
      refreshCommands?.();
    } finally {
      setBusy(false);
    }
  };

  const onReport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const payload = buildReportPayload({
        bullets: issues.bullets,
        commandIds: issues.commandIds,
        totalFailed: issues.totalFailed,
      });
      const idk = "report_qbo_sync_issue|" + payload.commandIds.slice(0, 3).join("+") + "|" + Date.now();
      await enqueue?.(
        "report_qbo_sync_issue",
        "qbo-sync-issues",
        payload,
        "deterministic",
        idk
      );
      markReportedIds(payload.commandIds);
      setDismissed(dismissIssueIds(payload.commandIds, dismissed));
      close();
      showToast?.("Reported to developers — they'll troubleshoot in the background");
      refreshCommands?.();
    } catch {
      showToast?.("Could not send report — try again in a moment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FloatingPanel
      title="QuickBooks sync issue"
      onClose={onDismiss}
      testId="qbo-sync-issue-panel"
      urgent
      minimizable
      wide
    >
      <p className="text-sm text-slate-700 font-semibold mb-2" data-testid="qbo-sync-issue-title">
        {QBO_SYNC_ISSUE_TITLE}
      </p>
      <p className="text-xs text-slate-500 mb-3">
        Your work is still saved on this device. These items did not finish syncing to QuickBooks:
      </p>
      <ul
        className="text-sm text-slate-800 mb-4 space-y-1.5 list-disc pl-5"
        data-testid="qbo-sync-issue-bullets"
      >
        {issues.bullets.map((b, i) => (
          <li key={i} className="leading-snug">
            {b}
          </li>
        ))}
      </ul>
      {issues.totalFailed > issues.bullets.length ? (
        <p className="text-xs text-slate-400 mb-3">
          +{issues.totalFailed - issues.bullets.length} more similar issue
          {issues.totalFailed - issues.bullets.length === 1 ? "" : "s"}
        </p>
      ) : null}
      <div className="flex flex-col gap-2" data-testid="qbo-sync-issue-actions">
        <button
          type="button"
          className="btn bg-brand text-white w-full"
          disabled={busy}
          onClick={onRetry}
          data-testid="qbo-sync-issue-retry"
        >
          Try again
        </button>
        <button
          type="button"
          className="btn bg-amber-100 text-amber-900 w-full border border-amber-200"
          disabled={busy}
          onClick={onReport}
          data-testid="qbo-sync-issue-report"
        >
          Report to developers
        </button>
        <button
          type="button"
          className="btn bg-slate-100 text-slate-600 w-full"
          disabled={busy}
          onClick={onDismiss}
          data-testid="qbo-sync-issue-dismiss"
        >
          Dismiss
        </button>
      </div>
    </FloatingPanel>
  );
}
