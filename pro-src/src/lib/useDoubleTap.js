// Single vs double tap — Company dashboard row navigation.
import { useCallback, useRef } from "react";

export function useDoubleTap({ onSingle, onDouble, delay = 280 } = {}) {
  const lastTap = useRef(0);
  const timer = useRef(null);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  return useCallback(
    (meta) => {
      const now = Date.now();
      if (now - lastTap.current < delay) {
        clear();
        lastTap.current = 0;
        onDouble?.(meta);
        return;
      }
      lastTap.current = now;
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        lastTap.current = 0;
        onSingle?.(meta);
      }, delay);
    },
    [clear, delay, onDouble, onSingle]
  );
}