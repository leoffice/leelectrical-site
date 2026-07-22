// Notification / reminder shell:
// - Phone: bottom sheet (same as Sheet)
// - Tablet/desktop: floating card — drag, close, minimize
import React, { useEffect, useState } from "react";
import Sheet from "./Sheet.jsx";
import FloatingPanel from "./FloatingPanel.jsx";

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
 */
export default function PromptSurface({ title, onClose, children, testId, urgent = false, wide = false }) {
  const tablet = useTabletLayout();

  if (tablet) {
    return (
      <FloatingPanel
        title={title}
        onClose={onClose}
        testId={testId}
        minimizable
        urgent={urgent}
        wide={wide}
      >
        {children}
      </FloatingPanel>
    );
  }

  return (
    <Sheet title={title} onClose={onClose} testId={testId} urgent={urgent}>
      {children}
    </Sheet>
  );
}
