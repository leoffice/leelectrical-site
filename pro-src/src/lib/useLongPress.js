// Pointer long-press helper (default 2s).
import { useCallback, useRef } from "react";

export function useLongPress(onLongPress, { delay = 2000, onClick } = {}) {
  const timer = useRef(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const start = useCallback(
    (e) => {
      fired.current = false;
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress?.(e);
      }, delay);
    },
    [clear, delay, onLongPress]
  );

  const end = useCallback(
    (e) => {
      clear();
      if (!fired.current && onClick) onClick(e);
    },
    [clear, onClick]
  );

  return {
    onPointerDown: start,
    onPointerUp: end,
    onPointerLeave: clear,
    onPointerCancel: clear,
  };
}