// Cross-render / cross-remount memoization for pure derived data.
//
// React's useMemo is thrown away when a component unmounts, so a route view
// (e.g. the Jobs list) that React Router unmounts on navigation rebuilds every
// derivation from scratch each time it is re-entered. For an O(N) grouping pass
// over thousands of jobs that is a multi-hundred-ms freeze on every "back to
// the list" tap.
//
// memoOne keeps the LAST result at module scope, keyed by reference-equal args.
// When the inputs (the store's jobs array, the sort key, the QBO index) are
// unchanged — the common case when you navigate away and back without editing —
// the cached result is returned in O(1). As soon as any input's identity
// changes (a data refresh, a staged edit, a sort switch) it recomputes, so it
// never serves stale data: correctness follows input identity, exactly like
// useMemo, but the cache outlives the component instance.
export function memoOne(fn) {
  let has = false;
  let lastArgs = null;
  let lastVal;
  return (...args) => {
    if (
      has &&
      lastArgs.length === args.length &&
      lastArgs.every((a, i) => Object.is(a, args[i]))
    ) {
      return lastVal;
    }
    lastVal = fn(...args);
    lastArgs = args;
    has = true;
    return lastVal;
  };
}
