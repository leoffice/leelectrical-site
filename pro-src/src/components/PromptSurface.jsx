// Notification / reminder shell:
// - Phone: bottom sheet (same as Sheet)
// - Tablet/desktop: floating card — drag, close, minimize
import React, { useCallback, useEffect, useState } from "react";
import Sheet from "./Sheet.jsx";
import FloatingPanel from "./FloatingPanel.jsx";
import DismissSnoozePanel from "./DismissSnoozePanel.jsx";

const TABLET_MQ = "(min-width: 768px)";

function useTabletLayout() {
  const [wide, setWide] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    try {
      return window.matchMedia(TABLET_MQ).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(TABLET_MQ);
    const onChange = () => setWide(!!mq.matches);
    onChange();
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);
  return wide;
}

/**
 * @param {object} props
 * @param {string} props.title
 * @param {() => void} props.onClose
 * @param {React.ReactNode} props.children
 * @param {string} [props.testId]
 * @param {boolean} [props.urgent] — light translucent red + heartbeat (inspection)
 * @param {boolean} [props.wide] — force wider floating card
 * @param {(minutes: number) => void} [props.onSnooze] — board-wide rule: when a
 *   prompt can come back later, ✕ opens the 5-min–5-hour picker instead of
 *   silently closing. Omit only for prompts that have nothing to return to.
 * @param {() => void} [props.onNeverRemind] — optional "don't remind me" escape
 * @param {string} [props.snoozeLead]
 */
export default function PromptSurface({
  title,
  onClose,
  children,
  testId,
  urgent = false,
  wide = false,
  onSnooze,
  onNeverRemind,
  snoozeLead,
}) {
  const tablet = useTabletLayout();
  const [snoozing, setSnoozing] = useState(false);

  // ✕ (and Escape, which Sheet/FloatingPanel route to onClose) asks "when
  // should this come back?" rather than throwing the suggestion away.
  const handleClose = useCallback(() => {
    if (!onSnooze) return onClose && onClose();
    setSnoozing((s) => {
      if (s && onClose) onClose(); // second ✕ while picking = just close
      return !s;
    });
  }, [onSnooze, onClose]);

  const body =
    snoozing && onSnooze ? (
      <DismissSnoozePanel
        lead={snoozeLead}
        onSnooze={(minutes) => {
          setSnoozing(false);
          onSnooze(minutes);
        }}
        onCancel={() => setSnoozing(false)}
        onDismiss={
          onNeverRemind
            ? () => {
                setSnoozing(false);
                onNeverRemind();
              }
            : undefined
        }
      />
    ) : (
      children
    );

  if (tablet) {
    return (
      <FloatingPanel
        title={snoozing ? "Remind me later" : title}
        onClose={handleClose}
        testId={testId}
        minimizable
        urgent={urgent && !snoozing}
        wide={wide}
      >
        {body}
      </FloatingPanel>
    );
  }

  return (
    <Sheet
      title={snoozing ? "Remind me later" : title}
      onClose={handleClose}
      testId={testId}
      urgent={urgent && !snoozing}
    >
      {body}
    </Sheet>
  );
}
