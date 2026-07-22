// Local controlled value + debounced store patch — keeps typing snappy when
// the store still has ~4k jobs and many shell subscribers.
import { useCallback, useEffect, useRef, useState } from "react";

// Instant in tests so save-bar / leave-guard assertions stay deterministic.
const DEFAULT_MS =
  (typeof process !== "undefined" && process.env.VITEST) ||
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.MODE === "test")
    ? 0
    : 120;

/** Active field flushers — saveAll calls flushAllDebouncedPatches() first. */
const FLUSHERS = new Set();

export function flushAllDebouncedPatches() {
  for (const fn of [...FLUSHERS]) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

/**
 * @param {string|number} id job id
 * @param {string} committed value from the store (job.notes etc.)
 * @param {(id: string, patch: object) => void} patchJob
 * @param {(value: string) => object} toPatch maps local string → patch object
 * @param {number} [ms]
 */
export function useDebouncedPatchField(id, committed, patchJob, toPatch, ms = DEFAULT_MS) {
  const [local, setLocal] = useState(committed ?? "");
  const localRef = useRef(local);
  localRef.current = local;
  const timer = useRef(null);
  const committedRef = useRef(committed);
  const idRef = useRef(id);
  const patchJobRef = useRef(patchJob);
  const toPatchRef = useRef(toPatch);
  patchJobRef.current = patchJob;
  toPatchRef.current = toPatch;

  // Job switch or external store overwrite (discard/save) → reset local.
  useEffect(() => {
    if (idRef.current !== id) {
      idRef.current = id;
      setLocal(committed ?? "");
      committedRef.current = committed;
      return;
    }
    if (committed !== committedRef.current && committed !== localRef.current) {
      setLocal(committed ?? "");
    }
    committedRef.current = committed;
  }, [id, committed]);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    const v = localRef.current;
    if (v !== (committedRef.current ?? "")) {
      patchJobRef.current(idRef.current, toPatchRef.current(v));
      committedRef.current = v;
    }
  }, []);

  useEffect(() => {
    FLUSHERS.add(flush);
    return () => {
      clearTimeout(timer.current);
      FLUSHERS.delete(flush);
    };
  }, [flush]);

  const onChange = useCallback(
    (next) => {
      const v = typeof next === "string" ? next : next?.target?.value ?? "";
      setLocal(v);
      localRef.current = v;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        patchJobRef.current(idRef.current, toPatchRef.current(v));
        committedRef.current = v;
      }, ms);
    },
    [ms]
  );

  return { value: local, onChange, onBlur: flush, flush };
}
