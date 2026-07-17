var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
var init_utils = __esm({
  "../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/_internal/utils.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name(createNotImplementedError, "createNotImplementedError");
    __name(notImplemented, "notImplemented");
    __name(notImplementedClass, "notImplementedClass");
  }
});

// ../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin, _performanceNow, nodeTiming, PerformanceEntry, PerformanceMark, PerformanceMeasure, PerformanceResourceTiming, PerformanceObserverEntryList, Performance, PerformanceObserver, performance;
var init_performance = __esm({
  "../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_utils();
    _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
    _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
    nodeTiming = {
      name: "node",
      entryType: "node",
      startTime: 0,
      duration: 0,
      nodeStart: 0,
      v8Start: 0,
      bootstrapComplete: 0,
      environment: 0,
      loopStart: 0,
      loopExit: 0,
      idleTime: 0,
      uvMetricsInfo: {
        loopCount: 0,
        events: 0,
        eventsWaiting: 0
      },
      detail: void 0,
      toJSON() {
        return this;
      }
    };
    PerformanceEntry = class {
      static {
        __name(this, "PerformanceEntry");
      }
      __unenv__ = true;
      detail;
      entryType = "event";
      name;
      startTime;
      constructor(name, options) {
        this.name = name;
        this.startTime = options?.startTime || _performanceNow();
        this.detail = options?.detail;
      }
      get duration() {
        return _performanceNow() - this.startTime;
      }
      toJSON() {
        return {
          name: this.name,
          entryType: this.entryType,
          startTime: this.startTime,
          duration: this.duration,
          detail: this.detail
        };
      }
    };
    PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
      static {
        __name(this, "PerformanceMark");
      }
      entryType = "mark";
      constructor() {
        super(...arguments);
      }
      get duration() {
        return 0;
      }
    };
    PerformanceMeasure = class extends PerformanceEntry {
      static {
        __name(this, "PerformanceMeasure");
      }
      entryType = "measure";
    };
    PerformanceResourceTiming = class extends PerformanceEntry {
      static {
        __name(this, "PerformanceResourceTiming");
      }
      entryType = "resource";
      serverTiming = [];
      connectEnd = 0;
      connectStart = 0;
      decodedBodySize = 0;
      domainLookupEnd = 0;
      domainLookupStart = 0;
      encodedBodySize = 0;
      fetchStart = 0;
      initiatorType = "";
      name = "";
      nextHopProtocol = "";
      redirectEnd = 0;
      redirectStart = 0;
      requestStart = 0;
      responseEnd = 0;
      responseStart = 0;
      secureConnectionStart = 0;
      startTime = 0;
      transferSize = 0;
      workerStart = 0;
      responseStatus = 0;
    };
    PerformanceObserverEntryList = class {
      static {
        __name(this, "PerformanceObserverEntryList");
      }
      __unenv__ = true;
      getEntries() {
        return [];
      }
      getEntriesByName(_name, _type) {
        return [];
      }
      getEntriesByType(type) {
        return [];
      }
    };
    Performance = class {
      static {
        __name(this, "Performance");
      }
      __unenv__ = true;
      timeOrigin = _timeOrigin;
      eventCounts = /* @__PURE__ */ new Map();
      _entries = [];
      _resourceTimingBufferSize = 0;
      navigation = void 0;
      timing = void 0;
      timerify(_fn, _options) {
        throw createNotImplementedError("Performance.timerify");
      }
      get nodeTiming() {
        return nodeTiming;
      }
      eventLoopUtilization() {
        return {};
      }
      markResourceTiming() {
        return new PerformanceResourceTiming("");
      }
      onresourcetimingbufferfull = null;
      now() {
        if (this.timeOrigin === _timeOrigin) {
          return _performanceNow();
        }
        return Date.now() - this.timeOrigin;
      }
      clearMarks(markName) {
        this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
      }
      clearMeasures(measureName) {
        this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
      }
      clearResourceTimings() {
        this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
      }
      getEntries() {
        return this._entries;
      }
      getEntriesByName(name, type) {
        return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
      }
      getEntriesByType(type) {
        return this._entries.filter((e) => e.entryType === type);
      }
      mark(name, options) {
        const entry = new PerformanceMark(name, options);
        this._entries.push(entry);
        return entry;
      }
      measure(measureName, startOrMeasureOptions, endMark) {
        let start;
        let end;
        if (typeof startOrMeasureOptions === "string") {
          start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
          end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
        } else {
          start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
          end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
        }
        const entry = new PerformanceMeasure(measureName, {
          startTime: start,
          detail: {
            start,
            end
          }
        });
        this._entries.push(entry);
        return entry;
      }
      setResourceTimingBufferSize(maxSize) {
        this._resourceTimingBufferSize = maxSize;
      }
      addEventListener(type, listener, options) {
        throw createNotImplementedError("Performance.addEventListener");
      }
      removeEventListener(type, listener, options) {
        throw createNotImplementedError("Performance.removeEventListener");
      }
      dispatchEvent(event) {
        throw createNotImplementedError("Performance.dispatchEvent");
      }
      toJSON() {
        return this;
      }
    };
    PerformanceObserver = class {
      static {
        __name(this, "PerformanceObserver");
      }
      __unenv__ = true;
      static supportedEntryTypes = [];
      _callback = null;
      constructor(callback) {
        this._callback = callback;
      }
      takeRecords() {
        return [];
      }
      disconnect() {
        throw createNotImplementedError("PerformanceObserver.disconnect");
      }
      observe(options) {
        throw createNotImplementedError("PerformanceObserver.observe");
      }
      bind(fn) {
        return fn;
      }
      runInAsyncScope(fn, thisArg, ...args) {
        return fn.call(thisArg, ...args);
      }
      asyncId() {
        return 0;
      }
      triggerAsyncId() {
        return 0;
      }
      emitDestroy() {
        return this;
      }
    };
    performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();
  }
});

// ../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/perf_hooks.mjs
var init_perf_hooks = __esm({
  "../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/perf_hooks.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_performance();
  }
});

// ../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
var init_performance2 = __esm({
  "../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs"() {
    init_perf_hooks();
    if (!("__unenv__" in performance)) {
      const proto = Performance.prototype;
      for (const key2 of Object.getOwnPropertyNames(proto)) {
        if (key2 !== "constructor" && !(key2 in performance)) {
          const desc = Object.getOwnPropertyDescriptor(proto, key2);
          if (desc) {
            Object.defineProperty(performance, key2, desc);
          }
        }
      }
    }
    globalThis.performance = performance;
    globalThis.Performance = Performance;
    globalThis.PerformanceEntry = PerformanceEntry;
    globalThis.PerformanceMark = PerformanceMark;
    globalThis.PerformanceMeasure = PerformanceMeasure;
    globalThis.PerformanceObserver = PerformanceObserver;
    globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
    globalThis.PerformanceResourceTiming = PerformanceResourceTiming;
  }
});

// ../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default;
var init_noop = __esm({
  "../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/mock/noop.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    noop_default = Object.assign(() => {
    }, { __unenv__: true });
  }
});

// ../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";
var _console, _ignoreErrors, _stderr, _stdout, log, info, trace, debug, table, error, warn, createTask, clear, count, countReset, dir, dirxml, group, groupEnd, groupCollapsed, profile, profileEnd, time, timeEnd, timeLog, timeStamp, Console, _times, _stdoutErrorHandler, _stderrErrorHandler;
var init_console = __esm({
  "../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/console.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_noop();
    init_utils();
    _console = globalThis.console;
    _ignoreErrors = true;
    _stderr = new Writable();
    _stdout = new Writable();
    log = _console?.log ?? noop_default;
    info = _console?.info ?? log;
    trace = _console?.trace ?? info;
    debug = _console?.debug ?? log;
    table = _console?.table ?? log;
    error = _console?.error ?? log;
    warn = _console?.warn ?? error;
    createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
    clear = _console?.clear ?? noop_default;
    count = _console?.count ?? noop_default;
    countReset = _console?.countReset ?? noop_default;
    dir = _console?.dir ?? noop_default;
    dirxml = _console?.dirxml ?? noop_default;
    group = _console?.group ?? noop_default;
    groupEnd = _console?.groupEnd ?? noop_default;
    groupCollapsed = _console?.groupCollapsed ?? noop_default;
    profile = _console?.profile ?? noop_default;
    profileEnd = _console?.profileEnd ?? noop_default;
    time = _console?.time ?? noop_default;
    timeEnd = _console?.timeEnd ?? noop_default;
    timeLog = _console?.timeLog ?? noop_default;
    timeStamp = _console?.timeStamp ?? noop_default;
    Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
    _times = /* @__PURE__ */ new Map();
    _stdoutErrorHandler = noop_default;
    _stderrErrorHandler = noop_default;
  }
});

// ../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole, assert, clear2, context, count2, countReset2, createTask2, debug2, dir2, dirxml2, error2, group2, groupCollapsed2, groupEnd2, info2, log2, profile2, profileEnd2, table2, time2, timeEnd2, timeLog2, timeStamp2, trace2, warn2, console_default;
var init_console2 = __esm({
  "../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_console();
    workerdConsole = globalThis["console"];
    ({
      assert,
      clear: clear2,
      context: (
        // @ts-expect-error undocumented public API
        context
      ),
      count: count2,
      countReset: countReset2,
      createTask: (
        // @ts-expect-error undocumented public API
        createTask2
      ),
      debug: debug2,
      dir: dir2,
      dirxml: dirxml2,
      error: error2,
      group: group2,
      groupCollapsed: groupCollapsed2,
      groupEnd: groupEnd2,
      info: info2,
      log: log2,
      profile: profile2,
      profileEnd: profileEnd2,
      table: table2,
      time: time2,
      timeEnd: timeEnd2,
      timeLog: timeLog2,
      timeStamp: timeStamp2,
      trace: trace2,
      warn: warn2
    } = workerdConsole);
    Object.assign(workerdConsole, {
      Console,
      _ignoreErrors,
      _stderr,
      _stderrErrorHandler,
      _stdout,
      _stdoutErrorHandler,
      _times
    });
    console_default = workerdConsole;
  }
});

// ../../../../../opt/homebrew/lib/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
var init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console = __esm({
  "../../../../../opt/homebrew/lib/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console"() {
    init_console2();
    globalThis.console = console_default;
  }
});

// ../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime;
var init_hrtime = __esm({
  "../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
      const now = Date.now();
      const seconds = Math.trunc(now / 1e3);
      const nanos = now % 1e3 * 1e6;
      if (startTime) {
        let diffSeconds = seconds - startTime[0];
        let diffNanos = nanos - startTime[0];
        if (diffNanos < 0) {
          diffSeconds = diffSeconds - 1;
          diffNanos = 1e9 + diffNanos;
        }
        return [diffSeconds, diffNanos];
      }
      return [seconds, nanos];
    }, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
      return BigInt(Date.now() * 1e6);
    }, "bigint") });
  }
});

// ../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream;
var init_read_stream = __esm({
  "../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    ReadStream = class {
      static {
        __name(this, "ReadStream");
      }
      fd;
      isRaw = false;
      isTTY = false;
      constructor(fd) {
        this.fd = fd;
      }
      setRawMode(mode) {
        this.isRaw = mode;
        return this;
      }
    };
  }
});

// ../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream;
var init_write_stream = __esm({
  "../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    WriteStream = class {
      static {
        __name(this, "WriteStream");
      }
      fd;
      columns = 80;
      rows = 24;
      isTTY = false;
      constructor(fd) {
        this.fd = fd;
      }
      clearLine(dir3, callback) {
        callback && callback();
        return false;
      }
      clearScreenDown(callback) {
        callback && callback();
        return false;
      }
      cursorTo(x, y, callback) {
        callback && typeof callback === "function" && callback();
        return false;
      }
      moveCursor(dx, dy, callback) {
        callback && callback();
        return false;
      }
      getColorDepth(env2) {
        return 1;
      }
      hasColors(count3, env2) {
        return false;
      }
      getWindowSize() {
        return [this.columns, this.rows];
      }
      write(str, encoding, cb) {
        if (str instanceof Uint8Array) {
          str = new TextDecoder().decode(str);
        }
        try {
          console.log(str);
        } catch {
        }
        cb && typeof cb === "function" && cb();
        return false;
      }
    };
  }
});

// ../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/tty.mjs
var init_tty = __esm({
  "../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/tty.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_read_stream();
    init_write_stream();
  }
});

// ../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION;
var init_node_version = __esm({
  "../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    NODE_VERSION = "22.14.0";
  }
});

// ../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";
var Process;
var init_process = __esm({
  "../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/process/process.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_tty();
    init_utils();
    init_node_version();
    Process = class _Process extends EventEmitter {
      static {
        __name(this, "Process");
      }
      env;
      hrtime;
      nextTick;
      constructor(impl) {
        super();
        this.env = impl.env;
        this.hrtime = impl.hrtime;
        this.nextTick = impl.nextTick;
        for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
          const value = this[prop];
          if (typeof value === "function") {
            this[prop] = value.bind(this);
          }
        }
      }
      // --- event emitter ---
      emitWarning(warning, type, code) {
        console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
      }
      emit(...args) {
        return super.emit(...args);
      }
      listeners(eventName) {
        return super.listeners(eventName);
      }
      // --- stdio (lazy initializers) ---
      #stdin;
      #stdout;
      #stderr;
      get stdin() {
        return this.#stdin ??= new ReadStream(0);
      }
      get stdout() {
        return this.#stdout ??= new WriteStream(1);
      }
      get stderr() {
        return this.#stderr ??= new WriteStream(2);
      }
      // --- cwd ---
      #cwd = "/";
      chdir(cwd2) {
        this.#cwd = cwd2;
      }
      cwd() {
        return this.#cwd;
      }
      // --- dummy props and getters ---
      arch = "";
      platform = "";
      argv = [];
      argv0 = "";
      execArgv = [];
      execPath = "";
      title = "";
      pid = 200;
      ppid = 100;
      get version() {
        return `v${NODE_VERSION}`;
      }
      get versions() {
        return { node: NODE_VERSION };
      }
      get allowedNodeEnvironmentFlags() {
        return /* @__PURE__ */ new Set();
      }
      get sourceMapsEnabled() {
        return false;
      }
      get debugPort() {
        return 0;
      }
      get throwDeprecation() {
        return false;
      }
      get traceDeprecation() {
        return false;
      }
      get features() {
        return {};
      }
      get release() {
        return {};
      }
      get connected() {
        return false;
      }
      get config() {
        return {};
      }
      get moduleLoadList() {
        return [];
      }
      constrainedMemory() {
        return 0;
      }
      availableMemory() {
        return 0;
      }
      uptime() {
        return 0;
      }
      resourceUsage() {
        return {};
      }
      // --- noop methods ---
      ref() {
      }
      unref() {
      }
      // --- unimplemented methods ---
      umask() {
        throw createNotImplementedError("process.umask");
      }
      getBuiltinModule() {
        return void 0;
      }
      getActiveResourcesInfo() {
        throw createNotImplementedError("process.getActiveResourcesInfo");
      }
      exit() {
        throw createNotImplementedError("process.exit");
      }
      reallyExit() {
        throw createNotImplementedError("process.reallyExit");
      }
      kill() {
        throw createNotImplementedError("process.kill");
      }
      abort() {
        throw createNotImplementedError("process.abort");
      }
      dlopen() {
        throw createNotImplementedError("process.dlopen");
      }
      setSourceMapsEnabled() {
        throw createNotImplementedError("process.setSourceMapsEnabled");
      }
      loadEnvFile() {
        throw createNotImplementedError("process.loadEnvFile");
      }
      disconnect() {
        throw createNotImplementedError("process.disconnect");
      }
      cpuUsage() {
        throw createNotImplementedError("process.cpuUsage");
      }
      setUncaughtExceptionCaptureCallback() {
        throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
      }
      hasUncaughtExceptionCaptureCallback() {
        throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
      }
      initgroups() {
        throw createNotImplementedError("process.initgroups");
      }
      openStdin() {
        throw createNotImplementedError("process.openStdin");
      }
      assert() {
        throw createNotImplementedError("process.assert");
      }
      binding() {
        throw createNotImplementedError("process.binding");
      }
      // --- attached interfaces ---
      permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
      report = {
        directory: "",
        filename: "",
        signal: "SIGUSR2",
        compact: false,
        reportOnFatalError: false,
        reportOnSignal: false,
        reportOnUncaughtException: false,
        getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
        writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
      };
      finalization = {
        register: /* @__PURE__ */ notImplemented("process.finalization.register"),
        unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
        registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
      };
      memoryUsage = Object.assign(() => ({
        arrayBuffers: 0,
        rss: 0,
        external: 0,
        heapTotal: 0,
        heapUsed: 0
      }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
      // --- undefined props ---
      mainModule = void 0;
      domain = void 0;
      // optional
      send = void 0;
      exitCode = void 0;
      channel = void 0;
      getegid = void 0;
      geteuid = void 0;
      getgid = void 0;
      getgroups = void 0;
      getuid = void 0;
      setegid = void 0;
      seteuid = void 0;
      setgid = void 0;
      setgroups = void 0;
      setuid = void 0;
      // internals
      _events = void 0;
      _eventsCount = void 0;
      _exiting = void 0;
      _maxListeners = void 0;
      _debugEnd = void 0;
      _debugProcess = void 0;
      _fatalException = void 0;
      _getActiveHandles = void 0;
      _getActiveRequests = void 0;
      _kill = void 0;
      _preload_modules = void 0;
      _rawDebug = void 0;
      _startProfilerIdleNotifier = void 0;
      _stopProfilerIdleNotifier = void 0;
      _tickCallback = void 0;
      _disconnect = void 0;
      _handleQueue = void 0;
      _pendingMessage = void 0;
      _channel = void 0;
      _send = void 0;
      _linkedBinding = void 0;
    };
  }
});

// ../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess, getBuiltinModule, workerdProcess, unenvProcess, exit, features, platform, _channel, _debugEnd, _debugProcess, _disconnect, _events, _eventsCount, _exiting, _fatalException, _getActiveHandles, _getActiveRequests, _handleQueue, _kill, _linkedBinding, _maxListeners, _pendingMessage, _preload_modules, _rawDebug, _send, _startProfilerIdleNotifier, _stopProfilerIdleNotifier, _tickCallback, abort, addListener, allowedNodeEnvironmentFlags, arch, argv, argv0, assert2, availableMemory, binding, channel, chdir, config, connected, constrainedMemory, cpuUsage, cwd, debugPort, disconnect, dlopen, domain, emit, emitWarning, env, eventNames, execArgv, execPath, exitCode, finalization, getActiveResourcesInfo, getegid, geteuid, getgid, getgroups, getMaxListeners, getuid, hasUncaughtExceptionCaptureCallback, hrtime3, initgroups, kill, listenerCount, listeners, loadEnvFile, mainModule, memoryUsage, moduleLoadList, nextTick, off, on, once, openStdin, permission, pid, ppid, prependListener, prependOnceListener, rawListeners, reallyExit, ref, release, removeAllListeners, removeListener, report, resourceUsage, send, setegid, seteuid, setgid, setgroups, setMaxListeners, setSourceMapsEnabled, setuid, setUncaughtExceptionCaptureCallback, sourceMapsEnabled, stderr, stdin, stdout, throwDeprecation, title, traceDeprecation, umask, unref, uptime, version, versions, _process, process_default;
var init_process2 = __esm({
  "../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_hrtime();
    init_process();
    globalProcess = globalThis["process"];
    getBuiltinModule = globalProcess.getBuiltinModule;
    workerdProcess = getBuiltinModule("node:process");
    unenvProcess = new Process({
      env: globalProcess.env,
      hrtime,
      // `nextTick` is available from workerd process v1
      nextTick: workerdProcess.nextTick
    });
    ({ exit, features, platform } = workerdProcess);
    ({
      _channel,
      _debugEnd,
      _debugProcess,
      _disconnect,
      _events,
      _eventsCount,
      _exiting,
      _fatalException,
      _getActiveHandles,
      _getActiveRequests,
      _handleQueue,
      _kill,
      _linkedBinding,
      _maxListeners,
      _pendingMessage,
      _preload_modules,
      _rawDebug,
      _send,
      _startProfilerIdleNotifier,
      _stopProfilerIdleNotifier,
      _tickCallback,
      abort,
      addListener,
      allowedNodeEnvironmentFlags,
      arch,
      argv,
      argv0,
      assert: assert2,
      availableMemory,
      binding,
      channel,
      chdir,
      config,
      connected,
      constrainedMemory,
      cpuUsage,
      cwd,
      debugPort,
      disconnect,
      dlopen,
      domain,
      emit,
      emitWarning,
      env,
      eventNames,
      execArgv,
      execPath,
      exitCode,
      finalization,
      getActiveResourcesInfo,
      getegid,
      geteuid,
      getgid,
      getgroups,
      getMaxListeners,
      getuid,
      hasUncaughtExceptionCaptureCallback,
      hrtime: hrtime3,
      initgroups,
      kill,
      listenerCount,
      listeners,
      loadEnvFile,
      mainModule,
      memoryUsage,
      moduleLoadList,
      nextTick,
      off,
      on,
      once,
      openStdin,
      permission,
      pid,
      ppid,
      prependListener,
      prependOnceListener,
      rawListeners,
      reallyExit,
      ref,
      release,
      removeAllListeners,
      removeListener,
      report,
      resourceUsage,
      send,
      setegid,
      seteuid,
      setgid,
      setgroups,
      setMaxListeners,
      setSourceMapsEnabled,
      setuid,
      setUncaughtExceptionCaptureCallback,
      sourceMapsEnabled,
      stderr,
      stdin,
      stdout,
      throwDeprecation,
      title,
      traceDeprecation,
      umask,
      unref,
      uptime,
      version,
      versions
    } = unenvProcess);
    _process = {
      abort,
      addListener,
      allowedNodeEnvironmentFlags,
      hasUncaughtExceptionCaptureCallback,
      setUncaughtExceptionCaptureCallback,
      loadEnvFile,
      sourceMapsEnabled,
      arch,
      argv,
      argv0,
      chdir,
      config,
      connected,
      constrainedMemory,
      availableMemory,
      cpuUsage,
      cwd,
      debugPort,
      dlopen,
      disconnect,
      emit,
      emitWarning,
      env,
      eventNames,
      execArgv,
      execPath,
      exit,
      finalization,
      features,
      getBuiltinModule,
      getActiveResourcesInfo,
      getMaxListeners,
      hrtime: hrtime3,
      kill,
      listeners,
      listenerCount,
      memoryUsage,
      nextTick,
      on,
      off,
      once,
      pid,
      platform,
      ppid,
      prependListener,
      prependOnceListener,
      rawListeners,
      release,
      removeAllListeners,
      removeListener,
      report,
      resourceUsage,
      setMaxListeners,
      setSourceMapsEnabled,
      stderr,
      stdin,
      stdout,
      title,
      throwDeprecation,
      traceDeprecation,
      umask,
      uptime,
      version,
      versions,
      // @ts-expect-error old API
      domain,
      initgroups,
      moduleLoadList,
      reallyExit,
      openStdin,
      assert: assert2,
      binding,
      send,
      exitCode,
      channel,
      getegid,
      geteuid,
      getgid,
      getgroups,
      getuid,
      setegid,
      seteuid,
      setgid,
      setgroups,
      setuid,
      permission,
      mainModule,
      _events,
      _eventsCount,
      _exiting,
      _maxListeners,
      _debugEnd,
      _debugProcess,
      _fatalException,
      _getActiveHandles,
      _getActiveRequests,
      _kill,
      _preload_modules,
      _rawDebug,
      _startProfilerIdleNotifier,
      _stopProfilerIdleNotifier,
      _tickCallback,
      _disconnect,
      _handleQueue,
      _pendingMessage,
      _channel,
      _send,
      _linkedBinding
    };
    process_default = _process;
  }
});

// ../../../../../opt/homebrew/lib/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
var init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process = __esm({
  "../../../../../opt/homebrew/lib/node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process"() {
    init_process2();
    globalThis.process = process_default;
  }
});

// ../netlify/functions/address-suggest.mjs
function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
async function placesSuggestions(query, key2) {
  const url = "https://maps.googleapis.com/maps/api/place/autocomplete/json?" + new URLSearchParams({
    input: query,
    types: "address",
    components: "country:us",
    key: key2
  });
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") return [];
  return (data.predictions || []).map((p) => String(p.description || "").trim()).filter(Boolean).slice(0, 8);
}
var address_suggest_default;
var init_address_suggest = __esm({
  "../netlify/functions/address-suggest.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name(json, "json");
    __name(placesSuggestions, "placesSuggestions");
    address_suggest_default = /* @__PURE__ */ __name(async (req) => {
      if (req.method === "OPTIONS") return json({ ok: true });
      if (req.method !== "GET") return json({ ok: false, error: "GET only" }, 405);
      const url = new URL(req.url);
      const q = String(url.searchParams.get("q") || "").trim();
      if (!q || q.length < 3) return json({ suggestions: [], source: "none" });
      const key2 = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
      if (!key2) return json({ suggestions: [], source: "none", needsKey: true });
      try {
        const suggestions = await placesSuggestions(q, key2);
        return json({ suggestions, source: "places" });
      } catch {
        return json({ suggestions: [], source: "none" });
      }
    }, "default");
  }
});

// ../node_modules/@netlify/blobs/dist/chunk-XR3MUBBK.js
var NF_ERROR, NF_REQUEST_ID, BlobsInternalError, collectIterator, base64Decode, base64Encode, getEnvironment, getEnvironmentContext, MissingBlobsEnvironmentError, BASE64_PREFIX, METADATA_HEADER_INTERNAL, METADATA_HEADER_EXTERNAL, METADATA_MAX_SIZE, encodeMetadata, decodeMetadata, getMetadataFromResponse, BlobsConsistencyError, regions, isValidRegion, InvalidBlobsRegionError, DEFAULT_RETRY_DELAY, MIN_RETRY_DELAY, MAX_RETRY, RATE_LIMIT_HEADER, fetchAndRetry, getDelay, sleep, SIGNED_URL_ACCEPT_HEADER, Client, getClientOptions;
var init_chunk_XR3MUBBK = __esm({
  "../node_modules/@netlify/blobs/dist/chunk-XR3MUBBK.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    NF_ERROR = "x-nf-error";
    NF_REQUEST_ID = "x-nf-request-id";
    BlobsInternalError = class extends Error {
      static {
        __name(this, "BlobsInternalError");
      }
      constructor(res) {
        let details = res.headers.get(NF_ERROR) || `${res.status} status code`;
        if (res.headers.has(NF_REQUEST_ID)) {
          details += `, ID: ${res.headers.get(NF_REQUEST_ID)}`;
        }
        super(`Netlify Blobs has generated an internal error (${details})`);
        this.name = "BlobsInternalError";
      }
    };
    collectIterator = /* @__PURE__ */ __name(async (iterator) => {
      const result = [];
      for await (const item of iterator) {
        result.push(item);
      }
      return result;
    }, "collectIterator");
    base64Decode = /* @__PURE__ */ __name((input) => {
      const { Buffer: Buffer2 } = globalThis;
      if (Buffer2) {
        return Buffer2.from(input, "base64").toString();
      }
      return atob(input);
    }, "base64Decode");
    base64Encode = /* @__PURE__ */ __name((input) => {
      const { Buffer: Buffer2 } = globalThis;
      if (Buffer2) {
        return Buffer2.from(input).toString("base64");
      }
      return btoa(input);
    }, "base64Encode");
    getEnvironment = /* @__PURE__ */ __name(() => {
      const { Deno, Netlify, process: process2 } = globalThis;
      return Netlify?.env ?? Deno?.env ?? {
        delete: /* @__PURE__ */ __name((key2) => delete process2?.env[key2], "delete"),
        get: /* @__PURE__ */ __name((key2) => process2?.env[key2], "get"),
        has: /* @__PURE__ */ __name((key2) => Boolean(process2?.env[key2]), "has"),
        set: /* @__PURE__ */ __name((key2, value) => {
          if (process2?.env) {
            process2.env[key2] = value;
          }
        }, "set"),
        toObject: /* @__PURE__ */ __name(() => process2?.env ?? {}, "toObject")
      };
    }, "getEnvironment");
    getEnvironmentContext = /* @__PURE__ */ __name(() => {
      const context2 = globalThis.netlifyBlobsContext || getEnvironment().get("NETLIFY_BLOBS_CONTEXT");
      if (typeof context2 !== "string" || !context2) {
        return {};
      }
      const data = base64Decode(context2);
      try {
        return JSON.parse(data);
      } catch {
      }
      return {};
    }, "getEnvironmentContext");
    MissingBlobsEnvironmentError = class extends Error {
      static {
        __name(this, "MissingBlobsEnvironmentError");
      }
      constructor(requiredProperties) {
        super(
          `The environment has not been configured to use Netlify Blobs. To use it manually, supply the following properties when creating a store: ${requiredProperties.join(
            ", "
          )}`
        );
        this.name = "MissingBlobsEnvironmentError";
      }
    };
    BASE64_PREFIX = "b64;";
    METADATA_HEADER_INTERNAL = "x-amz-meta-user";
    METADATA_HEADER_EXTERNAL = "netlify-blobs-metadata";
    METADATA_MAX_SIZE = 2 * 1024;
    encodeMetadata = /* @__PURE__ */ __name((metadata) => {
      if (!metadata) {
        return null;
      }
      const encodedObject = base64Encode(JSON.stringify(metadata));
      const payload = `b64;${encodedObject}`;
      if (METADATA_HEADER_EXTERNAL.length + payload.length > METADATA_MAX_SIZE) {
        throw new Error("Metadata object exceeds the maximum size");
      }
      return payload;
    }, "encodeMetadata");
    decodeMetadata = /* @__PURE__ */ __name((header) => {
      if (!header || !header.startsWith(BASE64_PREFIX)) {
        return {};
      }
      const encodedData = header.slice(BASE64_PREFIX.length);
      const decodedData = base64Decode(encodedData);
      const metadata = JSON.parse(decodedData);
      return metadata;
    }, "decodeMetadata");
    getMetadataFromResponse = /* @__PURE__ */ __name((response) => {
      if (!response.headers) {
        return {};
      }
      const value = response.headers.get(METADATA_HEADER_EXTERNAL) || response.headers.get(METADATA_HEADER_INTERNAL);
      try {
        return decodeMetadata(value);
      } catch {
        throw new Error(
          "An internal error occurred while trying to retrieve the metadata for an entry. Please try updating to the latest version of the Netlify Blobs client."
        );
      }
    }, "getMetadataFromResponse");
    BlobsConsistencyError = class extends Error {
      static {
        __name(this, "BlobsConsistencyError");
      }
      constructor() {
        super(
          `Netlify Blobs has failed to perform a read using strong consistency because the environment has not been configured with a 'uncachedEdgeURL' property`
        );
        this.name = "BlobsConsistencyError";
      }
    };
    regions = {
      "us-east-1": true,
      "us-east-2": true,
      "eu-central-1": true,
      "ap-southeast-1": true,
      "ap-southeast-2": true
    };
    isValidRegion = /* @__PURE__ */ __name((input) => Object.keys(regions).includes(input), "isValidRegion");
    InvalidBlobsRegionError = class extends Error {
      static {
        __name(this, "InvalidBlobsRegionError");
      }
      constructor(region) {
        super(
          `${region} is not a supported Netlify Blobs region. Supported values are: ${Object.keys(regions).join(", ")}.`
        );
        this.name = "InvalidBlobsRegionError";
      }
    };
    DEFAULT_RETRY_DELAY = getEnvironment().get("NODE_ENV") === "test" ? 1 : 5e3;
    MIN_RETRY_DELAY = 1e3;
    MAX_RETRY = 5;
    RATE_LIMIT_HEADER = "X-RateLimit-Reset";
    fetchAndRetry = /* @__PURE__ */ __name(async (fetch2, url, options, attemptsLeft = MAX_RETRY) => {
      try {
        const res = await fetch2(url, options);
        if (attemptsLeft > 0 && (res.status === 429 || res.status >= 500)) {
          const delay = getDelay(res.headers.get(RATE_LIMIT_HEADER));
          await sleep(delay);
          return fetchAndRetry(fetch2, url, options, attemptsLeft - 1);
        }
        return res;
      } catch (error3) {
        if (attemptsLeft === 0) {
          throw error3;
        }
        const delay = getDelay();
        await sleep(delay);
        return fetchAndRetry(fetch2, url, options, attemptsLeft - 1);
      }
    }, "fetchAndRetry");
    getDelay = /* @__PURE__ */ __name((rateLimitReset) => {
      if (!rateLimitReset) {
        return DEFAULT_RETRY_DELAY;
      }
      return Math.max(Number(rateLimitReset) * 1e3 - Date.now(), MIN_RETRY_DELAY);
    }, "getDelay");
    sleep = /* @__PURE__ */ __name((ms) => new Promise((resolve) => {
      setTimeout(resolve, ms);
    }), "sleep");
    SIGNED_URL_ACCEPT_HEADER = "application/json;type=signed-url";
    Client = class {
      static {
        __name(this, "Client");
      }
      constructor({ apiURL, consistency, edgeURL, fetch: fetch2, region, siteID, token, uncachedEdgeURL }) {
        this.apiURL = apiURL;
        this.consistency = consistency ?? "eventual";
        this.edgeURL = edgeURL;
        this.fetch = fetch2 ?? globalThis.fetch;
        this.region = region;
        this.siteID = siteID;
        this.token = token;
        this.uncachedEdgeURL = uncachedEdgeURL;
        if (!this.fetch) {
          throw new Error(
            "Netlify Blobs could not find a `fetch` client in the global scope. You can either update your runtime to a version that includes `fetch` (like Node.js 18.0.0 or above), or you can supply your own implementation using the `fetch` property."
          );
        }
      }
      async getFinalRequest({
        consistency: opConsistency,
        key: key2,
        metadata,
        method,
        parameters = {},
        storeName
      }) {
        const encodedMetadata = encodeMetadata(metadata);
        const consistency = opConsistency ?? this.consistency;
        let urlPath = `/${this.siteID}`;
        if (storeName) {
          urlPath += `/${storeName}`;
        }
        if (key2) {
          urlPath += `/${key2}`;
        }
        if (this.edgeURL) {
          if (consistency === "strong" && !this.uncachedEdgeURL) {
            throw new BlobsConsistencyError();
          }
          const headers = {
            authorization: `Bearer ${this.token}`
          };
          if (encodedMetadata) {
            headers[METADATA_HEADER_INTERNAL] = encodedMetadata;
          }
          if (this.region) {
            urlPath = `/region:${this.region}${urlPath}`;
          }
          const url2 = new URL(urlPath, consistency === "strong" ? this.uncachedEdgeURL : this.edgeURL);
          for (const key22 in parameters) {
            url2.searchParams.set(key22, parameters[key22]);
          }
          return {
            headers,
            url: url2.toString()
          };
        }
        const apiHeaders = { authorization: `Bearer ${this.token}` };
        const url = new URL(`/api/v1/blobs${urlPath}`, this.apiURL ?? "https://api.netlify.com");
        for (const key22 in parameters) {
          url.searchParams.set(key22, parameters[key22]);
        }
        if (this.region) {
          url.searchParams.set("region", this.region);
        }
        if (storeName === void 0 || key2 === void 0) {
          return {
            headers: apiHeaders,
            url: url.toString()
          };
        }
        if (encodedMetadata) {
          apiHeaders[METADATA_HEADER_EXTERNAL] = encodedMetadata;
        }
        if (method === "head" || method === "delete") {
          return {
            headers: apiHeaders,
            url: url.toString()
          };
        }
        const res = await this.fetch(url.toString(), {
          headers: { ...apiHeaders, accept: SIGNED_URL_ACCEPT_HEADER },
          method
        });
        if (res.status !== 200) {
          throw new BlobsInternalError(res);
        }
        const { url: signedURL } = await res.json();
        const userHeaders = encodedMetadata ? { [METADATA_HEADER_INTERNAL]: encodedMetadata } : void 0;
        return {
          headers: userHeaders,
          url: signedURL
        };
      }
      async makeRequest({
        body,
        consistency,
        headers: extraHeaders,
        key: key2,
        metadata,
        method,
        parameters,
        storeName
      }) {
        const { headers: baseHeaders = {}, url } = await this.getFinalRequest({
          consistency,
          key: key2,
          metadata,
          method,
          parameters,
          storeName
        });
        const headers = {
          ...baseHeaders,
          ...extraHeaders
        };
        if (method === "put") {
          headers["cache-control"] = "max-age=0, stale-while-revalidate=60";
        }
        const options = {
          body,
          headers,
          method
        };
        if (body instanceof ReadableStream) {
          options.duplex = "half";
        }
        return fetchAndRetry(this.fetch, url, options);
      }
    };
    getClientOptions = /* @__PURE__ */ __name((options, contextOverride) => {
      const context2 = contextOverride ?? getEnvironmentContext();
      const siteID = context2.siteID ?? options.siteID;
      const token = context2.token ?? options.token;
      if (!siteID || !token) {
        throw new MissingBlobsEnvironmentError(["siteID", "token"]);
      }
      if (options.region !== void 0 && !isValidRegion(options.region)) {
        throw new InvalidBlobsRegionError(options.region);
      }
      const clientOptions = {
        apiURL: context2.apiURL ?? options.apiURL,
        consistency: options.consistency,
        edgeURL: context2.edgeURL ?? options.edgeURL,
        fetch: options.fetch,
        region: options.region,
        siteID,
        token,
        uncachedEdgeURL: context2.uncachedEdgeURL ?? options.uncachedEdgeURL
      };
      return clientOptions;
    }, "getClientOptions");
  }
});

// ../node_modules/@netlify/blobs/dist/main.js
var DEPLOY_STORE_PREFIX, LEGACY_STORE_INTERNAL_PREFIX, SITE_STORE_PREFIX, Store, getStore;
var init_main = __esm({
  "../node_modules/@netlify/blobs/dist/main.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_chunk_XR3MUBBK();
    DEPLOY_STORE_PREFIX = "deploy:";
    LEGACY_STORE_INTERNAL_PREFIX = "netlify-internal/legacy-namespace/";
    SITE_STORE_PREFIX = "site:";
    Store = class _Store {
      static {
        __name(this, "_Store");
      }
      constructor(options) {
        this.client = options.client;
        if ("deployID" in options) {
          _Store.validateDeployID(options.deployID);
          let name = DEPLOY_STORE_PREFIX + options.deployID;
          if (options.name) {
            name += `:${options.name}`;
          }
          this.name = name;
        } else if (options.name.startsWith(LEGACY_STORE_INTERNAL_PREFIX)) {
          const storeName = options.name.slice(LEGACY_STORE_INTERNAL_PREFIX.length);
          _Store.validateStoreName(storeName);
          this.name = storeName;
        } else {
          _Store.validateStoreName(options.name);
          this.name = SITE_STORE_PREFIX + options.name;
        }
      }
      async delete(key2) {
        const res = await this.client.makeRequest({ key: key2, method: "delete", storeName: this.name });
        if (![200, 204, 404].includes(res.status)) {
          throw new BlobsInternalError(res);
        }
      }
      async get(key2, options) {
        const { consistency, type } = options ?? {};
        const res = await this.client.makeRequest({ consistency, key: key2, method: "get", storeName: this.name });
        if (res.status === 404) {
          return null;
        }
        if (res.status !== 200) {
          throw new BlobsInternalError(res);
        }
        if (type === void 0 || type === "text") {
          return res.text();
        }
        if (type === "arrayBuffer") {
          return res.arrayBuffer();
        }
        if (type === "blob") {
          return res.blob();
        }
        if (type === "json") {
          return res.json();
        }
        if (type === "stream") {
          return res.body;
        }
        throw new BlobsInternalError(res);
      }
      async getMetadata(key2, { consistency } = {}) {
        const res = await this.client.makeRequest({ consistency, key: key2, method: "head", storeName: this.name });
        if (res.status === 404) {
          return null;
        }
        if (res.status !== 200 && res.status !== 304) {
          throw new BlobsInternalError(res);
        }
        const etag = res?.headers.get("etag") ?? void 0;
        const metadata = getMetadataFromResponse(res);
        const result = {
          etag,
          metadata
        };
        return result;
      }
      async getWithMetadata(key2, options) {
        const { consistency, etag: requestETag, type } = options ?? {};
        const headers = requestETag ? { "if-none-match": requestETag } : void 0;
        const res = await this.client.makeRequest({
          consistency,
          headers,
          key: key2,
          method: "get",
          storeName: this.name
        });
        if (res.status === 404) {
          return null;
        }
        if (res.status !== 200 && res.status !== 304) {
          throw new BlobsInternalError(res);
        }
        const responseETag = res?.headers.get("etag") ?? void 0;
        const metadata = getMetadataFromResponse(res);
        const result = {
          etag: responseETag,
          metadata
        };
        if (res.status === 304 && requestETag) {
          return { data: null, ...result };
        }
        if (type === void 0 || type === "text") {
          return { data: await res.text(), ...result };
        }
        if (type === "arrayBuffer") {
          return { data: await res.arrayBuffer(), ...result };
        }
        if (type === "blob") {
          return { data: await res.blob(), ...result };
        }
        if (type === "json") {
          return { data: await res.json(), ...result };
        }
        if (type === "stream") {
          return { data: res.body, ...result };
        }
        throw new Error(`Invalid 'type' property: ${type}. Expected: arrayBuffer, blob, json, stream, or text.`);
      }
      list(options = {}) {
        const iterator = this.getListIterator(options);
        if (options.paginate) {
          return iterator;
        }
        return collectIterator(iterator).then(
          (items) => items.reduce(
            (acc, item) => ({
              blobs: [...acc.blobs, ...item.blobs],
              directories: [...acc.directories, ...item.directories]
            }),
            { blobs: [], directories: [] }
          )
        );
      }
      async set(key2, data, { metadata } = {}) {
        _Store.validateKey(key2);
        const res = await this.client.makeRequest({
          body: data,
          key: key2,
          metadata,
          method: "put",
          storeName: this.name
        });
        if (res.status !== 200) {
          throw new BlobsInternalError(res);
        }
      }
      async setJSON(key2, data, { metadata } = {}) {
        _Store.validateKey(key2);
        const payload = JSON.stringify(data);
        const headers = {
          "content-type": "application/json"
        };
        const res = await this.client.makeRequest({
          body: payload,
          headers,
          key: key2,
          metadata,
          method: "put",
          storeName: this.name
        });
        if (res.status !== 200) {
          throw new BlobsInternalError(res);
        }
      }
      static formatListResultBlob(result) {
        if (!result.key) {
          return null;
        }
        return {
          etag: result.etag,
          key: result.key
        };
      }
      static validateKey(key2) {
        if (key2 === "") {
          throw new Error("Blob key must not be empty.");
        }
        if (key2.startsWith("/") || key2.startsWith("%2F")) {
          throw new Error("Blob key must not start with forward slash (/).");
        }
        if (new TextEncoder().encode(key2).length > 600) {
          throw new Error(
            "Blob key must be a sequence of Unicode characters whose UTF-8 encoding is at most 600 bytes long."
          );
        }
      }
      static validateDeployID(deployID) {
        if (!/^\w{1,24}$/.test(deployID)) {
          throw new Error(`'${deployID}' is not a valid Netlify deploy ID.`);
        }
      }
      static validateStoreName(name) {
        if (name.includes("/") || name.includes("%2F")) {
          throw new Error("Store name must not contain forward slashes (/).");
        }
        if (new TextEncoder().encode(name).length > 64) {
          throw new Error(
            "Store name must be a sequence of Unicode characters whose UTF-8 encoding is at most 64 bytes long."
          );
        }
      }
      getListIterator(options) {
        const { client, name: storeName } = this;
        const parameters = {};
        if (options?.prefix) {
          parameters.prefix = options.prefix;
        }
        if (options?.directories) {
          parameters.directories = "true";
        }
        return {
          [Symbol.asyncIterator]() {
            let currentCursor = null;
            let done = false;
            return {
              async next() {
                if (done) {
                  return { done: true, value: void 0 };
                }
                const nextParameters = { ...parameters };
                if (currentCursor !== null) {
                  nextParameters.cursor = currentCursor;
                }
                const res = await client.makeRequest({
                  method: "get",
                  parameters: nextParameters,
                  storeName
                });
                let blobs = [];
                let directories = [];
                if (![200, 204, 404].includes(res.status)) {
                  throw new BlobsInternalError(res);
                }
                if (res.status === 404) {
                  done = true;
                } else {
                  const page = await res.json();
                  if (page.next_cursor) {
                    currentCursor = page.next_cursor;
                  } else {
                    done = true;
                  }
                  blobs = (page.blobs ?? []).map(_Store.formatListResultBlob).filter(Boolean);
                  directories = page.directories ?? [];
                }
                return {
                  done: false,
                  value: {
                    blobs,
                    directories
                  }
                };
              }
            };
          }
        };
      }
    };
    getStore = /* @__PURE__ */ __name((input) => {
      if (typeof input === "string") {
        const clientOptions = getClientOptions({});
        const client = new Client(clientOptions);
        return new Store({ client, name: input });
      }
      if (typeof input?.name === "string" && typeof input?.siteID === "string" && typeof input?.token === "string") {
        const { name, siteID, token } = input;
        const clientOptions = getClientOptions(input, { siteID, token });
        if (!name || !siteID || !token) {
          throw new MissingBlobsEnvironmentError(["name", "siteID", "token"]);
        }
        const client = new Client(clientOptions);
        return new Store({ client, name });
      }
      if (typeof input?.name === "string") {
        const { name } = input;
        const clientOptions = getClientOptions(input);
        if (!name) {
          throw new MissingBlobsEnvironmentError(["name"]);
        }
        const client = new Client(clientOptions);
        return new Store({ client, name });
      }
      if (typeof input?.deployID === "string") {
        const clientOptions = getClientOptions(input);
        const { deployID } = input;
        if (!deployID) {
          throw new MissingBlobsEnvironmentError(["deployID"]);
        }
        const client = new Client(clientOptions);
        return new Store({ client, deployID });
      }
      throw new Error(
        "The `getStore` method requires the name of the store as a string or as the `name` property of an options object"
      );
    }, "getStore");
  }
});

// ../netlify/functions/lib/storage/netlify.mjs
function createNetlifyStore(name) {
  return getStore(name);
}
var init_netlify = __esm({
  "../netlify/functions/lib/storage/netlify.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_main();
    __name(createNetlifyStore, "createNetlifyStore");
  }
});

// ../netlify/functions/lib/storage/cloudflare.mjs
function kvBinding(env2) {
  const kv = env2.LE_KV;
  if (!kv || typeof kv.get !== "function") {
    throw new Error("Cloudflare KV binding LE_KV is required (STORAGE_BACKEND=cloudflare)");
  }
  return kv;
}
function r2Binding(env2) {
  const r2 = env2.LE_R2;
  if (!r2 || typeof r2.get !== "function") {
    throw new Error("Cloudflare R2 binding LE_R2 is required for binary stores");
  }
  return r2;
}
function metaToStrings(meta) {
  const out = {};
  for (const [k, v] of Object.entries(meta || {})) out[k] = String(v);
  return out;
}
function metaFromStrings(meta) {
  const out = {};
  for (const [k, v] of Object.entries(meta || {})) {
    if (k === "ts" || k === "bytes") out[k] = Number(v);
    else out[k] = v;
  }
  return out;
}
function createKvJsonStore(storeName, env2) {
  const kv = kvBinding(env2);
  const prefix = `${storeName}/`;
  return {
    async get(key2, opts = {}) {
      const type = opts.type || "text";
      const raw = await kv.get(prefix + key2, type === "json" ? "json" : "text");
      if (raw == null) return null;
      if (type === "json") {
        return typeof raw === "object" ? raw : JSON.parse(String(raw));
      }
      if (type === "text") return String(raw);
      if (type === "arrayBuffer") {
        const s = typeof raw === "string" ? raw : JSON.stringify(raw);
        return new TextEncoder().encode(s).buffer;
      }
      return raw;
    },
    async setJSON(key2, obj) {
      await kv.put(prefix + key2, JSON.stringify(obj));
    },
    async set(key2, data, opts = {}) {
      const body = typeof data === "string" ? data : JSON.stringify(data);
      await kv.put(prefix + key2, body, { metadata: metaToStrings(opts.metadata || {}) });
    },
    async getWithMetadata(key2, opts = {}) {
      const type = opts.type || "text";
      const rec = await kv.getWithMetadata(prefix + key2, type === "json" ? "json" : "text");
      if (!rec || rec.value == null) return null;
      let data = rec.value;
      if (type === "arrayBuffer") {
        const s = typeof data === "string" ? data : JSON.stringify(data);
        data = new TextEncoder().encode(s).buffer;
      } else if (type === "blob" && typeof data === "string") {
        data = new Blob([data]);
      }
      return { data, metadata: metaFromStrings(rec.metadata) };
    },
    async delete(key2) {
      await kv.delete(prefix + key2);
    },
    async list() {
      const listed = await kv.list({ prefix });
      return { blobs: (listed.keys || []).map((k) => ({ key: k.name.slice(prefix.length) })) };
    }
  };
}
function createR2BinaryStore(storeName, env2) {
  const bucket = r2Binding(env2);
  const prefix = `${storeName}/`;
  return {
    async get(key2, opts = {}) {
      const obj = await bucket.get(prefix + key2);
      if (!obj) return null;
      const type = opts.type || "arrayBuffer";
      if (type === "json") return obj.json();
      if (type === "text") return obj.text();
      if (type === "blob") return obj.blob();
      return obj.arrayBuffer();
    },
    async setJSON(key2, obj) {
      await bucket.put(prefix + key2, JSON.stringify(obj), {
        httpMetadata: { contentType: "application/json" }
      });
    },
    async set(key2, data, opts = {}) {
      const meta = opts.metadata || {};
      await bucket.put(prefix + key2, data, {
        customMetadata: metaToStrings(meta),
        httpMetadata: { contentType: String(meta.mime || "application/octet-stream") }
      });
    },
    async getWithMetadata(key2, opts = {}) {
      const obj = await bucket.get(prefix + key2);
      if (!obj) return null;
      const type = opts.type || "arrayBuffer";
      let data;
      if (type === "json") data = await obj.json();
      else if (type === "text") data = await obj.text();
      else if (type === "blob") data = await obj.blob();
      else data = await obj.arrayBuffer();
      return { data, metadata: metaFromStrings(obj.customMetadata) };
    },
    async delete(key2) {
      await bucket.delete(prefix + key2);
    },
    async list() {
      const listed = await bucket.list({ prefix });
      return { blobs: (listed.objects || []).map((o) => ({ key: o.key.slice(prefix.length) })) };
    }
  };
}
var init_cloudflare = __esm({
  "../netlify/functions/lib/storage/cloudflare.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name(kvBinding, "kvBinding");
    __name(r2Binding, "r2Binding");
    __name(metaToStrings, "metaToStrings");
    __name(metaFromStrings, "metaFromStrings");
    __name(createKvJsonStore, "createKvJsonStore");
    __name(createR2BinaryStore, "createR2BinaryStore");
  }
});

// ../netlify/functions/lib/storage/backup.mjs
async function rotateJsonBackup(store, baseKey, nextDoc) {
  for (let slot = KEEP; slot >= 2; slot--) {
    const prev = await store.get(`${baseKey}-bak-${slot - 1}`, { type: "json" });
    if (prev) await store.setJSON(`${baseKey}-bak-${slot}`, prev);
  }
  const cur = await store.get(baseKey, { type: "json" });
  if (cur) await store.setJSON(`${baseKey}-bak-1`, { ...cur, backedUpAt: Date.now() });
  await store.setJSON(baseKey, nextDoc);
}
var KEEP;
var init_backup = __esm({
  "../netlify/functions/lib/storage/backup.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    KEEP = 3;
    __name(rotateJsonBackup, "rotateJsonBackup");
  }
});

// ../netlify/functions/lib/storage/index.mjs
function bindStorageEnv(env2) {
  runtimeEnv = env2;
}
function resolveStorageBackend() {
  const raw = runtimeEnv?.STORAGE_BACKEND ?? process.env.STORAGE_BACKEND ?? "netlify";
  return String(raw).toLowerCase() === "cloudflare" ? "cloudflare" : "netlify";
}
function getStore2(name) {
  if (resolveStorageBackend() === "cloudflare") {
    const env2 = runtimeEnv || {};
    if (R2_STORES.has(name)) return createR2BinaryStore(name, env2);
    return createKvJsonStore(name, env2);
  }
  return createNetlifyStore(name);
}
var R2_STORES, runtimeEnv;
var init_storage = __esm({
  "../netlify/functions/lib/storage/index.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_netlify();
    init_cloudflare();
    init_backup();
    R2_STORES = /* @__PURE__ */ new Set(["docs"]);
    runtimeEnv = null;
    __name(bindStorageEnv, "bindStorageEnv");
    __name(resolveStorageBackend, "resolveStorageBackend");
    __name(getStore2, "getStore");
  }
});

// ../netlify/functions/lib/pagesAdapter.mjs
function bindProcessEnv(env2) {
  if (!env2 || typeof process === "undefined" || !process.env) return;
  for (const [key2, value] of Object.entries(env2)) {
    if (value == null) continue;
    const t = typeof value;
    if (t === "string" || t === "number" || t === "boolean") {
      process.env[key2] = String(value);
    }
  }
}
function toPagesFunction(handler) {
  return /* @__PURE__ */ __name(async function onRequest32(context2) {
    bindStorageEnv(context2.env);
    bindProcessEnv(context2.env);
    return handler(context2.request, context2.env, context2);
  }, "onRequest");
}
var init_pagesAdapter = __esm({
  "../netlify/functions/lib/pagesAdapter.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    __name(bindProcessEnv, "bindProcessEnv");
    __name(toPagesFunction, "toPagesFunction");
  }
});

// .netlify/functions/address-suggest.js
var onRequest;
var init_address_suggest2 = __esm({
  ".netlify/functions/address-suggest.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_address_suggest();
    init_pagesAdapter();
    onRequest = toPagesFunction(address_suggest_default);
  }
});

// ../netlify/functions/calendar.mjs
function json2(o) {
  return new Response(JSON.stringify(o), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
async function load(store) {
  return await store.get(KEY, { type: "json", consistency: "strong" }) || { events: [], syncedAt: 0, request: 0, ts: 0 };
}
var KEY, calendar_default;
var init_calendar = __esm({
  "../netlify/functions/calendar.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    KEY = "calendar-v1";
    __name(json2, "json");
    __name(load, "load");
    calendar_default = /* @__PURE__ */ __name(async (req) => {
      const store = getStore2("calendar");
      if (req.method === "OPTIONS") return json2({ ok: true });
      if (req.method === "POST") {
        let b = {};
        try {
          b = await req.json();
        } catch (e) {
        }
        const doc = await load(store);
        if (b.op === "set" && Array.isArray(b.events)) {
          doc.events = b.events;
          doc.syncedAt = Date.now();
          doc.request = 0;
        } else if (b.op === "request") {
          doc.request = Date.now();
        }
        doc.ts = Date.now();
        await store.setJSON(KEY, doc);
        return json2(doc);
      }
      return json2(await load(store));
    }, "default");
  }
});

// .netlify/functions/calendar.js
var onRequest2;
var init_calendar2 = __esm({
  ".netlify/functions/calendar.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_calendar();
    init_pagesAdapter();
    onRequest2 = toPagesFunction(calendar_default);
  }
});

// ../netlify/functions/chat.mjs
function json3(o) {
  return new Response(JSON.stringify(o), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
async function loadPresence(store) {
  const raw = await store.get("presence-v1", { type: "json", consistency: "strong" }) || {};
  if (typeof raw.lastSeen === "number") {
    return { [raw.convo || "default"]: { lastSeen: raw.lastSeen, view: raw.view || "" } };
  }
  return raw;
}
async function load2(store, convo) {
  return await store.get(key(convo), { type: "json", consistency: "strong" }) || { messages: [], ts: 0 };
}
async function migrate(store, from, to) {
  const src = String(from || "").trim();
  const dst = String(to || "").trim();
  if (!src || !dst || src === dst) return { merged: 0, ts: 0 };
  const [oldDoc, newDoc] = await Promise.all([load2(store, src), load2(store, dst)]);
  const seen = new Set((newDoc.messages || []).map((m) => m.id));
  let merged = 0;
  for (const m of oldDoc.messages || []) {
    if (!m || !m.id || seen.has(m.id)) continue;
    newDoc.messages.push(m);
    seen.add(m.id);
    merged++;
  }
  if (merged) newDoc.messages.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const now = Date.now();
  newDoc.ts = merged ? now : newDoc.ts || 0;
  if (merged) await store.setJSON(key(dst), newDoc);
  return { merged, ts: newDoc.ts };
}
var key, chat_default;
var init_chat = __esm({
  "../netlify/functions/chat.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    __name(json3, "json");
    key = /* @__PURE__ */ __name((convo) => "chat-" + String(convo || "default").replace(/[^a-zA-Z0-9_-]/g, ""), "key");
    __name(loadPresence, "loadPresence");
    __name(load2, "load");
    __name(migrate, "migrate");
    chat_default = /* @__PURE__ */ __name(async (req) => {
      const store = getStore2("chat");
      if (req.method === "OPTIONS") return json3({ ok: true });
      if (req.method === "POST") {
        let b = {};
        try {
          b = await req.json();
        } catch (e) {
        }
        const convo2 = b.convo || "default";
        if (b.op === "presence") {
          const map = await loadPresence(store);
          map[convo2] = { lastSeen: Date.now(), view: String(b.view || "") };
          await store.setJSON("presence-v1", map);
          return json3({ ok: true, ts: map[convo2].lastSeen });
        }
        if (b.op === "migrate") {
          const r = await migrate(store, b.from, b.to);
          return json3({ ok: true, ...r });
        }
        const doc = await load2(store, convo2);
        const now = Date.now();
        if (b.op === "msg" && b.text) {
          doc.messages.push({ id: b.id || "m" + now, who: "you", text: String(b.text), status: "Sent", ts: now });
        } else if (b.op === "reply" && b.text) {
          const who = String(b.who || "israel");
          doc.messages.push({ id: "r" + now, who, text: String(b.text), status: "", ts: now });
        } else if (b.op === "status" && b.id) {
          const m = doc.messages.find((x) => x.id === b.id);
          if (m) m.status = b.status || m.status;
        } else {
          return json3({ ok: false, error: "bad op" });
        }
        doc.ts = now;
        await store.setJSON(key(convo2), doc);
        return json3({ ok: true, ts: now });
      }
      const url = new URL(req.url);
      if (url.searchParams.get("presence")) {
        return json3(await loadPresence(store));
      }
      const convo = url.searchParams.get("convo") || "default";
      return json3(await load2(store, convo));
    }, "default");
  }
});

// .netlify/functions/chat.js
var onRequest3;
var init_chat2 = __esm({
  ".netlify/functions/chat.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_chat();
    init_pagesAdapter();
    onRequest3 = toPagesFunction(chat_default);
  }
});

// ../netlify/functions/command.mjs
function json4(o) {
  return new Response(JSON.stringify(o), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
async function load3(store) {
  return await store.get(KEY2, { type: "json", consistency: "strong" }) || { commands: [], seq: 0, ts: 0 };
}
function audit(c, note) {
  c.audit = c.audit || [];
  c.audit.push({ ts: Date.now(), status: c.status, note: note || "" });
}
var KEY2, command_default;
var init_command = __esm({
  "../netlify/functions/command.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    KEY2 = "commands-v1";
    __name(json4, "json");
    __name(load3, "load");
    __name(audit, "audit");
    command_default = /* @__PURE__ */ __name(async (req) => {
      const store = getStore2("commands");
      if (req.method === "OPTIONS") return json4({ ok: true });
      const doc = await load3(store);
      doc.commands = doc.commands || [];
      if (req.method === "POST") {
        let b = {};
        try {
          b = await req.json();
        } catch (e) {
        }
        if (b.op === "enqueue" && b.command) {
          const idk = b.command.idempotencyKey;
          if (idk) {
            const ex = doc.commands.find((c2) => c2.idempotencyKey === idk && c2.status !== "failed");
            if (ex) return json4({ ok: true, command: ex, deduped: true });
          }
          const now = Date.now();
          doc.seq = (doc.seq || 0) + 1;
          const c = Object.assign(
            { lane: "judgment", status: "queued", attempts: 0, maxAttempts: 3, result: null, error: null, escalatedAt: 0, audit: [] },
            b.command,
            { id: "c" + now + Math.random().toString(36).slice(2, 6), num: doc.seq, createdAt: now, updatedAt: now }
          );
          audit(c, "created");
          doc.commands.push(c);
          doc.ts = now;
          await store.setJSON(KEY2, doc);
          return json4({ ok: true, command: c });
        }
        if (b.op === "update" && b.id && b.patch) {
          const c = doc.commands.find((x) => x.id === b.id);
          if (c) {
            Object.assign(c, b.patch);
            c.updatedAt = Date.now();
            audit(c, b.note || "");
          }
          doc.ts = Date.now();
          await store.setJSON(KEY2, doc);
          return json4({ ok: true, command: c || null });
        }
        if (b.op === "remove" && b.id) {
          doc.commands = doc.commands.filter((x) => x.id !== b.id);
          doc.ts = Date.now();
          await store.setJSON(KEY2, doc);
          return json4({ ok: true });
        }
        if (b.op === "replace" && Array.isArray(b.commands)) {
          doc.commands = b.commands;
          doc.seq = b.seq || doc.seq || 0;
          doc.ts = Date.now();
          await store.setJSON(KEY2, doc);
          return json4({ ok: true, count: doc.commands.length });
        }
        return json4({ ok: false, error: "unknown op" });
      }
      const url = new URL(req.url);
      const st = url.searchParams.get("status");
      const out = st ? doc.commands.filter((c) => c.status === st) : doc.commands;
      return json4({ commands: out, seq: doc.seq || 0, ts: doc.ts || 0 });
    }, "default");
  }
});

// .netlify/functions/command.js
var onRequest4;
var init_command2 = __esm({
  ".netlify/functions/command.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_command();
    init_pagesAdapter();
    onRequest4 = toPagesFunction(command_default);
  }
});

// ../netlify/functions/lib/paymentConfirmEnv.mjs
function isEmailTestMode() {
  return String(process.env.EMAIL_TEST_MODE ?? "true").trim().toLowerCase() !== "false";
}
function resolveFromAddress() {
  return String(process.env.PAYMENT_CONFIRM_FROM || process.env.EMAIL_FROM || "").trim() || DEFAULT_FROM;
}
function resolveRecipient(customerEmail) {
  const cust = String(customerEmail || "").trim();
  if (isEmailTestMode()) {
    return String(process.env.PAYMENT_CONFIRM_TEST_EMAIL || "").trim();
  }
  return cust;
}
var DEFAULT_FROM;
var init_paymentConfirmEnv = __esm({
  "../netlify/functions/lib/paymentConfirmEnv.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name(isEmailTestMode, "isEmailTestMode");
    DEFAULT_FROM = "office@leelectrical.us";
    __name(resolveFromAddress, "resolveFromAddress");
    __name(resolveRecipient, "resolveRecipient");
  }
});

// ../netlify/functions/lib/customerEmail.mjs
async function sendCustomerEmail({ to, subject, message, customerEmail }) {
  const intended = String(customerEmail || to || "").trim();
  const recipient = resolveRecipient(intended || to);
  const testMode = isEmailTestMode();
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = resolveFromAddress();
  const subj = String(subject || "Message from LE Electrical").trim();
  const text = String(message || "").trim();
  const meta = {
    testMode,
    intendedTo: intended || "(unset)",
    to: recipient || "(unset)",
    from,
    subject: subj
  };
  if (!text) {
    return { ok: false, skipped: true, reason: "empty_message", ...meta };
  }
  if (!recipient) {
    return { ok: false, skipped: true, reason: testMode ? "test_email_unset" : "no_recipient", ...meta };
  }
  if (!apiKey) {
    console.log("[customer-email] DRY-RUN (no RESEND_API_KEY)", JSON.stringify(meta));
    return { ok: true, dryRun: true, reason: "no_api_key", ...meta };
  }
  const html = text.split("\n").map((ln) => ln.trim()).join("<br>\n");
  const payload = {
    from: `${COMPANY} <${from}>`,
    to: [recipient],
    subject: testMode ? `[TEST] ${subj}` : subj,
    html,
    text
  };
  if (testMode && intended && intended !== recipient) {
    payload.headers = { "X-Intended-Recipient": intended };
  }
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[customer-email] Resend error", res.status, body);
      return { ok: false, reason: "resend_error", status: res.status, error: body, ...meta };
    }
    console.log("[customer-email] SENT", JSON.stringify({ ...meta, resendId: body.id }));
    return { ok: true, sent: true, resendId: body.id, ...meta };
  } catch (err) {
    console.error("[customer-email] fetch failed", err);
    return { ok: false, reason: "fetch_failed", error: String(err?.message || err), ...meta };
  }
}
var RESEND_URL, COMPANY;
var init_customerEmail = __esm({
  "../netlify/functions/lib/customerEmail.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_paymentConfirmEnv();
    RESEND_URL = "https://api.resend.com/emails";
    COMPANY = "LE Electrical";
    __name(sendCustomerEmail, "sendCustomerEmail");
  }
});

// ../netlify/functions/customer-email.mjs
function json5(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
var customer_email_default;
var init_customer_email = __esm({
  "../netlify/functions/customer-email.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_customerEmail();
    __name(json5, "json");
    customer_email_default = /* @__PURE__ */ __name(async (req) => {
      if (req.method !== "POST") return json5({ ok: false, error: "POST only" }, 405);
      let body = {};
      try {
        body = await req.json();
      } catch {
        return json5({ ok: false, error: "invalid json" }, 400);
      }
      const email = String(body.email || body.to || "").trim();
      if (!email) return json5({ ok: false, error: "missing email" }, 400);
      const result = await sendCustomerEmail({
        to: email,
        subject: body.subject,
        message: body.message,
        customerEmail: email
      });
      return json5(result, result.ok ? 200 : 502);
    }, "default");
  }
});

// .netlify/functions/customer-email.js
var onRequest5;
var init_customer_email2 = __esm({
  ".netlify/functions/customer-email.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_customer_email();
    init_pagesAdapter();
    onRequest5 = toPagesFunction(customer_email_default);
  }
});

// ../netlify/functions/lib/customerSearch.mjs
function digitsOnly(s) {
  return String(s || "").replace(/\D/g, "");
}
function tokens(q) {
  return String(q || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
}
function scoreText(hay, toks) {
  const n = String(hay || "").toLowerCase();
  if (!n) return 0;
  let s = 0;
  for (const t of toks) {
    if (!n.includes(t)) return 0;
    s += n.startsWith(t) ? 3 : 2;
  }
  return s;
}
function scorePhone(phone, query) {
  const qd = digitsOnly(query);
  const pd = digitsOnly(phone);
  if (!qd || qd.length < 3 || !pd) return 0;
  if (pd.includes(qd)) return qd.length >= 7 ? 8 : 5;
  if (qd.includes(pd) && pd.length >= 7) return 6;
  return 0;
}
function scoreEmail(email, query) {
  const e = String(email || "").trim().toLowerCase();
  const q = String(query || "").trim().toLowerCase();
  if (!e || !q || q.length < 2) return 0;
  if (e === q) return 9;
  if (e.includes(q)) return q.includes("@") ? 8 : 6;
  const local = e.split("@")[0];
  if (local && local.includes(q)) return 5;
  return 0;
}
function scoreCustomer(customer, query) {
  const q = String(query || "").trim();
  if (!q || !customer) return 0;
  const toks = tokens(q);
  const fields = [
    customer.businessName,
    customer.personName,
    customer.name,
    customer.billingAddress
  ];
  let best = 0;
  for (const f of fields) best = Math.max(best, scoreText(f, toks));
  best = Math.max(best, scorePhone(customer.phone, q));
  best = Math.max(best, scoreEmail(customer.email, q));
  return best;
}
function searchCustomerIndex(customers, query, limit = 12) {
  const q = String(query || "").trim();
  if (!q) return [];
  const scored = [];
  for (const c of customers || []) {
    const s = scoreCustomer(c, q);
    if (s) scored.push({ ...c, _s: s });
  }
  scored.sort(
    (a, b) => b._s - a._s || String(a.name || "").length - String(b.name || "").length
  );
  return scored.slice(0, limit).map(({ _s, ...c }) => c);
}
var init_customerSearch = __esm({
  "../netlify/functions/lib/customerSearch.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name(digitsOnly, "digitsOnly");
    __name(tokens, "tokens");
    __name(scoreText, "scoreText");
    __name(scorePhone, "scorePhone");
    __name(scoreEmail, "scoreEmail");
    __name(scoreCustomer, "scoreCustomer");
    __name(searchCustomerIndex, "searchCustomerIndex");
  }
});

// ../netlify/functions/customers.mjs
function json6(o) {
  return new Response(JSON.stringify(o), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
async function load4(store) {
  return await store.get(KEY3, { type: "json", consistency: "strong" }) || { customers: [], updated: "", ts: 0 };
}
var KEY3, customers_default;
var init_customers = __esm({
  "../netlify/functions/customers.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    init_customerSearch();
    KEY3 = "customers-v1";
    __name(json6, "json");
    __name(load4, "load");
    customers_default = /* @__PURE__ */ __name(async (req) => {
      const store = getStore2("customers");
      if (req.method === "OPTIONS") return json6({ ok: true });
      if (req.method === "POST") {
        let b = {};
        try {
          b = await req.json();
        } catch (e) {
        }
        if (b.op === "set" && Array.isArray(b.customers)) {
          await store.setJSON(KEY3, { customers: b.customers, updated: b.updated || "", ts: Date.now() });
          return json6({ ok: true, count: b.customers.length });
        }
        return json6({ ok: false, error: "unknown op" });
      }
      const doc = await load4(store);
      const url = new URL(req.url);
      const id = (url.searchParams.get("id") || "").trim();
      if (id) {
        const customer = (doc.customers || []).find((c) => String(c.id) === id) || null;
        return json6({ customer, ts: doc.ts });
      }
      const q = (url.searchParams.get("q") || "").trim();
      if (q) {
        const customers = searchCustomerIndex(doc.customers, q, 12);
        return json6({ customers, ts: doc.ts });
      }
      return json6(doc);
    }, "default");
  }
});

// .netlify/functions/customers.js
var onRequest6;
var init_customers2 = __esm({
  ".netlify/functions/customers.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_customers();
    init_pagesAdapter();
    onRequest6 = toPagesFunction(customers_default);
  }
});

// ../netlify/functions/devtasks.mjs
function json7(o) {
  return new Response(JSON.stringify(o), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
async function load5(store) {
  return await store.get(KEY4, { type: "json", consistency: "strong" }) || { tasks: [], seq: 0, ts: 0 };
}
var KEY4, devtasks_default;
var init_devtasks = __esm({
  "../netlify/functions/devtasks.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    KEY4 = "devtasks-v2";
    __name(json7, "json");
    __name(load5, "load");
    devtasks_default = /* @__PURE__ */ __name(async (req) => {
      const store = getStore2("devtasks");
      if (req.method === "OPTIONS") return json7({ ok: true });
      if (req.method === "POST") {
        let b = {};
        try {
          b = await req.json();
        } catch (e) {
        }
        const doc = await load5(store);
        doc.tasks = doc.tasks || [];
        if (b.op === "add" && b.task) {
          doc.seq = (doc.seq || 0) + 1;
          const t = Object.assign(
            { status: "new", understanding: "", question: "", report: "", images: [], priority: "Normal", target: { beta: false, dashboard: false }, ts: Date.now() },
            b.task,
            { id: "t" + Date.now() + Math.random().toString(36).slice(2, 6), num: doc.seq }
          );
          doc.tasks.push(t);
        } else if (b.op === "patch" && b.id && b.patch) {
          const t = doc.tasks.find((x) => x.id === b.id);
          if (t) Object.assign(t, b.patch);
        } else if (b.op === "remove" && b.id) {
          doc.tasks = doc.tasks.filter((x) => x.id !== b.id);
        } else if (b.op === "replace" && Array.isArray(b.tasks)) {
          doc.tasks = b.tasks;
          doc.seq = b.seq || doc.seq || 0;
        }
        doc.ts = Date.now();
        await store.setJSON(KEY4, doc);
        return json7(doc);
      }
      return json7(await load5(store));
    }, "default");
  }
});

// .netlify/functions/devtasks.js
var onRequest7;
var init_devtasks2 = __esm({
  ".netlify/functions/devtasks.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_devtasks();
    init_pagesAdapter();
    onRequest7 = toPagesFunction(devtasks_default);
  }
});

// ../netlify/functions/lib/base64.mjs
function bytesFromBase64(b64) {
  const binary = atob(String(b64));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function base64FromBytes(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}
function basicAuthBase64(id, secret) {
  return base64FromBytes(new TextEncoder().encode(`${id}:${secret}`));
}
var init_base64 = __esm({
  "../netlify/functions/lib/base64.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name(bytesFromBase64, "bytesFromBase64");
    __name(base64FromBytes, "base64FromBytes");
    __name(basicAuthBase64, "basicAuthBase64");
  }
});

// ../netlify/functions/docs-cleanup.mjs
var DOCS_TTL_MS, docs_cleanup_default;
var init_docs_cleanup = __esm({
  "../netlify/functions/docs-cleanup.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    DOCS_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
    docs_cleanup_default = /* @__PURE__ */ __name(async (req) => {
      let nextRun = "";
      try {
        const body = await req.json();
        nextRun = body?.next_run || "";
      } catch {
      }
      const store = getStore2("docs");
      const cutoff = Date.now() - DOCS_TTL_MS;
      const { blobs } = await store.list();
      let deleted = 0;
      let scanned = 0;
      for (const b of blobs || []) {
        scanned += 1;
        const rec = await store.getWithMetadata(b.key, { type: "blob" });
        const ts = Number(rec?.metadata?.ts || 0);
        if (ts > 0 && ts < cutoff) {
          await store.delete(b.key);
          deleted += 1;
        }
      }
      return new Response(
        JSON.stringify({ ok: true, scanned, deleted, cutoff, nextRun }),
        {
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store"
          }
        }
      );
    }, "default");
  }
});

// ../netlify/functions/docs.mjs
function json8(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
var KEY_RE, docs_default;
var init_docs = __esm({
  "../netlify/functions/docs.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    init_base64();
    init_docs_cleanup();
    KEY_RE = /^[a-z]{2,8}-[A-Za-z0-9._-]{1,64}$/;
    __name(json8, "json");
    docs_default = /* @__PURE__ */ __name(async (req) => {
      if (req.method === "OPTIONS") return json8({ ok: true });
      const store = getStore2("docs");
      if (req.method === "POST") {
        let b = {};
        try {
          b = await req.json();
        } catch (e) {
        }
        if (b.op !== "put") return json8({ ok: false, error: "unknown op" }, 400);
        const key3 = String(b.key || "");
        if (!KEY_RE.test(key3)) return json8({ ok: false, error: "bad key" }, 400);
        if (!b.b64) return json8({ ok: false, error: "missing b64" }, 400);
        let buf;
        try {
          buf = bytesFromBase64(String(b.b64));
        } catch (e) {
          return json8({ ok: false, error: "bad base64" }, 400);
        }
        if (!buf.length) return json8({ ok: false, error: "empty document" }, 400);
        if (buf.length > 9e6) return json8({ ok: false, error: "too large" }, 413);
        const mime2 = String(b.mime || "application/pdf");
        const filename2 = String(b.filename || "").trim();
        const meta = { mime: mime2, bytes: buf.length, ts: Date.now() };
        if (filename2) meta.filename = filename2.replace(/[^\w .-]/g, "_");
        await store.set(key3, buf, { metadata: meta });
        return json8({ ok: true, key: key3, bytes: buf.length });
      }
      const url = new URL(req.url);
      const key2 = String(url.searchParams.get("key") || "");
      if (!KEY_RE.test(key2)) return json8({ ok: false, error: "bad key" }, 400);
      const rec = await store.getWithMetadata(key2, { type: "arrayBuffer", consistency: "strong" });
      if (!rec || !rec.data) return json8({ ok: false, error: "not found" }, 404);
      const ts = Number(rec.metadata?.ts || 0);
      if (ts > 0 && Date.now() - ts > DOCS_TTL_MS) {
        await store.delete(key2);
        return json8({ ok: false, error: "expired" }, 404);
      }
      const mime = rec.metadata && rec.metadata.mime || "application/pdf";
      const storedName = String(rec.metadata?.filename || "").trim();
      const fallback = key2.startsWith("est-") ? `Estimate_${key2.slice(4)}.pdf` : key2.startsWith("inv-") ? `Invoice_${key2.slice(4)}.pdf` : `${key2}.pdf`;
      const filename = storedName || fallback;
      const safe = filename.replace(/[^\w .-]/g, "_");
      return new Response(rec.data, {
        headers: {
          "content-type": mime,
          "content-disposition": `inline; filename="${safe}"`,
          "cache-control": "public, max-age=3600",
          "access-control-allow-origin": "*"
        }
      });
    }, "default");
  }
});

// .netlify/functions/docs.js
var onRequest8;
var init_docs2 = __esm({
  ".netlify/functions/docs.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_docs();
    init_pagesAdapter();
    onRequest8 = toPagesFunction(docs_default);
  }
});

// .netlify/functions/docs-cleanup.js
var onRequest9;
var init_docs_cleanup2 = __esm({
  ".netlify/functions/docs-cleanup.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_docs_cleanup();
    init_pagesAdapter();
    onRequest9 = toPagesFunction(docs_cleanup_default);
  }
});

// ../netlify/functions/lib/jobToQbDoc.mjs
function parseAmount(v) {
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function fmtInvoiceDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[1].padStart(2, "0")}/${us[2].padStart(2, "0")}/${us[3]}`;
  return s;
}
function todayStr() {
  const d = /* @__PURE__ */ new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(iso, days) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const d = new Date(+m[1], +m[2] - 1, +m[3] + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function lineAmount(ln) {
  const q = parseAmount(ln.qty) || 0;
  const p = parseAmount(ln.unitPrice) || 0;
  return Math.round(q * p * 100) / 100;
}
function linesTotal(lines) {
  return (lines || []).reduce((s, ln) => s + lineAmount(ln), 0);
}
function effectiveServiceAddress(job) {
  return (job?.serviceAddress || job?.address || "").trim();
}
function formatServiceAddressWithApt(job) {
  const addr = effectiveServiceAddress(job).trim();
  const apt = String(job?.apartment || "").trim();
  if (!addr) return "";
  if (!apt) return addr;
  const aptNorm = apt.replace(/^#/, "").trim();
  const esc2 = aptNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const already = new RegExp(`\\bapt\\.?\\s*#?\\s*${esc2}\\b`, "i").test(addr) || new RegExp(`\\b#\\s*${esc2}\\b`, "i").test(addr);
  if (already) return addr;
  return `${addr}, Apt ${aptNorm}`;
}
function amountPaid(job) {
  const pays = job?.payments;
  if (Array.isArray(pays) && pays.length) {
    return pays.reduce((s, p) => s + parseAmount(p?.amount), 0);
  }
  return parseAmount(job?.paid);
}
function openBalance(job) {
  const total = parseAmount(job?.amount) || linesTotal(job?.invoiceLines || []);
  const paid = amountPaid(job);
  if (job?.openBalance != null && job.openBalance !== "") return parseAmount(job.openBalance);
  return Math.max(0, total - paid);
}
function billableLines(job, kind) {
  const saved = (kind === "invoice" ? job.invoiceLines : job.estimateLines) || [];
  const filtered = saved.filter(
    (ln) => ln && (ln.description || ln.itemName || parseAmount(ln.unitPrice))
  );
  if (filtered.length) return filtered;
  if (parseAmount(job.amount) > 0) {
    return [
      {
        description: job.title || job.serviceType || "Electrical services",
        itemName: job.title || job.serviceType || "Electrical services",
        qty: 1,
        unitPrice: parseAmount(job.amount)
      }
    ];
  }
  return [];
}
function isChangeOrderJob(job) {
  if (!job) return false;
  if (job.changeOrder) return true;
  if (job.changeOrderSeq != null && Number(job.changeOrderSeq) > 0) return true;
  if (String(job.changeOrderLabel || "").trim()) return true;
  if (String(job.qboCoPi || job.coPi || "").trim().match(/^0*\d+/)) return true;
  const title2 = String(job.title || "");
  if (/change\s*ord(?:er|ers)?\b|change\s*over\b/i.test(title2)) return true;
  const inv = String(job.invoiceNo || job.estimateNo || "");
  if (/(?:^|[\s\-_/])CO[\s\-_]*\d+\b/i.test(inv) || /-CO-\d+/i.test(inv)) return true;
  return false;
}
function docStoreKey(kind, no) {
  return (kind === "invoice" ? "inv-" : "est-") + String(no || "").trim();
}
function docPdfSlug(text, max = 40) {
  const s = String(text || "").trim().replace(/[^\w\s.-]/g, "").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return s.slice(0, max) || "";
}
function docPdfFilename(kind, job = {}, docNumber = "") {
  const isInvoice = kind === "invoice";
  const word = isInvoice ? "Invoice" : "Estimate";
  const no = String(docNumber || (isInvoice ? job.invoiceNo : job.estimateNo) || "").trim();
  const customer = docPdfSlug(job.customer || job.businessName || job.personName || "");
  const svc = String(job.serviceAddress || job.address || "").trim();
  const bill = String(job.billingAddress || job.address || "").trim();
  const addrSlug = svc && bill && svc.toLowerCase() !== bill.toLowerCase() ? docPdfSlug(svc.split("\n")[0].split(",")[0], 28) : "";
  const parts = [word, no, customer || "Customer", addrSlug].filter(Boolean);
  return parts.join("_") + ".pdf";
}
function canGenerateLocalDoc(job, kind = "invoice") {
  const no = kind === "invoice" ? job?.invoiceNo : job?.estimateNo;
  if (!no) return false;
  const lines = billableLines(job, kind);
  return lines.length > 0 && linesTotal(lines) > 0;
}
function mapJobToQbDocData(job, kind = "invoice") {
  const isInvoice = kind === "invoice";
  const docType = isInvoice ? "INVOICE" : "ESTIMATE";
  const docNumber = String(isInvoice ? job.invoiceNo : job.estimateNo || "").trim();
  const rawLines = billableLines(job, kind);
  const lines = rawLines.map((ln) => {
    const desc = [ln.itemName, ln.description].filter(Boolean).join("\n").trim() || ln.itemName || "";
    const rate = parseAmount(ln.unitPrice);
    const qty = parseAmount(ln.qty) || 1;
    return { description: desc, rate, qty, amount: lineAmount(ln), serviceDate: ln.serviceDate || ln.date || "" };
  });
  const subtotal = linesTotal(rawLines);
  const tax = parseAmount(job.tax ?? 0);
  const total = subtotal + tax;
  const paid = isInvoice ? amountPaid(job) : 0;
  const balanceDue = isInvoice ? openBalance(job) : total;
  const invoiceDateRaw = job.invoiceDate || job.estimateDate || job.status?.Invoiced?.d || job.status?.Invoice?.d || job.status?.Estimate?.d || todayStr();
  const dueDateRaw = job.dueDate || (isInvoice ? addDays(invoiceDateRaw, 1) : "");
  const billName = (job.customer || job.businessName || job.personName || "").trim();
  const billAddr = (job.billingAddress || job.address || "").trim();
  const svcAddr = formatServiceAddressWithApt(job);
  const customFields = [];
  const billCmp = billAddr.toLowerCase();
  const svcStreet = effectiveServiceAddress(job).trim().toLowerCase();
  const hasApt = !!String(job?.apartment || "").trim();
  if (svcAddr && (svcStreet !== billCmp || hasApt)) {
    customFields.push({ label: "Service Address", value: svcAddr });
  }
  const firstServiceDate = lines.find((ln) => ln.serviceDate)?.serviceDate;
  let displayDocNumber = docNumber;
  if (isChangeOrderJob(job) && displayDocNumber && !/change\s*order/i.test(displayDocNumber)) {
    displayDocNumber = `${displayDocNumber} - Change Order`;
  }
  return {
    docType,
    company: QB_COMPANY,
    docNumber: displayDocNumber,
    date: fmtInvoiceDate(invoiceDateRaw),
    dueDate: isInvoice ? fmtInvoiceDate(dueDateRaw) : void 0,
    billTo: {
      name: billName,
      addressLines: billAddr ? billAddr.split("\n").filter(Boolean) : []
    },
    customFields,
    serviceDate: firstServiceDate ? fmtInvoiceDate(firstServiceDate) : fmtInvoiceDate(invoiceDateRaw),
    lines: lines.map(({ description, rate, qty, amount }) => ({ description, rate, qty, amount })),
    subtotal,
    tax,
    total: total || subtotal,
    payment: paid > 0 ? paid : void 0,
    amountDue: isInvoice ? balanceDue : total,
    balanceDue: isInvoice ? balanceDue : void 0,
    messageLines: isInvoice ? [...INVOICE_PAYMENT_LINES, "", ...INVOICE_CLOSING_LINES] : void 0,
    showAcceptance: !isInvoice
  };
}
var QB_COMPANY, INVOICE_PAYMENT_LINES, INVOICE_CLOSING_LINES;
var init_jobToQbDoc = __esm({
  "../netlify/functions/lib/jobToQbDoc.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    QB_COMPANY = {
      name: "BLZ Electric Inc.",
      addressLines: ["383 Kingston Ave", "Brooklyn, NY  11213"],
      phone: "(718) 594-1850",
      email: "Office@LeElectrical.us",
      /** Printed on its own line under the email (not next to the company name). */
      license: "Lic #11212"
    };
    INVOICE_PAYMENT_LINES = [
      'Online Payment: Click the "View Invoice" tab in the email and pay',
      "via the provided credit card payment link.",
      "-Zelle: Send payment to Office@LeElectrical.us.",
      '-Check: Make checks payable to "BLZ Electric Inc." and either: Mail',
      "it or Email a clear picture of the check to Office@LeElectrical.us."
    ];
    INVOICE_CLOSING_LINES = [
      "Thank you for your business - we appreciate it very much.",
      "",
      "Sincerely,",
      "BLZ Electric Inc."
    ];
    __name(parseAmount, "parseAmount");
    __name(fmtInvoiceDate, "fmtInvoiceDate");
    __name(todayStr, "todayStr");
    __name(addDays, "addDays");
    __name(lineAmount, "lineAmount");
    __name(linesTotal, "linesTotal");
    __name(effectiveServiceAddress, "effectiveServiceAddress");
    __name(formatServiceAddressWithApt, "formatServiceAddressWithApt");
    __name(amountPaid, "amountPaid");
    __name(openBalance, "openBalance");
    __name(billableLines, "billableLines");
    __name(isChangeOrderJob, "isChangeOrderJob");
    __name(docStoreKey, "docStoreKey");
    __name(docPdfSlug, "docPdfSlug");
    __name(docPdfFilename, "docPdfFilename");
    __name(canGenerateLocalDoc, "canGenerateLocalDoc");
    __name(mapJobToQbDocData, "mapJobToQbDocData");
  }
});

// ../netlify/functions/lib/docGenerate.mjs
async function loadJobForInvoice(invoiceNo, jobId = "") {
  const jobsStore = getStore2("jobsdata");
  const stateStore = getStore2("jobstate");
  const jobsDoc = await jobsStore.get(JOBS_KEY, { type: "json", consistency: "strong" }) || { jobs: [] };
  const inv = String(invoiceNo || "").trim();
  const hint = String(jobId || "").trim();
  let baseJob = {};
  if (hint) {
    baseJob = (jobsDoc.jobs || []).find((j) => String(j.id) === hint) || {};
  }
  if (!baseJob.id && inv) {
    baseJob = (jobsDoc.jobs || []).find((j) => String(j.invoiceNo || "").trim() === inv) || {};
  }
  if (!baseJob.id) return {};
  const cur = await stateStore.get(STATE_KEY, { type: "json", consistency: "strong" }) || { ov: {} };
  return { ...baseJob, ...(cur.ov || {})[baseJob.id] };
}
async function generateAndStoreDoc({ job, kind = "invoice" }) {
  if (!canGenerateLocalDoc(job, kind)) {
    return { ok: false, reason: "insufficient_data" };
  }
  const { createRequire } = await import("module");
  const { fileURLToPath } = await import("url");
  const path = (await import("path")).default;
  const require2 = createRequire(import.meta.url);
  const { generateDocument } = require2("./le-invoice-suite/qb-pdf.js");
  const SUITE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "le-invoice-suite");
  const data = mapJobToQbDocData(job, kind);
  data.logoPath = path.join(SUITE_DIR, "assets", "logo.png");
  const buf = await generateDocument(data);
  const key2 = docStoreKey(kind, data.docNumber);
  const filename = docPdfFilename(kind, job, data.docNumber);
  const store = getStore2("docs");
  await store.set(key2, buf, {
    metadata: { mime: "application/pdf", bytes: buf.length, ts: Date.now(), source: "local", filename }
  });
  return { ok: true, key: key2, bytes: buf.length, docNumber: data.docNumber, pdfBuffer: buf };
}
var JOBS_KEY, STATE_KEY;
var init_docGenerate = __esm({
  "../netlify/functions/lib/docGenerate.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    init_jobToQbDoc();
    JOBS_KEY = "jobsdata-v1";
    STATE_KEY = "ov-v1";
    __name(loadJobForInvoice, "loadJobForInvoice");
    __name(generateAndStoreDoc, "generateAndStoreDoc");
  }
});

// ../netlify/functions/docs-fetch.mjs
function json9(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
function todayISO() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
async function docExists(key2) {
  const store = getStore2("docs");
  const rec = await store.getWithMetadata(key2, { type: "arrayBuffer", consistency: "strong" });
  return !!(rec && rec.data);
}
async function enqueueFetchPdf(invoiceNo, jobId = "") {
  const no = String(invoiceNo || "").trim();
  const store = getStore2("commands");
  const doc = await store.get(COMMANDS_KEY, { type: "json", consistency: "strong" }) || { commands: [], seq: 0, ts: 0 };
  const idk = `pdf:pay:${no}:${todayISO()}`;
  const existing = (doc.commands || []).find(
    (c) => c.idempotencyKey === idk && c.status !== "failed"
  );
  if (existing) return { deduped: true, command: existing };
  const now = Date.now();
  doc.seq = (doc.seq || 0) + 1;
  const command = {
    id: "c" + now + Math.random().toString(36).slice(2, 6),
    num: doc.seq,
    type: "fetch_pdf",
    jobId: String(jobId || "").trim(),
    lane: "judgment",
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    payload: { kind: "invoice", no, docKey: "inv-" + no },
    idempotencyKey: idk,
    createdAt: now,
    updatedAt: now,
    result: null,
    error: null,
    escalatedAt: 0,
    audit: [{ ts: now, status: "queued", note: "pay-page view invoice (QBO fallback)" }]
  };
  doc.commands = doc.commands || [];
  doc.commands.push(command);
  doc.ts = now;
  await store.setJSON(COMMANDS_KEY, doc);
  return { deduped: false, command };
}
var COMMANDS_KEY, INV_RE, docs_fetch_default;
var init_docs_fetch = __esm({
  "../netlify/functions/docs-fetch.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    init_docGenerate();
    init_jobToQbDoc();
    COMMANDS_KEY = "commands-v1";
    INV_RE = /^\d{1,12}$/;
    __name(json9, "json");
    __name(todayISO, "todayISO");
    __name(docExists, "docExists");
    __name(enqueueFetchPdf, "enqueueFetchPdf");
    docs_fetch_default = /* @__PURE__ */ __name(async (req) => {
      if (req.method === "OPTIONS") return json9({ ok: true });
      let invoiceNo = "";
      let jobId = "";
      if (req.method === "POST") {
        let body = {};
        try {
          body = await req.json();
        } catch {
        }
        invoiceNo = body.invoiceNo || body.no || "";
        jobId = body.jobId || body.j || "";
      } else if (req.method === "GET") {
        const url = new URL(req.url);
        invoiceNo = url.searchParams.get("invoice") || url.searchParams.get("no") || "";
        jobId = url.searchParams.get("jobId") || url.searchParams.get("j") || "";
      } else {
        return json9({ ok: false, error: "method not allowed" }, 405);
      }
      const no = String(invoiceNo || "").trim();
      if (!INV_RE.test(no)) return json9({ ok: false, error: "bad invoice number" }, 400);
      const job = await loadJobForInvoice(no, jobId);
      if (canGenerateLocalDoc(job, "invoice")) {
        const result2 = await generateAndStoreDoc({ job, kind: "invoice" });
        if (result2.ok) {
          return json9({
            ok: true,
            generated: true,
            local: true,
            key: result2.key,
            invoiceNo: no
          });
        }
      }
      const key2 = docStoreKey("invoice", no);
      if (await docExists(key2)) {
        return json9({ ok: true, ready: true, invoiceNo: no });
      }
      const result = await enqueueFetchPdf(no, jobId);
      return json9({ ok: true, queued: true, deduped: result.deduped, invoiceNo: no });
    }, "default");
  }
});

// .netlify/functions/docs-fetch.js
var onRequest10;
var init_docs_fetch2 = __esm({
  ".netlify/functions/docs-fetch.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_docs_fetch();
    init_pagesAdapter();
    onRequest10 = toPagesFunction(docs_fetch_default);
  }
});

// ../netlify/functions/lib/emailInsight.mjs
function normalizeAddress(raw) {
  const abbrevs = {
    street: "st",
    avenue: "ave",
    road: "rd",
    boulevard: "blvd",
    drive: "dr",
    lane: "ln",
    court: "ct",
    place: "pl"
  };
  let s = String(raw || "").toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
  for (const [full, short] of Object.entries(abbrevs)) {
    s = s.replace(new RegExp("\\b" + full + "\\b", "g"), short);
  }
  return s;
}
function addressSimilarity(a, b) {
  const na = normalizeAddress(a);
  const nb = normalizeAddress(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const ta = new Set(na.split(" ").filter((w) => w.length > 1));
  const tb = new Set(nb.split(" ").filter((w) => w.length > 1));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}
function isEnergyServicesEmail(from, subject = "", body = "") {
  const blob = [from, subject, body].join(" ");
  return ENERGY_SENDER_RE.test(blob);
}
function extractAddress(text) {
  const m = String(text || "").match(STREET_RE);
  return m ? m[0].replace(/\s+/g, " ").trim() : "";
}
function parseClock(h, m, ampm) {
  let hour = parseInt(h, 10);
  const min = parseInt(m || "0", 10);
  const ap = (ampm || "").toLowerCase();
  if (ap.startsWith("p") && hour < 12) hour += 12;
  if (ap.startsWith("a") && hour === 12) hour = 0;
  return { hour, min };
}
function toIsoLocal(y, mo, d, hour, min) {
  const pad = /* @__PURE__ */ __name((n) => String(n).padStart(2, "0"), "pad");
  return `${y}-${pad(mo + 1)}-${pad(d)}T${pad(hour)}:${pad(min)}`;
}
function extractDateTime(text, refYear = (/* @__PURE__ */ new Date()).getFullYear()) {
  const s = String(text || "");
  const dt = s.match(DATE_TIME_RE);
  if (dt) {
    const datePart = dt[1].trim();
    const timePart = dt[2].trim();
    const tm = timePart.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!tm) return "";
    const { hour, min } = parseClock(tm[1], tm[2], tm[3]);
    const md = datePart.match(/(\w+)\s+(\d{1,2})(?:,?\s+(\d{4}))?/i);
    if (md) {
      const mo = MONTHS[md[1].toLowerCase()];
      if (mo == null) return "";
      const day = parseInt(md[2], 10);
      const year = md[3] ? parseInt(md[3], 10) : refYear;
      return toIsoLocal(year, mo, day, hour, min);
    }
  }
  const dOnly = s.match(DATE_ONLY_RE);
  if (dOnly) {
    const raw = dOnly[1];
    if (raw.includes("-")) return raw + "T09:00";
    const p = raw.split("/");
    if (p.length === 3) {
      const mo = parseInt(p[0], 10) - 1;
      const day = parseInt(p[1], 10);
      let year = parseInt(p[2], 10);
      if (year < 100) year += 2e3;
      return toIsoLocal(year, mo, day, 9, 0);
    }
  }
  return "";
}
function classifyAppointmentType(text) {
  const s = String(text || "").toLowerCase();
  if (/meter\s*(?:install|replacement|set)/.test(s)) return "meter_installation";
  if (/poe|point\s*of\s*entry/.test(s)) return "poe";
  if (/inspection|inspect/.test(s)) return "inspection";
  if (/appointment|scheduled|schedule/.test(s)) return "appointment";
  return "other";
}
function appointmentTypeLabel(type) {
  return TYPE_LABELS[type] || TYPE_LABELS.other;
}
function parseEmailInsight({ from = "", subject = "", body = "", receivedAt = "", messageId = "" }) {
  const blob = [subject, body].filter(Boolean).join("\n");
  const address = extractAddress(blob);
  const dateTime = extractDateTime(blob);
  const appointmentType = classifyAppointmentType(blob);
  const fromLabel = /energy\s*services/i.test(from) ? "Energy Services" : /con\s*ed/i.test(from) ? "Con Edison" : "Email";
  const summaryParts = [];
  if (address) summaryParts.push(`at ${address}`);
  if (dateTime) summaryParts.push(`on ${dateTime.replace("T", " ").slice(0, 16)}`);
  summaryParts.push(`for ${appointmentTypeLabel(appointmentType)}`);
  return {
    id: messageId ? "ei-" + messageId : "ei-" + Date.now(),
    status: "pending",
    source: {
      type: "email",
      from: String(from || "").trim(),
      fromLabel,
      subject: String(subject || "").trim(),
      receivedAt: receivedAt || (/* @__PURE__ */ new Date()).toISOString(),
      messageId: messageId || ""
    },
    appointmentType,
    address,
    dateTime,
    summary: summaryParts.join(" "),
    emailSnippet: String(body || subject || "").slice(0, 400).trim(),
    jobId: null,
    jobMatchScore: 0,
    proposedActions: []
  };
}
function matchJobForInsight(insight, jobs, minScore = 0.55) {
  const addr = insight?.address || "";
  if (!addr) return { jobId: null, score: 0, job: null };
  let best = null;
  let bestScore = 0;
  for (const j of jobs || []) {
    if (j._archived || j._deleted) continue;
    const candidates = [j.serviceAddress, j.address, j.billingAddress].filter(Boolean);
    for (const c of candidates) {
      const score = addressSimilarity(addr, c);
      if (score > bestScore) {
        bestScore = score;
        best = j;
      }
    }
  }
  if (!best || bestScore < minScore) return { jobId: null, score: bestScore, job: null };
  return { jobId: best.id, score: bestScore, job: best };
}
function buildProposedActions(insight, job) {
  const type = insight?.appointmentType || "other";
  const actions = [];
  const when = insight?.dateTime || "";
  const addr = insight?.address || job?.serviceAddress || job?.address || "";
  actions.push({
    key: "calendar",
    label: when ? `Add ${appointmentTypeLabel(type)} to calendar (${when.replace("T", " ").slice(0, 16)})` : `Add ${appointmentTypeLabel(type)} to calendar`,
    enabled: true,
    defaultOn: true
  });
  if (type === "inspection" || type === "appointment") {
    actions.push({ key: "remind_1d", label: "Reminder 1 day before", enabled: true, defaultOn: true });
    actions.push({ key: "remind_1h", label: "Reminder 1 hour before", enabled: true, defaultOn: true });
  }
  if (job?.customer) {
    actions.push({
      key: "guest_customer",
      label: `Add ${job.customer} to the event`,
      enabled: true,
      defaultOn: true
    });
  }
  if (job?.email) {
    actions.push({
      key: "guest_email",
      label: `Add customer email (${job.email}) to the event`,
      enabled: true,
      defaultOn: !!job.email
    });
  }
  if (job?.id && type === "inspection") {
    actions.push({
      key: "paperwork_inspection",
      label: "Update Con Ed paperwork \u2014 Inspection appointment",
      enabled: true,
      defaultOn: true
    });
  } else if (job?.id && type === "meter_installation") {
    actions.push({
      key: "paperwork_meter",
      label: "Update Con Ed paperwork \u2014 Meter installation date",
      enabled: true,
      defaultOn: true
    });
  } else if (job?.id) {
    actions.push({
      key: "paperwork_progress",
      label: "Update task progress on the job",
      enabled: true,
      defaultOn: true
    });
  }
  if (addr) {
    actions.push({
      key: "calendar_location",
      label: `Set event location: ${addr}`,
      enabled: true,
      defaultOn: true
    });
  }
  return actions;
}
function formatInsightLead(insight, job) {
  const src = insight?.source?.fromLabel || "Email";
  const jobLine = job ? `I'm going to add this to the existing job for ${job.customer || "this customer"}.` : insight?.address ? `I found an address (${insight.address}) but no matching job yet.` : "I couldn't match this to a job address yet.";
  const appt = insight?.summary || appointmentTypeLabel(insight?.appointmentType);
  return `From ${src}: ${appt}. ${jobLine}`;
}
function enrichInsight(raw, jobs) {
  const insight = { ...raw };
  const match2 = matchJobForInsight(insight, jobs);
  insight.jobId = match2.jobId;
  insight.jobMatchScore = match2.score;
  insight.proposedActions = buildProposedActions(insight, match2.job);
  insight.lead = formatInsightLead(insight, match2.job);
  return insight;
}
var ENERGY_SENDER_RE, STREET_RE, DATE_TIME_RE, DATE_ONLY_RE, MONTHS, TYPE_LABELS;
var init_emailInsight = __esm({
  "../netlify/functions/lib/emailInsight.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name(normalizeAddress, "normalizeAddress");
    __name(addressSimilarity, "addressSimilarity");
    ENERGY_SENDER_RE = /energy\s*services|con\s*edison|coned|@coned\.com|@conedison\.com|@energy-services/i;
    STREET_RE = /\d+\s+[\w\s.'-]+(?:\b(?:st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|dr|drive|ct|court|pl|place)\b)[^,;\n]*/i;
    DATE_TIME_RE = /(?:on\s+)?(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)[,\s]+)?(\w+\s+\d{1,2}(?:,?\s+\d{4})?)[\s,]+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i;
    DATE_ONLY_RE = /(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/;
    MONTHS = {
      january: 0,
      february: 1,
      march: 2,
      april: 3,
      may: 4,
      june: 5,
      july: 6,
      august: 7,
      september: 8,
      october: 9,
      november: 10,
      december: 11
    };
    __name(isEnergyServicesEmail, "isEnergyServicesEmail");
    __name(extractAddress, "extractAddress");
    __name(parseClock, "parseClock");
    __name(toIsoLocal, "toIsoLocal");
    __name(extractDateTime, "extractDateTime");
    __name(classifyAppointmentType, "classifyAppointmentType");
    TYPE_LABELS = {
      inspection: "Con Edison inspection",
      meter_installation: "meter installation",
      poe: "POE appointment",
      appointment: "appointment",
      other: "Energy Services appointment"
    };
    __name(appointmentTypeLabel, "appointmentTypeLabel");
    __name(parseEmailInsight, "parseEmailInsight");
    __name(matchJobForInsight, "matchJobForInsight");
    __name(buildProposedActions, "buildProposedActions");
    __name(formatInsightLead, "formatInsightLead");
    __name(enrichInsight, "enrichInsight");
  }
});

// ../netlify/functions/email-insights.mjs
function json10(o, status) {
  return new Response(JSON.stringify(o), {
    status: status || 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,x-le-key"
    }
  });
}
var KEY5, MAX, email_insights_default;
var init_email_insights = __esm({
  "../netlify/functions/email-insights.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    init_emailInsight();
    KEY5 = "insights-v1";
    MAX = 200;
    __name(json10, "json");
    email_insights_default = /* @__PURE__ */ __name(async (req) => {
      const store = getStore2("email-insights");
      const doc = await store.get(KEY5, { type: "json", consistency: "strong" }) || { insights: [], ts: 0 };
      if (req.method === "OPTIONS") return json10({ ok: true });
      if (req.method === "POST") {
        let body = {};
        try {
          body = await req.json();
        } catch {
        }
        if (body.op === "patch") {
          const id = String(body.id || "");
          const patch = body.patch || {};
          const hit = (doc.insights || []).find((x) => String(x.id) === id);
          if (!hit) return json10({ ok: false, error: "not_found" }, 404);
          Object.assign(hit, patch, { updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
          doc.ts = Date.now();
          await store.setJSON(KEY5, doc);
          return json10({ ok: true, insight: hit });
        }
        if (body.op === "ingest" || body.op === "ingest_raw") {
          const raw = body.insight || body.email || body;
          const from = raw.from || "";
          const subject = raw.subject || "";
          const text = raw.body || raw.snippet || raw.text || "";
          if (!isEnergyServicesEmail(from, subject, text) && body.op === "ingest_raw") {
            return json10({ ok: false, skipped: true, reason: "not_energy_services" });
          }
          let insight = body.op === "ingest" && raw.id && raw.source ? { ...raw } : parseEmailInsight({
            from,
            subject,
            body: text,
            receivedAt: raw.receivedAt || raw.date || "",
            messageId: raw.messageId || raw.id || ""
          });
          const jobs = Array.isArray(body.jobs) ? body.jobs : [];
          if (jobs.length) insight = enrichInsight(insight, jobs);
          const mid = insight.source?.messageId || insight.id;
          const dupe = (doc.insights || []).find(
            (x) => x.source?.messageId && x.source.messageId === mid || x.id === insight.id
          );
          if (dupe && dupe.status !== "pending") {
            return json10({ ok: true, deduped: true, insight: dupe });
          }
          if (dupe) {
            Object.assign(dupe, insight, { status: "pending", updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
            doc.ts = Date.now();
            await store.setJSON(KEY5, doc);
            return json10({ ok: true, insight: dupe, refreshed: true });
          }
          insight.createdAt = (/* @__PURE__ */ new Date()).toISOString();
          insight.updatedAt = insight.createdAt;
          doc.insights = [insight, ...doc.insights || []].slice(0, MAX);
          doc.ts = Date.now();
          await store.setJSON(KEY5, doc);
          return json10({ ok: true, insight });
        }
        return json10({ ok: false, error: "unknown_op" }, 400);
      }
      const pendingOnly = new URL(req.url).searchParams.get("pending") === "1";
      let insights = doc.insights || [];
      if (pendingOnly) insights = insights.filter((x) => x.status === "pending");
      insights = [...insights].sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
      return json10({ insights, ts: doc.ts || 0 });
    }, "default");
  }
});

// .netlify/functions/email-insights.js
var onRequest11;
var init_email_insights2 = __esm({
  ".netlify/functions/email-insights.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_email_insights();
    init_pagesAdapter();
    onRequest11 = toPagesFunction(email_insights_default);
  }
});

// .netlify/functions/generate-doc.js
async function onRequest12(context2) {
  return new Response(
    JSON.stringify({
      ok: false,
      error: "server_pdf_disabled",
      detail: "PDFs are generated client-side; email attaches the client PDF via send-doc-email (pdfB64)."
    }),
    { status: 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } }
  );
}
var init_generate_doc = __esm({
  ".netlify/functions/generate-doc.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name(onRequest12, "onRequest");
  }
});

// ../netlify/functions/inbox.mjs
var inbox_default;
var init_inbox = __esm({
  "../netlify/functions/inbox.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    inbox_default = /* @__PURE__ */ __name(async (req) => {
      const store = getStore2("iterations");
      const { blobs } = await store.list();
      const items = [];
      for (const b of blobs) {
        const v = await store.get(b.key, { type: "json" });
        if (v) {
          v._key = b.key;
          items.push(v);
        }
      }
      items.sort((a, b) => a.ts < b.ts ? 1 : -1);
      return new Response(JSON.stringify(items, null, 2), {
        headers: { "content-type": "application/json", "cache-control": "no-store" }
      });
    }, "default");
  }
});

// .netlify/functions/inbox.js
var onRequest13;
var init_inbox2 = __esm({
  ".netlify/functions/inbox.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_inbox();
    init_pagesAdapter();
    onRequest13 = toPagesFunction(inbox_default);
  }
});

// ../netlify/functions/items.mjs
function json11(o) {
  return new Response(JSON.stringify(o), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
async function load6(store) {
  return await store.get(KEY6, { type: "json", consistency: "strong" }) || { items: [], updated: "", ts: 0 };
}
var KEY6, items_default;
var init_items = __esm({
  "../netlify/functions/items.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    KEY6 = "items-v1";
    __name(json11, "json");
    __name(load6, "load");
    items_default = /* @__PURE__ */ __name(async (req) => {
      const store = getStore2("items");
      if (req.method === "OPTIONS") return json11({ ok: true });
      if (req.method === "POST") {
        let b = {};
        try {
          b = await req.json();
        } catch (e) {
        }
        if (b.op === "set" && Array.isArray(b.items)) {
          await store.setJSON(KEY6, { items: b.items, updated: b.updated || "", ts: Date.now() });
          return json11({ ok: true, count: b.items.length });
        }
        return json11({ ok: false, error: "unknown op" });
      }
      const doc = await load6(store);
      const url = new URL(req.url);
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      if (q) {
        const toks = q.split(/\s+/).filter(Boolean);
        const scored = [];
        for (const it of doc.items || []) {
          const n = String(it.name || "").toLowerCase();
          const d = String(it.description || "").toLowerCase();
          let s = 0;
          for (const t of toks) {
            if (n.includes(t)) s += n.startsWith(t) ? 3 : 2;
            else if (d.includes(t)) s += 1;
          }
          if (s) scored.push({ ...it, _s: s });
        }
        scored.sort((a, b) => b._s - a._s || a.name.localeCompare(b.name));
        return json11({ items: scored.slice(0, 20).map(({ _s, ...it }) => it), ts: doc.ts });
      }
      return json11(doc);
    }, "default");
  }
});

// .netlify/functions/items.js
var onRequest14;
var init_items2 = __esm({
  ".netlify/functions/items.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_items();
    init_pagesAdapter();
    onRequest14 = toPagesFunction(items_default);
  }
});

// ../netlify/functions/iterate.mjs
var iterate_default;
var init_iterate = __esm({
  "../netlify/functions/iterate.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    iterate_default = /* @__PURE__ */ __name(async (req) => {
      if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { "content-type": "application/json" } });
      }
      let body = {};
      try {
        body = await req.json();
      } catch (e) {
      }
      const message = (body && body.message ? String(body.message) : "").trim();
      if (!message) {
        return new Response(JSON.stringify({ error: "empty message" }), { status: 400, headers: { "content-type": "application/json" } });
      }
      const store = getStore2("iterations");
      const ts = (/* @__PURE__ */ new Date()).toISOString();
      const key2 = Date.now().toString() + "-" + Math.random().toString(36).slice(2, 7);
      const entry = { ts, message, source: body && body.source || "progress-tab" };
      if (body && body.context && typeof body.context === "object") entry.context = body.context;
      await store.setJSON(key2, entry);
      return new Response(JSON.stringify({ ok: true, ts }), { headers: { "content-type": "application/json" } });
    }, "default");
  }
});

// .netlify/functions/iterate.js
var onRequest15;
var init_iterate2 = __esm({
  ".netlify/functions/iterate.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_iterate();
    init_pagesAdapter();
    onRequest15 = toPagesFunction(iterate_default);
  }
});

// ../netlify/functions/blob-backup.mjs
var init_blob_backup = __esm({
  "../netlify/functions/blob-backup.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_backup();
  }
});

// ../netlify/functions/jobsdata.mjs
function json12(o) {
  return new Response(JSON.stringify(o), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
async function load7(store) {
  return await store.get(KEY7, { type: "json", consistency: "strong" }) || { jobs: [], syncedAt: 0, request: 0, ts: 0 };
}
var KEY7, jobsdata_default;
var init_jobsdata = __esm({
  "../netlify/functions/jobsdata.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    init_blob_backup();
    KEY7 = "jobsdata-v1";
    __name(json12, "json");
    __name(load7, "load");
    jobsdata_default = /* @__PURE__ */ __name(async (req) => {
      const store = getStore2("jobsdata");
      if (req.method === "OPTIONS") return json12({ ok: true });
      if (req.method === "POST") {
        let b = {};
        try {
          b = await req.json();
        } catch (e) {
        }
        const doc = await load7(store);
        if (b.op === "set" && Array.isArray(b.jobs)) {
          doc.jobs = b.jobs;
          doc.syncedAt = Date.now();
          doc.request = 0;
        } else if (b.op === "merge" && Array.isArray(b.jobs)) {
          const byId = new Map((doc.jobs || []).map((j) => [j.id, j]));
          for (const nj of b.jobs) {
            if (!nj || !nj.id) continue;
            const cur = byId.get(nj.id);
            byId.set(nj.id, cur ? Object.assign({}, cur, nj) : nj);
          }
          doc.jobs = [...byId.values()];
          doc.syncedAt = Date.now();
          doc.request = 0;
        } else if (b.op === "request") {
          doc.request = Date.now();
        }
        doc.ts = Date.now();
        await rotateJsonBackup(store, KEY7, doc);
        return json12(doc);
      }
      return json12(await load7(store));
    }, "default");
  }
});

// .netlify/functions/jobsdata.js
var onRequest16;
var init_jobsdata2 = __esm({
  ".netlify/functions/jobsdata.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_jobsdata();
    init_pagesAdapter();
    onRequest16 = toPagesFunction(jobsdata_default);
  }
});

// ../netlify/functions/pay-link.mjs
function corsHeaders() {
  return {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}
function json13(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}
function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}
function makeCode(invoiceNo) {
  const inv = String(invoiceNo || "").trim().replace(/\D/g, "");
  const base = inv || String(Date.now()).slice(-6);
  return `${base}-${randomSuffix()}`;
}
var SITE, TTL_MS, CODE_RE, pay_link_default;
var init_pay_link = __esm({
  "../netlify/functions/pay-link.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    SITE = "https://leelectrical.us";
    TTL_MS = 90 * 24 * 60 * 60 * 1e3;
    CODE_RE = /^[0-9]{5,8}-[a-z0-9]{4}$/i;
    __name(corsHeaders, "corsHeaders");
    __name(json13, "json");
    __name(randomSuffix, "randomSuffix");
    __name(makeCode, "makeCode");
    pay_link_default = /* @__PURE__ */ __name(async (req) => {
      if (req.method === "OPTIONS") return json13({ ok: true });
      const store = getStore2("paylinks");
      if (req.method === "POST") {
        let body = {};
        try {
          body = await req.json();
        } catch {
          return json13({ ok: false, error: "Invalid JSON" }, 400);
        }
        const payload = body.payload;
        if (!payload || !payload.i) return json13({ ok: false, error: "payload with invoice required" }, 400);
        const code2 = makeCode(payload.i);
        const record2 = { payload, createdAt: Date.now(), invoiceNo: String(payload.i) };
        await store.set(`pl-${code2}`, JSON.stringify(record2), {
          metadata: { invoiceNo: String(payload.i), ts: Date.now() }
        });
        const url2 = `${SITE}/pay/${code2}`;
        return json13({ ok: true, code: code2, url: url2 });
      }
      const url = new URL(req.url);
      const code = String(url.searchParams.get("code") || "").trim();
      if (!code) return json13({ ok: false, error: "code required" }, 400);
      if (!CODE_RE.test(code)) return json13({ ok: false, error: "invalid code" }, 404);
      const raw = await store.get(`pl-${code}`, { type: "text" });
      if (!raw) return json13({ ok: false, error: "link not found" }, 404);
      let record;
      try {
        record = JSON.parse(raw);
      } catch {
        return json13({ ok: false, error: "corrupt link data" }, 500);
      }
      if (record.createdAt && Date.now() - record.createdAt > TTL_MS) {
        return json13({ ok: false, error: "link expired" }, 410);
      }
      if (req.headers.get("accept")?.includes("text/html")) {
        const target = `${SITE}/app/pro/#/pay/${encodeURIComponent(code)}`;
        return new Response(
          `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${target}"><title>Pay invoice</title></head><body><p><a href="${target}">Continue to payment page</a></p></body></html>`,
          { status: 302, headers: { Location: target, "content-type": "text/html; charset=utf-8" } }
        );
      }
      return json13({ ok: true, code, payload: record.payload });
    }, "default");
  }
});

// .netlify/functions/pay-link.js
var onRequest17;
var init_pay_link2 = __esm({
  ".netlify/functions/pay-link.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_pay_link();
    init_pagesAdapter();
    onRequest17 = toPagesFunction(pay_link_default);
  }
});

// ../netlify/functions/lib/zelleVision.mjs
function parseVisionJson(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1].trim() : s;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
function textFromResponsesBody(body) {
  if (!body || typeof body !== "object") return "";
  if (typeof body.output_text === "string") return body.output_text;
  const out = body.output;
  if (Array.isArray(out)) {
    const bits = [];
    for (const item of out) {
      if (typeof item?.text === "string") bits.push(item.text);
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (typeof c?.text === "string") bits.push(c.text);
        }
      }
    }
    if (bits.length) return bits.join("\n");
  }
  const choice = body.choices?.[0];
  if (typeof choice?.message?.content === "string") return choice.message.content;
  if (Array.isArray(choice?.message?.content)) {
    return choice.message.content.filter((c) => c?.type === "text" || c?.type === "output_text").map((c) => c.text || "").join("\n");
  }
  return "";
}
var init_zelleVision = __esm({
  "../netlify/functions/lib/zelleVision.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name(parseVisionJson, "parseVisionJson");
    __name(textFromResponsesBody, "textFromResponsesBody");
  }
});

// ../netlify/functions/lib/paymentVision.mjs
function normalizePaymentExtracted(raw, kind = "zelle") {
  if (!raw || typeof raw !== "object") return null;
  const amt = raw.amount != null ? parseFloat(String(raw.amount).replace(/[$,]/g, "")) : null;
  const conf = String(raw.confidence || "").toLowerCase() === "low" ? "low" : "high";
  let date = raw.date ? String(raw.date).trim() : "";
  const dm = date.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dm) {
    const yr = dm[3].length === 2 ? "20" + dm[3] : dm[3];
    date = `${yr}-${dm[1].padStart(2, "0")}-${dm[2].padStart(2, "0")}`;
  }
  const checkNo = raw.checkNumber ? String(raw.checkNumber).trim() : "";
  const confNo = raw.confirmationNumber ? String(raw.confirmationNumber).trim() : "";
  const ref2 = kind === "check" ? checkNo : confNo;
  return {
    amount: Number.isFinite(amt) && amt > 0 ? amt : null,
    confirmationNumber: ref2,
    checkNumber: checkNo,
    date,
    memo: raw.memo ? String(raw.memo).trim() : "",
    payee: raw.payee ? String(raw.payee).trim() : "",
    confidence: conf,
    kind
  };
}
function normalizeIntentExtracted(raw) {
  if (!raw || typeof raw !== "object") return null;
  const invs = Array.isArray(raw.invoiceNumbers) ? raw.invoiceNumbers.map((n) => String(n).replace(/\D/g, "")).filter((n) => n.length >= 5) : [];
  const addrs = Array.isArray(raw.addresses) ? raw.addresses.map((a) => String(a).trim()).filter(Boolean) : [];
  const amt = raw.amount != null ? parseFloat(String(raw.amount).replace(/[$,]/g, "")) : null;
  const doc = String(raw.documentType || "other").toLowerCase();
  const pm = raw.paymentMethod ? String(raw.paymentMethod).toLowerCase() : null;
  return {
    documentType: ["payment", "invoice", "estimate", "job_site"].includes(doc) ? doc : "other",
    invoiceNumbers: [...new Set(invs)],
    addresses: [...new Set(addrs)],
    amount: Number.isFinite(amt) && amt > 0 ? amt : null,
    paymentMethod: pm === "zelle" || pm === "check" || pm === "card" ? pm : null,
    memo: raw.memo ? String(raw.memo).trim() : "",
    confidence: String(raw.confidence || "").toLowerCase() === "low" ? "low" : "high",
    kind: "intent"
  };
}
async function callVision({ imageBase64, mime, prompt, model, apiKey }) {
  const dataUrl = `data:${mime};base64,${imageBase64}`;
  let text = "";
  try {
    const r = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_image", image_url: dataUrl, detail: "high" },
              { type: "input_text", text: prompt }
            ]
          }
        ]
      })
    });
    if (r.ok) {
      const body = await r.json();
      text = textFromResponsesBody(body);
    }
  } catch {
  }
  if (!text) {
    const r = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
              { type: "text", text: prompt }
            ]
          }
        ],
        temperature: 0
      })
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(`xAI vision ${r.status}: ${err.slice(0, 200)}`);
    }
    const body = await r.json();
    text = textFromResponsesBody(body);
  }
  return text;
}
async function extractPaymentFromImage({ imageBase64, mime = "image/jpeg", kind = "zelle" }) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return { dryRun: true, extracted: null, error: "XAI_API_KEY not set" };
  }
  const model = process.env.XAI_VISION_MODEL || "grok-4.5";
  const k = kind === "check" ? "check" : kind === "intent" ? "intent" : "zelle";
  const prompt = PROMPTS[k];
  const text = await callVision({ imageBase64, mime, prompt, model, apiKey });
  const parsed = parseVisionJson(text);
  const extracted = k === "intent" ? normalizeIntentExtracted(parsed) : normalizePaymentExtracted(parsed, k);
  if (!extracted) throw new Error("Could not parse vision response");
  return { dryRun: false, extracted, model, kind: k };
}
var ZELLE_VISION_PROMPT, CHECK_VISION_PROMPT, IMAGE_INTENT_PROMPT, PROMPTS;
var init_paymentVision = __esm({
  "../netlify/functions/lib/paymentVision.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_zelleVision();
    ZELLE_VISION_PROMPT = `You are reading a Zelle payment confirmation screenshot (bank app or email).
Extract these fields and return ONLY valid JSON (no markdown):
{
  "amount": <number USD, no $ sign>,
  "confirmationNumber": <Zelle confirmation/reference, often JPM\u2026>,
  "date": <YYYY-MM-DD payment date>,
  "memo": <memo/note text exactly as shown>,
  "confidence": <"high" or "low">
}
If a field is missing or unreadable use null. confirmationNumber is critical.`;
    CHECK_VISION_PROMPT = `You are reading a paper check or mobile check-deposit photo.
Extract these fields and return ONLY valid JSON (no markdown):
{
  "amount": <number USD, no $ sign>,
  "checkNumber": <check number as digits only \u2014 look in the upper-right corner of the check AND on the MICR line at the bottom (between routing and account numbers)>,
  "date": <YYYY-MM-DD date on the check>,
  "memo": <memo line text exactly as written>,
  "payee": <pay to the order of name>,
  "confidence": <"high" or "low">
}
If a field is missing or unreadable use null. checkNumber and amount are critical \u2014 always try both the printed check number and the MICR check number field.`;
    IMAGE_INTENT_PROMPT = `You are reading a photo Levi sent LE Electrical (payment proof, invoice, estimate, job site, document, or screenshot).
Extract visible clues and return ONLY valid JSON (no markdown):
{
  "documentType": <"payment"|"invoice"|"estimate"|"job_site"|"other">,
  "invoiceNumbers": [<5-6 digit invoice/job numbers visible, as strings>],
  "addresses": [<street addresses visible, as strings>],
  "amount": <USD number if a payment amount is visible, else null>,
  "paymentMethod": <"zelle"|"check"|"card"|null>,
  "memo": <memo/note text exactly as shown, or null>,
  "confidence": <"high"|"low">
}
If a field is missing use null or []. invoiceNumbers and addresses are critical for job lookup.`;
    PROMPTS = {
      zelle: ZELLE_VISION_PROMPT,
      check: CHECK_VISION_PROMPT,
      intent: IMAGE_INTENT_PROMPT
    };
    __name(normalizePaymentExtracted, "normalizePaymentExtracted");
    __name(normalizeIntentExtracted, "normalizeIntentExtracted");
    __name(callVision, "callVision");
    __name(extractPaymentFromImage, "extractPaymentFromImage");
  }
});

// ../netlify/functions/payment-vision.mjs
function json14(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    }
  });
}
var payment_vision_default;
var init_payment_vision = __esm({
  "../netlify/functions/payment-vision.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_paymentVision();
    __name(json14, "json");
    payment_vision_default = /* @__PURE__ */ __name(async (req) => {
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS" }
        });
      }
      if (req.method !== "POST") return json14({ ok: false, error: "POST only" }, 405);
      let body = {};
      try {
        body = await req.json();
      } catch {
        return json14({ ok: false, error: "invalid JSON" }, 400);
      }
      const image = String(body.image || "").trim();
      const mime = String(body.mime || "image/jpeg").trim();
      const rawKind = String(body.kind || "zelle").trim().toLowerCase();
      const kind = rawKind === "check" ? "check" : rawKind === "intent" ? "intent" : "zelle";
      if (!image) return json14({ ok: false, error: "image required" }, 400);
      if (image.length > 28e6) return json14({ ok: false, error: "image too large" }, 413);
      try {
        const result = await extractPaymentFromImage({ imageBase64: image, mime, kind });
        if (result.dryRun) {
          return json14({
            ok: false,
            dryRun: true,
            error: result.error || "Vision API not configured \u2014 set XAI_API_KEY on Netlify"
          });
        }
        return json14({ ok: true, extracted: result.extracted, model: result.model, kind: result.kind });
      } catch (e) {
        return json14({ ok: false, error: String(e.message || e).slice(0, 300) }, 502);
      }
    }, "default");
  }
});

// .netlify/functions/payment-vision.js
var onRequest18;
var init_payment_vision2 = __esm({
  ".netlify/functions/payment-vision.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_payment_vision();
    init_pagesAdapter();
    onRequest18 = toPagesFunction(payment_vision_default);
  }
});

// ../netlify/functions/dev_progress_snapshot.json
var dev_progress_snapshot_default;
var init_dev_progress_snapshot = __esm({
  "../netlify/functions/dev_progress_snapshot.json"() {
    dev_progress_snapshot_default = {
      meta: {
        agent: "Israel (Grok Build)",
        project: "LE Pro",
        repo: "leelectrical-repo",
        update_definition: "An update = one active build day's batch of shipped work. Each update expands to the individual commits (iterations) that made it up.",
        time_method: "Active build time estimated by sessionizing commit timestamps: consecutive commits within 30 min count as continuous work; gaps >30 min end a session. Sum of session spans.",
        human_rate_usd_per_hour: 150,
        ai_cost_note: "Grok flat subscription \u2014 marginal cost per build ~ $0.",
        generated_at: "2026-07-13 21:08:31Z"
      },
      totals: {
        updates: 12,
        commits: 248,
        lines_written: 78525,
        lines_implemented: 60497,
        deletions: 18028,
        files_changed: 2179,
        active_days: 12,
        first_commit: "2026-07-01 19:12:33",
        last_commit: "2026-07-13 16:33:28",
        active_seconds: 87359,
        active_time_hms: "24:15:59",
        active_hours: 24.27,
        deploys: 161,
        speed_lines_written_per_hour: 3236,
        speed_lines_landed_per_hour: 2493,
        speed_commits_per_hour: 10.2,
        human_cost_usd: 3639.96,
        ai_cost_usd: 0,
        money_saved_usd: 3639.96
      },
      updates: [
        {
          id: 1,
          date: "2026-07-01",
          title: "Initial import: leelectrical.us site with Jobs in Progress dashboard tab",
          commits: 8,
          insertions: 1965,
          deletions: 214,
          net: 1751,
          files: 24,
          iterations: [
            {
              hash: "50ae39e",
              time: "19:12",
              subject: "Initial import: leelectrical.us site with Jobs in Progress dashboard tab",
              insertions: 1425,
              deletions: 0,
              files: 10
            },
            {
              hash: "0aeef5e",
              time: "19:20",
              subject: "Add Early Access (Beta) tab to live landing -> app/jobs-beta.html (enhanced layout, sample data); real jobs.html untouched",
              insertions: 258,
              deletions: 0,
              files: 1
            },
            {
              hash: "3cf49d6",
              time: "19:38",
              subject: "Fix: add Early Access (Beta) tile to live landing",
              insertions: 3,
              deletions: 1,
              files: 1
            },
            {
              hash: "96526aa",
              time: "19:44",
              subject: "Live Progress to Dispatch pipe: Netlify functions (iterate/inbox) + Send button",
              insertions: 50,
              deletions: 2,
              files: 5
            },
            {
              hash: "b522191",
              time: "20:22",
              subject: "Promote approved beta features to real Jobs tab + Dispatch messaging bar (excludes dropdown follow-up, paperwork, progress tab)",
              insertions: 196,
              deletions: 198,
              files: 1
            },
            {
              hash: "f214156",
              time: "21:08",
              subject: "Rename tabs: LE Electric Dashboard (real) + Beta Development (beta)",
              insertions: 4,
              deletions: 4,
              files: 3
            },
            {
              hash: "83015a2",
              time: "21:58",
              subject: "Add Juan Cadaveira (Inv 231608, 50 balance) to LE Electric Dashboard + Beta Development",
              insertions: 14,
              deletions: 2,
              files: 2
            },
            {
              hash: "64fe93d",
              time: "23:49",
              subject: "Beta: expandable Con Ed / City Permit sub-menus inline on timeline steps",
              insertions: 15,
              deletions: 7,
              files: 1
            }
          ]
        },
        {
          id: 2,
          date: "2026-07-02",
          title: "Task #16: New Job (manual OR from-calendar prefill) + calendar store + calEventId link + calendar_upsert write",
          commits: 20,
          insertions: 697,
          deletions: 117,
          net: 580,
          files: 43,
          iterations: [
            {
              hash: "6ce4428",
              time: "00:21",
              subject: "Cross-device sync (shared Netlify Blobs store) for both dashboards + place both paperwork menus on Scheduled step",
              insertions: 52,
              deletions: 5,
              files: 3
            },
            {
              hash: "20cf0bd",
              time: "04:29",
              subject: "Promote Con Ed + City Permit paperwork menus to the real LE Electric Dashboard",
              insertions: 20,
              deletions: 1,
              files: 1
            },
            {
              hash: "6d5c863",
              time: "05:11",
              subject: "Add Development Task List tab (numbered tasks, go-ahead gate, collapsible completed, speech-to-text, photo attach/paste) to Dashboard + Beta + devtasks store",
              insertions: 108,
              deletions: 4,
              files: 3
            },
            {
              hash: "9a907d0",
              time: "05:14",
              subject: "Dev tasks: global unique numbering across beta+dashboard + Needs-your-answer question state",
              insertions: 7,
              deletions: 5,
              files: 3
            },
            {
              hash: "e678171",
              time: "05:22",
              subject: "Dev tasks: Review-it-again button (edit/expand desc + dictate, send back for re-review) on understood + question cards",
              insertions: 14,
              deletions: 4,
              files: 2
            },
            {
              hash: "ffb7d57",
              time: "05:50",
              subject: "Dev tasks: single shared list across Dashboard+Beta with per-task Beta/Dashboard target checkboxes (Dashboard ticks both)",
              insertions: 31,
              deletions: 34,
              files: 3
            },
            {
              hash: "d95c6f3",
              time: "07:51",
              subject: "devtasks: strong-consistency reads to prevent lost-update clobber",
              insertions: 2,
              deletions: 1,
              files: 1
            },
            {
              hash: "f7606a1",
              time: "07:56",
              subject: "Dev tasks: taller auto-expanding review-edit box",
              insertions: 4,
              deletions: 4,
              files: 2
            },
            {
              hash: "4511e35",
              time: "08:02",
              subject: "Dev tasks: fix typing-wipe (poll no longer clobbers input) + auto-grow/collapse description; mobile: condensed header that hides on scroll",
              insertions: 22,
              deletions: 14,
              files: 2
            },
            {
              hash: "be592f8",
              time: "09:02",
              subject: "Task #2: live jobs sync \u2014 jobsdata store + dashboard Sync-now button + live-data loading",
              insertions: 59,
              deletions: 4,
              files: 3
            },
            {
              hash: "3723aa3",
              time: "10:23",
              subject: "Dev tasks: add Verify-it-works status (executed, awaiting your verification) between running and done",
              insertions: 6,
              deletions: 4,
              files: 2
            },
            {
              hash: "9815c52",
              time: "10:26",
              subject: "Mobile: pull-to-refresh (stretch + spinning arrow) triggers data refresh",
              insertions: 18,
              deletions: 0,
              files: 2
            },
            {
              hash: "3a81ad4",
              time: "11:41",
              subject: "Add Golan Chakov job (Inv 231315, $11k balance) to dashboards",
              insertions: 14,
              deletions: 2,
              files: 2
            },
            {
              hash: "504f070",
              time: "13:07",
              subject: "Dev board: Build/General split (no priority on General) + sorted sections (High -> Awaiting your go -> In progress -> Not yet reviewed)",
              insertions: 12,
              deletions: 4,
              files: 2
            },
            {
              hash: "541c080",
              time: "17:18",
              subject: "#17 command bus: durable command queue function (idempotency + audit trail + statuses)",
              insertions: 93,
              deletions: 0,
              files: 1
            },
            {
              hash: "286e653",
              time: "18:20",
              subject: "#17: wire Send-invoice to command bus + live status/Retry badge on job cards (Phase 1: routes to Dispatch, no auto-send)",
              insertions: 20,
              deletions: 6,
              files: 2
            },
            {
              hash: "eb69713",
              time: "18:52",
              subject: "Fix: Send button reads Send estimate when only an estimate exists, Send invoice when an invoice exists",
              insertions: 4,
              deletions: 2,
              files: 2
            },
            {
              hash: "7b6047b",
              time: "20:36",
              subject: "Task #20: customer sync \u2014 exact-match dedup + approve-before-create pop-up (dashboard+beta), qbo_app.py customer-sync/create-customer, listener handlers",
              insertions: 34,
              deletions: 2,
              files: 2
            },
            {
              hash: "5a46058",
              time: "20:55",
              subject: "Task #16: New Job (manual OR from-calendar prefill) + calendar store + calEventId link + calendar_upsert write",
              insertions: 126,
              deletions: 8,
              files: 3
            },
            {
              hash: "28194bc",
              time: "21:01",
              subject: "Task #1: pending-changes Save model \u2014 edits held until Save & sync, unsaved-changes guard on nav/back/close, save animation, sync trigger (dashboard+beta)",
              insertions: 51,
              deletions: 13,
              files: 2
            }
          ]
        },
        {
          id: 3,
          date: "2026-07-03",
          title: "Sleek Beta (new page app/sleek.html): redesigned dashboard \u2014 phase-grouped progress, Today agenda, archive tab, grouped clients, safer sync UX; jobsdata op:merge (non-destructive sync); launcher card in app/index.html; includes prior session WIP (chat.mjs return channel + bubble wiring)",
          commits: 12,
          insertions: 1519,
          deletions: 157,
          net: 1362,
          files: 22,
          iterations: [
            {
              hash: "14b454d",
              time: "01:11",
              subject: "Task #20 expanded: recommend-update / candidates+refine / create-vs-update, edit-customer card, job menu (archive/combine/delete), qbo search+update",
              insertions: 60,
              deletions: 34,
              files: 2
            },
            {
              hash: "16db101",
              time: "01:17",
              subject: "Tasks #4 (Mark-as-Paid form + record_payment on save) and #7 (per-job quick-view: Invoice/Estimate/Paperwork/Calendar)",
              insertions: 40,
              deletions: 6,
              files: 2
            },
            {
              hash: "e83eda0",
              time: "01:23",
              subject: "Tasks #11-15: condensed tap-to-expand progress steps (Complete/Skip/Undo + auto-collapse), Deposit Receipt + Paperwork stages, Con Ed / DOB branch with standardized sub-steps + date prompts (inspection->calendar, meter install date)",
              insertions: 62,
              deletions: 30,
              files: 2
            },
            {
              hash: "a73104f",
              time: "01:30",
              subject: "Task #5: floating chat bubble (replaces bottom bar) \u2014 auto page-context, animated volume mic, Developer tab stays context-free; posts to Dispatch via iterate",
              insertions: 66,
              deletions: 6,
              files: 2
            },
            {
              hash: "83e7778",
              time: "01:32",
              subject: "Task #19 item 3: dormant cloud send executor (qbo-exec.mjs) \u2014 no-ops until QBO env vars are set; go-live is a deliberate morning step",
              insertions: 141,
              deletions: 0,
              files: 1
            },
            {
              hash: "4fc8727",
              time: "01:36",
              subject: "Task #6: chat bubble Phase 2 \u2014 in-bubble Dispatch replies + per-message statuses + collapsed-bubble notification (chat.mjs return channel)",
              insertions: 75,
              deletions: 8,
              files: 3
            },
            {
              hash: "8dcc812",
              time: "01:39",
              subject: "Task #8: auto-attach job attachments to the QuickBooks invoice (qbo_app.py attach-file + listener attach_to_invoice + addAtt enqueue)",
              insertions: 2,
              deletions: 2,
              files: 2
            },
            {
              hash: "fa8085b",
              time: "01:51",
              subject: "Sleek Beta (new page app/sleek.html): redesigned dashboard \u2014 phase-grouped progress, Today agenda, archive tab, grouped clients, safer sync UX; jobsdata op:merge (non-destructive sync); launcher card in app/index.html; includes prior session WIP (chat.mjs return channel + bubble wiring)",
              insertions: 787,
              deletions: 0,
              files: 3
            },
            {
              hash: "b2ccfbe",
              time: "13:28",
              subject: "Task #23: multi-job-per-client \u2014 jobs group under one client card (expand to see each job); single-job customers unchanged",
              insertions: 24,
              deletions: 2,
              files: 2
            },
            {
              hash: "82a5af1",
              time: "15:01",
              subject: "Beta upgraded with Sleek design system: search bar, jcard job cards, expandable customer groups w/ auto-collapse, Sleek chat bubble + context chip, + FAB, QBO sync chip, Sleek job detail (customer card + 5-phase progress). Dashboard untouched.",
              insertions: 181,
              deletions: 53,
              files: 1
            },
            {
              hash: "0c492ad",
              time: "16:29",
              subject: "Sleek gap-close: attachments card (+QBO attach cmd), send history, follow-up types + Telegram remind, payment reminder via bus, dev-tab photo attach + paste, refine-search in customer approvals",
              insertions: 75,
              deletions: 14,
              files: 1
            },
            {
              hash: "5684636",
              time: "16:40",
              subject: "Sleek dev tab: build-target picker (Sleek/Beta/Dashboard, multi) + target pills on task cards",
              insertions: 6,
              deletions: 2,
              files: 1
            }
          ]
        },
        {
          id: 4,
          date: "2026-07-05",
          title: "LE Pro module 1: standalone React PWA at /app/pro (Vite+Tailwind, installable, offline shell) \u2014 Jobs/Detail/Today on live data via Netlify-store adapter; Supabase schema ready; SAS webhook research",
          commits: 13,
          insertions: 13920,
          deletions: 1458,
          net: 12462,
          files: 194,
          iterations: [
            {
              hash: "039fecf",
              time: "00:55",
              subject: "LE Pro module 1: standalone React PWA at /app/pro (Vite+Tailwind, installable, offline shell) \u2014 Jobs/Detail/Today on live data via Netlify-store adapter; Supabase schema ready; SAS webhook research",
              insertions: 5390,
              deletions: 0,
              files: 38
            },
            {
              hash: "5324326",
              time: "01:25",
              subject: "LE Pro: full feature parity with Sleek+Dashboard (mark-paid, quick views, customer sync approvals+refine, new job, archive/combine/delete, phase progress + ConEd/DOB branches, follow-up+reminders, attachments, activity+retry, chat bubble, dev board w/ Pro target, sync chip, savebar/guards) \u2014 58/58 tests, responsive",
              insertions: 4382,
              deletions: 597,
              files: 40
            },
            {
              hash: "99041fc",
              time: "02:04",
              subject: "LE Pro fixes: customer dedupe grouping (no double rows), same-customer combine popup w/ remembered dismissals, chat repaired (reply rendering, optimistic send, retry, hint) - 78 tests",
              insertions: 696,
              deletions: 94,
              files: 14
            },
            {
              hash: "af55a4f",
              time: "02:20",
              subject: "sas-inbound webhook receiver (SAS Flex Custom Action -> calls store, shared-secret)",
              insertions: 33,
              deletions: 0,
              files: 1
            },
            {
              hash: "e94bd8d",
              time: "09:21",
              subject: "Presence pings (LE Pro + chat fn op:presence) for presence-aware Dispatch chat; 80 tests",
              insertions: 150,
              deletions: 70,
              files: 9
            },
            {
              hash: "f7361a1",
              time: "12:49",
              subject: "LE Pro: dev-board archive+edit+mark-complete, paperwork lists exact parity w/ dashboard, live PDF viewing path (docs.mjs + fetch_pdf handler), sync-chip time fix - 87 tests",
              insertions: 499,
              deletions: 123,
              files: 17
            },
            {
              hash: "9605e2c",
              time: "13:23",
              subject: "Chat online mode (dispatch heartbeat, online dot, 3s polls, typing line, notifications, unread fix) + QA fixes (savebar overlap, dev-board error handling, iOS safe-area, SW v2) - 96 tests",
              insertions: 375,
              deletions: 102,
              files: 17
            },
            {
              hash: "54a93d7",
              time: "13:35",
              subject: "Levi chat requests: paperwork enable/greyed default + removable items w/ restore; jobs sort-by menu (smart/amount/next-step/overdue/follow-up/newest) - 113 tests",
              insertions: 661,
              deletions: 112,
              files: 11
            },
            {
              hash: "6b3b14b",
              time: "14:47",
              subject: "LE Pro Calls tab: SAS lead tickets (convert-to-job/dismiss, unhandled badge, no QBO) - 119 tests",
              insertions: 547,
              deletions: 85,
              files: 13
            },
            {
              hash: "5fe5bcd",
              time: "15:28",
              subject: "LE Pro fix: customer_sync approval resolved client-side (done + create/update_customer cmd) - listener ignored approval field, sheet looped; tests green",
              insertions: 227,
              deletions: 77,
              files: 6
            },
            {
              hash: "2a765d0",
              time: "15:46",
              subject: "LE Pro fix: stale eventually-consistent state reads reverted saved edits - cb on state GETs, retry-after-write in saveJob, stale-snapshot guard in refreshJobs; tests+build green",
              insertions: 161,
              deletions: 77,
              files: 7
            },
            {
              hash: "f25c6cf",
              time: "15:53",
              subject: "LE Pro fix: approval sheet now renders recommend_update shape (customer+diffs) with Update-existing option and old->new diff box; tests+build green",
              insertions: 72,
              deletions: 16,
              files: 4
            },
            {
              hash: "d6fdc8a",
              time: "18:26",
              subject: "LE Pro: Biller Genie payment-link pipeline + customer window (total balance due + Customer detail view); 145 tests green",
              insertions: 727,
              deletions: 105,
              files: 17
            }
          ]
        },
        {
          id: 5,
          date: "2026-07-06",
          title: "#39: biometric (WebAuthn) + password lock on LE Pro app open",
          commits: 6,
          insertions: 2220,
          deletions: 680,
          net: 1540,
          files: 76,
          iterations: [
            {
              hash: "ae6b792",
              time: "12:52",
              subject: "Pro app: FIX calendar range - rebuild with 2wk-back window + inspection exclude (was overwritten by a stale build)",
              insertions: 155,
              deletions: 18,
              files: 8
            },
            {
              hash: "4f91ca9",
              time: "14:11",
              subject: "LE Pro: consolidate build targets - LE Pro only + Development (paused) expander (pause Command Center/Dashboard/Beta/Sleek per Levi)",
              insertions: 127,
              deletions: 80,
              files: 5
            },
            {
              hash: "7b44b78",
              time: "14:19",
              subject: "Login landing: LE Pro is the one option; Command Center/Dashboard/Beta/Sleek moved under a collapsed Development (paused) section",
              insertions: 10,
              deletions: 4,
              files: 1
            },
            {
              hash: "f449ebd",
              time: "15:01",
              subject: "#39: biometric (WebAuthn) + password lock on LE Pro app open",
              insertions: 1006,
              deletions: 73,
              files: 24
            },
            {
              hash: "ec3012d",
              time: "15:34",
              subject: "redeploy: netlify credits restored 153441",
              insertions: 0,
              deletions: 0,
              files: 0
            },
            {
              hash: "6b367e6",
              time: "16:14",
              subject: "Pro: job-detail #54/#44/#45 + new-job/customer #49/#55/#56 + ycx7/c58e",
              insertions: 922,
              deletions: 505,
              files: 38
            }
          ]
        },
        {
          id: 6,
          date: "2026-07-07",
          title: "Deploy 2026-07-07_19:45:28",
          commits: 32,
          insertions: 7668,
          deletions: 2999,
          net: 4669,
          files: 335,
          iterations: [
            {
              hash: "70ec3cd",
              time: "13:57",
              subject: "QuickBooks customer info: billing vs service address split + QB sync fields",
              insertions: 887,
              deletions: 239,
              files: 35
            },
            {
              hash: "a9f1333",
              time: "14:00",
              subject: "Service address tied to invoice/estimate # \u2014 not copied from customer",
              insertions: 135,
              deletions: 94,
              files: 11
            },
            {
              hash: "3da437d",
              time: "14:56",
              subject: "New job: QB customer autofill + title picker for open invoices/estimates",
              insertions: 362,
              deletions: 137,
              files: 11
            },
            {
              hash: "ccc4efa",
              time: "15:27",
              subject: "QuickBooks customer info: full contact fields in customer index",
              insertions: 10,
              deletions: 0,
              files: 2
            },
            {
              hash: "70cb0fc",
              time: "15:47",
              subject: "Edit customer QB autofill, amount due display, FAB on Today+job detail, calendar tap on Today",
              insertions: 181,
              deletions: 102,
              files: 12
            },
            {
              hash: "6465990",
              time: "15:52",
              subject: "Today: Mon-Fri week calendar with swipe, tap events, add appointment",
              insertions: 366,
              deletions: 108,
              files: 11
            },
            {
              hash: "76057bd",
              time: "15:57",
              subject: "New job FAB: add lead with calendar appointment option",
              insertions: 79,
              deletions: 8,
              files: 3
            },
            {
              hash: "74fa222",
              time: "16:05",
              subject: "Today calendar: edit/delete/duplicate appointments, link to jobs",
              insertions: 398,
              deletions: 37,
              files: 8
            },
            {
              hash: "1d28e79",
              time: "16:08",
              subject: "Rebuild Pro bundle: lead option + appointment edit/link",
              insertions: 75,
              deletions: 70,
              files: 5
            },
            {
              hash: "16b471c",
              time: "16:08",
              subject: "PWA cache v3 \u2014 force refresh after Pro rebuild",
              insertions: 2,
              deletions: 2,
              files: 2
            },
            {
              hash: "829d95b",
              time: "16:25",
              subject: "Appointment link: customer picker, confirm save, unlink/relink from job",
              insertions: 418,
              deletions: 131,
              files: 12
            },
            {
              hash: "e0685b7",
              time: "16:25",
              subject: "PWA cache v4 \u2014 appointment link picker",
              insertions: 2,
              deletions: 2,
              files: 2
            },
            {
              hash: "49b5c42",
              time: "16:29",
              subject: "Dev #wtel: create appointment from job window (Calendar sheet)",
              insertions: 161,
              deletions: 89,
              files: 7
            },
            {
              hash: "8930ddb",
              time: "16:34",
              subject: "Balance due prominent: invoiced + paid sub-lines on jobs/customer views",
              insertions: 241,
              deletions: 104,
              files: 14
            },
            {
              hash: "fcdadca",
              time: "16:48",
              subject: "Calendar: pull on load/refresh/sync + optimistic appointments",
              insertions: 191,
              deletions: 98,
              files: 12
            },
            {
              hash: "4981d91",
              time: "17:01",
              subject: "Calendar cache-first load; linked job shows customer; unlink confirm Save & sync",
              insertions: 170,
              deletions: 124,
              files: 10
            },
            {
              hash: "901445d",
              time: "18:59",
              subject: "Compact mobile typography: smaller job/customer text and logos",
              insertions: 71,
              deletions: 57,
              files: 15
            },
            {
              hash: "8c30f19",
              time: "19:14",
              subject: "Fix single-job mobile row: compact customer card, fixed avatar square",
              insertions: 172,
              deletions: 131,
              files: 12
            },
            {
              hash: "c95ba6a",
              time: "19:35",
              subject: "Appointment unlink UX fix; remove redundant linked label",
              insertions: 46,
              deletions: 31,
              files: 5
            },
            {
              hash: "37ac339",
              time: "19:37",
              subject: "Deploy 2026-07-07_19:37:02",
              insertions: 565,
              deletions: 280,
              files: 16
            },
            {
              hash: "a3963fc",
              time: "19:45",
              subject: "Deploy 2026-07-07_19:45:28",
              insertions: 949,
              deletions: 82,
              files: 18
            },
            {
              hash: "977ae76",
              time: "19:52",
              subject: "Deploy 2026-07-07_19:52:24",
              insertions: 395,
              deletions: 179,
              files: 13
            },
            {
              hash: "3c1b578",
              time: "20:23",
              subject: "Deploy 2026-07-07_20:23:06",
              insertions: 8,
              deletions: 8,
              files: 5
            },
            {
              hash: "1f3754a",
              time: "20:25",
              subject: "Deploy 2026-07-07_20:25:13",
              insertions: 472,
              deletions: 147,
              files: 19
            },
            {
              hash: "e3b73b6",
              time: "21:12",
              subject: "Task #64: fix chat scroll twitch; bubble actions for dev task, job update, appointment",
              insertions: 401,
              deletions: 86,
              files: 13
            },
            {
              hash: "af92b97",
              time: "22:12",
              subject: "Fix QBO sync chip + paid invoice safeguards (pullJobs, openBalance sync)",
              insertions: 38,
              deletions: 17,
              files: 6
            },
            {
              hash: "d8b508d",
              time: "22:17",
              subject: "Fix QBO sync chip + mark-paid safeguards (reject unapplied, block -- balance)",
              insertions: 132,
              deletions: 88,
              files: 9
            },
            {
              hash: "007ef0b",
              time: "22:18",
              subject: "Remove duplicate Invoice # row from job information card",
              insertions: 4,
              deletions: 5,
              files: 5
            },
            {
              hash: "216049e",
              time: "22:21",
              subject: "Fix squished customer names in jobs list + compact expanded rows",
              insertions: 222,
              deletions: 157,
              files: 13
            },
            {
              hash: "5bb07cb",
              time: "22:36",
              subject: "Fix combine-by-customer + restore job info Invoice row layout",
              insertions: 178,
              deletions: 104,
              files: 11
            },
            {
              hash: "125d48a",
              time: "22:39",
              subject: "Mobile customer cards: name+balance on top, meta and job hint below",
              insertions: 226,
              deletions: 190,
              files: 11
            },
            {
              hash: "17c0b29",
              time: "23:27",
              subject: "Fix mobile: show all customer jobs in group (paid+siblings under Active)",
              insertions: 111,
              deletions: 92,
              files: 7
            }
          ]
        },
        {
          id: 7,
          date: "2026-07-08",
          title: "LE Pro: Sola pay links, custom amount, calendar, payment history (le-pro-v27)",
          commits: 43,
          insertions: 12749,
          deletions: 5026,
          net: 7723,
          files: 534,
          iterations: [
            {
              hash: "7af5b3f",
              time: "08:25",
              subject: "LE Pro: Sola pay links, custom amount, calendar, payment history (le-pro-v27)",
              insertions: 922,
              deletions: 182,
              files: 26
            },
            {
              hash: "aef9637",
              time: "08:39",
              subject: "LE Pro: fix doc confirm popup, invoice send + payment link (le-pro-v28)",
              insertions: 198,
              deletions: 97,
              files: 9
            },
            {
              hash: "6f06bd4",
              time: "08:41",
              subject: "LE Pro: pay link validation, email compose, le-pro-v29",
              insertions: 192,
              deletions: 87,
              files: 8
            },
            {
              hash: "89ceea3",
              time: "09:37",
              subject: "LE Pro: editable payment-link email To field + CODE auto-exec (le-pro-v30)",
              insertions: 48,
              deletions: 28,
              files: 5
            },
            {
              hash: "658389a",
              time: "13:00",
              subject: "le-pro-v31: View & Pay landing page + Sola env switching (sandbox/production)",
              insertions: 377,
              deletions: 93,
              files: 14
            },
            {
              hash: "6d799d5",
              time: "13:01",
              subject: "le-pro: auto-trigger Face ID/fingerprint on app open (no tap to unlock)",
              insertions: 59,
              deletions: 27,
              files: 5
            },
            {
              hash: "bd3b3a0",
              time: "13:23",
              subject: "le-pro-v32: BLZ pay page (PDF, fee, prefill), logo theme, amount edit on landing",
              insertions: 543,
              deletions: 153,
              files: 21
            },
            {
              hash: "d8fa923",
              time: "13:32",
              subject: "le-pro-v33: LE logo, pay page layout, zip prefill fix",
              insertions: 171,
              deletions: 100,
              files: 13
            },
            {
              hash: "2795c00",
              time: "13:37",
              subject: "reupload logo: LE No background + cache bust v2",
              insertions: 5,
              deletions: 5,
              files: 4
            },
            {
              hash: "adf7225",
              time: "13:40",
              subject: "le-pro-v34: Sleek theme, fix View invoice PDF, pay page layout",
              insertions: 200,
              deletions: 109,
              files: 11
            },
            {
              hash: "ee99e91",
              time: "13:52",
              subject: "Pay: 30d PDF cleanup, layout order, Sola payment\u2192QBO pipeline",
              insertions: 429,
              deletions: 86,
              files: 14
            },
            {
              hash: "bbe984a",
              time: "13:56",
              subject: "Paperwork: Con Ed inspection step, auto-enable, Up next in job info",
              insertions: 420,
              deletions: 146,
              files: 13
            },
            {
              hash: "538c925",
              time: "14:06",
              subject: "Pay: View invoice triggers QBO fetch + retrieving overlay",
              insertions: 383,
              deletions: 46,
              files: 9
            },
            {
              hash: "b92b7fe",
              time: "14:18",
              subject: "UI: navy theme, bigger LE logo, Payment tab, pay page layout, paid history, fee toggle",
              insertions: 436,
              deletions: 234,
              files: 23
            },
            {
              hash: "cbdfe43",
              time: "14:29",
              subject: "Customer card edit corner, job info bubbles, calendar tab colors, payment history pull",
              insertions: 319,
              deletions: 248,
              files: 15
            },
            {
              hash: "22450ef",
              time: "15:09",
              subject: "Paperwork ConEd colors, schedule appointment flow, remove record payment btn",
              insertions: 317,
              deletions: 210,
              files: 15
            },
            {
              hash: "378f510",
              time: "15:13",
              subject: "Mobile layout: customer name flow, full-width up-next pills, QBO sync card colors",
              insertions: 209,
              deletions: 153,
              files: 11
            },
            {
              hash: "b37328a",
              time: "15:18",
              subject: "Auto-link calendar appointments: orange pending, green on sync confirm",
              insertions: 288,
              deletions: 137,
              files: 12
            },
            {
              hash: "66fdf13",
              time: "15:29",
              subject: "Awareness bubbles: sell/billing/paperwork, Needs attention filter, job card gradient",
              insertions: 539,
              deletions: 143,
              files: 19
            },
            {
              hash: "0c0745b",
              time: "15:36",
              subject: "Calendar full address prefill; bottom attention gradient; bubble grid layout",
              insertions: 169,
              deletions: 109,
              files: 14
            },
            {
              hash: "fd75954",
              time: "15:52",
              subject: "Fix partial Sola payments, fetch_payments from QBO, bubble UX (revert, labels, calendar prompt), Final payment phase",
              insertions: 493,
              deletions: 120,
              files: 16
            },
            {
              hash: "29c94b2",
              time: "15:54",
              subject: "Fix calendar unlink auto-relink; address confirm suggestions; red tab when unlinked",
              insertions: 349,
              deletions: 114,
              files: 15
            },
            {
              hash: "7d07565",
              time: "16:07",
              subject: "Payment history: method labels, refresh fix, QBO void",
              insertions: 328,
              deletions: 129,
              files: 9
            },
            {
              hash: "d7f7ac6",
              time: "16:14",
              subject: "Draggable customer sync OK + calendar unlink fix",
              insertions: 383,
              deletions: 152,
              files: 14
            },
            {
              hash: "bb80ee3",
              time: "16:20",
              subject: "In-app credit card: Sola iFields + charge in LE Pro",
              insertions: 865,
              deletions: 94,
              files: 13
            },
            {
              hash: "6f7ba98",
              time: "16:30",
              subject: "UX: doc buttons, search idle, appt suggestions, payment dates, import_customer",
              insertions: 348,
              deletions: 174,
              files: 19
            },
            {
              hash: "a0eb0f2",
              time: "16:38",
              subject: "Customer card expand/collapse; compact card pay + save on file; Check/ACH fields",
              insertions: 394,
              deletions: 146,
              files: 14
            },
            {
              hash: "4bfc407",
              time: "16:47",
              subject: "Import opens customer immediately; calendar shows all appointments",
              insertions: 229,
              deletions: 124,
              files: 12
            },
            {
              hash: "6fcc8cf",
              time: "17:03",
              subject: "Job cards tap-to-open, FAB menu, payment UX, listener TLS fix",
              insertions: 528,
              deletions: 185,
              files: 16
            },
            {
              hash: "ed1ecc9",
              time: "17:19",
              subject: "Calendar linked UX, job card collapse, customer scroll anchor, sync progress",
              insertions: 324,
              deletions: 132,
              files: 14
            },
            {
              hash: "ffac43f",
              time: "17:23",
              subject: "Sync chip inline progress, shorter QBO wait, tap to skip",
              insertions: 115,
              deletions: 105,
              files: 6
            },
            {
              hash: "6b45c3f",
              time: "17:27",
              subject: "Move + and chat into bottom nav between Archive and Dev",
              insertions: 217,
              deletions: 148,
              files: 9
            },
            {
              hash: "df3b485",
              time: "17:29",
              subject: "Job detail: collapse only sections below job info card",
              insertions: 39,
              deletions: 41,
              files: 7
            },
            {
              hash: "d94ec36",
              time: "17:41",
              subject: "Fix QBO sync stability, gradient chip, job info scroll, amount bubble",
              insertions: 225,
              deletions: 179,
              files: 13
            },
            {
              hash: "49efb91",
              time: "20:22",
              subject: "Job detail collapse: sibling jobs list when Job Info collapsed",
              insertions: 132,
              deletions: 102,
              files: 7
            },
            {
              hash: "d45fc9f",
              time: "21:28",
              subject: "Customer view job expand/collapse fix + 3-version backup (le-pro-v34)",
              insertions: 209,
              deletions: 105,
              files: 11
            },
            {
              hash: "4b3bc32",
              time: "21:34",
              subject: "Job info always visible; only detail sections below collapse; customer view keeps all jobs open",
              insertions: 131,
              deletions: 173,
              files: 10
            },
            {
              hash: "bb19b01",
              time: "22:08",
              subject: "QBO import fix: Arthur re-link, per-prompt sync chip, q: customer keys (le-pro-v37)",
              insertions: 272,
              deletions: 137,
              files: 16
            },
            {
              hash: "508822c",
              time: "22:48",
              subject: "Merge prompt: side-by-side compare before combine",
              insertions: 316,
              deletions: 99,
              files: 10
            },
            {
              hash: "6024b46",
              time: "22:53",
              subject: "le-pro-v39: invoice dedupe prompt, expanded customer scan (phone/email), calendar search copy",
              insertions: 368,
              deletions: 89,
              files: 18
            },
            {
              hash: "9a6884d",
              time: "23:06",
              subject: "le-pro-v40: calendar search rolling 1-year filter (real, not copy-only)",
              insertions: 35,
              deletions: 16,
              files: 7
            },
            {
              hash: "552cdea",
              time: "23:20",
              subject: "le-pro-v41: Levi deploy-approve \u2014 skip Cursor gate, SW cache bump",
              insertions: 2,
              deletions: 2,
              files: 2
            },
            {
              hash: "f289ec3",
              time: "23:25",
              subject: "Duplicate prompts: side-by-side compare (customer contact + invoice fields), Separate customers/invoices options",
              insertions: 223,
              deletions: 67,
              files: 15
            }
          ]
        },
        {
          id: 8,
          date: "2026-07-09",
          title: "Zelle screenshot vision + payment reconciliation (le-pro-v49)",
          commits: 45,
          insertions: 11748,
          deletions: 2565,
          net: 9183,
          files: 383,
          iterations: [
            {
              hash: "0392f0a",
              time: "00:10",
              subject: "le-pro-v44: Israel chat bubble UI \u2014 auto-grow input, scroll history fix",
              insertions: 972,
              deletions: 184,
              files: 25
            },
            {
              hash: "239b3b3",
              time: "10:36",
              subject: "le-pro-v45: retry deploy \u2014 dedupeScan test jsdom fix (307 pass)",
              insertions: 3,
              deletions: 2,
              files: 3
            },
            {
              hash: "2e5873c",
              time: "11:33",
              subject: "Post-payment confirmation: centered logo/name + receipt balance now (le-pro-v46)",
              insertions: 218,
              deletions: 38,
              files: 11
            },
            {
              hash: "62fef6d",
              time: "11:39",
              subject: "LE Pro v47: cross-device chat bubble sync (stable pro-levi convo id)",
              insertions: 178,
              deletions: 44,
              files: 12
            },
            {
              hash: "124cf3a",
              time: "11:44",
              subject: "v48: automatic payment-confirmation email (Resend, test-mode-first)",
              insertions: 411,
              deletions: 3,
              files: 8
            },
            {
              hash: "54eee43",
              time: "11:51",
              subject: "Zelle screenshot vision + payment reconciliation (le-pro-v49)",
              insertions: 1239,
              deletions: 115,
              files: 17
            },
            {
              hash: "33a286f",
              time: "11:58",
              subject: "4-field customer search: business/person/phone/email live match + prefill (le-pro-v50)",
              insertions: 260,
              deletions: 48,
              files: 12
            },
            {
              hash: "5cae760",
              time: "12:01",
              subject: "Bubble-driven invoice editing: NL parse, agent draft, review gate, learning loop (le-pro-v51)",
              insertions: 767,
              deletions: 91,
              files: 19
            },
            {
              hash: "ec6ee2e",
              time: "12:07",
              subject: "Add customer flow redesign \u2014 single form, live QBO match, Save & sync actions",
              insertions: 746,
              deletions: 171,
              files: 14
            },
            {
              hash: "12b5dd7",
              time: "12:10",
              subject: "Add customer: QB button labels (Update in QB, business name already in QB)",
              insertions: 8,
              deletions: 8,
              files: 6
            },
            {
              hash: "4c33dce",
              time: "12:13",
              subject: "Chat bubble: scroll to bottom on open + stay pinned unless scrolled up (le-pro-v54)",
              insertions: 83,
              deletions: 43,
              files: 6
            },
            {
              hash: "78c0650",
              time: "12:26",
              subject: "Appointment autofill: parse calendar description for name/phone/email/billing vs service + address autocomplete",
              insertions: 780,
              deletions: 154,
              files: 17
            },
            {
              hash: "d3a6f3a",
              time: "12:29",
              subject: "Add customer QB match popup: search + new-customer on top, full details per match (le-pro-v56)",
              insertions: 188,
              deletions: 93,
              files: 10
            },
            {
              hash: "620367c",
              time: "12:46",
              subject: "Desktop scrollbar cleanup \u2014 hide decorative sliders on lg layout + credit card fields",
              insertions: 157,
              deletions: 24,
              files: 17
            },
            {
              hash: "dea6e7f",
              time: "13:28",
              subject: "Invoice edit + bi-directional estimate/invoice address sync",
              insertions: 341,
              deletions: 61,
              files: 11
            },
            {
              hash: "7a17ff9",
              time: "15:03",
              subject: "Deploy invoice edit + bi-directional address sync (le-pro-v58)",
              insertions: 134,
              deletions: 2,
              files: 3
            },
            {
              hash: "82ef622",
              time: "15:11",
              subject: "fix(pro): show red tab + toast when estimate/invoice QB sync fails",
              insertions: 107,
              deletions: 10,
              files: 4
            },
            {
              hash: "3a71079",
              time: "15:18",
              subject: "Fix card expiration field \u2014 remove input overflow clip, MM/YY auto-format",
              insertions: 110,
              deletions: 92,
              files: 10
            },
            {
              hash: "2f60144",
              time: "15:23",
              subject: "Fix new customer QuickBooks sync + invoice edit access",
              insertions: 287,
              deletions: 16,
              files: 12
            },
            {
              hash: "37f52c3",
              time: "16:27",
              subject: "Customers tab: parent/sub companies, multi-job per address",
              insertions: 889,
              deletions: 110,
              files: 18
            },
            {
              hash: "3d807b0",
              time: "16:28",
              subject: "Deploy batch: Customers tab, QB sync fixes, card expiry, failed-sync alerts (le-pro-v59)",
              insertions: 2,
              deletions: 2,
              files: 2
            },
            {
              hash: "0072e13",
              time: "16:36",
              subject: "Fix customer card green: require QuickBooks link, not just full contact info",
              insertions: 14,
              deletions: 2,
              files: 4
            },
            {
              hash: "d8eb67e",
              time: "17:01",
              subject: "Same-customer prompt: Combined vs Sub company tabs with parent/sub toggle",
              insertions: 413,
              deletions: 80,
              files: 7
            },
            {
              hash: "91a7d37",
              time: "17:07",
              subject: "Same-customer prompt: add Ask me later (snooze until next login)",
              insertions: 116,
              deletions: 1,
              files: 4
            },
            {
              hash: "7a9306a",
              time: "17:09",
              subject: "Estimate/invoice builder: Save & close, Save & sync, Save & sync & send",
              insertions: 154,
              deletions: 28,
              files: 4
            },
            {
              hash: "5a889c4",
              time: "17:10",
              subject: "Deploy batch: customer green fix, same-customer prompt, estimate/invoice save options (le-pro-v60)",
              insertions: 81,
              deletions: 81,
              files: 5
            },
            {
              hash: "995410b",
              time: "17:17",
              subject: "fix: same-customer prompt uses scrollable sheet on mobile and desktop",
              insertions: 89,
              deletions: 93,
              files: 6
            },
            {
              hash: "57e6e51",
              time: "18:21",
              subject: "Parent customer cards: tap anywhere to expand subs, 30s auto-close",
              insertions: 79,
              deletions: 17,
              files: 2
            },
            {
              hash: "01f0b2a",
              time: "18:23",
              subject: "Customer forms: Customer name first + sub-company toggle",
              insertions: 177,
              deletions: 110,
              files: 9
            },
            {
              hash: "6219f13",
              time: "18:29",
              subject: "Parent company: second tap opens rollup view; no duplicate list rows",
              insertions: 100,
              deletions: 8,
              files: 5
            },
            {
              hash: "9da1a8f",
              time: "18:43",
              subject: "Per-customer QB sync menu + invoice/estimate/payment tabs",
              insertions: 783,
              deletions: 17,
              files: 12
            },
            {
              hash: "9488f3c",
              time: "18:46",
              subject: "Fix invoice create UX: full builder opens, no collapse on customer view",
              insertions: 51,
              deletions: 49,
              files: 7
            },
            {
              hash: "4574d7c",
              time: "18:55",
              subject: "Bump SW cache le-pro-v62 for batch deploy",
              insertions: 1,
              deletions: 1,
              files: 1
            },
            {
              hash: "516be87",
              time: "18:55",
              subject: "Deploy batch: parent company UX, customer forms, QB sync tabs, invoice builder fix (le-pro-v62)",
              insertions: 82,
              deletions: 82,
              files: 6
            },
            {
              hash: "442571f",
              time: "19:13",
              subject: "QB sync menu on header chip; restore amount layout",
              insertions: 212,
              deletions: 170,
              files: 16
            },
            {
              hash: "4e739e1",
              time: "19:19",
              subject: "Customer view: hide jobs list, show invoices/estimates tabs with open+closed sections",
              insertions: 254,
              deletions: 205,
              files: 7
            },
            {
              hash: "9fed925",
              time: "20:21",
              subject: "Fix estimate sync false-success UX and auto-create QBO customer first",
              insertions: 94,
              deletions: 11,
              files: 5
            },
            {
              hash: "93e6ff7",
              time: "20:26",
              subject: "Customer invoice UX correction \u2014 rich rows, fold job detail, drop address block",
              insertions: 87,
              deletions: 106,
              files: 7
            },
            {
              hash: "1c72ff8",
              time: "21:59",
              subject: "Deploy batch: QB sync menu, honest estimate sync, customer invoice UX (le-pro-v63)",
              insertions: 83,
              deletions: 83,
              files: 6
            },
            {
              hash: "d0954d0",
              time: "22:55",
              subject: "Fix mobile sheet gap above bottom tab bar",
              insertions: 4,
              deletions: 1,
              files: 2
            },
            {
              hash: "dc20c52",
              time: "22:57",
              subject: "Shorter mobile top banner \u2014 compact logo and padding",
              insertions: 5,
              deletions: 5,
              files: 1
            },
            {
              hash: "6e556fb",
              time: "23:03",
              subject: "Fix invoice send feedback \u2014 toast when QuickBooks send succeeds or fails",
              insertions: 63,
              deletions: 0,
              files: 2
            },
            {
              hash: "70bcf79",
              time: "23:09",
              subject: "Short pay links + friendly payment emails; Sola card key diagnostics",
              insertions: 365,
              deletions: 62,
              files: 19
            },
            {
              hash: "fcab273",
              time: "23:11",
              subject: "Pay page: branded in-app card form; QB email link only at bottom",
              insertions: 167,
              deletions: 40,
              files: 6
            },
            {
              hash: "2063bed",
              time: "23:41",
              subject: "Deploy batch: mobile fixes, invoice send feedback, short pay links, branded pay page (le-pro-v64)",
              insertions: 394,
              deletions: 2,
              files: 3
            }
          ]
        },
        {
          id: 9,
          date: "2026-07-10",
          title: "Add Company and Build dashboard tabs (approved mockups)",
          commits: 37,
          insertions: 19080,
          deletions: 2954,
          net: 16126,
          files: 308,
          iterations: [
            {
              hash: "3c97261",
              time: "00:06",
              subject: "Trigger Netlify deploy: batch mobile fixes, invoice feedback, pay links, branded pay page",
              insertions: 0,
              deletions: 0,
              files: 0
            },
            {
              hash: "9cbb1ae",
              time: "00:22",
              subject: "Trigger Netlify deploy: batch v64 retry (webhook unblocked)",
              insertions: 0,
              deletions: 0,
              files: 0
            },
            {
              hash: "9eaa12c",
              time: "00:30",
              subject: "Fix deploy: remove hardcoded SOLA_X_KEY from tests (secret scan blocker)",
              insertions: 7,
              deletions: 7,
              files: 3
            },
            {
              hash: "fe5c32d",
              time: "00:49",
              subject: "UX: mobile logo banner, neater QB sync chip, delete docs, change orders, invoice sync scope",
              insertions: 443,
              deletions: 106,
              files: 15
            },
            {
              hash: "cf77f73",
              time: "00:54",
              subject: "Fix QuickBooks doc sync race when customer is not linked yet",
              insertions: 263,
              deletions: 61,
              files: 5
            },
            {
              hash: "d938375",
              time: "09:08",
              subject: "Zelle screenshot vision: grok-4.5 model fix + batch QB/sync UX",
              insertions: 23,
              deletions: 23,
              files: 5
            },
            {
              hash: "38c1391",
              time: "09:52",
              subject: "Fix desktop customer list: parent companies expand sub-companies in sidebar",
              insertions: 22,
              deletions: 4,
              files: 2
            },
            {
              hash: "ac40066",
              time: "10:01",
              subject: "Progress invoice editor \u2014 QBO-style qty \xD7 rate with % / amount toggle",
              insertions: 613,
              deletions: 105,
              files: 12
            },
            {
              hash: "e5406ad",
              time: "10:14",
              subject: "Change orders: single add button, CO numbering, connect docs, edit archive/delete",
              insertions: 628,
              deletions: 99,
              files: 13
            },
            {
              hash: "8a177d3",
              time: "10:20",
              subject: "Payment image autofill: check + Zelle, memo fields, chat bubble attach",
              insertions: 948,
              deletions: 197,
              files: 19
            },
            {
              hash: "aa6b203",
              time: "10:23",
              subject: "Unified image upload skill \u2014 Telegram + bubble buttons, invoice/address lookup",
              insertions: 492,
              deletions: 93,
              files: 11
            },
            {
              hash: "535c1fe",
              time: "10:30",
              subject: "Fix manual card charge crash after approval (refreshJobs missing from store)",
              insertions: 53,
              deletions: 14,
              files: 5
            },
            {
              hash: "6598f9f",
              time: "10:34",
              subject: "Deploy batch: card charge fix, payment autofill, change orders, progress invoices, customer sidebar (le-pro-v67)",
              insertions: 2,
              deletions: 2,
              files: 2
            },
            {
              hash: "14c8d93",
              time: "10:40",
              subject: "Add Log off \u2014 clears session lock and busts stale app cache",
              insertions: 113,
              deletions: 24,
              files: 8
            },
            {
              hash: "17801f2",
              time: "10:54",
              subject: "Payment edit: single-row actions with Delete label",
              insertions: 21,
              deletions: 14,
              files: 1
            },
            {
              hash: "63493ad",
              time: "11:04",
              subject: "Follow-up login prompts: service calls, must-today loop, inspections",
              insertions: 994,
              deletions: 103,
              files: 14
            },
            {
              hash: "dc841b7",
              time: "11:40",
              subject: "Payment receipt via QuickBooks + recurring invoice toggle",
              insertions: 355,
              deletions: 85,
              files: 12
            },
            {
              hash: "94eb6c3",
              time: "11:55",
              subject: "Chat bubble: parallel equal-size reply buttons (Levi UX)",
              insertions: 249,
              deletions: 78,
              files: 6
            },
            {
              hash: "7896921",
              time: "12:07",
              subject: "App customer index + full invoice builder + deploy batch v68",
              insertions: 629,
              deletions: 147,
              files: 18
            },
            {
              hash: "9a6cc7d",
              time: "12:07",
              subject: "Deploy v68: log off, follow-ups, payment receipt, recurring invoice, customer index, full invoice builder",
              insertions: 20,
              deletions: 20,
              files: 5
            },
            {
              hash: "0f3968f",
              time: "12:12",
              subject: "Calendar: drag-to-resize week schedule height (Levi)",
              insertions: 158,
              deletions: 27,
              files: 6
            },
            {
              hash: "95294b7",
              time: "12:23",
              subject: "Smart appointment follow-ups with mood-based customer emails",
              insertions: 577,
              deletions: 102,
              files: 11
            },
            {
              hash: "8c06279",
              time: "12:28",
              subject: "Remind-me: weekday calendar, work-hour picker, friendly nudges",
              insertions: 435,
              deletions: 139,
              files: 9
            },
            {
              hash: "fbea560",
              time: "12:32",
              subject: "Add open-in-calendar and reschedule options to reminder popups",
              insertions: 167,
              deletions: 2,
              files: 5
            },
            {
              hash: "d889454",
              time: "12:38",
              subject: "Nest sub-companies under parent from QuickBooks parentId",
              insertions: 351,
              deletions: 162,
              files: 9
            },
            {
              hash: "2075d64",
              time: "12:39",
              subject: "Remove invoice delete from customer doc list; keep in job edit only",
              insertions: 36,
              deletions: 87,
              files: 2
            },
            {
              hash: "c64f0da",
              time: "12:58",
              subject: "Active tab: sort customers by last opened (Levi)",
              insertions: 292,
              deletions: 152,
              files: 12
            },
            {
              hash: "8414662",
              time: "13:01",
              subject: "Deploy v69: calendar resize, smart follow-ups, remind-me redesign, sub-companies, invoice delete UX, recent customers",
              insertions: 2,
              deletions: 2,
              files: 2
            },
            {
              hash: "3695786",
              time: "13:08",
              subject: "Add Progress tab with momentum dashboard and progress API",
              insertions: 592,
              deletions: 26,
              files: 11
            },
            {
              hash: "0bcfa63",
              time: "13:30",
              subject: "Add customer UX, parent picker, FAB invoice/payment prefill",
              insertions: 716,
              deletions: 59,
              files: 11
            },
            {
              hash: "18a2ded",
              time: "14:26",
              subject: "Add Company and Build dashboard tabs (approved mockups)",
              insertions: 7261,
              deletions: 452,
              files: 26
            },
            {
              hash: "94d2021",
              time: "14:31",
              subject: "Chat payment from image: check/zelle hint, zoom, invoice #, deposit",
              insertions: 411,
              deletions: 50,
              files: 6
            },
            {
              hash: "ee8223c",
              time: "14:31",
              subject: "Chat payment from image: check/zelle hint, zoom, invoice #, deposit (le-pro-v71)",
              insertions: 208,
              deletions: 184,
              files: 8
            },
            {
              hash: "46b615e",
              time: "16:04",
              subject: "Chat bubble: attach any file type, not just photos",
              insertions: 307,
              deletions: 44,
              files: 6
            },
            {
              hash: "f10d81f",
              time: "16:07",
              subject: "Payment flow: full form after choosing check/Zelle/etc",
              insertions: 356,
              deletions: 222,
              files: 9
            },
            {
              hash: "cff156d",
              time: "16:13",
              subject: "Chat check deposit: auto-open on typed context, better check # read, pan/zoom fix",
              insertions: 194,
              deletions: 60,
              files: 8
            },
            {
              hash: "2bb5ecc",
              time: "17:26",
              subject: "Safe-autonomy deploy pipeline (#64): reversible deploys with auto-rollback",
              insertions: 1142,
              deletions: 2,
              files: 11
            }
          ]
        },
        {
          id: 10,
          date: "2026-07-11",
          title: "Payment form: deposit-to bank picker on check/Zelle (job + QB sync)",
          commits: 4,
          insertions: 478,
          deletions: 196,
          net: 282,
          files: 43,
          iterations: [
            {
              hash: "6d78943",
              time: "22:54",
              subject: "Calendar: duplicate full booking sheet, tab search, year+forward range",
              insertions: 189,
              deletions: 41,
              files: 10
            },
            {
              hash: "32a1d9d",
              time: "23:04",
              subject: "Allow mobile screen rotation in LE Pro",
              insertions: 2,
              deletions: 2,
              files: 2
            },
            {
              hash: "71a832e",
              time: "23:26",
              subject: "Payment form: deposit-to bank picker on check/Zelle (job + QB sync)",
              insertions: 248,
              deletions: 153,
              files: 12
            },
            {
              hash: "5c712dc",
              time: "23:55",
              subject: "Deploy Ohr Gematria Hebrew preview at /app/gematria",
              insertions: 39,
              deletions: 0,
              files: 19
            }
          ]
        },
        {
          id: 11,
          date: "2026-07-12",
          title: "Add multi-user time tracking \u2014 Time tab, clock in/out, job timers",
          commits: 10,
          insertions: 986,
          deletions: 140,
          net: 846,
          files: 83,
          iterations: [
            {
              hash: "4c97944",
              time: "00:19",
              subject: "Stage \u05D2\u05D9\u05DE\u05D8\u05E8\u05D9\u05D4 \u05D7\u05E1\u05D9\u05D3\u05D9\u05EA v0.2 preview at /app/gematria",
              insertions: 11,
              deletions: 11,
              files: 10
            },
            {
              hash: "d0a1a40",
              time: "01:29",
              subject: "Deploy LE Pro + Gematria v0.2: deposit picker, rotation, calendar duplicate/search, payment flows, chat attachments",
              insertions: 11,
              deletions: 11,
              files: 5
            },
            {
              hash: "9462f9c",
              time: "01:33",
              subject: "Fix bump-sw-cache ESM syntax; sync version stamps after deploy",
              insertions: 6,
              deletions: 6,
              files: 2
            },
            {
              hash: "394cdd5",
              time: "02:01",
              subject: "Deploy: pipeline fix + SW cache bump",
              insertions: 8,
              deletions: 8,
              files: 4
            },
            {
              hash: "d6d7ce9",
              time: "02:12",
              subject: "Deploy: Levi requested push live",
              insertions: 8,
              deletions: 8,
              files: 4
            },
            {
              hash: "bd7a7a7",
              time: "02:16",
              subject: "Deploy Ohr Gematria: tabs, files, chat, approved, history, installable app",
              insertions: 94,
              deletions: 32,
              files: 18
            },
            {
              hash: "3c4b95f",
              time: "02:24",
              subject: "Deploy Ohr \u05E9\u05D9\u05D7\u05D4: conversational mode understands context, offers solutions",
              insertions: 17,
              deletions: 17,
              files: 14
            },
            {
              hash: "bdb3cc2",
              time: "02:26",
              subject: "Sync version stamps after Ohr \u05E9\u05D9\u05D7\u05D4 deploy",
              insertions: 6,
              deletions: 6,
              files: 2
            },
            {
              hash: "0deea7e",
              time: "02:48",
              subject: "Add multi-user time tracking \u2014 Time tab, clock in/out, job timers",
              insertions: 815,
              deletions: 31,
              files: 15
            },
            {
              hash: "cdf0b19",
              time: "10:41",
              subject: "Abba app: \u05D2\u05D9\u05DE\u05D8\u05E8\u05D9\u05D4 \u05D7\u05E1\u05D9\u05D3\u05D9\u05EA rename \u2014 title, header, PWA (ohr-v3)",
              insertions: 10,
              deletions: 10,
              files: 9
            }
          ]
        },
        {
          id: 12,
          date: "2026-07-13",
          title: "Deploy: customer tappable fields, smart suggestions, reminder dismiss, calendar address picker, customer email compose",
          commits: 18,
          insertions: 5495,
          deletions: 1522,
          net: 3973,
          files: 134,
          iterations: [
            {
              hash: "8766d5c",
              time: "01:15",
              subject: "Fix calendar week tests: pin fake date so events stay visible",
              insertions: 21,
              deletions: 6,
              files: 3
            },
            {
              hash: "12f2481",
              time: "01:15",
              subject: "Deploy all apps: Time tab + Abba rename (Levi batch)",
              insertions: 8,
              deletions: 8,
              files: 4
            },
            {
              hash: "6a814ec",
              time: "09:51",
              subject: "Fix calendar duplicate not appearing in app or Google Calendar",
              insertions: 236,
              deletions: 168,
              files: 9
            },
            {
              hash: "3b7c60c",
              time: "09:54",
              subject: "Fix reminder notifications and add flexible batch snooze",
              insertions: 461,
              deletions: 26,
              files: 5
            },
            {
              hash: "7d081d1",
              time: "13:35",
              subject: "Reminder live actions, calendar back-nav, broader last-week follow-ups",
              insertions: 406,
              deletions: 35,
              files: 7
            },
            {
              hash: "ba03d11",
              time: "13:40",
              subject: "Fix customer import and QB sync pull direction",
              insertions: 467,
              deletions: 72,
              files: 14
            },
            {
              hash: "854e4da",
              time: "13:43",
              subject: "Reminder allocation: next-step + follow-up time tracking",
              insertions: 196,
              deletions: 181,
              files: 6
            },
            {
              hash: "df1dcb0",
              time: "13:55",
              subject: "LE Pro: edit/view appointment gets full create parity \u2014 reminders, guest invite, week calendar",
              insertions: 179,
              deletions: 133,
              files: 2
            },
            {
              hash: "d32f4e6",
              time: "14:13",
              subject: "Fix estimate/invoice drafts not visible after saving on job",
              insertions: 315,
              deletions: 165,
              files: 13
            },
            {
              hash: "6242b9a",
              time: "16:05",
              subject: "Time tracking Round 1 + staged LE Pro batch",
              insertions: 799,
              deletions: 203,
              files: 17
            },
            {
              hash: "efc4420",
              time: "16:08",
              subject: "Time tracking Round 1 + staged LE Pro batch",
              insertions: 8,
              deletions: 8,
              files: 4
            },
            {
              hash: "873f7c8",
              time: "16:11",
              subject: "Customer service addresses tab + job header add/change-order buttons",
              insertions: 291,
              deletions: 17,
              files: 5
            },
            {
              hash: "559555b",
              time: "16:12",
              subject: "Customer service addresses + job add/change-order header buttons",
              insertions: 143,
              deletions: 143,
              files: 7
            },
            {
              hash: "76601e7",
              time: "16:16",
              subject: "Calendar create-job: pick service address instead of linking open jobs",
              insertions: 248,
              deletions: 63,
              files: 4
            },
            {
              hash: "d3af0ef",
              time: "16:19",
              subject: "Fix reminder popups staying up after Levi picks an action",
              insertions: 172,
              deletions: 30,
              files: 3
            },
            {
              hash: "f0fb9d0",
              time: "16:23",
              subject: "Add smart suggestion badge and live UI edit mode for popups",
              insertions: 601,
              deletions: 22,
              files: 11
            },
            {
              hash: "30f2b95",
              time: "16:31",
              subject: "Customer card: tappable contact fields replace action buttons",
              insertions: 58,
              deletions: 34,
              files: 1
            },
            {
              hash: "b83706c",
              time: "16:33",
              subject: "Deploy: customer tappable fields, smart suggestions, reminder dismiss, calendar address picker, customer email compose",
              insertions: 886,
              deletions: 208,
              files: 19
            }
          ]
        }
      ]
    };
  }
});

// ../netlify/functions/progress.mjs
function json15(o) {
  return new Response(JSON.stringify(o), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
function loadSnapshot() {
  if (dev_progress_snapshot_default && typeof dev_progress_snapshot_default === "object") return dev_progress_snapshot_default;
  return {
    meta: { agent: "Israel (Grok Build)", project: "LE Pro", generated_at: (/* @__PURE__ */ new Date()).toISOString() },
    totals: { updates: 0, commits: 0, lines_written: 0, lines_implemented: 0, active_time_hms: "0:00:00", deploys: 0, money_saved_usd: 0 },
    updates: []
  };
}
async function loadProgress(store) {
  return await store.get(KEY8, { type: "json" }) || null;
}
var KEY8, DAY, progress_default;
var init_progress = __esm({
  "../netlify/functions/progress.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    init_dev_progress_snapshot();
    KEY8 = "dev-progress-v1";
    DAY = 24 * 60 * 60 * 1e3;
    __name(json15, "json");
    __name(loadSnapshot, "loadSnapshot");
    __name(loadProgress, "loadProgress");
    progress_default = /* @__PURE__ */ __name(async (req) => {
      const store = getStore2("progress");
      if (req.method === "OPTIONS") return json15({ ok: true });
      if (req.method === "POST") {
        let body = {};
        try {
          body = await req.json();
        } catch {
        }
        if (body.op === "replace" && body.data) {
          const next2 = { ...body.data, updatedAt: Date.now() };
          await store.setJSON(KEY8, next2);
          return json15(next2);
        }
        const snap = await loadProgress(store) || loadSnapshot();
        const next = { ...snap, updatedAt: Date.now() };
        await store.setJSON(KEY8, next);
        return json15(next);
      }
      let doc = await loadProgress(store);
      if (!doc) {
        doc = { ...loadSnapshot(), updatedAt: Date.now() };
        await store.setJSON(KEY8, doc);
      } else if (!doc.updatedAt || Date.now() - doc.updatedAt > DAY) {
        doc = { ...loadSnapshot(), ...doc, updatedAt: Date.now() };
        await store.setJSON(KEY8, doc);
      }
      return json15(doc);
    }, "default");
  }
});

// .netlify/functions/progress.js
var onRequest19;
var init_progress2 = __esm({
  ".netlify/functions/progress.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_progress();
    init_pagesAdapter();
    onRequest19 = toPagesFunction(progress_default);
  }
});

// ../netlify/functions/qbo-exec.mjs
function json16(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
async function getAuth(store) {
  const saved = await store.get("qbo-auth", { type: "json" }) || {};
  const refresh2 = saved.refresh_token || process.env.QBO_REFRESH_TOKEN;
  return { refresh: refresh2, access: saved.access_token, expires_at: saved.expires_at || 0 };
}
async function refresh(store, refreshToken) {
  const id = process.env.QBO_CLIENT_ID, secret = process.env.QBO_CLIENT_SECRET;
  const basic = basicAuthBase64(id, secret);
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body
  });
  if (!r.ok) throw new Error(`token refresh failed ${r.status}: ${await r.text()}`);
  const t = await r.json();
  const rec = {
    access_token: t.access_token,
    refresh_token: t.refresh_token || refreshToken,
    expires_at: Date.now() + (t.expires_in || 3600) * 1e3 - 6e4
  };
  await store.setJSON("qbo-auth", rec);
  return rec;
}
async function api(access, realm, method, path, body) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${API_BASE}/v3/company/${realm}/${path}${sep}minorversion=${MINOR}`;
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${access}`,
      Accept: "application/json",
      ...body ? { "Content-Type": "application/json" } : {}
    },
    body: body ? JSON.stringify(body) : void 0
  });
  if (!r.ok) throw new Error(`QBO ${method} ${path} -> ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}
async function findTxnId(access, realm, entity, docnum) {
  const q = encodeURIComponent(`select Id, DocNumber from ${entity} where DocNumber = '${docnum}'`);
  const res = await api(access, realm, "GET", `query?query=${q}`);
  const rows = (res.QueryResponse || {})[entity] || [];
  if (!rows.length) throw new Error(`no ${entity} with DocNumber ${docnum}`);
  return rows[0].Id;
}
async function sendTxn(access, realm, kind, docnum, email) {
  const entity = kind === "send_invoice" ? "Invoice" : "Estimate";
  const path = kind === "send_invoice" ? "invoice" : "estimate";
  const id = await findTxnId(access, realm, entity, docnum);
  await api(access, realm, "POST", `${path}/${id}/send?sendTo=${encodeURIComponent(email)}`);
  return `SENT ${path} ${docnum} to ${email}`;
}
var API_BASE, TOKEN_URL, MINOR, CMD_KEY, qbo_exec_default;
var init_qbo_exec = __esm({
  "../netlify/functions/qbo-exec.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    init_base64();
    API_BASE = "https://quickbooks.api.intuit.com";
    TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
    MINOR = "70";
    CMD_KEY = "commands-v1";
    __name(json16, "json");
    __name(getAuth, "getAuth");
    __name(refresh, "refresh");
    __name(api, "api");
    __name(findTxnId, "findTxnId");
    __name(sendTxn, "sendTxn");
    qbo_exec_default = /* @__PURE__ */ __name(async (req) => {
      let b = {};
      try {
        b = await req.json();
      } catch (e) {
      }
      const need = process.env.QBO_EXEC_TOKEN;
      if (!need) return json16({ ok: false, dormant: true, reason: "QBO_EXEC_TOKEN not set \u2014 executor dormant" }, 200);
      if (b.token !== need) return json16({ ok: false, error: "unauthorized" }, 401);
      if (!process.env.QBO_CLIENT_ID || !process.env.QBO_REALM_ID) {
        return json16({ ok: false, dormant: true, reason: "QBO env vars incomplete" }, 200);
      }
      const auth = getStore2("qbo-auth-store");
      const cmds = getStore2("commands");
      const realm = process.env.QBO_REALM_ID;
      let a = await getAuth(auth);
      if (!a.access || Date.now() >= a.expires_at) {
        if (!a.refresh) return json16({ ok: false, error: "no refresh token" }, 200);
        a = await refresh(auth, a.refresh);
      }
      const doc = await cmds.get(CMD_KEY, { type: "json", consistency: "strong" }) || { commands: [] };
      let done = 0, failed = 0;
      for (const c of doc.commands) {
        if (c.status !== "queued") continue;
        if (c.type !== "send_invoice" && c.type !== "send_estimate") continue;
        const pl = c.payload || {};
        const email = pl.email, docnum = pl.invoiceNo || pl.estimateNo;
        c.attempts = (c.attempts || 0) + 1;
        c.status = "working";
        c.updatedAt = Date.now();
        (c.audit = c.audit || []).push({ ts: Date.now(), status: "working", note: "cloud exec picked up" });
        try {
          if (!email || !docnum) throw new Error("missing email or doc number");
          const detail = await sendTxn(a.access, realm, c.type, docnum, email);
          c.status = "done";
          c.result = detail;
          c.updatedAt = Date.now();
          c.audit.push({ ts: Date.now(), status: "done", note: "cloud exec sent" });
          done++;
        } catch (e) {
          const msg = String(e.message || e).slice(0, 250);
          if (c.attempts >= (c.maxAttempts || 3)) {
            c.status = "failed";
            c.error = msg;
            c.escalatedAt = Date.now();
            c.audit.push({ ts: Date.now(), status: "failed", note: msg });
            failed++;
          } else {
            c.status = "queued";
            c.error = msg;
            c.audit.push({ ts: Date.now(), status: "queued", note: "cloud exec retry: " + msg });
          }
        }
      }
      doc.ts = Date.now();
      await cmds.setJSON(CMD_KEY, doc);
      return json16({ ok: true, processed: { done, failed } });
    }, "default");
  }
});

// .netlify/functions/qbo-exec.js
var onRequest20;
var init_qbo_exec2 = __esm({
  ".netlify/functions/qbo-exec.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_qbo_exec();
    init_pagesAdapter();
    onRequest20 = toPagesFunction(qbo_exec_default);
  }
});

// ../netlify/functions/sas-inbound.mjs
function json17(o, status) {
  return new Response(JSON.stringify(o), { status: status || 200, headers: {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-le-key"
  } });
}
var KEY9, SECRET, sas_inbound_default;
var init_sas_inbound = __esm({
  "../netlify/functions/sas-inbound.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    KEY9 = "calls-v1";
    SECRET = "le-sas-7391";
    __name(json17, "json");
    sas_inbound_default = /* @__PURE__ */ __name(async (req) => {
      const store = getStore2("calls");
      const doc = await store.get(KEY9, { type: "json", consistency: "strong" }) || { calls: [], ts: 0 };
      if (req.method === "OPTIONS") return json17({ ok: true });
      if (req.method === "POST") {
        const url = new URL(req.url);
        if ((req.headers.get("x-le-key") || url.searchParams.get("k")) !== SECRET) return json17({ ok: false }, 401);
        let b = {};
        const ct = req.headers.get("content-type") || "";
        try {
          b = ct.includes("json") ? await req.json() : Object.fromEntries((await req.formData()).entries());
        } catch (e) {
        }
        doc.calls.unshift({ id: "call" + Date.now() + Math.random().toString(36).slice(2, 5), receivedAt: (/* @__PURE__ */ new Date()).toISOString(), data: b });
        doc.calls = doc.calls.slice(0, 500);
        doc.ts = Date.now();
        await store.setJSON(KEY9, doc);
        return json17({ ok: true });
      }
      return json17(doc);
    }, "default");
  }
});

// .netlify/functions/sas-inbound.js
var onRequest21;
var init_sas_inbound2 = __esm({
  ".netlify/functions/sas-inbound.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_sas_inbound();
    init_pagesAdapter();
    onRequest21 = toPagesFunction(sas_inbound_default);
  }
});

// ../netlify/functions/lib/le-invoice-suite/email-template.js
var require_email_template = __commonJS({
  "../netlify/functions/lib/le-invoice-suite/email-template.js"(exports, module) {
    "use strict";
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    var T = {
      font: "ArialMT,Arial,Helvetica,sans-serif",
      text: "#393a3d",
      // primary text
      muted: "#6b6c72",
      // secondary gray
      green: "#066a34",
      // company name
      bannerBg: "#cde1d6",
      // pale green banner
      sectionBg: "#f4f5f8",
      // bill-to gray band
      rule: "dotted 1px #babec5",
      buttonBg: "#393a3d",
      // "View invoice" button
      payButtonBg: "#066a34",
      // "View and Pay" button (your green)
      width: 768
    };
    var esc2 = /* @__PURE__ */ __name((s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"), "esc");
    var nl2br = /* @__PURE__ */ __name((s) => esc2(s).replace(/\r?\n/g, "<br>"), "nl2br");
    var money2 = /* @__PURE__ */ __name((n) => "$" + Number(n).toLocaleString(
      "en-US",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    ), "money");
    function buildPayLink2(o, cfg = {}) {
      const base = cfg.base || "https://secure.cardknox.com/blzelectric";
      const redirect = cfg.redirectUrl || "https://leelectrical.us/.netlify/functions/sola-payment";
      const q = new URLSearchParams({
        xAmount: String(o.amount),
        xinvoice: String(o.invoiceNumber),
        xRedirectURL: redirect,
        xPostURL: redirect,
        xCustom01: String(o.amount),
        xBillLastName: o.customerName || "",
        xEmail: o.customerEmail || ""
      });
      return `${base}?${q.toString()}`;
    }
    __name(buildPayLink2, "buildPayLink");
    function buildEmailHTML2(d) {
      const docType = (d.docType || "INVOICE").toUpperCase();
      const subtotal = d.subtotal != null ? d.subtotal : d.lines.reduce((s, l) => s + Number(l.amount), 0);
      const tax = d.tax || 0;
      const total = d.total != null ? d.total : subtotal + tax;
      const balanceDue = d.balanceDue != null ? d.balanceDue : d.amountDue;
      const logoSrc = d.logoSrc || "cid:companylogo";
      const btnCell = /* @__PURE__ */ __name((label, href, bg) => `
      <td style="border-radius:4px;background-color:${bg};text-align:center;">
        <a href="${esc2(href)}" style="display:inline-block;font-weight:bold;color:#ffffff;
           text-decoration:none;padding:10px 40px;font-size:16px;white-space:nowrap;">${esc2(label)}</a>
      </td>`, "btnCell");
      const isEstimate = docType === "ESTIMATE";
      const btnRow = /* @__PURE__ */ __name(() => {
        const cells = [];
        const viewLabel = d.viewLabel || (isEstimate ? "View estimate" : "View invoice");
        if (d.viewLink) cells.push(btnCell(viewLabel, d.viewLink, T.buttonBg));
        if (d.payLink) cells.push(btnCell(d.payLabel || "View and Pay", d.payLink, T.payButtonBg));
        if (!cells.length) return "";
        return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin:auto;">
      <tr>${cells.join('<td style="width:16px;font-size:0;">&nbsp;</td>')}</tr>
    </table>`;
      }, "btnRow");
      const customFieldRows = (d.customFields || []).filter((c) => c && c.value).map((c) => `
      <tr>
        <td style="font-size:18px;font-weight:bold;vertical-align:top;padding:10px 5px 0 5px;width:250px;">${esc2(c.label)}</td>
        <td style="font-size:18px;padding:10px 5px 0 5px;word-break:break-word;">${esc2(c.value)}</td>
      </tr>`).join("");
      const lineItems = d.lines.map((l) => `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="font-family:${T.font};color:${T.text};padding-top:20px;">
      <tr><td style="font-size:16px;padding:10px 0 0 0;line-height:1.35;color:${T.muted};width:75%;">${nl2br(l.description)}</td></tr>
      <tr><td style="font-size:16px;padding:10px 0 0 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${T.font};color:${T.text};">
          <tr>
            <td style="padding:0 20px 0 0;">${esc2(l.qty)} X ${money2(l.rate)}</td>
            <td align="right" style="text-align:right;color:${T.text};font-size:16px;">${money2(l.amount)}</td>
          </tr>
        </table>
      </td></tr>
    </table>`).join("");
      const totalsRow = /* @__PURE__ */ __name((label, value) => `
    <tr>
      <td style="padding:0 40px 20px 0;color:${T.text};">${esc2(label)}</td>
      <td style="text-align:right;padding:0 0 20px 0;">${esc2(value)}</td>
    </tr>`, "totalsRow");
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc2(d.company.name)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="font-family:${T.font};color:${T.text};padding-top:0.5in;padding-bottom:0.25in;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${T.font};color:${T.text};">
<tr><td></td><td width="${T.width}" align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${T.font};color:${T.text};width:100%;">

<!-- title -->
<tr><td>
  <div style="font-size:13px;text-align:center;color:${T.muted};margin-bottom:10px;">
    ${docType}&nbsp;&nbsp; ${esc2(d.docNumber)} DETAILS</div>

  <!-- logo + company name -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${T.font};">
    <tr><td style="text-align:center;padding:0;">
      <img alt="${esc2(d.company.name)}" src="${esc2(logoSrc)}" height="160" style="height:160px;"></td></tr>
    <tr><td style="font-size:20px;text-align:center;padding:14px 0 0 0;color:${T.green};">
      ${esc2(d.company.name)}</td></tr>
  </table>
  <br><br>

  <!-- banner -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="font-family:${T.font};width:100%;background-color:${T.bannerBg};text-align:center;">
    <tr><td style="padding:31px 0 20px 0;">
      <div style="font-size:16px;font-weight:bold;color:${T.text};">${isEstimate ? "TOTAL" : "DUE " + esc2(d.dueDate)}</div>
      <div style="font-size:48px;font-weight:bold;color:${T.text};padding:9px 0 12px 0;">${money2(d.amountDue)}</div>
      <div style="padding:0 0 10px 0;">${btnRow()}</div>
    </td></tr>
  </table>

  ${d.topMessage ? `
  <div style="font-size:18px;line-height:1.5;text-align:left;padding:20px 20px 0 40px;">
    <p style="margin:16px 0;">${nl2br(d.topMessage)}</p>
  </div>` : ""}
</td></tr>

<!-- bill to / custom fields on gray -->
<tr><td style="background-color:${T.sectionBg};padding:20px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${T.font};color:${T.text};">
    <tr>
      <td style="padding:10px 20px 10px 40px;">
        <table width="100%" style="font-family:${T.font};color:${T.text};">
          <tr>
            <td style="vertical-align:top;font-weight:bold;font-size:18px;padding:10px 5px;width:250px;">Bill to</td>
            <td style="font-size:18px;padding:10px 5px;word-break:break-word;">
              ${esc2(d.billTo.name)}<br>${(d.billTo.addressLines || []).map(esc2).join("<br>")}</td>
          </tr>
        </table>
      </td>
    </tr>
    ${customFieldRows ? `<tr><td style="padding:10px 20px 10px 40px;">
      <table width="100%" style="font-family:${T.font};color:${T.text};border-top:${T.rule};">${customFieldRows}</table>
    </td></tr>` : ""}
  </table>
</td></tr>

<!-- line items -->
<tr><td style="border-bottom:${T.rule};padding:40px 40px;">
  ${d.serviceDate ? `<div style="font-size:16px;color:${T.muted};padding:10px 0 0 0;">${esc2(d.serviceDate)}</div>` : ""}
  ${lineItems}
</td></tr>

<!-- totals -->
<tr><td align="right" style="padding:40px 40px 20px 0;">
  <table cellpadding="0" cellspacing="0" border="0" style="font-family:${T.font};color:${T.text};font-size:18px;">
    ${totalsRow("Subtotal", money2(subtotal))}
    ${totalsRow("Tax", money2(tax))}
    ${totalsRow("Total", money2(total))}
    ${isEstimate ? "" : totalsRow("Balance due", money2(balanceDue))}
  </table>
</td></tr>

<!-- payment message -->
${d.paymentMessage ? `
<tr><td style="font-size:18px;padding:20px 40px;text-align:left;border-bottom:${T.rule};color:${T.muted};line-height:1.5;">
  ${nl2br(d.paymentMessage)}</td></tr>` : ""}

<!-- footer note -->
<tr><td style="font-size:18px;padding:20px 40px;color:${T.muted};text-align:left;line-height:1.5;">
  Thank you for your business!<br><br>
  If you have any questions concerning this ${docType.toLowerCase()} please contact us.<br>
  Phone: ${esc2(d.company.phone)} Email: ${esc2(d.company.email)}</td></tr>

<!-- second button row -->
<tr><td align="center" style="padding:20px 0;">${btnRow()}</td></tr>

<!-- company address -->
<tr><td style="border-top:${T.rule};padding:10px 40px 25px 40px;">
  <div style="font-size:15px;text-align:center;color:${T.muted};margin-top:15px;">${esc2(d.company.name)}</div>
  <div style="font-size:15px;text-align:center;color:${T.muted};margin-top:15px;">
    ${(d.company.addressLines || []).map(esc2).join("<br>")}</div>
  <div style="text-align:center;">
    <div style="font-size:15px;color:${T.muted};margin-top:15px;display:inline-block;margin:15px 10px 0 10px;">${esc2(d.company.phone)}</div>
    <div style="font-size:15px;color:${T.muted};margin-top:15px;display:inline-block;margin:15px 10px 0 10px;">${esc2(d.company.email)}</div>
  </div>
  ${d.company.license ? `<div style="font-size:15px;text-align:center;color:${T.muted};margin-top:15px;">${esc2(d.company.license)}</div>` : ""}
</td></tr>

<!-- anti-fraud note -->
<tr><td style="border-top:${T.rule};text-align:center;padding:27px 0 25px 0;font-size:15px;color:${T.muted};">
  If you receive an email that seems fraudulent, please check with the business owner before paying.
</td></tr>

</table>
</td><td></td></tr>
</table>
</div>
</body>
</html>`;
    }
    __name(buildEmailHTML2, "buildEmailHTML");
    module.exports = { buildEmailHTML: buildEmailHTML2, buildPayLink: buildPayLink2 };
  }
});

// ../netlify/functions/lib/le-invoice-suite/logoBase64.mjs
var LOGO_PNG_BASE64;
var init_logoBase64 = __esm({
  "../netlify/functions/lib/le-invoice-suite/logoBase64.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    LOGO_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAoAAAAH0CAYAAACtlpxpAAEAAElEQVR42uz9ebRmyXUXiP5+cc733Zs3MyuzVKoqTZYtJCO5JCTLyJYty76ppm2994DHM3YWYIGH9Qz4WSxksB/LLMBZ2YyrbQT9moeNMTTduF8vV9o0hjaD3eBMyZIn4QGpNJakGqRSzUNm5XDv/U7s98c5EbF3RJzvfjln3jxR61bee06c2BGxI87ZsYffJqYylalMBcCxY8fc8ePH/b1/5y9+7Wtf8doDf/WP/8WPPvnk4+6uu/b7aXamMpWpTOXaFzl9Wr7vw3/p+RP3nuiudNvtNL1TmcpUAOA4jgMA7n/gV7pXPvvxf/3zn/rlRSdCTlMzlalMZSrXuBAineyfHWi+5s57/m8APnz06NHmxIkrJwhOAuBUpjKVonzxzFO3QQBE8U/iS+kizq5ZfTEvt0tr42Lo8CLavBQ6uz0nlzlfFzPei6WDS+AnrhMfVhmvXEF+h3u7PXel+HC1x7Ybv1fl227jvdL8vpJ8kCuw1i+W3xc7P7qqoAHQYYHXvuS1p3/k3X/q0/8Cx3n//fd7XsEj+SQATmVPFhEhcN9VU16Rx/euWXQGzNxMGqEIbi4FIONrdvnLmZXPokzb5jryayo38/ys2s9p3636fQFEum6+70D7so3bf/yr3vCGp//gn/tzs/vuu687duwY77vvPiF52VM3CYCXUI7JMXcf4C7uqZM35VhPAjiJU/7m20D007vlUsscnqQTQCA3lQAoS/5adkeupKJgKpfIr6ncrPMjl1hv4v+4qLzjpL0D6+e/+W1f85Mfwv+M//JTP7XzX4a7x48fvyJUJgHwEspxHvfHAX8rLcab7TX2hRf+1R0Hb3viJY++8GnZ3u6yAWwN/67VH14DgNN9va2t/u/hkfl8Q9YObaHFk194DU9dmDg+DXwqU5nKVK7oa4jSOeeaO/cd/nRz/2cP/4k/8Sdud85J0zTSf4fmO//8n//zh3GZStRJALyIckzgjhP+M+f/n6/bWD/4x1/c2hbCjX8yPODRATiHDufRKw0vUnEID49nBgnEwTvABdHTwYqhTtMN9z08FvDOyqtuRHz1Wfcav29t5u54N8AGftUP5KBGoYfgAuq+HFL58ooZjIhAeH54QmoUar+T4uR5/LPfd3rb37UzPytcAxnaF6oxZMYISrwkkP7+vOvvzfp/trzv1jBrXjx7x7sB/JLI0Ya88tFZ17dsA7IOigBuWBAiV1SMZ+SqgCDkhtEF3FpGKaLfDyJXnw+h/RuL3zfKB58QkWuyAgOta8WHm2tHXZveBj++MT54+IYd0X7iqbf81pnTn+6StXcxm82a17zmNf89gB/Z3NxsTp06tZgEwGtQ7gPkOBqcw6P/v4PY+dpmrXfUlKrdKCykDgJgNtTZTQyqL0cPoAPhKhu25uzaX/dBGoSAIwKU7KoEuYAdfB4Sr3Jkm0j2uxvqSYXickdk23aYNyrBbPcPzbZ/HluLBdCQ0Y1NstFRkDvmctiUUaLunTFSy+3CbS/c2fXmDZ/rr92zB79k8yiapbm4sq9HMRxehae7Hxkm8e8S+SDXhg8SvTPlhuHDjSKM6n0m14jWtdp3clPtO7kO/C7fsR2J/ecbHHpBsOV3+rcxicVi0W5sbOwcOXLkf/zH//gf48iRI/7UqVOX3I9JAFyxHDt2zJHH/WfO/79ftzX7ja/+4tYzO72WSkkUpJJzlMBD1wswkpjN4X/2+xpOA/lpARBhFKhkFe1b+ITTJVlHdVVMH6TQy6S+L4alJ6i774Z6zAY0aM6MmlJ22WRSfDCoRWVJJGxwarrQ3xNA6MA5AQg9CFZmzmeTrO4HZSApw9wThHTzedtcePHAw/cf/LsP/bk/9+zsz//5/wObm5sOAC7nJHajigegA7X2j8MnU67/a1muCp1JM3Vj8OEaCsBTuWX4fcOXoHAQ4CVnGsy7BosGoBAkF/P5vDl48OAvHj169EtHjx5tjh8/flnWp0kAXLEcOXLSHT8OvyUPv32t2ZldWMw60jXkiPrMKLtECYJilGAcWQPj12gtmFx+qqr/Yf/k0kE4JRQ6JaQq4oOAZAWpcE8qA6qF+Ev1dF7rlmmOdjQ0ispe6hVWXjFRSUkjDUYRVXW/rycQEdmHOQ4eOPSLx8EFfmoPv/iD7E5vwkDiB/NS0DuWXQNWQ2G5GrRXRXKQa0D7aoxxt3GtWvdKzsWNyu9rTfta0rlU2rsbbfbG/FxHPgjD17UPu5svgEPnGkB5LC0WCx44cAB33333PyPpNzc3L1t+mwTAlQXAu6Q3q57ZJDqlkgrCA42mLiym9O5UYhPHBbMxYUjGql7TM+CI6YBLznBc1uZuGsGrOyquQtv2310Qwcmf9W/+M+/5vh/bOAD6BT0bcm1t7Yl/9I/+0Y+L7KGzLC+z7uVcu5j+XE3avIp0eI3GeKV4y1uA39ea9vWksyrtm6GPe4APwcbmHXD7+QaHzzt0FEAcerdNaW677bZnv+d7vudD73//+3ny5MnucjEBJwFw5ffBCS8i7vfOf8s7LmAbAJ2xo1b8pQy/Q1xE9nepIJOl67CqULuRNEcSNIpy5TQQK9O9CH6ugsVp+EfQiTtztsHJ//iFdz/5yAvvnq8T4gV0xEtf+tLfc879eNd1eWjOVKYylalMZSorlVkneMlph6Zz2G49Wg8IpFtfX2/379//E29+85uf29zcbEletsuRm6Z7FeHimAMhHz/9na/l7PxXbm1DyGgbHTki5wIHrd8UlwgicnmCy6UKUFdEUGYIWuFyOryc49alz8vqw9QGaELEYzYTfOkh4vGHmo6NXywWFxaLne4CgMX+/fv/v13X4dixYzfxnjrW/zOfgWywp7SZU5nKVKZywxYGPQPWLzS4/WyLrolR+uK9b9q2vfDyl7/8nwDAyZMnrwjyxCQArlQ+ThFQZme/bqPdmYvnJWh4dsupwIuVea7s8rsMmiI10Umq9ZbTudIux7KrOFkKOUFQV75uIkDXgAA+/4kFds65xjnfCth6+LW2bfjqV7/6w0MDe0D7N+sdJydMvKlMZSpTuerFSTABE7edbTHfcSClv07xTdPwpS996W/9rb/1t74IoLkSWUAmAXDlckJISIfFn+iBXy5f0t9NWLmZlC+rCo8XK2TKRQid+rpchCRd+lBkgroAYAc0Hbyf4TO/6wD2oIAU50lyfX3f5//G3/gbnwbA48f3QIq47SkqbypTmcpUrl0ReALrOw53n276iIHhJew7j9lshjvvvPMnh+CPK3Y0nwTA3djSY6D4j8k/OuB5/qsv+O0gsF8yo6+GsLSakHm5vbr8Zy7meV7i/PAy56IovoGbezz7VINHPkXMZh4iHQTON42TQ4cO/YZzbufo0aN7Yz/NJwFwKlOZylSumZwxGFwOnic2Lrj4gSPpRaQ5cODAM+95z3t+EQCvlPl3EgBXKscIAP7cb79hNtv+su0dAZ3UXfdW+GpeTc1eMmdePBFeQn95mcInL2mMy++VjJHLFly9CGauxZc+5/H84w5tSwgcvF9wfX2dd95556+KCO655569YzTlJAJOZSpTmcq1et0SgtvPtGh9g+BlJiJ+fX1d1tfX//nb3va2FzY3N6+Y+XcSAFcqJ3u0uOaJd643nRBuNPJGCx8ykjrr4jV7FyFQVRqXSxa1ViNfCmRXV3BYqvnjlZ7RNKYGLT73ALGz5cCGgEBINgBefN3rXvfvgqy4d06kkwPgVKYylalci+IdMFu0OHyW8JQIXtt1XbNv3z6+9a1v/XkAuOuuu67oB3YSAHcpJ3BKAKCTM0cWAdnPYP1xVBjjFRGLZJm0taKwIys1fynCEnkpT130yHcROi9xcCvUEgCN87iw1eHTv9eibSV0QEhi//79n/qBH/iBRwBgT/j/IaQ9njSAU5nKVKZyTQ7cENx+usXadoPORQuvJ4kDBw78zg//8A//DgB34sSVzTs/CYDLmCLCe4nus2f+9t2e8i3nFhcgYEM9bUPUQQw+UCnJVhGJLuoze9FaGV6RKhcvhF0Z4YGXNQ1ceXC7BSY3M4dnnmjx2Oc82nlwzvV+Npth3759H1osFrwSqOw3StnpxdvpBTCVqUxlKldN6Bv+JTDviDtPA60nnPSIE13XyYEDB/jyl7/8n5PcvhoQY5MAuLTc6wBgq/34W9bnsuE78SRYy4TBgJoxSEaXZ46U7Kdu3t1dzrpYQYy79mw3IYzXxXTIKzD2ERAaAWaOeOhTxIvPAk3b9qgwnbBtW7zqVa/6zyTlSqvmr2vZvoyTwVSmMpWpTGVl4atzxMb5BgcuOCwcIINDIJ1rm6Z59k1vetPPAeB9993XXa0+TKVanuwDQNzz3zznjkB6z8yLTSB+JSQDEVFaN64io13GmeTSe3354MG8BE3n1dQ4CgTEg78n8B17SBhAnHMNyce+/uu//pcB4MSJE3sn+8f8egnyU5nKVKZy6xRPQeuJO860WNtp+2hg8RDx3axt5aUvfekvfe/3fu/jR48edVcy+GMSAFcqpzwALPz5b9oBCLQMOX8vX7DgLk/on+Eqr4zAc+lP75Ld4xKFRcl7d91BEIfUfhC4hjh7do6HPgHMmhkgHkB/ELj77ruf+/Zv//ZzGEvgfDOXKQp4KlOZylSuovA3mH93iMNnHTwBJwKiwWLh3YEDB/jGN77xZwHw6NGjV6UPkwA4LpyQhP/U03/rlZ1sv/XCYgck3JX7zsuKwuCVE9TC9UsHaqmboy9VWRTa4VXl46XOVS/rzVrBFx8VPPmIoF3rd62Ix3w+h/f+J7a3t7m5udnsrdW/gymd8VSmMpWpXL3ivIMDcPBsg40LDkKB9AATXdu2juRv/9AP/dD/AQD33ntvd1X6MLFhrBxpAGCx8XvvOryvO7hYoAOvgtFVcmHw8gSc5e1dLB0ZE45vUJ5R9XtIrMNLGaMH0AHi0FDw8MeBcy/M4doFBA4i4pqm2d63b9+pPef/d5WOJFOZylSmMhX1laEHvMPdz7vehDS8dL33Mp/Pcfjw4f+J5OJqKhgmAXC0DPAvOP9NAi9Es8JHnoVwVBfQ1BOXGYWbPz/WnsjyPq0EYp23gxT9LLptubgxXHlxJZnPVwPnlqyd4GO5QCdr+OxHfZ+aBw0A70lyPp9/8Sd+4ic+Aewx/z8AM8wATkAwU5nKVKZytQ7Y4gQHLhAHzrcYokv7965Is7GxsfPud7/73wPAkSNHrtr3pZ1YMS6g3y/3N4tz/+QdW9IR7CgDg5Z/GYMQGNzCpCJwSSa0aAGkNA2TSrCk0nNJkOGDaVbTkkIw0spBkZL+2LPk0OcIcaOlz4CL2AdvxLq9r1xGY+i8Gr9uqgoqHW/sJilLL6RlU2h54SoibS4E9tXFO7TtAi882+LRT2xjNgfEEyS8c4779+//dQD+6NGjzZXGZroBJEA4Zj6oLNdwdAUY5lj0ASSsMwz1JP0u0vPKLPdlOEnZMopthn4M/pp922otVOppWmYMIwcDc1/seEL/V6IzQlvT0PUMnXw/jMxF4oO+Fne3paPeKYYOV5iLETq635EPGb/DfsxB8007S9aaIILkFq/Ly+FDlZ7U+bBs/en5yemEDhd9pKVZPdsOj+/Kh7E9UvBhaHo3PsjIXBX8DikHyn1X5XdofBUNSP55XHHf1bysavzabd/Zuul7uPT9B5g9kK8rAnAEDp+ZY7YgfCNwAniRbjabNQcPHvyF7/zO7/zs0aNHm+PHj1+178ukAayU++VoQ0L+wLlf/erG7dxzbtsLQBdwoKOOqbZ28y8gV5l2ZtonG/zRL1DdLEeEmGVaMV211JjZsbCiqaOiPfwIlZAaNImyRCtX639FADOSGLCaQZKoWb97QG6W2r2l75v+q9m0Do993uOZx1s0s/6ts1h0mM/nvPPOOz9AUp588sk9Zy3tcQD9kJ8o/ESdL4JpneEaAVDAWA/2OQoQ0ltS4r/xHnOTvYJAYnYtPo9UX11jjU5ctomW6f8I7SQDV2jHsVs6LMZUuVaZu3jNCeAy2mYux+YCig963AK6Ch2qOcjHiVX5bedB97Hgg1P3ONJujd/I+F2srcpaC3PusJQPtTVgeSPl/NC6layy1iJMGEf4jTF+i51f5HOOcg0gmwuuvu/q+6zOh5LfzPisFBY1OmpsBQ/y9Vdb/9m4ma8DZHMJOxe1+bH8lvIaJI6lzgcxgZq1fcehja4RzBYOd55p+vuDHkW852w2k7vvvvtnRARXK/hjEgCXlKMD/MsWHvraA+vewbMjHUEH/YbrtWgOZP8Tj1ZGmtBvEKem3GXC3rK/3fDqG34XoA50zEGYc+Z583foZ3HqLZ+r/+S0neqTZEsr74Mel6VDNqoOi2fLvjkzNn3ftsNh7lwvDLImeIcv1tDGoGFoMMeDvwdsn23gmv7I6ZxrROTMV3zFV/zC1VbPXzcF4A7UiThojkvwo5DuULLTgiigpPCOjBHfkj8v5nwiF0On4stQXssOULpN2f3axdLJz1qCkfGImPmJ8ytaS18BnBqeLefcF8pCCdYHyfggFT6IzywFl8YHZtd0evLaIW+UD1jOB1lhrUGhDIiyxIT6foy3qF3z5TGxtgYyPkg2xpzf5X6ojHvk2u58GN93qPURF8+HnN+Q5fvOX9S+Q8nvwsVqZF2Iv7h9h/H30tL3QMYHyeZC80Fiwoh+Vg6ddThwvv/cuF7Z4Um6AwcOfO7HfuzH/i1w9YI/JgFwSbkPpwZmnn/zAovBLj9ovMQB4iA+CSEi4X5FeBKCSIIFRWvOXPzRdVI7zgpM4boEIaUmNA59i+04S09yTVztOU1P96vSZ6lo2PQYJQiINM/0O0fPaTbHSL+L0I4pnwf9bBxHoJXoydAnVuYs8gYExcFRcGFH8NkHOrgm+hJ6kty3b99n/tJf+kuPA+Dx48f3nKvcDnYGLWg/J2HNUmj5KxwOt5bn1GtC1YtrRT+reBjpZDTyfgR+kq5SD+W1Yk0O11mhw0o9cekwt6yPYDmWot/DtaLvGOrBtFfrO+kqbWbXAh+KMSLei+0J1L5MNC+aD7XxY8mzWMIH5HzI+qjbRD5vqPY5jqvGh5zf+VzCrdDHkg+RdoUPFA4KwHwvqffzKB9Q8iG3zIzuOxZ9XMZvXNS+Q9me+RaO0OGK+wmV9QhU6rnl+w7jY6Sw+p2qP4vy+RE+EIR3vZtSIw63n276b1L4JHuR2XyGgwcP/gvnnD969OhVR5eYfADLEw7vA7sfkPsPfPHcT3/b+W4HpHPJuYzInGusj54QuYNK8reTKP3HFzFz8y0rmsScJqHN0doMG02YyOBalC+GqLFY1xHJ2hajCQrji+ZeY3kooWGKU6GhkTnxiPbTE2v6FRgfDHO6jy/KCi3JnMzE+j5SOcGE0y4HYb+ZezzzRIMvfpaYzeNcS9u2OHDgwIdIYnNzszl16tRiL24Don8pCyr+mTV3gZEkMsmdhpX7NJd282AoNevB1ET1/EWmP+SS+7RuE7u6/178JBd/UGVhZs1jYsyTQca9LuzUs1KnwoeVPSYyPtTmaFlfuRofZHjvGFfi/IWz8uLZfZ5259fIvWXuyqwT1b+N7hVW1v+Y2w7rvK3165L33eC/V+67cdRb2W2euct6viTGXDy/7R7g8mcLPmCcDwRaD/hGsHHB4fCZxvgzevFufb6+9Za3vOVnRAT33HPPVVcuTBrArNyPex0Jeebsr2zuX9962fai68TMk1L6Zg6xBf9ZW9E6VZwolfFuWTik8q6Tok95tK9IzWwhhRkjD1wZU7GnujJm4EIt8KW2MxKwOVU7q0DP5AKujMw/ls5jVMlrp+3eERdtQzzySYcXnnJoZzKkf+s4m81w9913nwSwJ+Ffehswhijgck3V16iglr4wHnlYqwe7D0bbG7nGZYbW5XUvjo5EfybB2D5dRkeKa1WfJzOOZLqsg79LhXbJA1KW9EOq7xRZytdl1xj7b/dd5oNn+ro6H5j5wu3GbxZjLnlDLFsXu7+H62vg4viNGr+1D90ov0fWqnqGuIr7rvo8RvuzGh1kPKzVq9HBkjVe4/c4H2jVNCvsuyVrVT1DNQdC4vAZh7UdJoNcH/yB2Xz2b/7yX/7LDw3BH1fdvWgSALNy5+D/t8NHXufcBaFvpff/8EogyrRQIwtUC1fBRy5zTxnxi4GpV/d78OXWEYH1Tcn/xqhwlQuhun1Lw1ulYiYQ5gKbzvaRrvlMsFgOnaPnIT0rxtenBmVT89Ep27cbun+leXTwePC/CmTRm5GHj5dbW1s78453vOM3AVyTE9p1KTsjHz+yElSjNNLG9SHdK7TbJsAJwNL2Vr02XpejKi3lgzpKZ+z3ss06HWbaHmZj3i0ADEv6jZFnAwQSM7XLpdLhEjpAHiBWBqOxbuW4ivyWXfhVaqaXq1nHf7N1pcIbCWbEK8rvyvOS7Ttc632HjA9conav7TtbT0ZpoLK/sXTfBmvGbnyQ6txdHB9Eyn0pw3x4B8wXwO2nHUSJX9577Nu3j6973etOiAjvueeeaxJcOAmAWXkq4P/JzmbXp2SmEyq4Ei7RimBUE0UVrSSFlpDVZ0LIeRlabrWLXKp5HBc09We+zO7Baq6SBPGwPII/jZcRciBm/lgKvQFjFg+Cn26vaGMI7uCKJpxl9UQA1wDb52f43EeBph3eq/0JjSLy60ePHv3CtTqhXbciKTqP0IL24BAf3VtGTtMcieod1STJZdZbRas2rp0zdeRi+7SMTq7l8RiNdlx57Fh93riK9u5i+IDL4PeIFqV6/1J+LoIPkvMbI/yvtSmjdHjJfFhNS7gqv1ffd5e3LlbTZq+47y6H37Ibv32aH1lxLi/xfTN2rcf+8zh4doaD52bwjQ/fMiHpZrPZF/7qX/2rvwRA7rvvvmsCLTb5AGbywVHAf/rpY7edxn/6uq1FN0gaLEP/R4SWlb+vyr8u17ZwiaByMXS0LxF3eXDMhah6/SLHz2WYW/lZirXnrv5hKBqxRDCftXj0Mw2efBSYzx0gHQAnTdPg7rvv/qD3HnsR/iWU2WwIiPZj6foIiRiQAFzvzC61A4rA4N1Ff0JJ/oXGhzZ+SJ2J3MyFfoNhB411hiLSO9FWGJ05aFdeD1Klo5+z/WZlfas2o5tDZS7i/NQ1UfVE0yPYdWMHRUNH9UfqOI/hHeUMH1jhw3J+p4oJe83OBbJx1/iV80HUeHo8NdllzkvfQdVH2mfB3L0kg7pCgjO11erzm8Zd0i78x1nyWTJfbFbWWpUPVYzAxO+yP6hoawHn3AgfVtx3mg8V7VlZr7bvEgEal6HheTeyx8bm3NQb23fMUAok86Gt8cFiPVrtsMBJgzueJxoPdC7u3W59fb09fPjwz73kJS95YXNzsyV5TXzLJwFQlZ+Vow15ovvE+Ye/Yf+crzxzwXfsAUB2lXaCtmpVAU1EKoCn+Qulfs0AT46pASuCYPmyUPcli+OQtOAlvdlHxyi+BKkt3pKSjVuNsfgeZ0Ck5oDHXSRYPXfL6mf3ZNjQjRM8/CnBuTMO+9YJLw7ed5zNNrq77777AwCwZ/3/ehEQxE4yayh/VSrpXIT9izdbT+bFGR7PNefUsF5iMaHphmvpZV37mGl2u0Fj7ai9bVB+rELfqD6QsMJJoWHXoMCOBZCy/lAGaAhG0F+nVldPxw2QosjAazWdNMY84qEG4hzoKClH3RM9HvUNpnDQ4MLu83hodMXHmSYiiGVAxtC+yzPJEObASyVLUws2RkhU4w/3KSkQTQuEmpRj8f4yvpRxzmiFVYEV/kS/JnRgXOC3ml/HFKxGtdbYC9F6DeTzEflJWGDouLZdbC9eG9Ya8vlRmjnBWNAPCuWDXpPaRE41V/V959KaLBQZVD51aX3l+86R1cNFDpItFaFMC6hJQLP7LqwwF8xEguq+g3pzBNpUa8BR7++w1pz9eFLi+8usaRDe9cEfB886iOuPV4SI975pmubCG97whp8GemixU6dOXZM3/WQCViX4/23jS9/g3A4EFD8gO0WlLlkxAAzoTwy/Izf0lEYEJmNBX78PNYn0GOim9rxqXwZH4ZRAuvwJ7aZ2BjSrGNGvxpa3wX7ZxvbJAeFKhrb1vEgcT7juWY5TBpOhHzaHZ3Y9jFUEnrZfYfyesPwY6pv+K5ekvp2hbcn6rtoWJAyvTlo8+DGB7wjnPHr9Fpv1tfXn3/e+9/0OsPfSvy07Ooj+EmoT8bBDiCyQiBXZfPjY5h8jIa3rkvrwapQ3GZDXxfi0sjQuWXzyUmOlBFOpBj4kYdfgi9FqJmr2A+3qZdok1M5Jey/+m74+5XMsTWmmX+EwyLSPaniE5usd5jGjZXx4wxhYw0VjNh5W3MRYengF4YhlBG8uQIgKvBEp16GYObKCDVHyW6N3lABz4WCa3uH5/Egl4CHwEBrxQAMbaH6zwm99KM7ey2aMma8541pj5DezfSfajEJWzCzl+BDf11Lwx+4FGgPs6KE81DOuIrkVLEMEE6lkcrL7e7myo8LvfL4z/srwvS34LXnoiqj3kNWWmvZ01qwhiEwGj7/bzwjWFxwOXwDQZ5Y6dOjQ7/y1v/bXHgDgrqVr0SQAqnISp7zIx+Zd5779nN/qsbzZAwkHgSEJYzS/J8EiLQYtDPlBgIp1KEqYESWI9OY1HzauswKUJyGOQxuEB42AaGgEwYypvmiBMN4TI1z5YZziUr+DENjTVhsh9Gl4BvGDLuWchf6E/qMX0HzQLoaN5fqxm+fCfxQl3KY2+3YQhWMthIZxxnlA+j32AwIPopkLXngW+OwDDWbzGXx/BPBN0+C2Q7f91h133PHigM+0t1Pl6uxgop2j+xQPHNL9EdnHiaWQFDQcBkB2WN+Bn+EkngsCHEDLRYkcWjNY0FGfSbA00yZ3CCYhjLZNyfqoD0naZK39Ykn1Sc0yM+R1k+cTx8cd+qgOSVUhGlBCi/XptYKgqED3ypxLhTZK2loYJLQwCdNm0sjkQgeqtHUqMehD9si4I79o26wJ6cFPzaO+1vIAoNq4bY0UVCC5MJqNO/Kbdk0iEwYTv6Wc8/xIZoTUUlgq94OobJ2sJBzV61yKdW4SvdPum3igkCz8RddD0o6yOBzRHEh0P/P3gOE31cEhNxer77FZk7Rm3PgOwvI9VvJbFFrbMtSKEPzRf1uddzh8pgW9i9Z+772sr6/j1a9+9f1d1/HYsWPXVCabBMDEMB4n/Kcu/OQr4V78/Vs7MTkLxh2Hcyfi0cazOpnDlDnpxciHLDpXdFQELKRLrR9S0q7RkyX11DVRfdInV3tdRk5w2RyaMaG4Xoy7as/OnGxVGgUZHcfyH++BphU8/jDx/BcazGaDUOkha2traJrm50n6vez/1xuAVSYQKaEiiqWsgnS0Twzz3NH5CzLL8Rz4TmNmkmgqFfVhgSD7yNbosNIeioh3qhM/Ua5dal+8LCpfCzDWqMYqgEWRRQE6ol1HEg60tWJJasKkzWWq+cYKnVxdE9tkbc+m2l581iZj1oXCVF7J3T2afSKf88qshbXCnF8qL7Ax0y+Z8yQk+lF+w2h38jXJESGvIoAN1ona2qeU6T6LNZnzG1T7LeN3cXjQa4DFe7bUitu4aS/WDB3X9Vh/8qhXTVsLx1Wkhnp2j1yTKxn2LirrJ/hHFm16KbBqxzPT2Pjjkt8wmU5MgGPoBbVjQ6/wOXDW4eCLc3g6eAhcP/HNvvV9z/+pP/Wn/gUAuZp5fycBcKn270gDAIvF01+/b183g2dXOlBMZU+rvNCh4Qyf/ZjH9tZOn8tRGoh41zTN1h/4A3/gN4G97v8XBMA0LWQyreUv26RhoXHYzrVjwa8rnLDjC1PSSTz64Om/lXmxiADX7QQ6SM9Qmx6h+4Hob0VFl5l2qPADjHVt4EIKJNBjSB+G/NmkPZOiTeZaCJa087kwgoiaaxS07TykOVZ913OK9LyjM/OW+pD4qvuT0zAGWhIOah5ZoV25ls8FssCHND/ZWlNrhdD/Jg1WOW5kzycTNh0LYSuNO80ZhnGGzCtCyeYKlTmv8VutacfkP5rxm5X9oLXecZVX5lhrAnt+67nUa9JqMc38xHvINO4q/1LGV324stezPRq0iKi9B7LfgeJdQ/Ue6/30kpBWq6s3ZOR3nHo1zop5XR+mGnh4erTS4I7TLZwXgD6olrrZrOWhw4f+96/5mq95/npYlqYgkKEcQf9R33ZnjqxjQWWjn8otUhwFOzsNHvqoh8N60Fl6Em7//v1Pvu997/vUD/7gD3Kv+//toLfC937mwa8v6bVo9DDWsZ+U0jl/yJHKJDkZjS2zbAUm2EPCS9dn0D/KnGNsWj5rT1J7OqxdspwLVB5WVLk8OdDOMp6ITi4vKOIcg+2niMI0OkLV8byuMrvZgMJhzinJbY+1cWOcttQc31UQgqACiKvbNIodSB5uwIHfQcoJ81jpY3xaJ5io0lbzS5g2q7QLftfWjxLEDe36XGrtD7PQBsPDJCmkBzDkew0wJEadtBu/s3Ev5Y3OGsVhXWSauDwLVG391vgtysWDNsCuh4ZK2Vqo+aD5TZ9FO4vWrWa0vYnS1uFdafoUH5j2Xf294gGn9p2ICVLJ9dDmEKzuEDYAK15jeneISB+dTkDQYm0huO2Mi6dSB4dFt+CBA4fwmte85p+KXB+dwiQAxnK//4j81Myf+9++YbsTgJ6TgvTWKYIObdvi+SeBL362RTsLUXbws9nMNU3ziwC293L6N2sKqQB1cxy8G0v8kWomuTEznU18IfYTIdlHyXgAVBz7c0T/PH2hChcXlB8kUSbYvD9JGBDzRB0TXgpH+nzmiHIsWfCvqjcCIaV8tGiuQaVazD9mVqNrfPFMCH6mLIcy/YuWoWouG7lrCk0AQI0OlVSY9zNfKzTzVgFNzeYHknPb0uHI82TJh+r8GM6Urj86QINj+yHPXrEk61HOb1FC6mg9DYMywgcTSAK77yglt0NEv1Tm0IBCKHgcO6YKvznG72zfscIHgYmozra3jfCuvYPCu0aoUk6q/SVSpBHIX0MhD/SBM8T6dtqGAumapmnatv2NH/3RH/0t77271ubf/lAyFdwvRxuSsv/cp9+8NvP3XNj2vocDnsqtUrx3WJsBj3wGeO5JQTvrIW+895jNZnLnnXf+nyTlVpmPLMcFghkrmhZ3TaBaJlMSKBw+ZZLUPmMa5yz3ikoRoQnKQRTcgvHzyz6/MoLybyP9mNpUPnnhpS9mRkaeNXRU8qnMFxGKTjT5GT0Mg3HK+GFKpY/G5zDzvZIBa0/M59byQY/bfoQtHwxvIh/s/Fg9ig4QSWOy/bZ80N5oVT5kfowsfPLy/OWsjLvEDczno2+TBe2SDzD85lJ+w0LyaH9JZaLt/fRYCOahTyUfkPptNLjluMu5pBGE8n03yu9s31H5vFrvNw3fYtdF/r7I+bCc3/meHefDGB0T7GSQBTI+KBiyTOzMemHH278zgRkEdz3fgl5/b/rgj1e84hUnSC5Onjx5XWSxSQBEgn/Z2vniO2az7Qay8DJNzS1ViB565qEHHBbbs6DKFxFp5vP5+a/92q/9DaDHaLpVdKKMZk4B6dGj4fQx8aAfXGRUxpDwtwPohn+pf1KdoEbQ12I2l9gGRq5JzJcaaAUIj7ytGm2O1gt90nTstfA7smdTPVH18jr6OdUm9HwMczc8b/tT9hHV+atfH+ODbTPjA0f4wNr8aB7U5lpW5APG+VBbA2rclhc5n8TUy/lg16VeVyN8cCW/kdGp8ifuFV/sh5wPqMxFyQdEPi4dI3U/R/Zdjd9L+ACzF+Wi+MCV+VDht1u+7zA2toIPUtDO90PMrBLH54v5TevEK3oeaATz8w63nQXERexe8d43GxsbF9797nf/wvX8rkwm4GRW4O+8+P84IrIA0CYflqncCrIOmoY4f77F5z5KNGlX+KZpmn379n3qT//pP/3Egw8+6PZ0+rdQZuGFzkFAqedULX1nhjNlPXXFVJZqTKdy6/F7Wgs3576r5MyqoaGjz/37ktMt3IKQATRagG5tba1tmuZ//WN/7I89uLm52R4/fvy6uBXd8mouEfBdONU9+uivrXfNc193rltAwKZHiZvKrbEGCNd6PPMY8aXPO8zmHt73ENOz2Qxt2/48yZ3rpaa/5mUHMIB2MvYazLJCZM41V9SxWS7hnlxBQVSuEZ0rPQc3ax/kOvNBLqMPtwIfcA3X/A297zJkcmH0SfUQrG05vOQ5QthE43HnOzefz/0rX/nK/wm4vqgSt7wG8MSJow73nuief/6f3NO2i7svLOBJuEk2voUEQAjaZoaHPuFw7nSH9Y05xAu6TrhvX9u94hWv+PD13qjXsrx8YwPPisd2t5Ww+ko//lR8md5PO2Dv+nLlivdqfZCVGHx1PwayS//lCikgZEn7Y3N5ObTH+j+2FuRiGr1Ifl8OH66WIDp27UrM+VUXyiqEVuH3xfSDK/STl7H2gcuzNqzKp932XYFjOAiATvrgjy035E4H+uhSugMHDnz+H/yDf/Bf/uE//IfXFVXilpdy7jw6pH9rnvn6fTPM4J2f7Fe3ogjo8NnfEXRdG7EhSDSz2ez0d37nd/4OANx///23hFp4Y7aBxrne52Uw6daxxmDxsmo/+pmR6zTOXzUML41BNnKPFreuxO1jgUsXcex0G8oZf6zf6VmFXeZoMOXivaJPKO4lfDLVH6DAsSvG4yweYol7Nj7XVbw8Pc+oYzcmXMY0bmZ4adV5K7AdWeC5sYZbOLaWoOea43zgGB8y/L6A/VfMdYk5F8Zax96rzBVKnEC95mu8Mynclsxjld+usn5zPEAzDwqXsLoeANTWUMFv2Htcsu9quI/5nkEFFzDHddQ8ruwt7MaHYt+VGKCozPEYv/uW+uzPrScOvTAbgud6n+rOd37fvn04fPjwT5K8sLm5eV2zSt3yAuBTuEtEpCG7b9/2O5VMplPZ06KfAE0LnHkBeORTxGzm0ENaSdc0LQ4fPvxfvvqrv/r00aN9pPitMi9Gtssw8EoQYAudUP0XJcaY/tcg6o8EGI/SUeDEVdKVRPZGiE2fONuZkX7XgGij4Krbp+4fjHCbdVABR5d9hgGfzsZjgGsrE1zJnaoBfmtvO7Lsv32eNS8oOyfASB2O8KHkX/EyzvI7F9OR8YEo165ZNkqQVBKGHXIBus1yDWJ8viy/Wd1jli9pJXJsrqv5cLl83+kFRMsHDdpd5XcGbjzO74y32GXfMWsj30+V3NLpUGD5rYXU+nSwTqfYd8hA7GmArc2aqPEhQPs4YuNCi0NnAGlMCuumaZoX3/KWt/wr4PoHFd7SAqAIeC9PdA+88NOHPM++9YJfYIglmsqto/xD2xKPP9Li6S8R8xkB8RDxmM/nOHz48AduhfRvpRDAIhn6VKZyM5WbTV0/7bVVeCo3NB/6dHUeiwY4fNphvtPEPMMCdG3b8sCBA7/0F/7CXwjBH9d1md7iPoBHHXCi28aH/uD6utz24gV0JJpcQ5SffvJrtTrj9yq44wrKybjUDFhFGr9UZdsapTneb0kn/+y6yQ0pCSle38vrXYq2Lc85mrdXJPZWm5Ir0shPj/V+CygOXjxc4/DoA4ILLxL7D7Tw3ov3viHZ3X777T8fTmqnTp26RfbFDigebkhkdUN8mabI4hvkZHDz8GEy5ew9fvOGn65ea7i+BRx8HiZbTNd1OHDgAF772tf+PAAeOXIE1/ubcktru04O+H9onvhm57YchCIi8N4rUEpJIJzZj/cJiDM84+P9/pp9PjiI6ueDUCgxUfcYPcD2LfUjv4byWZVqqGwXxd8YuafHXf9B5f6QjDubi7Jte82b/o/Pf6LXp+0q6dT72d9z2N5xePD3OjRsINgCACEdNzY2Hv3+7//+hwHwloB/MS+yfrgRfsuYpezLuGZysyYsZs+xuBfpap8s3Y5wtA+WrjU7WTp53yp0RuuV95a1haKfu8/B2Jxx1/ms8QFL+FDxf6uY7+p8KPuOJXOwK7/H6FTarvP7SvBhjN9YMtdXht+JDxnPeTX2XbkftOtFdfyybC1e7L7jxe07rrLmx9cCRuc6GwPtWuBoH3bjw2D+pceBsw4HzrVJqyPwzrl2Nps98u3f/u2/CAD33Xdfd73f87e0BnDw/3MfOfvN37QQ3y+PmBh9ycex4qPAYDmWxHOXWZNFMp+JLGl2Safip5RdEwGc4+iz+enkYo5aVhvZ0+n/3eVR1h2LRM2P3kKSXdOJ0ZfTGeeDbbPCBwBwC7iGOPP0HI9+hmhmDhAPANK2Mxw8ePA3X/7yl589evRoc+LEie5W2hsMeS2ZzMFQGPspz6vYwEFKyJo0kkKsv5+npaJRbZe5OGNoHdKpmpmaIuT1dCYLiM3XSp3GTKd1Mumk0rmdlTDX9OJPKd7CHNXuuSxNVZgnnUot7jkZ8ptKlu4t0kl971PLpn5HK8HQFmupsIJUH+pD5xKByjcr1XyzNo3aAJYr6qVX5G4p563kA1biQ43feq4hNs3crnyIOeTy1HpUgZ5eCRh6rlfkd1jzUGnQsvkkc7uQxPelWQuKp8zT2al9V/LbmkdY1fD54Z3P0fRqef6W6r6L82JVh2GupchlrENqK3xgmae4xgdX40NpH6rMteKRtniJ5kNtb0n2/kttOzgcfmEG5xt0TUyT6OfzOe++++7//W1ve9sLm5ubLcnrnlL0lhUAez6f6D799P/nNr++eMv2wvf+f5LnkwyJ33M8tHHMhaTVK/XnIsTyePsk4IlU6MSXMI1AszsGRDIno8zgOPq81FJ6CZbSGe+HqOeTiTnNy65cw2o4F5oPtTnrf/cemK23ePRB4rmnBOszwEsL73dkfX2Gl73sZScB4J577rkFrUk29VKVu8XHGwYPq1hBQpWuK1uHQw7T0oe9zOHL7OOkk7TZQIMiU2ef1xMw/UjyaiaUqo9cFbUi/wCYOdIpucpcr+GezidKyWdfffjECt82T7GU/c9wyXIe0fDPfAczAUvtXakIjPq0iDLHLjPMmDyvM2tHU7HPMBMnkeVKpoIpKvmgxgsZeXXQrCIaAVI9x5E1r+ZgdK5H+jXapkgh6Or9oMfKJfyWeG0JH2zCOqhkz9m+Qybo68SF+RykdSJQgmsmd3L0K8Nif+ZC6257S7I9nL97yn2XcvxaftucyRQ71pjoUABPwfp54PDzDp4EpQNA6bqu2b9/v7zuda/7x8CN41J0C5uAjzoAODP/jf92337etr2FnlOD+dR7gfc9xFlvwoQyrea/59f037Uf2r8B+zwQzcOFOdfXTLxY4RrgfdZX5P3apU2Pipl5bNw1k7Qddw+2zJG5lCX92Y0PzMzPJQ+8EDKYNz73caDbaoZjqhcRNPP5bPH617/+V4fFcouhgs+QO/8IbHL7PI27FNdkyT2avK+SfdukeKpsB5UAFUtH4idKKiORar8qdJb0weSVFRb04xwU9+wclOecMq9qbFNYhd6rtbkqH8qRSvF3bX5EH5Arc5rXLeZaSm6syofald3WotT4oPIkMxu75POpMX8vmt/jc1DXMweNmRKjRC563xklH8b6Ve6RcX5LUX/s2WJ9Cy5631X7LdhlrvM+jO/T2r5DwW+p7BUxhwYJvvUOuO2Mg1sQKvmvb5oGGxsbp37oh37oswBumIxSt6wAGPz/FnzuWx3EkTH6IApGOoW6QExC9TzZezjiyBCmHhcZqRKhZwdmqgT3zJKgw0IUSPbRhEk8r+pF2pJoq2uiMCNE1FahSh6fnWzr10Qli7B0rJ2XKhm8Tgov9gVLQjiMm9ZsXLwktDKWNC/sNL+M85s5c6DPZts/0Z1v8PAD7HHvhldE27ZcW1v76Pd+7/c+cCNt1uuh/6vBImAJrh+WYJVp+ARWsc1Q4gKO4MmtQqeOy8ZR/LsaVh1GaeT1Ucfby+6hgltYvTdCBxozcCU6y/o+3mesPNe78QEr8QEjNJfj5dHAcSzHPdx9fqrzean3anR24TeW0LkSfNB7eBlW4yp0xvlQwSWs7TtczL67hLnmkrm+VD5U6QBCh0aIjoJm0eDQ8y0aIYQLCAHvO9nY2ODLX/7ynyLZHTt27IaRu25JAVAEPIJTnYi0Ime/8YLfgYhz2h+ENdwoGLxaOFonURiTA6N/T6qXMNMSXqkG6VT1gmyTOV07syArTskS2qelE57NzEy6nxYkEwUd7R9pnGKHMQJqk4iuO9zXSdtRcbSWZH6xAK3ZCyWbX03HzLnmh1J7cvClma0Rzz7m8KXPCWYzBy/ptHbHHXd8iKS/FffIfBb8ipKQvWv0N6+c2HkNJdxr1yaXXONVpnNdp5w3Bh94jZfYjdCHnPiN4MhyNebguu47gvQAPcQ53HamxcaLDTrXo0xAnHeuaQE88s53vvPfA3A3QvBHKLekD+AJHHX38kT328+/763z/XLP+fM7npw5MV4ltM7ZUYdNo4qO/gRSUbqLViWzkhZL+Z5IpkCXus+dTT1IY4rCkmtjKbn0dREUtGt1bX9sLkQp/BMZTQflTtKRv9pHsJJap2IAEm0OG54XyefJJc2jJIFQPEEnePhB4MXnHNbX+kEvuo4HDx7E7bff/kEAOHbsGI4fP37L7ZH+ANHPXnTgXvEdeSugtVytcV5MVrWr2Qe5Seb3Zl9vV6r/l9PO5cz1te7/Dbfvhm9KR2AmggOnHdqO6Fr0AiDEz2Yzd8cdd/zbe++994YJ/rilBcBQtuQLr95ot52cm3XiJB6SRHwGJJd5FRjAPsmlQRjc7ywCS0z8hxL2al72td+tFz7Mb1mbygs4RhjaZzPX6FVjOZZdYyX4IqctgsL73Mxf2bbUPIElE84z9kRhktFV3FyntPj07wJ+AWCdEBEh2Xjvn//Gb/zGDwxV/a24N5LWVXY9OFeOH8V85y/OZSlHx5b/WBvZkaJ6VM8DM3fr11j7OoZwtC4VluZY/zWm58g4l4eJDUgDS+anNs+yRKEhSxQmy9oYnfOL4rcgjx3lSvwu663K07z/3GUNLl+T/Utc83Q1fkuCD1mx/6usmWVCzbJX/LL2May3Gk9X7f9uc77KWK/EmpcR3iytl/dzeNgJIY6YX3C47bRA3BBoD6DrOrexseHvueee+wHwve99r9xIeLK3rA+giLB1298B6Xr3Myo5pAJpYFS+xuPUplTK0wjpD5Be4aVpVYWYI0uVg1q6o5IOR+qT5U4xZubaF4El5lM129DYNdb7bfqZ1StM2ixpY4Q2kWtrtUmYRRRgM/M4d7rFo58kZm0U8H3TNDh8+PDv/JE/8kcexy3q/5c+TOPQQbLkFD0mDOQPFqd52d0qI6M0NexLJcXWEuEPJlZwN/rcfQ5k+byNpWCTJeMac1xfxofdLWNcuU3swu8a9h9W6EdtXmvg48vGxCVzt5sFUFbo4VjAQrHml/GUHAla4UXO9W5rhqMCMkdaXJ3f3FUbuHTNV1rb7UAytj5lpTVVXzvVqOIV+W74pvzfhR7rpx3WLzgoQIuuaVp38ODB3/2RH/mRDwLgvffee0PBid1yGsAA//Kxjz0wX7zqxXfKAgB9z7U856HYJNJas0UkbLS0mCX7mFRfExBKZQPKyOdWyuezqCTCZvko76rFTyl0NaicXsdftGKEXkqpAaAB5tDDEIOpFcEPFD6iMa9z+YuQweRLLtECVT4HArRtgy886vD0FwWzdg3Sg3bLbDaT/fv3/xIAbG5uulOnTt1yAuAMs6QxG478jlz5I7v0HpfUzd7Q3P0dXbzg61q73YUIl0ViYoU2ucsH8GLniMuEmQoS1artu6WaDpr2dxOaavfd6JxztT7W+sWLGxsrzHNL1oLbRQO227gv5rm6iLYKb1ZbM2NreTmvpABQXpWnbpdvxOX2fyWXvgo62ip7/5LfXQFzMH6ctAhLzBYOt7/gIOLiPvXeY21tDYcOHfqnJOXo0aPuxIkTN9S7/pbTAJ4Y4F+6V/7Em+Yb/u7t7c6DjZNMAAFliEqVQaIXo00T8cNHkvDDD+DgY9QsIeKGKU6RwD2sjK433Bf7rAcHHzfXQ5bE5zlAbqZznRcCdPHZ/ppLbYc2hz5CtdlDpjjVdn/Nq2fS8/2SSeOz1xDr9bT9MI4YCSwujQ1u8PtzAF0cF0KfaGn3ddXfgY4at+4jIu0kEoZI404EzQz4/CcWOHu6AdveQ9B73zjnePjw4X8LXP9E3der7GCnn80hMpq59qLilMrKvXA+yvHuAIz6pEZuyYh2Qpa0ITXQlkrdCraHVMeGzBdXVlNNVvpl7sm4ti2HKNFzMqaRgMhqGizKqFpDKnPFJXNeM+UumwMRWTJmS1suid8lPRnRAMgov6UYA1fRjSqQ8nJwOUCKFH1Ja15WUsNKsYCW9WvsFkf3sJm7ZXN+MWt+bC3IuD5PgOVrZpSkjLJ0Gb9Fg/8MGaXiGjAKIBolkXfA+rkWB07P+mQJ6UjSrK+vn93c3Pw5ALz//vtvuO/JLacBvBNPEgJuv/C5d6zNtmdnz7Nzzi9XLYsUKFU6sEEy0HTJfdeKA0u/8LxYH6tq8IVU9pDC8GNOR6wmRTJk/Nr6JyoBJ6NBKFKMpwjagALLVK+9qLFTPo+i61VegLUAmOUf/ZGPTXipSQNwGzvbc3z+Y4RDA7Dru0S69fX1h9/2treF9G+3ZPbZmfnCs7Iey3Ny8kHNTHkK8ihP+aZfvMa8xBHzoWCJfknvuZBZRGu3xtTbS1RPmVpmpUw6Mq7KEZFxzaZOM5BrtCTT1I2pTmWJCiXMSU31Irl5j6OC5ui93FLAJbrAXHvDOu/zdTfWRp5hCbKknZyLrPi9qHsyxled7WaEVp6DnGP60Ur/jYNzsSSX6xsl76+YrZBlPin3ME3lcbWkzdYzvjdkbO8LwF31pajvB46vp6XOKMycypnxQ3zf3yjwKYteceoJVjePgy+0aHca+HbRPy/Szefz9uDBgz/znve85+mjR482JG+4bFK3nAbwJE550Inv2nu3u+0+bU/+Dh7ZVHkMQ+0tKPqjh9JRVSovatlF4BvLwMHyEFd8v6QGZCuonp5kBeFLZPyEarIfYUncaOFiKUu1H2PC37JDZ1mHABYQETQNcPqZGb74mQazWQfvHQCRtm1x4MCB37j33ntfzKwgt5gG0H50Tf7WqoNdtvYqggirTJJxwWrM4WqM9ohwmS3IlWx1lJGP2m7RL1IRxrIPt0EXKDYzy/bycXNMwCubwMhHt/qlXcl2zuU8XULC+B9z6fTXn1tl3RX8luVSRX5pqe1xxP6+RPheOudA3Tkt8oOjvKj5YGNU0EHdD2OZX8Nua62+HMb5jZE1wxHBcbmzZXYwGn8PFPvI0OaIbKuxfZf3LRyoZtsNbnu+AZodAA4UwnvvmqaRV77ylf/rjfyuv6UEwGPH4I4T/mOP/JOXYH7+q7Z2vAjgRK2JJAj5+CMY1MHDv6SHiB8EHG9SmuUphKja4fDTI4T7AY7YmzrxHu1z+bX8p3qPiqbpg5g+5HSqfWD9315VXu8DR35HNg/FOGv34t+yEr30o0GoW1AWaGYtvvRIh+e/BLTzHv7Re8hsNsNdd931AQA8duzYLZj+zRzbB+10iKIezCMlRnPKqRpxHsXgZUZ/0fwHZRvVtpfdU7JT3maEHQ/3nNj+ok5bdP853kdUxkA9B6i3kwd65fiil0obLAPB8mAwuiVzvuxe3p7id8GP0fHY9kwbWLIO3LI5WcZv1vmdzZtARmmvPD+K30ZAqgTELR3rMn5n7WHkOTsHJd+qbWLZHpPRtRBy9db7nD0z0ufl/JYqr3VQpVlTtfW0rF/5vDqViz6A3Bo6AlLgQoLfpsPBFxrMLrgBo9YBkM455+bz+Ud+7Md+7IMA3I2aS/6WEgDfeN9RAsD2bb/yNfONcy9dbFMsFHOKZ+tfJU0v0cMN15thNTmQblgoblgsrnKMSj53Yz/c5f5V+SEvoh/NLm1dmT7JynV5Ue32e9mrjC4NHB0+/1FiZ6tRScqlbZpm8eVf/uW/oqTMW7LMZjOjTYoBRkvMPGNmPC7R3MQsLlIx6xhzbt2kF+6NaXhYnPJtH7mCGZLLTHqsmQWgzK2saqnyCH/73LhmixXzetS0j7SP2hyNjGfpvUKwGb8HfSCuzHE0hY/ym0sVglUriNT4jTq/uYynNJim4ybpfH4Svw3rM81soegdU4fKyDoU1CGzoslHlsxBZf2O8bSYO9tPo/AgFb+TFiXn97gGd4nZf6S/taCZ6l7MxlbjqcGyFdsnVqKTKCEblYBdg43TDo13Q5aqBbz3sr6+jle/+tW/0Cuejt2wctYt5QN4J56kCPibp5/7ppnzEHFeIE4qZikZUqX1gp0o/D5mvgg26XWKb2VytFVZMozzKmvmUpqYYq0vj9hDyixCkyR93KIgoaaMW5pML62DRwF+CY5BATBt+FWsO0Vm9FxVX8tKyyodjesUT93KFyZoW3e21vDQx5ze3F3TNM18Pv/YX/yLf/ET73vf+25Z+BcAygaMGOk9KiRoBo3yfMlNWeo+NC6gaIECUpqRR1yocn+o1dS8YujldwiiJrlZ2M0lA11mDsMq+2gJdgC5hBxH+7KyYFhj8VIfvNXuVXmaz3nlpbc6T5f0heP3DL9lifAqstzUusrLcXTux/0bl2OxXNz6WiYAF/6M5CjE0Wo8HTHf7nJvhKmjzxWHECjhNqZzlaU+qzGpgPNYPzfDwRccQMATYC9Nts65F9/61rf+zPDIDfstuaUEwCM41ZGUDz6zvYnOo4/zdcpVxMfVFaFWpCaF2CwfEUKCIQqVCoqEWZaPGsC0VQlIIaXR1o1ZzKngVjSwsw5Z1751hEWdhslPnPpZ+rWIlF/WGgBs7I+MSpglbcnFVuvcGOZWO+X2ZnlWIyrD014G0II4AR7NrMUzTzg89vkO8/kcfkDznM1mOHTo0IdIyubmZnMrwr8U71EpBTXr58nRe1IcKZYshRFXrd1cp2pamxpKf7aNrC+a+n2s//pzV37PrYZCZLyPo/PDJQGbS/qIkT6zdmGkX/m9WkIj+4ZhETmWPzc2nlV4KhUBo7aexuaOI/NaAPty9/7W26jQVtiqWoMkY/M6MifL1gWz9+qy56q8MYNf7bld3+Oyu+vo6F7BckgjwWo8Nd1b5ndYrBOanAlGVZL5ewaa1J8qEXgSB55zmG8R3SwqJrqmYXPHHXf8yvd93/c9jBscS/aWMQEfk2OOhHzi/F/5imZNvv782R0hXOMH/D8JgI7mICWDH5TPQJuTbxQpCTIlQOeSg+aQSZzSwHm6/UJzoXMR2xVKjm0pe/wmaBe7UVDQ+k4ZgXYk8N5EvVD522RblbLcyRo1c1Q9XIaZ6U7yMGgGgT3xqPRXGyB8GF4ORDMjHn1QcPqZOZoWg/+fZ9u2uOOOOz4AAO9973tvyeAPowKMvi4sQLm1MOQ45HmWZJzHcM1B54guwb1d9m89v3Vqx6kXVu5gYfJNZ8/Ee4Og6pjRz8DZTfu07SCbg3KcYvroYP2XQr2CdmWOXQaSbuYxowEmx5Wi/5V+xXmQvI005pRXfOBpZT7yOacanxvhaT7/NVB3XUf70DlcIk9z/7vKvLpd1hrUfWb8ZjZm6LnL+pX7rLmRvRHar+2HwG83yu+Mp6jzlGM81esg7//IGnTZfWRjMfuI9fZctlfcLjzlGE8r/dS0XM1vdPimuZE9GOq6Ab2jXTS4/bkGcA7BXXDRdTxw4AC/8iu/8n70vuQ3tIx1ywiAR3DSAcC5xefePls/uwbfq/t0VjcqnyTJHE/DNRNBK1bTr/V8eRSvOftIMmEV5ls6FWFOI6hJ7VomNBnMNsnNdbYdkUyYVH6M1geC+uijXk0wfi+hHlkzoAVBDlUh0PhQkmqsTG0rwZBqkGZegALnK0LPQNAQePhjLWTHAc4H4bKZzWbd2972tt8EgAceeOAWFwD1svBR+JcgYLMPIgpBIvq6KAEcLt2jukf9t/5R9/T1gMcJlj+6TVEHM/0M9e+6v7D34mGCqo+qPl2iS9VnGNqo1xExB8fYf9jxR9pOAyiJCcjRc2nnAGW/RJKPoKLbz4Mv5h81nmb9FpRzTupwupI3rNARNc/5vKQDXNYvljzN+5vfy+d2bF4xOq+V/mt/u8o6rvE3p2365Ub2keYpS34X+2Hgd22NyAgPE8rkyNxV9sqyfVq7V2uvWPM57SX8Nu8Lt2Re83fS8O7S+zUE8ITfiz1Z2dvSOBw402LtHNC5aGbzTdM0AD71N/7G3/g5ADh+/PhiEgBvoC/alj+76ZrI5X7D+AGDTmTw25Nhfw8bymugTg3dKVG4MkCeAiuGiCTAy+FfCYJJFGI8Ehbe8NmJ1xCf817SNQg0fp5oOupnGFqMWjaYeyJZO4mO7oMej6Hh1bOCrJ3c/lDrZ+iGr7cZ58qn7mIMb1XNi6CYF9d4nH9hDQ99HGjb2N+uaRocOHDg1/7kn/yTj6DH//OT9IfBxWA4w0uvRqUMkW6i9AzhuvpbhH0ddZ2S2onPZe2bNsN5XD8T77l0L7RfaxP2OZHKPTU20fd0fyvjqdUr74XIwPKeng9K+ZyhJ/X54m5zB1UPeXtuMIWlcRP29zGe5mMXGe/j6vxextPxe5BxfjObE4zMubmH8XEi44We18S3cj9AKuskzF2xhtJe4ZL9ILW5Q30tmDbUuAX5mh/hN+z4cCn8HsapeYoxfld4yhX3H6vjHhIPiJ53lXggzKnieXhGxPJVhKAHDj0DuK7RCg0/n89x6NCh/5nkhc3NzeZGf8XfMj6A7+KpBeCw7c9/o2x5+oDZreQg0Rov9GjpWkPYH/iC2OeKUA1tFhVlChAjFDITepjBVomp12sfffwgV+tV/QahfLOy7AyEQblPQNa+NNrmURXGwSrHufJRY5eDQyeYNDEWZe1wawI9Kg4dktu1ZUmyL1qfHBGAM4fHHyKefLTDbDaHSAfAy9raPtm/f/8vk/Sbm5vtqVOnFre25DeLalYqTQRUwE7NrC852HB+z6W0hToqM9xD5V7ZfgnrUd5DPNGHfRb6lfexRjstIzFg56P9KlwWJIs4leq4bftB01Mb9wBhg/F51Rt5/B7qtGHHbeduGU/7fsW9eck85Qo8Hb+Xz12MDq/cW8rTYk5g3FuIWhu+iDDO2zdzp+85VtfMqnvF8rs2PyM8RdkvE3AxzFfJU5Q8xW48re+VWp/134Fv1BvEaeztJXslPBfSj2ooG0VQr5ORE7BZA04G9UkDrJ932P98A98ka91isWjm87m85S1v+bc/8zM/gyNHjvhTp07d0G/6W0IDGOzwv/3Cd31l0174yu2tHUm2VhizZ9SW1bJ7JI8BZR62v8eXQB5HUUXt1PWpFmMAo7HQNKGdtHcH93pB9SVUD3ArE99TRSnXkrjHq2J9CVPEoH0iN8kW7Sm8RZJDSH3WyyJpAdMLJ5MNS/9MmjRe4XLbODzyqQ7nTzdwbS/gd524tm356le/+lcB4K677prMv7NlJuEl+vWl0Z3j9ciLb+Pi7vEK0L60fl2JNla+t2Rs4KX262rz9PLnZGkeYeI68vTqziuuI+2rv1fG3z2r74dKv8ZgZVY3ikBIHHyW4ELQDK5R3vuubVvu37//l37kR37kY8eOHbspkCRuCQHwyH29/98OLvxf9x/gPt9JN25GHP87vxcss7kWUQuRtbZYa0vqKSUr6SnNNVFCl2S+ibU+lJHBMCbisRSOydxdHJKqkY+5qVZQzleslwlz+bjz+UUlrWvyu0zSoQkvoQCd69O/dX1WEJAiAre+vv7cO9/5zv8KACdOnJjMvzv2RD6VqUxlKrd6CV+VtR3BgednaH2Djj5qS9fX1/GKV7ziZ7quu2lkq1tCAHwKpwQAuu78Oxfeg2irGTlZ5LviyOmm8jOWX1Tn9xxOIBIjhVHQYY4SS62zS5Dlth8arNPmntTXkoKxjONi1LDZoA6SUesJpYkrkuYxxaslZHU7RxFym9RXocW2hHhYoVNDci3AfWnQ4EPLTQO8+HyLxx4k2lkP6C1e/NraHE3T/PK73vWup48ePdpMUs8SDeBUpjKVqdyywh8gjWDtRYf5WQc0DJ5KnqRr2/aR97///fcDN37wxy0lAN4L+Ece+fC+Due/dmt7C+J7cDgdJND/G35C8IGH1iaJAF5qgRE6aCTWVtot3z/rU2CD9x7eh3vpOe8lBo2E4A8fAhzQB6wAAvE+BakMP337Po4pBHGEa37A1IMag4QgC/gh8CP1NdAJ/Q9tep/SrAWcvtAfxHGiT6ytgltCYIn3vk+Cp3IVh76FOUakI1HrF9utBJPE/nnfB+1EbayH74hm5vHY54FnHuvQzAHvh2CupsHdd9/9AQC85557OL3qhhcDOQraOpWpTGUqt9T7UADvBBTiwHMzzBYOHv3f8J2fzWa86667fpnk9qBIuDnGtecldznmQMgzaz/zejTnv2LrvAidBuhXju5I+f606B+jcHX4fRFpKwqnT5IzbcyqoaOAdeNACsfXzq1EHlFLHUmLHN8PMDApWkdWg10x97M8xtqHMcMMzGGfJcs1au3ANE75NpsQzXgwTFGY/5TmS1RYTXDulYiXWDg/h34Zu7SDcy0e/kSL7XPt4Lju0PmuWVtbw+/7fb/vQ7jF078tO/VOZSpTmcqtXAhCnGDfhRkOPteY71wn4tbW1rrXv/71/+ymE2z3OuNO4qQTAc83n3/nvgMdgKYzKc6oc//m05LMu6Sz0ArqJ0JLQGHXhRy3Yk2fxoQ7/Ghzbh92HgJQwnNuEFatKVZUGo8+yC89H1LZxTB288wAfC2IYe1hDuLzkiRAiZkcqDAENSzAUC/rD4YxRAxBk3YEA94fjXib8AZ1/9P8910a+kRbV89/mC+KgG4bi+0ZHvrEDhq6gdfeu8ZxPp9/+gd/8Ac/CQAT/Is+OE3i31SmMpWphM9SC2DjNDE/7zQARde2rWua5pf/yl/5K7927Ngxd+LEiW4SAG+QcgSnPAnpZOubF7ID+D5dnxdtarW/+2DORML30yZW72UwBYsxF4uXaOb1vjPmT00ntu9LU66ur/EAg+k3fZwtBqAG88w1k7HNYG71Co8wtrkE7y/Mj9auSYY/WMESjOZq9V8063r9fG62tuOK8wvYeyJFf0Sbz+EhvoFrHF54WvClB4Fm7gIWjp/NZmjb9j+SvHAzqe2vVjk2/DsD0MBNBuCpTGUqUwEg9KB32Hi2hVPZVL33WFtbw8te9rL7YROf3BRlT+MAighJ+k+ePvbSJ7Y/8K3nz3oIQvJfhalHjS9kM2/oMwBRwdtTbRi5RCWkhuRniVxjFSGLTGyG9ndLuSUtVlJqs6RBNa6E2SLqWd2WTevGomUpc2aKMltHTZ6Y5NqhXR3AYWQ7qATctH2NOFRxfnVvxGA0QvNGJd/sBJi1Db74IHHm2RbztqfRdR3279+P17/+9Z8HgMn/Dzg+/LuDmVLS8mrtTeUycaNNfa1PaU1emTlZPm6ppYm86FYupRcjLV4xNl1MQ+N1rxwfduuBXBNf2Gu/H3Ri4Evndz2z083GB8FoLvrhkjSCfS822DgN+KYFZQGSIiJu3759Z+69995/91M/9VM3nRvRntYAnsC9DgCe3/rsm9uNnUPbOyKOLgao6qRm+UIWUb5lEQQv4e0RJbSLBaIdhCEFWErmuIFpF3EQmDK3OINdZH0P0+/WF9D685ULPaNt/s6ilwsfw5AX1vpM5qm+xZh6FS4fSt9EKjoieR+ZIoxV4vbAEtFYoDFqeZjPIfevUNA44qGPtVhc8Ho8Tdu2W1/1VV/1b4a/b3nzr9YAona2UDkOJc91WFwr6xnNbR7RXcP9yX4XdT96wsbgoZLObn2s3Q/ZgCT7OIuwAhNVQiNJtd8VCCUp51c0dpL+tQQjLa9dFB9SfYrOVgRoUM78wFWbq1X5nR8t6/UKtUs53yIV+C65uPVXtGnHZ4IBK0tx17VWmR5U+KXHbdKQ2tjCLPXoRfBbSn7HRsMaH+G39eVGyUe9B1eY81F+C4r+mn1nskzt3uZu60qqfND7XP9uEw8cfKZBu93COx+a7WazGe+8885fefe73/3E0aNHm5vNjWhPawDvxJOEgPLsM98827cQnmcnQBvk3nCqkJBNIxNeiD4rGQdZ2b4Q+xp+yOahX9hkeM7ClYR8vKI1eEaa5Og71hcv0EEr6K06MIVGZPTghhyQ6sUSs3aY3CMDpItYIGXtJyk0QlfcfOp5H2kP/clR50XgxWYNSam4VVuDlCc1PQXtOy3wywicFJw76/DIJzu0bRta7tq2bZxzv/6e97zns5jSv5mysTHDbKF9VgdeMgXkaMggKYKj0qGJGsZIH6QgNrGMWlJCpow7qk0X3Un7VSIx44uYejF4KMvkYA9RyPrLmEfb6ezVzHckzR5GEdxUjqev4OGG9tPhU9TBhWZ/BK9cPZepj5LuM9WTTGub9p3AFbyBAZ0Pc56dp4wFIgDPC1M7OZ+0pp8Zv8sDp+6vaNfg7HVINY9ixl3yQbdlA8libuvgr63WpEMto0vObxUoWNCmek8K8oC8xG9mmnU77nytOdDmBUad35GGGje1hUcztZIdhDk/AwRYDH6E5WPcd+l7k8/52F6s8dtm1bL7IVl6anNOxbcav9WcZ+8g268wZ71/vFMc6NwCa1st9j3bAE6GQxPhu86t7du3c+jQob85YP/ddGVPC4AnccqDkJ0nzn+zbAvpQXHDMvJKsyRDYhDxMTaVHIQusZtfFz+o7VOe3f6l573axkRsiIWQ2cOncLghyEy7gupL05hJgcHXLj+w5eczqQBbiwoQyVOx1bUaJoNImIO8q0ogVMNPgoT6CkbwZtZAr+0JzmZmSX03GIKhnYFwOyeefIR48lGgnUUhXmazmRw8ePCU956bm5vNlP4tX2tDpLVLJ2H9wtfHd45bTKHz/uUiPAsNsY3oZsXGpJMGUqd50aiPxp+isj6rlh7lzoBaFL1kQkFlg1CfmNLYKPojVNPAS9JaF0fMkXqCAn6U2ZwTNVeOislXYNrU+62mstTjgdTrJUEipXUMwmuUXsx8odjreYeYMy/vtz4qS7YwBVZADOtZMmE9H/cIX1BYH/T8lJvC0WpSUx1UhO5l66LCbz0/9YygYFWlj5K+3ncQjFqls/73fnFieBZ3iYjNi8o6cdvH/GC1ZD+UE1Kdn2Rpw+hhpK+j3lkecDNg/TmH+bkGXUO4/n3YOeeaffv2ffT973//RwDwZgr+iHzbqx8wEeFxQD505ofu2nZbbz1/TiCgE/EVEwat/5hSO1P9HbHmsoANvfl1EITCkEER3CFYHkQhtYAOHQBC82G2H+WU95AZjIpd9Mw+fDa4otS5SSZQqpMpYfoQ583kLFGg0lKLpCbyQJTa+CWzpekTYAhwCf6asxnw2IMO514AmtYP6d861zQNB/w/mdK/2TKbpWO5I+BccEVIEfDafF+AnWtQcWam/ljPDcKkQ4q0J2KQfQZwns7wwQ2BKSdqhXaKyi/7GDqVp1gM/rFUGoOUM1X3U2ybBOiGsRS0xbpJUEOgK9ou+3DTKS2rSj+pQQiMRkVNsstTLOYpJWmFHQebhrJkbnxHMAOn78edpa40j7phfvTcuHTfjawfdZOASQ0Z6zpmvLRrzaA5ZLiWVK8gk3LTNqCXvP1kOtZTi2W0LcqEyu/uJBPU9LizdVEczjJ+h2vxPVzjt+WNTkLAIrFB5q4Ufjf7Ou9nGKFL+zv6Eam5cBapIcyhTkNKoJJbwVntcrrcN+8yfudJEKi3MM2uKMail4Hr0PoGtz3dohlQOXrov4Wsr6/jy7/8y/9V13Xc3Ny8KYMI96wAeBJHGhCC80//N/sPu8OLnUVHBr1eUmuXadky4aLwZyvPS0SZWUMvxNpxh0aPNvasTm/Gkdy+0ShS0BSjmq+d5gulnfWDrJzEUqvMDmKya+CAxOOfK8ZeZvkYy0NZy9KS4G1itpVBePcLh8/+nge6xuiH1tfXn/4zf+bP/DYA3HPPPZMAqMtOz1NHAegHgcf3wiARzYmkwLE3L6Yc1eFvSZiaDHW1D6dEf9LYJv3QXqirMtiQQ53QnlfPZuZGRZuKdvgJ/dZ9grrGzJTkwPSsHjfCtYRz6YZ+hnYcBXRIdBD6on13JY3bUdEObebzqMaNNOe2j8NcOmR0Au3wcfdpLtzAc2gaqM4l1BjJYJ6u8VsfRMt+umwNAel3M+7++K6uw/RT94+Vvqc2GdvsDzeiBFsJ4qlZ54i8qfE7tRnHo/jN3fgd+ZD6UYzP5fyGmsfwnDc0tEk052GoF/pZ4zec3WNhHrSvu57LeNCpzg/UOyTbd4P53fQ79NGlPUUJ88vRNanfQ/kaouJh5Ddg9zEBuvQeaIQQB8zPEPufc1i0HZx0vXbJsRHhU29605v+CQA5efLkTWkD3rMm4KfQa3W28ew3rbMTuEE3LzQimGRBByKlACOwTinMTatIvmzUAQuwnkOSt1m1R9nIXBuYkk4/CpRlEHxkJCrYmnlDp0wUcBDpWPpASmY6jt5ZyulEK1QjVmDyJMkMOCFQSuyJWDKhmjUfc0Hpg6WdpzNtixOcfdHhsc8STRONgb5t2+bgwYOffOtb3/ocAHf8+PFJABwxCTlJPmeFJ6rKvRyCnbSvDsTD0UXzrgy8dzHyXcxadtR+q3441FO5ZvQva8R6oW+iroV94eNa1OtOG7ATHafWLxIdh4wOjINaOCA5l2gnC3Dy9+j9ae24Q5/K8Qzjju6vqU1iBdoRRFQfunwP6uNgnPfdIN6mOR/44Cq0izlPU5HzMLmABAFRz7lkkfuw/Kb2zc7mR2p8KNeP5ndYf6LWbuhjyYdl/MbonJu1G9yBRKLZV7+tY4bM4QUmgTdxXuycl7RhfLshAhcYBk2bMfmA4bdxs/HRPK1pO2UVK/ngi/mxc+Z7d6rM4uRCUB7CvIV9J+o9gPH97ZCtaf2+UPshzlnyd8/XZLzmxKxf7R4Y1BxCYv/zArcNSOsCb7qmbduNjX3/+s/+2T/7xObmZkvypnQh2rMC4AM4ISLC//TUu75xe2uHFNIKMxJ9ExLwcjAzeuukG+EflHglwSGVRlNYRM5JeqnpzZf8+XT4fxlNlvqmTBcVz40QuUjVTnrRqCe8ZB+hdN97GHNPbu7VPjzipXCa1sEgNvgjEyKZtHbRZ08QhViSMRWdFQaT83MehZ1D9ngPzNeBxz4DPPcFh2bev+96s/AMs9nsZwfVvZv8/0oFILVZdld/C0QnpyjCi/SSRGbkKg151nWHZKH/1SbZXa9JzcyjtzIL/b0+dJS0UdDBsv5o/zgVZFH1YxRWxs0KbaxO21mjTu+w7qz1u2pSrIxbkt+npcMicIHGmS4zsS3jd0XfX/KmPj+ozHmKppVomxGW3mPJjI2qpUGPEUvXJEb4wJIPlWihFJjAuu0jtql4x8oeq9LWz5Z8MOsvCD+8xH0X56zCJ+VeZc3TWTu77HlUeDNej4MPcz4Xdn6q+7tXgGLBBeaLGQ48M4e4BC/mvef6+rp/zWu+4ucB8GZ2IdqTJuBjcswdJ/xvPvuX7vFu8aYL53v8vxxAOUEs5MDDNmo/Zs9QaeFEaQylACFWP1T+g8ZXMM9BLIUpWvsLakFMTN7h5ENH2FD2KIzpPqrTpBYMdQ7jPNhCC8FizL00YyVtJJcUWTr02AGg9KPsaftMg2l9AlU2ONVWxi8RuMbhkU8Q22cbsGnAPu8y5/P5zqte9aoPY/L/q5YZgk+b4mdtUeX6Zqm4SCgGpe0nJURDDsqOfP3lsCL2edELYRSug8ldwSwcqcB46P5ka1EyuKZiLkqg9DTG7JF8LkTT0RvY+r/qZ3JADhnjjYEIyd57GW8iBIcSqCTHrjFrouQ3zLjr/M438FjfS9ccxYcalBDs+2msP+UaqfEbBb8FGdyK2DSdK40ly2tuxiB2jsz0LqFjX4SZIqKyR5D5tJffnxx+qbbHiui9DBKG2biVDnKED1XolxL/x/Ih23c17YDU5qfyjIgAjcP+54H27KxPH9orJwRAc+jQoSf//t//+78KAPfff/9NiyCxJwXAIzjpAHDBR4/cdrtvIFwApIuOpIMzK110to4Ox2yGH3WKpI0+TOnblJO6SumWO8wGJ/aIIWj+ZTJbCpPzd/XH2WcHNX6vsfRDf5o4riBQWZpBq+Z6kIGgAVVjCeJbSMEGJId0bdKxbev5SH4XgLf4iDr0n4RI4EED6/gPxR87JxBk2IraB613xncEsOPw8CcH4AcReDhP0s3n8y/dd999HwWAEydOTPAvVQkwM9VRh4dmGgXW/TYlR1av7J9oGtb8VScQ1jzhNQRNjGJl9EMz15A0gqIc2hF9RQXWBxXmmtYo2RSOWsOfaTGE2RgxrmXU9ahdOlIYbwyUr7VZ0XaWLiwwfNBxsMv4wIwPFqIJxnle1PPQsCSCci6orhk+ZH2XbL1E4X0JH5iFueS0pXx/27XGcT5QivVHsx9Y1awal4mC31ldKhebyn7ou+fMeMzaRQYvlmsTd9l3mg+MUVZ63K7cd7D7Tr2Mk4bTjLvkNwvaNOD/VOPRdIwmcWzfmYh1iz1jfMezfdWA2PfcDI1PTjAi0q2treG22277aZJnNzc3G9YgQiYB8PqVp3BKAMhWd+abdxYLiPTqDK/z4qqcuV5S4EDS1mnXZdq4WiG8JLNryLcbc+qG/LlDHS+w7Zjns1y86IWiMqcvYt0wjtCWNgEnzSYSjdgvZ57zSrvp1cHNS/JR9EMf479Ife//dWr8UP+KmZuyL+l3r+c9/gS6CdtPFICpj+ODyXks6CDSgTPiuWdaPPYZYj4PyV/Et02L22+//TebptkZ0r9NGsCizKOze/h4hXhMHZGZe3cabC0CTpmFieFvl32byMFfyVrcbFRjcFpn8V3TwOzhunOlaSu4wBkTqDpIadoFneiAL2bsgY45IDLDWUMWTan7nc1F79yfxWTq/mSHJz23SUgrabvc3OpYGSNjQELOBy7hA+ENQD6W8KGGNW/orMoH2lCwnA9JgLJzARU5bsL0Kuuq5IOka9TA/5oPUuWDPvzntPM5xwi/LW0VHOEqa4CWtmONDzRjrO07jPG7su+kxm+p8zvML3bjN+y+Q43f2nGPFT5UMA8tXSkg3ggADbF2vsH6c4C4pCz03jfOuRdf+tKX/iMAOHLkyE2tQNh7PoAiPAr6jz1x7MAXu5Nv9xc8IKR0FgQ16jd8AjLVTumMAQ7pd2W0TC8aDaqsXMtzuCOP3olZn6j84KPQn2pd8tlDBski2Vsrg2OJJzCv/P/Mq0+KIItkPQlIfYRG7xOFdxV+9xSreTEjtSCwXiRlGUA252FcA22jUdCP+PTiDpiLXqwOI4J4h5OiNPDi0DQeX/q8wwtPAfO2D4Tp/A72bezDS1/60g9676f0b6NlW38e02pTKD0BPBhS8UktE1dYs1FhbLVWJO2NkUPsVbf8spRhS+hYp3KWVmyg0JgZ5OporrVea5mzgglGKbIgVvuqAjnE7vOaNb7+exmwVkvgUeNDroAz6S+lMjtizcAlKimrvMv7k2fMlFE+ZPwuLIs1PpR+w2N8KICbRZm4oRLBShG6p54XWLjzCsh/rU9SgkabQBthZSGN8ZNL+VCxqCrT6th+oHoNjCMMal/3Gn8NH7n6vpMRfqPgQ77vaDZDDWEyaIODBnXjGYfZVgs2BMQDdF3btu0dd9zx63/n7/ydJx988MHm+PHj3c38pt9zAuBR3OtIdL/+xCOvbWby5dtbC3Gc5dilxvU0AF8aBP2oj7MRiwCK6DBIgDpKUXr2VUiTQcHsb6k4KINL/9TnrhhVpcCVWXt1stxlrKJ7jr9VqI53IeLXbCqRuhOwEZEFJsdcOC1L7W3D9AKOUc4V5FhRphwCkAVa1+LRB4DFNrB2gEAHobBpZ+35N7/5zb8Q5fKpVDWA+tMWWewzJ/ElH58MW/WK5AvlyOehlrvzclq+uBpcoZ8Xm92VdUHriszblW6hBo+lv9ZXtt8XM5vc5Rp3fXYXPlTAuOvvVl7C7KoDQBGowCwP5pVeBdzlutT5MCLl77Z3Vn2PXMrq4Uj/jOldGKPlPXv0OHbAvmfZx04P3yXfdZyvr8vLXvaynyYpm5ubN70CYc+ZgH8ATxIAzuOFd2zctiMQ6QSeoB/8msRo8sQJhL4P1lBmWCiYGC8eogLbjal1mMXoNB2fse0pHwL1rLpPD8Hwwx7EIt1X9wBlkgZQ9KnSNpQ5GW440HpFE+X4wrUwN/TRz0enbotmbN2HYEKmMwCodo51fanQlwHIdgikgZ3foq+RLuDYYus88fCnBS3b0L5v2pYi8hvf9V3f9fCxY8fclP5tyeuTNJjDDfoUadH8CZSmOFic4oRZNsDEDC97g+QoYmBy44+U7QSAb4MjWKlXpVM8vyqdjN6SH528tUD3rLSZ0wHKuaheExmhvxqdkAFjNzraxF/WHZsXWcqf/Ah7cXyQyvjqvALqfKivgVX4UNICpd7vK8kH1uZLRq4vm7fKWl1hTdv5UV8UGdkfUlk/l7jvsIS/u83jMj4Y/PHhZBtxAT3BxmPjjMPamVahYdADaPbv3//kD/7gD/4bADx16lR3s7/n95wA+NSJUyIi9P7ct+4sFiRahk9TH1yaLaMgwZksFEOyZ0nLhWhGltDgfCopiMPC+vshqjWheSWTUf2e+LB5PIJ51i5rr6KW3Mjy7qNpRXzEg0r4e3ZsOhNH/68eg1N1mV0T1X9X6WOHYOINvoJhw+no4jwbSKQX2/YrvKZ6hyrxAjdf4PknGjz9UINmlgLS2rbFwYMHf9V7z5MnT+5ZEPTLLjvbPW+z5Y0mOK25ZBEb8tuGOl5/uaKE6AA3POM4+GprpNbhXnBEV/WMQ7lzpXO8TjhAiwQrQ4YO/fxKdJqcjv0Sm+AFdS359Tk7xt5xqbhGl/qQ6Ns+skbHZZK39ttyqe2UiCGn3bcRYaz0eNS4AzZozk8Wc5H3Q40j5zdTlpIw7lgPei4GPgzXEr9dnQ/ZGghBDOWcu2zO1RrI+ICMt/2BNrvmSj4Efufzw2xNSuCDmnMOYwzuOdp/VGp8UG1rfuv7Ut0PrPOB5X7QTqTlvmO2zu0aCDxbdd+Fe2ncCeaGeo9k/aE+kea8Bcy7LIsaVHPRgK4Hv97/ZItm4aKE5L33a2tr2Ldv309/2Zd92YUh84dMAuANVI4dO+buvRfdJ07/3Zd0svPfnjvnIeKcQW7QyAMCE/jhPUwgA5DnntXPZ38Pdb2XDN4lQaHkCAlj9/T9FFRhAx5SHanczyBisnHZPsjIWGtQNSiupf5XgjhCoIcf/BN9mHMdCDKKHGECacoxjozZE27m8MXPOJx9doF25iJ2U9M08vKXv3xK/7ZbmSUTL0E4YQD7tydnsSd6iA0WccPzDLA84b6k07mTPuF91AgM9XJtgWlb+Sq5/mlzzWgZZGgzJJ2TpG3oacPQTs8w0u3HPTioSwJ47jOEUOeWT4Eypo/lNepxh/EJrXZE0e6zISSVvwuUFG19LfHHtploWy2JC8+LnW+n8xyJosM0P4k2jGNfPu6CDz7jg+GZmgefjbugjQhyjFy7lPXHZeuCQ3ovTS+s076tnN8o+SA1PlgTTR8/u5zfGNafk7zvqKzfbD9k/NZzYfgges5d5AOr+yGfc6r+OAVMPkZbLF+HivV9p3jg9b4bBD3ddzWXhrbarwzzq+d4uBYiHU2ubJEeKcJ1mJ+bY+MZ5k6nbjabXXjDG97wsyTlZg/+CGVP+QC+8b6PE8eBZ8998s2z/Rf2b1/w3vXY6SuavaZv/9UowhF3mqt0pGE3x0OfALrFLGhzBUAzn8+f/bZv+7aPvP/975/gX5bKf/OUKsrBgqAPv7sgrFOMD0+Ec2DylRXtCDAIGykV44DgHx23E9A6Bw/5PpkD0zXokCudnSTLzzOYY9MbINFxyrfXBXqOMZMCnKaT+hZacjFDgsR5aGAd+6mhdCKW25BJIvZnmBOXB4/pQC6dpUAGrYYMfbCmTkTznPTgtUiQToCg0bSDudqFYDcZFGwqb7eoDBtuGLcgRk6mrC995ot0T/lOD9YCmnEzZawY6jVhfWl+h75Fq43PIp1z2Ko8R5OtV+f3oFWNfuD9ePVcJNrJ/86puY97QXuNZ/zCIFz2a8XyDhGgeMjk4VTbaq4kC+9J+8AisGracV1Jvv58mgsFd9SETCcuHfATv6my/JShJXrfpT0kxf5LGUdEtRmAm9W1wK+BklPZcnS/4vwGT4zAT4RgtfROspmtwsZycB7YdsTacy2abdfna+7Xgp/NZs36+vqHf/RHf/SjR48evemDP/akAHgnThAAFs2L9872dcR514HeXQk36KncDJJmb3678CLwhU95uGYOQQeAvmmaZmNj47++853vfH7y/9utbPcv8maAbREXMR2o4y5E571n5hSfPqjMYiVFJaM3aZh6Z9osYUL+0dPXqES09DGPGoP4QdVZQgjtRJ+yF+jgLZhB5rlD9McEwuGDKtAZq5xzJnAMwuEDroTbSq5wZrQBmzUhx09zcCbjEIVKoAvNJAHH8Mc49Ts71oAkEKywik4QDKhRElwSrBMfBuFPZ16I99SpkImXDlqoKMeoMz9IFnzCLCCFQpO9KGr0DL/LKF2gFiCn+eCS4MjgAEODiJCEFYnvJZgsFJV1VaEXER1cfS5EXdOBKyFdXWAitYBpECvqa63O78AuqnVBi8un913c8gpnb4gIM9lJzKGBRrjFkv3gAtqERs8I+LfmYEi15sRmeQn4uyC61sNJgwNPAx4NGp3qzzncfvvtP7nX3vR7ygR8EvAfk4/Nt/zpt29d2IETTH5et5b8h3bu8fQXiee+6DGfDxAd3kvbtmia5gRJmfz/VtCGBwiFoEDNo7TFoBLltvshN3CfOzQFD6lPnc6oMwhI4gfNhTJpRdO+um6zQOhrSQOm+9J/+IvUPsqklTJtUKy5KSXNYTbOZKKzWQpor+X1fKCtaAyAloa2z57PsgXRZDWBGU9PB4kO8n4zo53McJE2rBlQsvkuadf4kGXokPyaxHrBTcCLnouRMQrKDB01fuV8yDOGRN8YZBk4Km7TtfUHRL9mnRGEek36kfWXrfPaddmVD7R04lqjyTZS7AfNa7XW9LU6b5HRZrkuNB2fz7kkATJoxYcAQFbmoVirer68gjuTBP4thqfJPB/oUaFvSBh3PM0S+063WH/eDVpoCZJks7a29vjm5ua/A8CbOfPHnhUARYTHCX/hsX/5MnDrjVtb0IkWp7LnRb/+Zexa4uFPAFtnZnBNAJoWN5vNdr7sy77sN4CbH7zz2giACcBW61esv1smDJr0ZCqTjmS+SMZPTYZYH4m+20AeRZw0j+H5CBwcff5ozG9UHwVW9ES5IEudXyHLjFNGKNoMBPZarT+KdpY1hZUsBCmegGXu1KBRLcZtUc2s5hUmM1E+xlR8BD3uabioHdFtciRauaQtlQhbWH+xJMEXEa5mLg0fNP0MsFmvgbiGa36rkq1pViJQ9ZiZrUun5iLjt6g5dyzy3WZ5REZoUwFN63o6A4pX/YzQ/YqPUNdyPqhrBhs3aInFgI3lbgaJjhRtKnUrYDApeiSBlOqR0R8w36FppQEarjrNQbmf7ZPNIKAyCsrJ1Jw0uX1fusFXULDvaQDdDKQPSmzftq3ceeed/+G7vuu7bvrMH3nZMybgkzjSAFicnz329n0H/OzMGVmQrp0+5beS0OLhFw6PflKG7C4e8BA659q2fezv/t2/+8Df+3t/D8ePH58CQJaUDcyjQSvmgKX6RNRSwSozqygU32gmjKmeEhQTaUHFY+7W8FdM/+WT4DAc34N2JApHtDlFtdlZX5MBUTrk6I6fZZ13O6SwyvISJ+HJG6Dbkk78clozpZK1fBhT8kKPRqtkLivpiM/nz/YxVc7ym7LUIsYcrcpHK2UK88mqFuj47BrFgnVj8LfyXh/LjFAkBRhbGLfVnKUscOUYaRCUJQkJhMoPK4kPPmlgo0lY51zWALGQCnqrFAeIOGt6fgBjjg+0ZQQnUfqb0W9A59mNcp/XdFSbBluzAngceYvkFgEL3B6irk1u4iHYI+aWD84WTu1NsRiuGp9VqNO6MeLTJlDmZIaN9SKiBKL7gsQXzBAtPBwQPK1jhmSmZNEZzKndP6iyXmm82j4QxhNwWw32PdNAmm5YY4103U6ztr4uL3/5y/9HANhrwYN7zhR2vnv6CJqOCadiKreEvkqAZgacecbhC59yffq3XvDo2rbF4cOHf+O+++7b3tzcbDGlf1tlSs3HT0TCd32ZFj772ME8n17sgxDkfSUJ/C7t1RK3Q4rrS6+hTDQfKdHSkQrt6rUs4fyyvtcS369MB8ufHZ2jsWsJCkEFOyAC4wp7OKdgyg+q1Zg6MtPDR/GLSSDxwzdeWVPhJSCbpk9RAArw0MhaMuCiJloexkI+9EcqOKh9CsjU5oApOqTT9IPTZoBiiXBHQ8rCHiMWCVpkuO6He+Fa7GcI323s9ZTTj6kPHJ5vQr9SnVhvwKnt67HvDwDvBNJ4eCfwzqNz4ff+ujgP7zp45/tnmp5eF+o2Hr4Z2mAHcX746el55027oZ7X9RqBxDp9ez7Qjm2GepLqOd9fazr4poNvPaTxQOPBVgDXX5fGQ9rhuvNgE57r+y+NhzQdJDzvhrrhXjvUb/s+oUk//b2u70OYu/kO1l5osH6m6dsCQRFxjeNtt932qb/9t//2RwG4vRY8uJc0gP5jH3vv/FH5yXds7yyQsj5OZe+X/mvQNA2eeHiOF5/2aFtCPAEsMJsdwB133HHy+PHjfnNzc1oXq8qAHAIcRCmWOJ6WzSab0RGaWX1mmi6lnQnO4JXENUqbCNMnyXKIkdwltVT972XXTaIZc02naJM++EMFaqS0jBntFJ+yAh+SxkdrxnKBrrymoynrfIpa0UEIa6RRGhSl3o0qxDL8AuhSgE2oGzU7Ov2SVLdu/5g2vHoTdKSDDPTBnoNQB6mkAhQVrAHbdArgaQdSGot1PK3g8ntj9d3Ic7vRcUva6mHZ2fleVgGySPXxrhv9uBS57FL6OaP1rLQVfqXdMxRUNd55qjzvLVyT5Lm7tZIaI/fybo1lKcoQKJidWjoSjg4HH2vQOQ+GPeAXsra+D6985Sv/Jcmdzc3N9tSpU4tJALzRPv8Cksf9H37m/3V3051/w855k3RtKnte/Bs++I3HFz7ZYeeCQ7vfAdLBezYkLrzyla/8BaD3/zt16tQ0aUvKzs724IM0QE8M5tIgWEUfMQ0NMwgajuqrroQ7Z/I8q1c6E7QMzWe4F6bCR0rXCcF+0cdQZaSP1jdnNV2IOH5JGxj9h3SaV4jyN4OinepSC6xmHgbfKacEJ5U/O1nm0vzRBEyKilYerkjwQxuiJ5mc3/Mxltd01oq8Xspl7AB0DbD+jODwZznAx+iI3d60a4N4RJnomyJHOE0EbIp+DqbIwtAaokOBwrSagb2o9rVowTIHsSjcj8JxlWiCGtHPVT5xXqbAdy2+OmrOkA5kVrBHvqEu/xR0KSPO8tuHIBB6tSt0mk8mSS6+MkTBCxQHPylzyGtpVFg7bQz7bnATAoFujsYH6JceeGfhpdm3b9/OW97ylv9lr3479oQAePLkZgOcWpzeevDt+273a6dPY0Fi8v+7ZSTAHu1x54LHQw8ImrbpN7bAk3T79+9/8Id+6Iee+OEf/uEJ/mWVMpuDO0lgiJArIiYfNCSHKck+CsY8qVHKlDZPaPy3knAGo3KjFtAi+IQWEGiQBEXqAR+x+1ro0r5JmSCoA1yir5nxgRR1jZnQpq5FrR9tfvE8X66mE4WwJAQl7WuiYw/DNqe58ZHLvpACC7jRbAPtCw4N20IK6DMK5eAoAbClMVrNlYSIqpq1oiqt3DNuX5IL0cYFDjnwSSZCWa2X8uHM5SV7LddE2wCcmsY1rA8xurC6nlyySWKe+peah3pkLKX/qlZTxnR7dZHOtDWmDtztnowKkLnmUjLgqN30saK1g2NdR6aMRu5HKcgATbv5fN4ePHjw5777u7/7se/5nu/ZM9h/e04ATCrgxR/ybgr7vdUK0aGZCZ7/0jqefpRompBGjn42m7n9+/d/iOT2oMKfBMAVdRnpBcnyYxU/xNbOox3ZpfYt0J839eFlrsLIKFrA2SyAA5IFXFj9kAbKjfAgyDH3chG1IlRAazMy5YaqySzfOKlNorD4gDpwRvdGUAgLkJBYMdN55fZu0cIRi/GUok3Kve0cAecH3zwHDGEMFGfyj0dNDRkhTnR6rqiJchLNu7Qjr9xLGiFtFjaQybQrgUFTGtwHRN1zmoc+jVmBlffrqEsKabLwa8ynTpbIqZdyTVbYi8vqeWRCjo3pKCXYfE2vogVcJtznMuaytpRbgd5/fgCFuR7KA73J3LDUFouFP3jwYPOa17zmX5KUo0eP4sSJE3vuPX/TC4D9OjrVPfLIh/d9wv+1P7p1fgGIc+Dk53+riH8iHm3b4tHPCs48A6yv9QChXddh//79eNWrXnUKAI4cOYLJ/LuCAhAhnWnKT+rFw/XgWOnbL8kkKQq2JPq+MXPgEaWL0n8zCUK0KNAKXJpWmzIIHgEWQ4ac3sxNgkxCH43MxQwgWgPvMmYhCVGRVuPkVHYUJguVKJBiwmhHnc7nGzNsDFPgEm2nhCf9O6PsohwCkcCtCUsPRjhnFIjSuHuzbtKcuAEzTfFYPEg6xwqalpZKndXGyRCCkfqhhdvcb1FGxHB7D9kBoPIWqD5jga8VFSZIFgwazDy6XHaRysjlCs6asKWtlrV7qypNqaNd1UEnP3nJCoLlNX5dRw28KN/ZdjZD0zRLtIlXqTscRE8FsyQimM/nmM/nn//v/rv/7pf/5t/8m+7EiRPdXnzX7wUNIEn4X/nS//LaZr591/a29z3s+lRuGV0VHUQcHvlUB+k2grlCADRN05x905ve9GvqsDyV1d/TSUOnTZ9h2tUX1pkPis8CEpR4Qg0eq1666uMdzWrGIoPC2hTFDFGaIOtGVDUz5kpGpviG5Js3EBWxwk3SGvXaK+1/uNuEMvs+G9cmhVOmhc3QQatt1EKclRxqwSrI/StNUElFVUtCOo/ZfI7ZbPboYtG9CAgD/pkBpCaLoJemadA2LWRkUmphJOPTxotox2aLkMJoazPLiFlcgO86rO9bx2y+hl1D3t3428Q5B+93f9WsWm+3fjg4dF2HA/sPYGP/fnTd1Y9TcHDwF/k6rT1DUtq25ZkzZz5z/vz5T5KkiFxX7Y2I+KZp3OHDh3+V5GLIHLUn3/M3vQB48uSmA0554KnvmO3H7PyzzYJ9HhuFC6VSTmknax3cZrQLWYVMda3f5vEjkDuxUjkhxy8njW9KPTww81sASsyxoY897bzz6uuncnLWVPlSfFh1fZPXq3J2ZNZOhRbsvF0UHwwdddymNd71tzqce7HFY59o0TQDDITv8zfOZrOPvOc973loL+VvvCYvweg0L4DCIRPQ5A7NDVQJSiRhrjHireVrmUNgZua8Qw1GQpu1Sa+LgA+mgk8LvyzjEFYJH6btfYK/0Y0mrDKLb+jthpWKFAYb/CKGdvIZtInI9TUxmh69D8RIs3kIDYyKSvKMsWH+lfsiJco1HoTb2Nj40i/8wi+80Tl35mJP5DdrcXRLNXs1wfdqHcAutvWgrb8ZNTjb29u4znLfaNnLfuM3vQD41FN3iYg0v/Slb/lGt7MA4CkyhP/79DHxOh1TNNcMWQiyb5kotFujlVDepsYZW7fhByFl+JeSvZbF+g7lclZoq+Z6Mfhh938P7Yf6FIWxRh0dJnXn98xPKPVNFKpCmkNjtsji/Qe8UiCjFeaDKml4zCyWf7gyPkimaop+RoY3gHiimROPP0w8+8ga2rmHeAFJaZoGL3vZyz7ovceTTz45+YZe5AeIKmdv9JEZNG9kVREbtVmOTm+mlIA+RPBCad0GuBAaQF6vAinSHgiZPmOe0yFLCFXuUyqzX1yrIQ9oiGRGnzDemIVjJGoCuo2CGFN2hkDHZRpMfarTUc/JzYh2ctU1oQ7VUIJZLYLYJbw+Uo+bpVbOJY4KtF8gbfDM4Cso8RDm0HWLraZtz0ge6bC7BuWmXfd+MhJcN9n7RoPouuuuu2Svmn73hADYKyJOdJ9++mduE2z/wQvnduB7zyXokH9RmQJyTZtWL9RQ+427N0utnNFyaTrqy1KAteYHd6OBsIJR8ZzWBEBKpRvtA7Jrv423zlCfJbATkRtOVJs6oq6UJGS0P6wGqS3vox2zh8d81uKxB4GtcwvM9/UpgBaLBQ8ePIiXvvSlHwybeXrHXowmBDHZVc3QZvyxsigJKu/7pOlLApheK0Go8iEdWNDiDemsNMW0K3zvPxf9Ce1eiH5yEJBiENTSNcJFrLWYuDTTvItNvzVERDuGf6EOfylBmAyiRMDXa3RYSJwPRZu+snW0eJY0gT2sjA42ScJiysTih4OrDHR6Djrjm5hOoFErLzOlgXRwzrFbLFqSi2lHTOVqy95TgN51eM/f3N0/6gDgi9v/8R1rBxa3Sec6ugV11kMxYXrB6ZT9izurJ4XkwQygtJBo1DVmH6vQpi/a9J4jtPNoPltPp/wxYxIU9aoncV2PtXpZbq9iPFIIvCIo6NcUACIaeMKlej7PTpBS9kjRx6xPIZ1QRzzyAND5qKHxJBsAX3znO9/5G9hjCbyvftm2Ip6gCs4qRluslpBORF/sF0G+1L1KbWZJFVlmYyqqBBgjJbSGF+Rd9mLrBqFIslRf+bUgXIU29aHMVzxEvHqaMUOqvpbTRoW29Y5I1ySm1BIzA0nzVsxFhPGx2IdSObCJOkWOncemMpWpTBrAG6KcxJMDRNf2/x0zNPCy8HADBpz2E/MJs4vpRIyqoKI1Gg7RHyf65KjclNEXKnqHV3I0CmpYSUHoo8Jq8l7U3wreIqsnhk6KBsxpD9480aSThMrSVJvaZKmOK2iHcbv0zfcZZMgw54zzmATIFEGJjA9a4EM0EWraSSvZ9KbGxuPMcw2efJBoZxz6Qd+2rdu/f/9vfcu3fMsLR48ebUhO/n8rl/lgpUwmRQ1eYjSCWbSraKy74C7BiiO/AlQGmemhGTwHVaRmgv+I0bcQ43MY+0ED/NL/xkKtrGhpRLVcz53PgQ0kyFtNfq5etV9HoGOBx6fR3ZL0WdBjjW4OQEMVDEPjg1ngI2rYfJ0vd5L9pjKVSQN4IxYR8CROeRGZb+HMN2xd2IKQDjIbrJb6BeYGB1lnpZpC8Bg0frkQVLx0Y9LIKNyw8mmJUyx9PWYaMSvs0WjHWDmV274m2mVHmQQ5uij0smqqTbRp2mMFWDOnnQROFn1w2b+1cdv5yevZuACtuWwQMny2swZPPkI8/yTRNg0ERNd1mM1mcujQof8AYPL/u4TS88gPJlmJvrRu+N0xOZ1H5/OBPc5hwHKTiF4c0pxGH720PId6/Y8b6jvTbmrHqa3i6AZhz8c2aeoOOHVk1h5Uf0LfQj2nnnFxrIjjdurfvqFwLdEfspi4nLYboe0AOtNf0sUUtGAYn4v1GWlTtedj9haYue6zkzjqufaGRxIiuZXvYq9En8pUpjIJgDdgOU74D33yv1/rcPorFjvsz7HsEuBqLuBFW0nyGcpNr1YDtgTC00RcKUMMK8+SKrAhS3NTAcbVV5Mjfq5FKOnok7sM9ilZEROq8LMrsCQSdIcWpAukDw29YOZC+YSJUS3W0duzFA6iBMtgVh/8lPDFT3tcOCdwjQDihb1me/Gyl73s3wPAyZMnJ+3fxR+x4k/UYlNSVG91BWXPUxtxtXGz9pPWmE5zZfOAinFrsNpjRSNqmFMEbYBZsWtKoq4xXZGEZZj1O6ZA0ytSaTc17QBuLZVMHKJom76L1v2nuU86ztQjiNZe5gFmMspLC8AbxqXGRw2yPJ2bpjKVSQC8AcuJwf9v68DvftP6Bg76hXR9BLD+MCRTrY56FfjM508Gk2Wqa39E/SsxirVez1ee8ak7SPeTideb9qB8B3U/TR/h7Zhi3+xHL5lOK2PLxp3SPqXnU9qpcE2P0dJOfmH5T1Y38kXNhWhho5xzM0ZKn3+UwPaFBo884NC6GYQCwgmdw/r6+qfe8573PAHAkRMq+KWIfyFatI86Tdh4IVJWa/+MoMMSHy62ZUCdreY8avsgqj5Nm3RMgNPoo39N+6G/kg4hLh7WknBXasydCrhIkczhQBjNsM6pVGsJvNlpc7lYOjopnKNTx7fwjEvg04NImjSMqY9OHTojxI65BnPNzuHQE0erUVdth31IApiEv6lMZRIAb9Ry5+D/17Wn/7Cb+8Z7G+4qSC/TWo5FHfcgUgZQlNqJ9CKWAr+95ufHQvtooE0Gu0vqBgt9l9F2RABY3U8t9IV6VIEUqR+SaeKgtJHjQSYS27ReSkrzqVWAId2VuaaCOETUHOrw5UEPIyrasQhuUXMqTZ+AoPE4/TTx9MNE08Zk7r5pGtx2220f/v2///dv3WjQAjdD2T+foR1Q+WVI0sQoqFiwZC5RA0Zzq1H4WiEw5g8ZsmtEYYxW+Cs0UkwCJBWAcz1jhTKrKgHKKXOw1rZHkypUVpAg1FJSxG2WOixgyIV7Ahgalo4CkYaYa4l2Xq+fj2D2NUKvMkfnMJp50H141o4/MxXIdGaaylQmAfBG1E4IeASnOhFpOv/iN2xt7wDSOOtzVvrVpWAE6yNX1s196+rtpN9hhJkqfZZQMro97urX55De1g7aD0+/4U1QiumvVNpz42PJ6Y749dmgkxBgo55hSmietBkumxfWlyJddc5F+tRkzazB0w8BZ54hmhkBTyy6Hcznc9x5550fAPr0b1NZsdzX/3NotjGkLlPBASprRNTg5kh1OQKSyjMLis46q+CFVB2xrhFi4n8zEGPpo3BjVg74eKyI0IUmJYjapIU52B7kbOCWRAFWuQKa+nneYUHFlKvzGGf1YI5oZRx01aAr5ZjS+1EGfJrBXE9Rqfe0sdwbczvEmbE5N52dpjKVvVxu0ijgYySP+197/AfeyLl78/mz4kHvUPjb5PAvOSSLqMQAVBoIiRq3lDzAW82G9n/TWFxKK5aS3fuY3Nwk3mCXgJizdEo12ikG02cZD0J7pUauiECknYeowRDJEimFpr0dj+ioRZXaC75QA0ls0/peMQF/JH2qGncqXZawIQgjHeB7dLWHHwC6HQeuSeha2zTNi1/7tV/7gaGRCf7lIsvODAb4O/q5McuzqzkeQJmz8wND2K5OqoEsYpViTM0GAplBMJQsjUgeKVuKSVIR8tKWsT6pGiIFlLQndJQTezgYA19JQrzPNJ+pntlnZo+j9CUUUTsiz/oac/OqTIdMeInU+YuH58K7TRS+Zza/OmNL8vHkFP87lalMAuCNqqg46QD4s4vn3sED241c4IKAC5h96dCv4F9FC2T6m5CSyadsUTYHqBbm0mGbuVYy/hvSw8XvAmlgTaKpU1iYpfOMVTo3mlRom8xW3mZp8EqIDR9gH/APdUq4lKXeOt+riN3UN1otRICXUMJt6AvAKpiEZNrVhGOmfJlE3dPprIak9YTg/NkWX3oQaF3IctCnf2vb9re/8zu/81EAU/q3S5IAbYSvFkPGAgRclsotHiiC/BQzdRDaqy6sBy2aOK051MpFZpkvDLB45m9H5a4hLBw3tHZN+8hhgEx2ka7SQpIxi4nRcjpXQLrA0WpAMZiDM1B5DbWt55qZ64qD8gekxPQiJnNIANKGM+0FP8UyVj8J0jE1o0zgL1OZyq1Sbkod/5H+pcZtf/YIseg/JFQOLiZzgIJFUY7h2gQZfGCcS/d7OAv2eUWU/42NElYO5UzXnFM0lQ9S+n14UbvkyxNe4uZZ7fyewT5AOeE7l/oQf4fyE8r6oWEv9DX90dd0wgfVZXMYnPIB5aCv/bbiNd024pwywl5A9UH/PkRpUtKcsfdJc2vE808ATz1CtHM3CKuUtm3xkpe85IMigs3NzcmT/RILRZL/ZsVgWRMCI5CxiNHBsTh10cTgFgeBDCK5Dktc00IyPT0EGWEwh2ZZhY2WS5S2UKo9QBSkdDdYS2OjHREz37pEIxf0yiJGD8gsApiZYTlFC2tMxBhtzCKjMKrGZW1hF0HTTDAwU5nKJADeSEXAd/HUAkCzwAtfv3V+GyG7qI56Tb5Bya8n+C6pUFuI9ADM1YhWAzshMZuA9g/SUavQUbfmOK0jkaX4oPSQLXngh73mhzpeEshteM77sj85baWyU3TEZA/Qzwoq7QToHEU7mW3FtFntz/Cx9B6mDzY3MNJ4lE+lzkrhvUPTCr70GYdzZwDXDsm8vHdt2+Kuu+76AAC8973vnZQZl1Bms0F4p4Au+G8OploXhHEGodtG9RpBHiapcArsCHWTYB98BHNsQWphyQRUCBjx8dQBj/Wo4LyPyGkpDSMHzMN06CgxAkPEcg/hF3D1BlO1E3MwDJpDF+ZQj5kwh7xAxxyC6NWhCaoNqkPUYMlQ1+OchYBiF+hTmexp+ablw6lMZSqTAHgjlWM4RgD4wGN/4c3tOl6+fYHe+9aF036CDCHEh58g77leiGOCOoESFr1Hf7r2BLyD94D3qR0gtWf/ZZ9xY0gx1//r1O9DHemFH/G6b653ZtfXTN/Ts/2/g3lV1YN+frjmu2wOhCUd74Z0bFTjdCVt2GvwQ9Su1/OR6JV0hnGL4oVXcyV6fsJYk8yqeRr8tWQxwxc+0Qx2bhlkTXHz+fz8u971rt8FgAceeGASAC+h7Cj9eQBGTxG0KvhIaX9REQSRacvBTLtt1XcKiiXpx2A02MjuuaxdpZ0O2nNHGLx1JM261YZBBYcEAPVqnHMyF5PKD1f1JYuuD+nwRFknkolaawJ11LMOonKWctGvLKLazDfSPMJl8C/l8Azs5xQJPJWpTALgjVSO9P5/OOcf+2PzfZyLeE92CdJV1EtQ9DBdehkOgl4vN6SXrM1bOjiFS/Z2FA0q7cyLPtLKgY6zF3QO0VKYgYTmo2Rf9MwiG7OP7NBHVmk7oKCtfIkkMwsFP7wMq7cO0eKSeTj7YMVxe63VU35HQx2fw9KIGwTDnn+9AEiwIc6dcXjsMx3ath20ouLbtsWBAwf+07d+67c+BcAdP358CgC5ZEW7JLEmapCDInDQ1olXIMIaLLmX3OlFgf74oX6/CJxK8xb2Wd+GV+DMMtT3eUbs/l7sx1BP/Zv6EgKoRP140xbhw0Ct2drnNH3URffjGfovSqwSUdHIehxM9QHAp3rCIVJ3GCskzQHz6GMVFJV+vBkf4hh9imCOMTyi6kMZpcXgICZBcypTmcokAN4wAuARDzh0cvYdOzvn4dBS6JHsHNYZvX+tKiiEiDdHJfwNWivBCI6YaoxSOTmv6DktFtailPByLDxkWhSxfTDPK4GRUtFwhC94oKNhL1BoRUTC6gjP5b6OQB0nUUZ9jSLArORTYvvnmXK3qhSl/adLHJoZ8dQXO7zwhEPTNoP2VmQ+n2NjY+OXScqE/3fpZRbW6OCD6QahIf7L9LdT9/tr4adPG+cy4aSv70174Xct/DnTPgwt/XcSdAI92HZVH/p7PvYh/E6VTg5U46DP+tqnorMCV96XUM+bsUXdKUX1K5ixh7qEmmsfQZWCEIyBHyja1nNrf9ftmXEYOkO7YoXASQCcylT2drm5ooAFJI/7Tz/9L2/75Pl/+pbFhQ6+cy7AxYlkwpgohZ1YjZqIThivBbAc5DkIKF7BkShhJ6adgolWZU34klxmVL5uCr1VRwPra5YOLe0InizVVGqopGwLZlaybu7pzb+5oCcV2kxu6nmaZXXN6JfUXEbfTT2M2EgShEPmEOeIxz4xw9Y5wb79HuKdAF1DUl7zmtd8EACOHDniT506Ne3wyyoB3ojZoaXXl4sBDUqZNmrhBkGgSFAnQB4P7iIYtOlBZZ9qDTYMyHQGZBSrsgJknmBQcl21hj1XeJc6s0kFuN1lwPOkHkMt5aNCN4x9cMrjVfUlBrgww1nsY5Yle6acw/LQafKR5O+RqUxlKpMG8EYq9w/p3z5/7pe/ul2Tly52Oh/8t1NQgoJKYS6s+RTEIRhMh7tLnQJv2lPJ1oygJVICxJgUa1r4MrmCtUBocwVL9jFJr28Lf6Hh/7TWzIT2sbxmFXJ5llAbO2jQycy4fW5ZLgJe8musaEbNjYw30SRJQbdo8YVPeTg2g8JTfNM0JPnR1772tf8Vk/n38kU/V0aJStAWixXxdGCUjOQJ1vtDauBAIz5nIljSYnmoqWzfyr0shlZK0cnANmc5iNM4w7tB1KFHqm8QCxxdEQpRez4cUhHxN82wqXMQr/YmkyqIlTqmSsmvqUxlKpMG8LqXO/EkRYT/7tHv+NZ2raOcb7oeskud16leXpkwoTHskjynXr0sX775Kd/g9iEDp2V+DVGDEl/g1P56kmD+iFFNh0hp0g10hIOas3A9TOmoEh0Ofk6012CvOZa0Rc2xSJ7ywSkBNKg9UpspElRdS2qVhBGnP4pkJmQMOUYc8eIzgscfIdq2t3Z7EA0pX/ZlX/bovffe2wGY8CsuX/dnonkTiDEUNqUU4guzNayBxi3AZaYRjJHFYrRoOg1cIZDofpjtWj5fF3cyjVwASCftQcXlKRLLNqABlZGDZecg78pHkUQzaO1d1l9qrTcz6wOzgyGtTpHo46NIjPRX5V/2fYRwIzJgCPZ9njKBTGUqkwbwhvkmvQunOrKVne78H93avgCSFBX5C+3XpqBXIniLJE1Dii716u+Us9ZAwkgFJmZ4MUdqsR0FlSIDdIzKvJHqJa2ZeNsmcjpAvT8I0cy+gK/xXtFhRtsr2ll/CKCr0tY0LExO1KwSdm7Eq7nwaQxImQ0iDI9pz+g5E098A86BJx6a4dzjLZo2AFTvYG1tjbfddtvPAcCxY8cmG9blbjay+FdjP+bYjhpvsgSRRgb/YqFYQGSwKSUcTNGHvB+O1f7Uf0oIGNu3PJIZGUZlwNJ0to/FPNhnqmMYrjmXj0Hhb7oMRieDpqn1IWCC7jYnUZ7MTONGMJ7KVKYyCYDXsxw7dowg5De/8CNf5mYXXnPhvIj33kVtXzDI+AGjTgHHidg60dyk/QEjPiAGgcojQctkptz4q70Wc6VK8u2LTRd1k2bRNiVGYJWCToZlCO37KEZzUQrGufpEm8wxMj/qWUFhDtN91P/mc6EFWOMTGZ7RJvyIzajMb0IIFmjh8IVPePjFDtB4CJ2ArhGRM4cPH/6PAHDfffdN2T8us8iUD+KmmKMr2wfJTwETk6cylUkAvP7ljfd9nADw7OIzX9dsbB1E13jSEaJxsXosMYNCyyzzRzzxYggs6J8RBlwxNyRFd/31IRYvYaAFGi7+3behaEPTdqZ/kEqKLaJvT48Dup6mY8cXaMcoaNhx6+cttpjKApKBStixJNoJ0HewsEpOA9BZQmDmbKQ/ETeNtp6Bo+it/M4BW+cdHv8MADcHpAGk841rsb4+/92//tf/+pcAOJKT9HJFtIAVoWAqe5njQDV541SmMpVJALyO5U48SQA4353+ZjjfJ3iSkBki5eDVCjJ9X2urovnUq8wUsa4yUaowAvNsZhYO91NGEWZ1EYGYfdbfAD6tn41AytlYEp0yX3FPh9l8lD9egS+X9Vh/NuT1Ldopn6/dD7/7vI4keBcACjAaEdMx/N11gHMNnnt6jqe/AMxmIf0VpWmcbGwc+CAATPAvV0r4kykY9BYS+6BzlLN/F7VTKripTGVPl5smCORdPLWQX5H2X7s/9N9snd+mSK/+kxjh22srGNH1B+EoM9GyyFnvB+FDlFZNpyLTju01M6p5jRpTsYWTsU7yuj/hxZv7vsGkUctczr1U8jZpX8MahAtUH3W9jI4hJGGiCg2BDOC2MqI1MOMRixHIjG8a31B03jcGAGkPtsDjn17g3PMt1taCYNi5ffs2+IpXvOIUANx1112T+uJKlQkR5JZhMwqYqalMZSp7vdwU2pL77z/aAMB/et333cOZvHHngvfRLmgEMEb8OFFZMaIYxzyfgPo9pJVSbaXIXCDH3o/vSRp8FVNXikTwNCAMqT9WYGR2zdIfrrGko9surzG7D/Xs2H1kDuIKlmKo5c21IECjnMscbzGfU7IiTNu0Wl7W8MVPC2ThoqxO0s1m7Qvf9E3f9Hv9Wrl/gn+ZylQutjAF609C/1SmcmuUm0IDeOfR3vy7tXX6HbPbFzy3zY6A80aOlUxtoYMh8lRrMuTGrAEjqOeG9HACjwbK3Dv47In4IbVbQC9m0QqHfKE9lPQgCjL41MGkqwsaTXIwuzLJ52RvYnZkNJkGeI4eRoMKaSMJmJKlkuvvO+QwGJKlQSEcvMI5HKNtxjjAVuiUdwmWpxR2SwzF3O8vCJg9Lt35FwVf+qwbon8FEHjnXHP77bc/8G3f9m1P9EOZ/P8ut8zQR7hOksAtVARwIUI/88GdylSmsjfLTaEBfAp3CUBsy4XNTrYgnvSQwkRq3mYhYhXa5JmgUoa/zPMBlkRdiWDRnfQp5Tod5YocLLUXfrwGU/Xe9LD3gZOIv2UFTya4GlrxNDxjehcygqh+eDNWX/RRRLI8yb3QlgNChwwJKStJnbZuXwtxqT/apOwNjwx0TsxiGp7zCcrHA03r8NzjHZ5/3KGd+cE/0MtsNpO1tbVf7LqOx44dm5yWrkDZwU6WbnAqe72ENI0RBWDA55zKVKYyCYDXtdzLE9399/vGN2e/7sJWB9LR5rtNQRnUjiwKRFanZ9JpnbTGMAKjqjZTtO6QiUJC7tAeNFULVkHPF6Inexy8LP0SFZgycx+/PsF9uqZ/8gg9K9TG/kIB4w73DTj2oNEERT07CKUJhNC0a/uD6jWp9VtScnoR6wcZTeYx0iYlqE8SpsS5bBrgSw+uYftFwqUcxU3TNNzY2PgPDAldp3JlFELiMTmD3WpMtyyftIBTmcokAF7nD9ExBwC3vfUH3o5258u3znvxXpx0iFhxfaRoL3B1XRcjar3XdSRFo/pes9ffR7znTSRv/wr04iFe4r0YySu9lqp/NmmyvA/AzjoyWFRfAj0xkcPxGqDGpPsjWd10DYCag9SOpemHemNtp1RQHip61y/rz5I+6ihfFQ3svUfn/TD/w3NeKv1K/BEIFguHLz7gQd8M/pq92/rGxsYj3/d93/dpADh+/PgksVyBMpvNMCl/bjWBPx1OpzKVqUwC4A1RTuKkEwFl9uwfmm10DUQ6ndRdTBJaFaAh9uVmry/3dNaZQqAzVzD52hkLdNYXqdLE6O/5tfy6Fkhr4xJjzl3lWr1/Gl+6HEutPxjvT6VuHshSDT4pkgr3rpBnn/d46iFBO0MAh/az2QwHDx78vTe96U0vHjt2zE0qqytTdrCjODAJBLdCiS4gyld3ygQylalMAuB1FgBPeZJybueZb95ZbEPQDJaJydp3S2gmAMzmDk8/3OKFp1o0rYvCedM0mM1mPwuAb3zjG6ev1RUqs51pDm5JIRA6L/KUCm4qU9nr5YaOAh5c8PyHH/nRlzyyffIt/oKAQjc5qN8qn6OAD9hn/+i2AW5E2d+1bbv1pje96TcByNGjR6cTwRUqO7MZqPxnx+DhiNVVrqvUTaFQ9bolmFD9wLBq+xfTp7ExcEXal7MLVpn73fq5bI6JhLYkvHpjmcpUpnJjlRtaA3gCRx0APOs/9obZvu7ObgFPJxx//U9lr5QeZLqHntnecnjiM4JGWggWENDTOW5sbDz4vve978FBUJm+WVdOBBxiqASQbpC4pYKEWaJjjv3gIupgxTbGBJxV28dF9hsj93GRc8GLnDesOBerzLUdu4DwPX8HJ2iJwVicXrFTmcokAF7/sui2v62ZQWxytqns5UIIRBzczOPcUw5PPDRDO3cho4hvm0YOHTr0YeecHD16dIJ/uYJlNkv5l9m4Hg7EoY8cd5L+Db/nf+e/156rPc8l19wubejnltEbq197dln/uWQMFzuOVca/6twt619RF4AjOPwYiY9TFPBUprLXyw1tAr4XJ7yI8MSD/5c/hO1tWujgqeztIhB6uNbhyc85nD9DzGcdBETXLbh//36+7GUv+6CI4J577pnWxZUsgw+gI4do4KB0F6tCGn5XWfwgVBCWVPcHnHRt0gymx4hL6Srt6vbVNbtSVD0NLq5sBZGeGHz1HvtONFRSpa18PKGNeI0xZWI+xvAsdYhS3q6r0MvmRDQZ2mv5PIRxBRcKYTlnKQEwNIZ9uQmnMpWp7Nlyw2oA5dgxB0L+z8/9+S9byPmv2t7aAUQaKFy5hC2nf4ASny48g+y+xdDL24vXKtfH2jH9kGV0UNCRkXZEltEuf09A1WIFKrH9KOmgmM9Uv06zzgMNtV3WW4UPAgCeIBy+8JkOfrvHX6RQSOecc8++/e1v//cAcN9993XTVr7CJWJdMvK+z8vizXqRAjsOCYcdKZV0/CMAi49s29rypmRtocSAl6yNfClrBwHVlSzcvS4CpSoS4UXFQG2qHNdSmcZ8tev+odzGIlYIrtUz+c5FA80HnoitJ5UxWub02ZEUbqlzbjZthKlMZdIAXvNy4r6PE8eBLXnhbesHu/Uzp8U7OhdQ6vNjfoA4luC/AlVPmE7Q3kI/Exgyd4SPmjZ8BPGF2YtdbNaLwT/KizabSIRVCIftHopPjHpAtxLHoj44oYZ9yedjTEDWJjewot3/HrJs2HFTaxh8cg+PsNLDnItRAKXMIKLGLbG9QXiA/XiGVHcDLKHhg4gajwfIFhdedHjic0TTtH3mEIh3zjUbGxuf/rZv+7anMaV/u/JlNoNLiOkpQ7VWUQkVwHoZWsCKIJVA1ZO46MIBh7lyTIUpVNzRdFccWMmGjSybToA20Q1KTaFZtM+wj0ee6dNKltrRQD4F1Kh3lk3HY3zunHp3Ubev2xrRehrVoqBqM2GWp1ynZRQZfG+dw9bW1pOwsuZUpjKVSQN49cudJ/v8v+dw+p10CwD0fRq14QXqCUiABOnfhH3yAg7gxamevi8Ce03CM4MdJAIXhzr5tV5IkoxOeF5UXehrPvTB1ku/22fTPZox9goYPe4hpZxwAFKmmp9AG5G2HfcwF17PTxibHjfKNmN/8mvhWZfoqrFA9Qc1Oqovbr7Ac481eP4xopl3UXSez+dYW1v7+a7ruLm5Ofn/XemygyjU94IJB+sno2CWAguYBRdQ/Yf4/+BTRvVExJ5T/mbmft4iWVIZ7LnM6of2yz4SuhWoPub/1drCKJ2Uf9u0SWb9z/uleyJZP2nGRtLQkbE+mwjuci7DISvdpwYChMD72WyOhx566FdJ+mGPTYesqUxlEgCvQRHwyJFT3SNy/75Ft/OHL5xfAHBOKMaEogyMg65s+GH/Ki3rqWeF1hxDVX8woab7KU9tfE63G+lQ1WWlj4PyBCyNpsZsJpauqHZYthnGG3J5jo+bVWNtkOWi+VUGwGtdXwrjcDZefW34nXo+aesHQdPMhwLahkPTOjz+OeLC84RrgpDrHUl/5513ngIgd9111/RhuuIaQEQNldCs3qTZHdYhKFHrq+2tguATl1L6CZTtl0q/PtDSdfRzps283pAzOq6+4R6p95x9TijmWliBooIlTFtDG8Ky/aTelJhi0ow1zoVETafoa/Bq7mDqQ9Peba61K4e2nWfzm/w4s10sUkQeO+faaTNMZSqTAHhNyzEcIwn5xGd/47Wu6X7/hS2BEK5/eTJGrwkdQBf/hXPD8dr1r0AXriH504RrjurZ4QTskD5aw/3QpkDRcP0RXlz/IUx0goAT6lLRHjzBqfuYfg+0EWi7JtWLzzVRfZASmjSpzUGAKsYd+8jYh15g7OuJqcdhbjk+7kib2TxqPiTBMj2r2nRU/emvBQERroE4j8V2iy99ZoEmSiTiAbi1tbUv/fiP//hHAeDEiRNTZPjVkP8ia4bc10PubQ7rL1wnBc4J4DzgpM/TTAHdcI8pd7ZTEan6+VAfCM8hXVeRqxzux/qBzhDtqmkj0Ha19vM2ALjhGJL1z6lIWlbucSSSuKCjaFPNSaDd99+OXUfxmrFlc+BCG4oul0QXU81rbA8ezlsXlknrN5WpTALgNS9HcNIB4Dl8/h3NgQvixC045I2lpGCF5PM3YFnpYAPqwIJkjhnsjAh2RtIP9XwvQEkyK2Fot48S7LUNAYVYxBmTWKBNelUXiraLdGSwgTIMRgJtp1jSxbr9xyLRxkC7l9h8bEPyORhMsr0jv8Sx9G0iXqMadz+3fvA5Sh+qNG7G+jpwI+r9xMc5T2Yv3f9+zsM1UfMb+Ci+A53gwmniqc+34KyLKsq2bXHw4MHfaprmwgD/Mn2krnCxiUB6gc+x/qpIvql5aG7SqCf/tiwsN6cTRQ9Rvw/PGxdDbdhVzynf2PKe/tOiHUvmv0etYzMBLqn/wWWBReguimALooKuTBZQK0EnV/O4i77NsuReDbpFllpaUqAIc0dLom0nBeBUprKXyw25w5/CKQEgO4sXj4jvCAg8nIIBDEJdyl9ZouD3970vP1hBjUWmF6oXRqfpFIRRfni8qNAPHc1HiYJRpCMhNCUVr+jrD5x4+7YOtPPxpKTt6SUeP3zB91tFEmo/eO8ZncqDjOiLMQ59FPtsGBezb5D3fbqWPE8wo0idzSW0Yzrjh1k8TDtN6/DsFxuceVLQzJpesBTKbDbDS17ykg957/Hkk09OzulXtVSEm1wQMsE+okzEUjRTC9BicFsYcs+KCl0t7qlQX+aBTyKqP3pn0QhV6RBIZYZGpV+lf6LpPzOTeNjHtIEdQagrxqaOsLGPgqoQFwOomNphDLXScwvbXpz7EGQlVURoN5I7xPtJuT6VqUwC4LUsAh4F/L/79P+w9vTi59/udgBP50CCooGwaNIWsXLcDdqn4DvYP+UGf59SFeqdKEFyoGde6OGLICZKL2nOVHtk9K9LIpyDk1o6KwLOm+jIgnYATXMZbXGFYsWFDyf1eFwmiqY0X955+8kUZ/ErmJzHwwcup23GTe0zBjj02fuMUBB665hpXzzEOzhHPPYZQXdhhmajg/hWPBZN0zTnX/7yl/8bADhy5Ig/derUtIuvcNmYHcLctXDwaNBYXzcT8Zur8wRV9ZMGr1OCigEQVJp0oBZ6GrT6MAJebI9SeSiBBwa/PYjtWzhQiRImbb+t4KehmWIUbk54eBkIZRCugBLDRYAsbl8KXWqS1vrAYZ/xwSkVpY8+wCykvBSpT+nNzhIPpwPCgTjQA4IOQJPanMpUpjIJgNeq3I+jjjzR/evPPfD2dsbfd/58J46OvWnRGTNOctAGOmGRvijCk0g6pfcCmUsvd6XpogLg8sjNV/odbj8HHZL2KuKvcnjZqg+OVxGRBskGVILhoLkEB1NyBvwqFmimgxtMyYjjSQKsqPZKTU6cSXHZuFWsIJEJhxLBczuMzLlYHUan9TYR/VciNE2QkT0JsIE0Ht3OHE9+zqsPkhfnnJvNZg/96I/+6KcB4Pjx45P596rq/hQwHdOuM1rteFBRJxsm9TZJ+CHIAFb5XWj19KKJUChKW2e1x1CL3WrPBF6hQMtwMAna+qSX7s2eknR1ovuhxDDtDme0ZlAYgJLMwUzvnfy52MfKvWCFTfdo3is9dJMP4FUVjJewlwYE6eA6Ei0JCRaLkmk0xSvBry+z2dq0EaYylT1cbjgfwDvRm/UWO09/U7uvi/JVOHXr6F3lypdefCKDq5l6GUaz7PCS9x5ZyC8SQPGQGSCImAE40JdotRLNrwLxPn1EROCGdqP5RlSqAd03ABRvaEfjkPc9g/zgj6c/ehJO9QLx6UNNycYd+5iNFbadRHvQwoVnCtqEeGX4yuYx0UGkHegw2sx9ErgHCJswx9IBjetw5ukWT3+eaGctvDgA3rdti0OHDn14Z2eHm5ubLSb/v6tSZoNw5EilKbY69ghLQg0Xk8Gg6OcdhzZdujYEBdHpZ0PdoZ5zqS56X0TqNmJwUfBT7MHDQ3qz2EfnImxMfE5prdN4GDXjsb/M76X+koRTfTSQL6pO6LNjCs6KKdiGcbshiKrvn4vz0ruXIAqEiZYOKnFDGyVfYoybHnes1z/fNOXhsGkmhKWpTGUSAK9hOYlTHgAW/tzmzs4OCUdjGDFatRSU0As+flBGDAnNh39TQAjitXTfD5o6De0wmIREhhSood5QNwpQg15NhhhWEUC6QTDyyTMqRPyFdiIYnld9RMqyID1NFzQWgW4ILBlyMoAy1Au007iS6dvH1AXUkA+S0ZYUUJPGY2nTQE6kueAAiBjrDbT9QLuYc1UvaDyCyE3xaJoWzzy6wLnneigYQOA7YDab4c477zxFUt773vdOwt9VLKI1YUyaqxQsUJpcjRCo4j60212AI7EwKr0bRdQcSyXoQag0hlYrCFFatcwHL6rYvFVvWjw9pYmj0vpTHZ7ye1CHGyThtbinrLE0hywaXz8qjafAZiehSsUXoVxCFH788cpvUadAydW6VgAM/sAFmuMg2E5lKlPZu+WGMgGLCEn6//CxYy/5kv9PXyMXOnhfZqmk5Bj6+lPiYVQV+o8apr3xQ5LymbIyypRo+TMmTAI652bZnxVpS1lvdwlIdqkpmSt5MtfWaa9GVdeTXetrX0MCHSHS4MnPCLodh/ncw4nIjni3tra29TVf8zW/DgAPPPDAJABepbIzaIEhgGsYMSK11qznnI/CXgo6ok2+kSdpcSqAw1NhEJvoiCRoRrOs8g1koiMBSmUQEiNN0Zk/guCptPDoxxMCI3QKNCi3hChoKd89GhfI3AcyuaZENAEVwBHsuSp9cP8ME76iywJUIhktnIsVICPmoEjvz6d9F5knRbZZe+B603IjzfDG4qRan8pUJgHw2pYTJ+51ALoX+Yk3zTbkjnPn4QeEvCIResqDmUJldRIzm94I6gStommhXszIogzVNZNQillOUlq5TrIXtgwppHon9MGzSSec141qGZVWTkwfV9GZnsy8iOTPKtf24UZ0Xhf9QUwfTT1ndoxqdk20opg5Nt/RrG/5Nyg4oieZwYONw84FwWOfIpqmCcDWvm3bpmmaj3z3d3/3ZwC448ePTx7qV7MM5sGAu9Tz1fqdOSLCHWkBig5mjSPFbdkNSSUMDv54NMlrtdaQds0OG96sdxO4lPzyInKM9hnM07cZX0RarZmUfnzVQ9aw0ONY1XOOOuWdH0DPJYSkRcBnLVzmRnej2XQw/oy54EwzxyrPN3PfS8b3oKgNTGCCgZnKVPZ4uaF0/Hfe2fv/bfHZd7RrgIP43M9ZlF96UkzlMcAsFFcJLiIXrKggW5J2IWTFKHRz6lqeqD3Ps24DDpl8EPPPh4gKUMkSxtMKuwpdxoxRyYXK/c/ioIkRMmnhYhR8jVgLVPTlS9hn5bV83JL1LX6jTECNM333QrgWeOHJBi88TjRtkotnsxluu+22X10sFtzc3JxsU1exzGY98HbvQxeAiQGiGRaWS0IOEf3PqP3zXFpXfQS6AwN2JsNBo68f2o31EHz5OPzuBlePxtSJdSWZM5PNdcDU7NHNB9qJHiW06VJdEIhjpOqzq/Qt76MdQ+iT/jv6J6IZfmuiNjAIaikzCeKcE03fb5f7KBoMeOWDCJPtRL/Xgha3x6lP/XMhrEVt5skHcCpTmQTAa1aOHDnlRcQtPP/o9tYFiAh9zHPLlD4MNPlyvc5hm+XVDfEe3twbz7/r/dCeZz0nL8p2vGds3+QDHtqo0fa6jybHcKU/WX9DDt1iDNC0MdpfMW2GuJmSdn2uAi9G6kHlXIbNG+xDLmTE2JJYz3uCnQCtwzOf99g64+Ca/rmu6zifz+VVr3rVKQCT/99VLjs7OwgA35KMsxB2Q9CA10o4JBOtBitXmjh6CH3/b9TRc/i7vx7SoslQlyEd3PBc/3dn2jL3QkLB4W8ObUK1IRyAxtnFsQgHv9zYVvpX09G043NDH/u2BsB2XQeSxm3ud0NqucFXFyXWYNIKDn2AVwezpL0TycwE6oCHGMpWOcCGvcoh0p4SD4HNcNCccACnMpVJALwm5dixY46E/88P/s2vcrPua7fOixBDyFxw7dHmW+ODo4u205Tp27XmL91jcU23a4yzovWJ+pnhhawQB3Pto6EtY30sHbKV/iy+0MVcU5rMbPyUWjuaDkf7g6I/qPQnG6OoD0/AHlO5inv+UVHXoDYAveCxTzl4Hx3dBYCbz+env//7v/+3AODee++dvkxXUwOIHePWwMpKVxxTjgbjpbYTaVZ6irznyDN5W1Y/L0Vdjv7L6piY753KvfrOrPcPZizlHmRlPDaTCbKxocIHBUI9Qr8+DrX7w7uuS9lIiCkIZCpTmQTAa6b9O+kA4MWdT72t3fAzEXSQxrzNUwQdLH5Y/qLkElGF+TM5WPPw4lRe4GRFhGPunZP8BjUdFh8qIBct7Q1Wx2JETlrBL1wj7YjLj3KNXo2OZHOg6+UfMp2TQNQnSWuGso+Syo+cTMUEZw5bp+d4+qEZGtcGVaJv25aHDh36+Cte8YpnECDipnIVJcCZCYyQTNjTekExOUD07zA17e/2b314qt3PQ64srfEUchngUXbd3pfi+byHeT2lGc3+08KcVFpC8QwMFSnq5O3Q1GLWp3IepOCTZO/EAHwvJPygcexdAaYylalMAuA1Ki90T715IRfSC0t6nLuAdRd886Llw0dbRtQ69X7pSdskCv8u1jUObult6Qf/HwlI0NLj8Wmft55ueib6wkV8wWDv1FiwKYGoSImfF5FhRPvmDeOOY/aKtsU2FO8NHiCUORdDBpXkByhxXqHHo2nLMLeKhp0XmPH0qd5cpndwvbnYqzGjN18HP6uYqcETjQOeexw48+Q22pkM5mYvs9kM8/n8fpIy+f9dg7IDg/uYZ96l0qElLzhWtEsc+V3M3ynyNq+fPPPKH53vQjJYFalqGa2mUd8Xowmz/SvzckS8QnUgdVl9wsK95HYGVud193nOx+3MnHNEy1dvM4qbYrWuLs76VKYylUkAvAbl5JEj/v77728WXbe52FlA/MwJF9GqKMpKGeQfAZBkCQkyV38NAU65z8ohVD5q7OEWUj2J18PnJNIMdaGsm6ENZHIM9XOKLmnahNP9tnU1nfhMvJbSQhm5MtJR8m3A+KKYPnKgoee1h6FgfSxAMRe1fgeoizDnXlJUYZqD0J5YOXzIFtE44vHPCrbPz8EmYJSJW1tb2/nKr/zKX+s1xUcm8+81kAAbOjgSDmJCJHSIBYtrVmhz6hrza7RCjysEoZC+MK9Xa1OHZMRQjqLfTtV1lWsUmHZclbaG4WOknwQ7KetHOq46lyz6yep9VwiKLJ5vqrxiZnrv++gCYHTIyEhRJ9vJB3AqU5kEwGtQRI654zzu9//BX39ts7795q0LEFJYmmuMC55xio7AtTGS1kcQ5NLsIZlJKfwEJ3TJTF4wKaw8rJkL+nnUzVXacdvnftsMz4oCW8ZF0Lamp/gCr1D3yKKYB+HL1CRGzG8+M+kp6rR/91GgEp9BYQrMWmKP+/fkZyQ+NwBDuvX19Wd/+Id/+L8CwH333TeZf696maVMallwbcwyoQU4k+YM0YU2RBBrvOK05EMmi5QOuk98IXDqWeiI1yxlWklbCTa6HjMYGih6hBWMqF8jSsBigYtt2tXaQdMv6PlL4fAc4KeMFjP+IQWdYtyw/TFuy/mzmgeQQbAfxhVTaFofYsEEAzOVqez1ckPs8JMnTzoA/vzWU3+8PbiY4QVZCKWFNCoBelmsO5+L16y3nUXrDynZWIhLSrKETVxfpZs5adfc5HudlzP1qm0KjGFH6SFRdxi3ALA65691AHdAxSyWSd9Z8njErCHlePLgFsl6qD6bop/xWd/L0TQNcPaFBs887NC2LvCpa9u23djYOAlga3NzsyW5mLbt1dcAQgSOEoWzXsingtwT63M6aHiTf6qOZlVxrcqvkBGLj9EP15EmnCO12WPeRfxMA5jnkEKSNchzBjId6dhgE6Feq0jYgUFmC3iFVBlSEiK1CkqzOYHFokkrWCeF92f6l6S3hNfc5zWmy8fNDHNU4x5mWIYps3IUIlPcl+vTWGYZlkxwyFSmMpVJALxa5akjd4mIuP/t43/8XduLBbwPQP8eOvp1RH+odGMoBDiLj6D/HmtXlgiG+lQvJhXUaL2oc1teb5zuLnWlJriOtblsLj3yqGJWMwL4JePYLWOIzqKi+uIBzATPPCo4+yzRtv0933lsbBzA7bff/m9J+sn/7xrp/2YbUaBKoRYqRraAsxR1oKIB/k4nHA5NJt16fuiRbH9RkAQq0YDHksGmeLOqRR1AJB78ktAn6pAlKogpZRfxCaDZ6Sh5JSiqlG/OtKlnIh0DdWAUyeLImIDcJRujRZq3486vZTszTqqHDuIS0YfM3uLhnAOkGRKv+5yBU5nKVCYB8MqXHtz/RPeRz/7UoQuL5//g9nkPkXDezV5r5sirDLqiNA8RpDhP75TBx4TXslitRUpfUYo2jMdyb+XJJW1K8WlT9ayeAyE4Iz95m49LyHdq6DJeK8eDTEOBkblAzBKSi4/5J1pQi2ReZTw5nf7DuhCiaYjHP+vQbQtm8wXENwDZOMcLr3/9638T6P3/Tp06Ne3aqy4BItotqdKzlel/c307Y5oyKKFKA6AnnLsc8y7DwQsp0yRk4xnqhWCv/Bmmegip0lwIYEpxsiXkShJORQmWUGDnzHTdut+6st7r5biS8CuiDkAZ7TTG2vzQxB6bOddcCXMhqY+xH14J9krT6QdnDUen3m+TEDiVqUwC4FUsJ04cdcCJ7guLT7/FbXSHF+d859A2ff4xSenClJ4BAnOajcJYeM0JzbVM4Cy0UpJh+0lx4k8CTki3JN5m+siNxqk/9vxf0I7pMXRqthzTKzvhCysKN+VNVBl3/AATCRuwmrou1yDU+wIgM9XZ671Gg2p+M+Ox9E7+gg5N4yFn1/DEpwUz14TonK5pXNO2s//y/d///Q/+5//8n5vjx49305a9BmUn8YvsA9p7zZRLkaySbIm5sKMFjrBP82sOLJD7zDWxz+qazmDejdAZ+uZo8fU05LLpD8s2HV0hQPVrNr9Ww9nUY0B8lkMqyJQWh+q+nh9Lh0Cmkc9pZ2h/lTapbMD6jBuzh3jfZ2UZ5nJtfW3aC1OZyh4u192k9sCQ/u1099A3uDkbiBMZwvFCpCg1vvDg1kaXonBVpqUhulcKb2lZFnZH1SZtWxgiX3U7AkIcyuvB0VtfdzXa2tNczHgMPReelxjpHF/g+bgch/uI/9p5kWEuCZ89m2gjOavHa6LGksZtxq5o67kX3V6sx+B9PkQP9zl/zzwDnHmccG1gDqRtW9x2220fIilPPvnk5JB0DSVAp0z9ZOVAUWBeIhMnmAldGvibVdhm0QDMpNFucQTUJeF0hvRtJkSiEKFQ6LAHOlKCpVjamRCphM0c8EXPC2n7LWruQhBI7m4R/fj0c4WAmvfRiHJFvSAUk3bOwnUHh+h2I00mNE9lKlOZBMCrUY4c8R/5yEdm4hffvrX1IuiGpFIiEaDURKmKDJAvPoORhTKvSIzkzSNkRdWLMahD3b5Nq1wzrVDFsYaUSjp/by3eVTTMTKDti/oRNsXU0/l7RYHOKm0eUpsaeDnQDpMTPiBetSdD+q2SNodrohzZM/xFDaET8AmHaMMwnuRHxlivTzs34DOih+5xDfDUI8D5Fwi2DiIC7z1ms5m/4447JpvvtS6znSHYIF9XCvwypn1LyaB74WGIvg/rQvq6oR2Jz+p/dXvqmZhWrv+dYQ3Ffmg6Q8o18QGIKOufWJqxnZSOTlS/RBKNuL7j737QlqUx6zEiXhPVH0nzov6NfVAAm/F38eZ3qHao2qm1rWknDFGJ9HQfe7zRrrB2TCbgqUxlEgCvWhERHudxf+HOX7uzk603bp0XDD7VCQBaS24GwJgQ7yI4sUCDK2MAHx7stKFeAIWOwlF4+SmxSgeKSBaw4JUQJL16Tjx6wVFsAISPgM9JDZgAkVX6swgE3deToZ5Cg4799JF2UHUi0QkvbgmClsR6BoxZ5zPwur1EO32M+jkIwjEy2log7L/TCVxaRMsG2iPfJzO9dPDsgaGf+JQb/P4EJEVE2tlsdu47vuM7PgIAJ0+enMy/104BiN58GrRUvRo+ZZtJ10PEbNTdOaUdI0E31HMqBtxooRDbCf/2bwCCHHAAHaNWLPxOJl/XQCdos4s2XTpAMYzDVcCRqXR8LtHo25T4bMCuEU0bQZMuqa3hniAdZjnMK1Q9IPXH6BJdwshJkDFqLlSfzVwY2kOQNFFoZEssGajofWDWNNNemMpU9nC5rj6A95080gBYfOH8R76O+87vkxdlQTZtFLqYBR7kmcyi9o1R+KPx4VYmkhAfEnO4WeElOrgz86mJcSFUYQ6MwlZP0Kk4kNyTSIVEqg8MJIerUf57A4AzhGrMOhqSJrgintrFxxd9yndQgGqkDCh6nIo2I9ZGikwkXUZ7mKuQ3UP+/+z9ebRmyXUXCv5+cc733ZuZNauyqiQVkhEuSS5JYLAtD5KcKQtjsMHu9+gsaIbl1UwGybSNH6YX/XhkJWCeDc0C7GYQ73XD6rd42JVGfgYay7JBmZIsy9jyJKkka6pSqcbMGnK+03di9x8nhr0j4nz3Zg2S8uZ3at3Ke8+JEztiR5yIHXv47Ua4i+ZlIxibJNh5bF6e49lHPLqUK1h83/fdwYMHf+NbvuVbnj127FhHciUAfgmvHJ0aAwryXae/SrFhDkyfrqgI9SKQIgZbaCfa0r/XZOgp0hwWEbnhUxm/cSUc6fMTC5gj6O+DNAHz2o8YNCJTsQ7RvFP542koJN3mwndXf6nR/B3L5whjDU2jAt7SCpj9hy13pMrnHN0Pnbh0eHTsVAPC6rFKBbe6VtdKAHypr8X2xSMy32EW5MpgBh3Fx5QPM2Pd+bRUirAMcQWUO7UOarBbnViaoQ4RCSf24AwfoxrjTudDubRhOUtTfBZkVfY356iiE0fhzblcLkdS5s0kY5rFlGoqos8jYHrlRVwU7SgQitc5i615ObWx4KEkW7MkTDRRbUy0rX43BIFIrioBoQWNpnfoZh7nzzhceLJDN3MQ8fDey4EDB3Do0KH3kFwcOXJkhUj7pVQA7uxAIHD06JxM5N2GzSWdY1ztc5H8SbCESQcqaCATmS61WqrCuCufF3SkrFO3ey+09ZzFNO0saS6nbZmThGiL+OTrCH/T7ym+tPhqacc86gIkzaZ4gEMfupijgLHKBLK6Vte+vr68PoBHj3oR4ebw7Fu2FzsAOrYXSw3BUGitEn6dXoS5fMGt7lktXF7o8wKbtF7RnJPAZ5VmsKJbwPPDmr40bhrZEkoVfAuVkzyz5iJpAV3UEsKY6SrNDktH+BbYs266FBtMATvBvJFgKtbZpDLQ2h+Pjh3OPuSxddnBdSnnsnPODa985Ss/AgB33HHHyhnpS3jNZjM4ujT+eviczvLhcjqx0XRvs37EMq2MIHWmEAHdADL+YMmPLueLjB+SU5yZOv0S2ihoy3Q5Rds1+7RX2pjo94tEm23aMRDEBRO3I9MYQWdU+grYHlbX6lpd+1QAjOnfPvj5+9/k1vqv3dzYEUC69qm+BbeAWvBrCIw18HHrZFwARBMmwET790UBNDuJS07tpjBpxDovKl+/7H8X8b8i1I339Ylda1+y/6IYn8iy3FhPkfxOqoR66h5NYreMZ6jaI6h5FrS1uT1sjE6BCiyKhxQMC+LsZ4guh7fE9G9njx079nEAeOCBB1aqiC/xRefygSekKKyCFbw3QQd1YMde7mufXB3BGwIfUlYaMdq6OsuNqksBH+eQfzVnVVmmexoaAFV7aVAxx8y8UgZtmH4CFmpggh8CQ5vqWavfsZxkZ+ddaCONXQYKRXGAjqkbraVjbW1lAl5dq2s/X18209r9If3bw9sfu0fWtmfY4gCwG82uWbjSYKbSSGsmzXRvccHLqaMgNvsEleGTRvDR/xDaV9DiA1rsPhsEok3YKj2UQJmKw4ldtCCmzd7S0KKJea55U2rbNNjsVBtJS7vWlOb3BdanS5u1MwBwIbyWIMESMeSCWdgBWxc6PP0FDzfrILIAQN91XXfrrbf+2hve8IbLK/+/L4sOMJgJPYDOzg+HhGWXRBuJqdckCRzK7VVNi3qu5nf0nFQwecn3wc5RYTHfCLT1/hFPNGux9fcg6pAZ262dI2IbZcl3Q+o1xBoRyoNgM9pC9dtkKW/0m2XWbzb4Glc3WiSB8PEVbQtnNB877uAwfm7OrTSAq2t1rTSAL5kWULizMRz1shVg57yCjgAs6AnUaRuFQKjrtIKMCGw0rWjRRAphCUs0gyhSyaEQ8jChkcjlpDC7SoiwtUIlmxpOadFuM3XqSaGlk4bQ2taUlhHOAFSEtjQ2+NqHs9SiigB9D5x/XHDluTlcB0A6eO9lfX0dt9xyyy+u8P++jBpAwkaz6ohgsIp+TQeaEKiUftcRtsWPfidHGFtT5VS5bPJttEvT0N4HtG4Ry2m76TaqIChNp92/sp2o3tWm9l35w9b7rZ+639pMnOpGNuH7KASGbcGvfABX1+paCYAvvuAHnnj76QFAv8DWH9veHAAZjRDZRNEWPpJfmrTMmVrTF7DmWj7nUObYENhg31dSiijzrRVhGmJYw7QshWQqbef2JEiKyrklvm68WEG2lvEawlqLpulni6e+3aeYtkqlo9NCuW6XTlJfhD2PQQZwePrzwGJzgHNDbFQHYPN3/a7f9bPAmP5t9Zl+OTSAwJ5wgLnHey+5xPpi05Wr6/PVtPOlXl8hV9ceHSWtcgevNICra3WtBMCX4DpOAPIfHvy/v1bWrty5s+29F+e8AB6EF2LwgBfCy4h1572Mf/sRz8+D8B7heQAv9gHi1Et6JuG5R/jXw7w33mcAHw40zXNFT0LdguJHbN0eGGJ7A35f/le1Q5jaKrqcj7+zaJPU9cW+pjbr9ov9gWpn8DlMULiatqfiPQOdTF8QeR5wCANwdOanJD4Nhhf5mRBYbM/w1OcAsoNIB4H3fd+T5EfPnTv3yPHjx92JEydWAuCXWvyb7cBRgFXozT6/4kEtp9jTh81ZgIE5evToilWra3Xtw+vL4gMY/f/Obz/85u6mYX3YloWDBA2gzc0LOvjkiM2kBMsxCWJws7TrjPZzSVAkEdOvzH0b8grnHLYj9l3WzNlAFGlhmCVfnljGB58pDS+jywk0qlruQMy3VgSzRPwvp8Gk1fsp0S8t/EaDNkThJ8Z0e1LQTgx0oXchC0HkVXJKT+Ebhn+pveH9yEongJsBF88Izj0O9LMOwA5EOjhH3H333Z8Lgt8KifbLcO3gCkCPVSaw6+SKFhAZgdh98Ev0ITvIqVOnVjxaXatrpQF8ca4Hz94hIsIdbP6fdxabkIH0ITNRzqoRM1r4EFUrESNu9E1pZuwYVX4xs4f3Hj68g6Td8ilThvc2slbEpxRmYiJ0geifqNsH0VG4gI7U1TiAKShFReyW2GrGzKyjfWHNzzrYwmY1iUKiel/zqaBtg15KE7g02hh8hFKmEqaUbclXSI2TVG3M7Rng4ZzgwqMzXDnXw/XDKF56L2tra7jrrrv+KwAcP358JYJ8OZVDKw3g9SIBpgNgAoxWuZ5XGsDVtbr25/Ul1wCOCSxODmee+sQNW9h4886mgOJcCpEIDtUx00X810SRpuhB1risOoow3ioAVG30IQv3PimCSyKQ8UjLe8mLpdI8NiD3su5O7ILKBla1XoBTqIhqm3bcLtEQW/XpvlFD6ei2G55J5SCvoxJz5GSsy0ZeR+E0O+OrenRb05sOT31mABY9MCcAJ4Ltfj5f237zm9/8wSR1r64v+TXDiAPYnNSra/9pARwBzxzQFb76tbW1FXNW1+raz9/+l5rgSRxzAPCBJ//J73drW7cuBgxjkBoz5EIh/ImIgkuYwv6LwpYVTKgibjUN/XusqxQUdblKUFMAzyUWX1YCEpLyANtyJUTDmGqug3gmM3gU3kiVg9gj5e2NWriUF0VytLEEmkSLNi1tH3IBe6qYFUmRoCJtXqTxUKndstCs6KnyAsIR2LnS4+kvDOg6xsASP+tnAPDB7/qu73oIQLfy//tyKoWo0o+x8dM67ryQcnye5V6KOvdTG3cvG3OPt9NUrq7VtbpWAuCLdB0+dYYAeHHr7NvY73SjhVQqvKpaqGqZJpVJU92nup9NtkgmS6DEx1oCdyKo6td0y3dTO1FCvLQE1QIg2QijUP1Vwmd8t8Bmlgp6Rpumd6GNhkyt2pP9JUvomAxlIxNjU74nImDvcPkscOGpGbo+W6dns7msr6//Z5Jy5MiRlfrpy3Tt2FPMxE9r4ryQcvI8y73IdfIaaOOLTZsE6IuEcatrda2u/X59yU3A//zsHQJQNtzGW+m34OjqHKIv8JKGebL+W/Zc24t5iciLeu8lo82aly+cN2Pmgq7v8fRDgp3LwNoa4AXive/6vudrX/vaDwOr9G9fdgkwYMM5x2TalzLDDutApaw11HOkTLk4hTHTSt9Y1hMPSMqNw9AsswCV9S2nrYO4du+PBpZfjtKpIZzzndb3xeXfT4Pn9Tu78aXus01jGZw0VjAwq2t1rQTAF+s6LnAneHL40Bd+7BUfO/e+t1y54gWe3erAeR1d7DEsHM5+1gEDY6CwkHR93z/51re+9ZMA+MADD3iufNC+LNeh2c2jD2BwA4hBRzQCAm1mGCVUNFNxN/N0FCDvYJHuUYo3xdA2Prg6M4bo/OBs0spR+LQCWTKFBs07ZWJ5areznVtcP7dp4VQm8as4WLX71KJNTIHcKxE38NEFuKtYQ9etgvBX1+raz9eX9Ij3BhwjADxx7jPf0K1t3jR45xsJflfXfr0EcB2wfYl47lGgm7loYhfnHG677bbf+PZv//bzAEhypQH8Ml2z2S3oXAdHgsKYyyNloc35PZCeUP8X8vfGsjkjLs2/MaMugyDkVIZflUMk5pIp6hnTKJZlnUgqr+lY2uO7uj8uLYgulXOKNlU72WwjizaWZWwGY/3jJutEwcPYZ6o+2XK5zjbPYz9cLK8zhYju3epaXatrJQC+iNfhU2coAl7cefaIdwt0WG3y15n8B/YDLjzW4dLTHaKCQUQwm83k4MGD/xEAjhw5srI9fVmvHbSzzLQ0UWUe6/qdSu8n9bNWXh1USXlkslaRVhsFKEy47Rp0zaovbLR7ysWurH8XF1uYeNv2M/1W6Z/cpNNoR0sTq0Ys+fqKyOQor67VtbpWAuALvXj06OnBsZMNufS27Z0BY3zr6rqeJEDS4ZkvEMNWyiErADrnHA8fPvwLwCr925f7ms0iDIzOn6vhgHQO2azCd45VDl+n8s1Gi75zZW5hpeHSkeaN3LaxDbodwIhfzmb+YJXzFhzbo/PpQmnS9LvO5jPO+Y9tXt/Ek1a/qf3rUOQHHut0irajBncveMSi76FZjkrT54p+o8jTHP51JqlwHXCXNoeVD+DqWl0rAfDFuI4fH/22f+G3/9Gd0m+/drE1CMb1a3VdD5Ifxs3Tb/c485khCBgDIBQ64sCBA586evToowC4gn/5cl87QPQGY/BV4ygQZAHEgwxmUea8zwYkKAk8kp7F33Ue7CzQeMQ81BH+SAueFobIg/Sjj17lp5eF1qTvoqj6TSPDT8JYCnKR8tOjKpbmc8ygI5WfIFN9ef7HvrgC+zPT1rRkTMWXu6OEYMVL5OxGUUZMPDdjl+vO7c7mZ0fAuTFjj6jAkK7rVufz1bW6VgLgC7+OHh3Nek8Ov/3d84PDTcMAr/KZra59P8082A/YeI44/wTRdR3EdwAGP+tncuONN37k7W9/++axY8dWaocvu/i3HcQAD2vitdBHSIDrWrgqZQYtdJUG2CX2VCWQtUyiGdtcstDYNCSXtHyzviywiRHI6taJEQ7HNnhMR9kKWobnVkCI7styXmZ+i+qPFP3RvoGm32LbN+KMWt+/oA3sV1/D6lpd+/f6kn3gZ4/eIQRxRZ572w62xmyzLwjWhPjS+Kt8qejs34sYU/zNOcOzjztsnidmncDTQxbg2qE13n333R8EgHvvvXd1KPhKGLNk7owCkVOfgRVfXMqxHSN0XX4eBBUXwMedMjlSXAqrGMup6N0o4ak6Uw5rRk3dGBQh6huluBwjW9AmclkigKknIdKHxukc4rHfWm0XtI4xAppaZmXKhaPbKFpQBkB0Y0BUfJU+gXyaXOSKl1nYzNh9ue8Y+aPrQ04NpMQ6OOkygM1YAegAoEsZiyLW6NbW1nOrL2F1ra6VAPiC95P7eHKQ4+L+X4tv/+bFphDinD0wl1k4dAozgcnxVr3TENREbSLxxoRjt6VTvqsgLybbY9OzNfUae6KzXAA1WGySTTmVI/he+qjrD3UtL7ecRjUmMeMIfDJYCTs887kBfnsGHBRQICA77/2Ve++9978oNcfq+jJeM8yzeRBaqLEauICSkrLQMGHbeSN8xGwy2QKp8fzCv0UuQ0qZ8DDj7jE2RsqvY6Stha5R0JMCFCYKW/o7pFHUsfg2YirKsa+ExiLMeHs+QKqMAqJuR26hXcdoIHWiEKnveTBgpWYBNpdzcVxUdqFIyyuu5Ohen/wBfRASU4Qzo8hLDsOAj3zkI+8DgAcffHB1Al5dq2sfXl8Sc9sDwaz3s8f+H6/nbOtVO9uDgHSiwAs0MpYEySYbW8K/zGVhgCZoPGMEhKj305bF8h1Lp/VuBHaQshxR30PE0bLAESPWliv606Zt+kVnyovaMiIvvBT02KK9jA5SO5q8qPrjqn7b50jt8wCEDiIOZIedK4LnHpplfDGhpyNuuOGG3/6zf/bPfgGAW/n/fWWIgGAh0idfu5zphsHUWEWyUpsyrYYuaxhhTbgs0OoUrF/2Z9PaN31c1LRhgOWlGbus/O6k9OEr8mHEjDyBtn6agifMC6Ib3aAtFX80bdFib5QXG2ci0WbfIIlnU7wWdgsOEXb8Ij/EJ8bHN7quW2njV9fqWmkAX9h1+J1niAfAZ3/loW/qb8FcLmDwkC5GEIrKMVAoAiotloZr0PfElKNZSL26Z+ATaDH9fUOvqOnoLUI8VF7h8G6jPUi0/WRfENoYV/3USlF9FKNca/anrDPS9kH7SUZeGEjdRJtFPdLQBdb5mS1/BEpbwpjjeAfsgctP9jj/BOD6tN/IbDaTm2666YPACP9y+vTplQD4FXM8JOhcTmloFOEshCatfnKqYHy3U5M4fJtOq521Hq/+8FncS5HJQXsX51tqh9PtodJIxxlaZPNIwNJizbq02UMsnbKPik5qt+qjSFGns/02H5Lk9iCbqrmXrCpKa1mLyqGN0ewuIbjEudyHlcvL6lpdKw3gi3WdOnXag04W/daf2B42Eoypy+oicFSphXWO6f64YMWFVN1P94KgE+pw0ZdG1xkXUnV/BFWlpW38v/OzmjYS7dheymguM++J2gCqdtuf3B6xbYemp3/P/THlNG1tjortLNpoaaP5PI9Dpk2MmQPadcKMg4iD6zo888gMi8tjejEAGIbBra2t8e677/6AiOBd73rXauf5irh2xsVBAIpkcGVRoMUi6ZkTFs+CTlhkrCOUdwksOQA0S9CvS6Rl/43vukTHtiV+cxSgQ/5+XXgngSKnNug+IZcXW86pvuRyI+0urFsjHVWPoSO5z4o2Vb/ZaAdD3S4IaLEel/gd3w3rTWp/4Esck6KvFV+h1lmledWp9Uii71cxIKtrda00gC/s4okT8B/60Adu/A0ef9PWlge8c0LCl259caXUB1kp4+WYTRvaFuQjplXrBOsLF0M2D8a1bYnmpC16wdQn/9BGaaQuZUyybuxEjTbSJyHLpoZq+Axq36XSD1JrJYyTVCHrK6VFMhtN0DaujkbJUJRLWkdRWcJC/wfg7EMe3vfB5EYAcPP5fOMtb3nLrwPAsWPHVtq/rxDxjwqSJU8qZ76pbNp1VnONIQkSoua7FLl1JZlA8zzKpk2bAM4EiFQp1qh0eYOi4pIWH8UbovolBW37e4wwrnMCS6Fj8xiUn67mCYs3637D9Ft9v7Dp6nKpMubZevzpfuvgF1HawXRAhB89BpV5eHWtrtW1EgBf8PXAA8fcffedHB5e+8nfi37z5cPm4B2dA4YkUBkBSSxkgrQ9WYqyML4vpRCWvNWl3AZqoS3nCG2YVpSZ0zS6RZvqVN1ItG7aZ+qb9l1SR3Ur3JoyUjQU0P5Gu/alRbsco5hBYKLfo8kwmtYEQsHWxQM4/4ig6xgyKsgwm826AwcOfOgP/+E//DgAR3IlAH4FXDNgxGl0hLg6p62eQBI1+drlgvlZ1Aam2W/w8VyYH0waR1vOCkYJ9FmknpvWe2703RUtAlLRrnMAm8+SLYGR6fNKBgWKQT5UkNij5k1FE0sjeE2UxhRN/tAIhfZRI5grCoU6wriok+obHgM/xnEmuxSso7WBq2t1ra6VAPi8r8PHxvRv//JXn/xWzBfgZu+F4uBdK4+8ssHG1V1rzPL5Oq9kUZIpvNal0ABK9E0rPZfU9kRRUBYN7RpKrDDdRtTaiaQl1NGDpbQkxcrc6I/FmlhSTt2nFg51G3MkZVrjqXyl/JJ+UyWw55I2mnY6zGaCp79AXH66h5shpZ8KQLM/6b1f+f99hV0S8vk6penW0a/xUCNK45v0bixOOMq1jdqfDhIgSLI6moXoEz9HZ6Q0Gnc5KhGwRA6I/rJVhttCGLT1qXMWFYCy7gFtkIVGhTGBJLQ6daWYLIRbSzu1jG3Bu9KDUie9K3neqE+y7dcDoyOwZIGWXMV/7JPv+EUcSL4opQSC+++/nziav4Q3nH1Q7rvv5LAasX0mAB7F6YGk/PhHzn/r4BcQ8UyYVd7CupCE+MK8Q0Akmn+8wr1CgbFlN5z0rs8LsCeqJJ+iTUsNbK9S75gFJ9ZKEaW5jIEQEa9LhYAY2AjthG4+IuOPXrSRbEZoGKEuOb2jmWA1CbqxcUn4K6+adlmnbmMMEIjjOAbLODz3iGCxIZgfGO957918PuerXvWqXwPG9G+nT59efZFfKRdjlggH733O/qFEHMLBMX6VkhTd1KbipOJifZ7QYll1jlFa+ok6CVpsPKE1yoYsGylwwnwvBTCMK2gHfDwxdWZtfookVtFrZRvzyiOFtObqDZOWdgpUrupUtKHPmi6vfxy1fmW/qTEYmdc/R4EXZw0qEHSdUER4//338/kJEnxeb8jE/QdOHnPHjp30J08ec/cdO+mP33+c999/Qk6ePOY+cexewam9+rSf2lupU9f2J3zHG04LyeErb2kJH+2JFeTXV8Ay/9KePkjKLz7yL175yTPv+fTF4emDnXcSj+TZ6bgEX5AlywEnT8Tt+5K0AGXUH4oIPx2RGIXLOixZv9uiW5y5dymbIgZVueRRp/fNUM42ZwpTEAUPJ2hH7WdFp8XLFs9KD6fSf2ncQGc98eF/3ePMb6yjPzC+NiwGvvzlL3/8H/7Df/jGV7/61c/FubL6JL9813E57k7whP//fPgn/sCvnvnFjz7+3MMy69co4gtYGB0FrqJjrWQBcxJL31eBNynRD0+y1kmf6oj6kKTnuYj9lsrDlKZDqLUgvytAg3aO4tVwL6xPZzUdLYCafkvKAayj6TlZDkFTp/1wp/BOy0+27KOuU0nWcKATDJfneO5nHfzFDnAY5rNZR/LIL/zCL3xg9WVc0xrAGwF0OFc8uAXm1sPnfhM4d25JTbfgHM7h3MMPA7fcksveEv93Lv6Bcw8/jIfPnUt3Uw3hxuzwofXZre6Wza3zr9vCdj/HgMXGxtarXn3kffe98b7t1ajtEw3gSdznAAxPnP3lr8PaxkFeGlFNs49YPGsCE6AjSlsm1lwbt6ISCNmUsqdda+5t0FT3RAGRUcGw1u9iWvhTZa0TuQWSrWibd2E2obhxVqIxywwGmoe16AegoEOlGZwQuJlNeNb9viFgBi1l1wOb5zpcfHSGrh8jG0UwrK2tdV3XvffVr371c8eOHeu+lCfVtjajvnX//SCOHndvOPqgHD5lM5Scwim84egdch/3n9lihnnWhLNO4yY6mazkHLdKlCvYqeeZT3ltRfT3Ed7VtlJq8GOaaDHrCqK/G1ZKRVEp20hWgikb32umnU9cTn1NpK63nkbmC6toZxgbY+KNvNBrDu0aVqWVcyztz2lVNbTNPRYWAwIyAHRgR8B5SDfgNa/53bfJ+86/7HOfe6g7fPh3h3l+EZ967JO4cPGi6vSNAC6afy/iIh577LE9zLaLuHjxAi7cmO/cVJV5DBcuXsRXf9U3vuGpc5/9nTtvef3rPvvwL33iFXd+zeELF569eOddr/qqBfDcbOa+5tLmc7OdYQCGDujqT9MBuLy9iac3zgPDgBiwBARs0vS3x8bOBjaGS+OTTj3CWD3QYeYdd8TLjes333bD+g23LxbDzsH5wTvn/fpti2HnnBfxB2cH7/Z+wJXtDQxYjPz1hdbZjzQWi21c3rgM1wFehkkVzcb2JrYXG6MG3rWXIEfXff//8X96C8XN4sHI6Rmi4Il2/A6Efgy6LLDX4xKwwIDFsAM+pbICPVXshAR2hi0Ms2FExdDKjysYIUbPsXcXuvXZga739OAacejijU99HQ5/NYAds8WsrmtXADx86gwB4aXhvz8y9F4Eg/dwbjTV5JO2by3CCVosR615qXN4ike12UgljMAAnFq5Rvv1WawvkSmhSp+gS7lPmvKTNAQlkZp2WeeI01eDuYrUylLxrX63M5raDQB1kExLG4PgsN/st5L7AhSMCNDNgece77F53qOfDYA4eBm4tn6Id7/67l95//uP9w8/jP6d7zxeLHWnlhpq3nD2DjmJk3s/jBwbd8HjAl5FsIngegSmngfZj0HooRasWETOozDpZlMjm7lx80t0aLo+lCcaVnh3Amv9dfU3TdqpLNr5TnYxftBg+qEwjWYFINtnJdWOxBO4+qDbBu5M312DPQUx2nd0HrvgepLFHtUetVYxRLV0ax43v2MRooGHznsP3Pn0v/0f/uP3DV6sgLG5fQkLWSjLvp4TeW3b3llMGHKyAsBjgHcecpmVoCbC5AIkHPDUmZ+/cWNr6/Jntx86tNFdufjFZ84eEPE7n33yUweGxTCs33CgEy7gvQDSFwE1+gA4YMEFOFNiuuQJyACoLb2HF+1JTaOhFQi2wyH+Aq7gYuiubAPYzrHpsh3cY+LY+DALvF3HZQiNWM8wY9M7N9GFdnYCq01Oe6fHk1e+UMQ8KbQGM+0cKmBc5L1r/Hpc2Cd80iZH/HCNvEsQ7IDB5JaGyqjjIeLhL2IAsJjdOO/74dA/e/sb337p+PuP9Cd4erESzfaBAPj2o6cHoJMt/+1v3dnapsjMjRNJDJgyVfo37cpSnWcr5VqWcLw+bHijhGoIleXkhzly6HiJ6B6nslsVuhBWVlYW9Yje3PQGkfaAIjClRKkx+9kuyitpRDc39uEo7+l9UWA3cl0WhInIZmmKMm6UwcNRBOQMZz/jsbjcAwcJLkQ8XLd9ZXjmd+PIybe//Y8uAHwJPvgRxuQEB3nwzOmXP7vxGIcDa7L1zON8+sqnAGyMh9SNp8cTNg5ivj7rX7b2u74BToa19fltF849Jwss2IOy1V1gvz278r3f+G9+UmQ/yohiv5Fai5rBkysg4uId/UHo3xsbDVH4t0op5MRvXHQ6EUO3RlkvP6rWRlejvYvEiOPiG/cNsPomcrrtIw0PiBrFvW4jd5NVUQJeNzJmll0s/SBFwBmw/gr7GT47fPHg0+e9AbxPgswevjYkTW8QmDRtVxoMtJsJsDDPxgXqwuZ56Tp36MLGprje3Tj4bZDstzY3hWR3+blLAx2lsSRWCmkS077UqPLBTDwTk55zCkNb2AY514ckKZDWWUaNl1Z/dWBfJid2mHVpSWZS2Ncaa9H+oQz++bQpeRJnO+X3aofU+niUO0rk04hE2TnXeRncfGuNd3Z3v/cv/aW/NPuV9zzijhw5AmD0C19lhrpGBcDo0/W/feR/uvspOX3vzvaAEekDVmsnFsQh4fiJjpyrtXraLKoVctTWIgt+r+ZkXhIsCCrtHqUCRljAuogyu5hyWtIrFSdRKyC2zuIAWtNGQdssRmI2i7jgpmwhrN+3mH4qChKw/ZEcxWj6rSNDSy9ABaPj6LC9Idi8MuCmV84wm3u4GSDdgLtecdPG3d/3X+/8qT/7g99+6MChW3e2BrmyeYHe78C5GbYWV7CDrfHU6XawtbMF8T3pvCzkyvqNa3d+7fra+isvX74gO36TnQMWsoOdxTYgY3DCIFtYcDQr9k4OAJx58Vf+6yP/6JsXwyY9IV4WXAzbIEczmbjFyD86cFu4OXt4joGYsYMcGDENuRD0N3bYOnPbxwj3k3/7uHcn9qFDM6Wt+YA0DgDVBpu/42oHLv3WWPio1ZJE4z7tN812O6rw3wIliaXq0SjoJgK9yvWES4Q07vK3PvFxjwpKKbSN1HmK6wNc6UdM1s9FBLJjtaYde+lYZBkSSdlDRK+lpVKz8M2ESOErXGt0tQDcYlPHjhggnRv/jWtU53pCRFznuvokXGtGrY9p4V7QkPdbQzoeVlwt2DWnMFv7YxJsc3OZlQYioItruze65LzXsTI+1Z+Q1FagRhu9mhcCsWkNxc4T+1ko96bYsBDZLzpjj7bQhYApz8F3684dlNlH/u59/+JXyzatggKvYQEw+v9dwWd/X3dg+wZ/WTydOBGt3hYT1VuqDGTqKKt1ykZ8DAucsM6VadYkKgFL0slG0sfCapXVi512gBepj5D6nkhp2g3ePWKBZ1t0bJ21YGhMyGLvUQu1pSRc0DY5TUVLq1Rltc9Iy6Sd+5tT1QEiC7zxO3sItuA84NZI33msr5+7+5NP/son1w85zLdn8OLh50M26c0WIbq0A+AhawynRw/IgOeGc6PecE0daaP5ybsQtTqg86PmT2QIQkaHcxtfSAcMau8oAskuKQs4Ehcvb42OOJfHQR998rk4wG625m/8CS8LHD16xJ04sb8gbKg9XwsBYjxsxDzTkzukxkqxGw9raWZyE5UJ9QsbGvUJYUvM5mb3tsmNk8sFsXa6yjYdlSUOe0JX4fLNOkf4lho0be62UdeSDoiFEEj7vtXmZxR+MbTr/Mexj0Yx22J2YUOZUmiygc9aSFPU9Jv2+FITW/5rDgOWp1Km0yvmAvcQPyktLfjE+/GQZfQi4pI2mA1h/qqMH8uV/XV9WuAzfrUsvgE7DO0PEBXax7gPCYgZFk/cdPn/9n3v/P4zF591558770n6tbU1vupVr/qlf/pP/+lvHj9+fJUj/poTAIN71g62/qR3O8KOPsKKGWDS+OnRhiuMf7sEMcJsOE4WEps/VH3RlCrsorW4s3SEaCj5i6UwT3dKAVqNyj2qHZ5nPWut3CsTJgTYfppyUxiBgilQBaFGbdttZUAzl0G9Ypfa0ujnRXQ3DGHjcICMPitbWztCR164KANEdBQBkpO8wAQBJUd6cXmWVFHRHtlbO4D/Row5GZ3dHXsnVbDCuHvpoAMvgOOs0+M/UvYOW+t+2Ljh1wHw/vtPTw32tXltZxOZNKPWrea31CpNaZnQ+tTIJZoxazVufZ4Nb5HK5EmlLWQjmQgnYDyF0wrISo4hjP8VlWaQMiE07mrebQgUyY+qrs9GV7eFm6bvovHlk+bGX41bxYdGwnTsQei1mNw213hxwKhN2GjkIZ9Yplrja5ZuGk0uySJbUlsD2wR5oLaG2JjB1K9d5oAV1DOcT/Vtqe+NyowshYWpeaBpADuY4H5B4QNbo06INL6pUuZXGWaSl5YjOumd3/B49Feee0f39NY7BuchXrBYLHDgwAHccccdbwWABx98cAVK+ZId9F+qS0CBuH/84W97cHt+/rWL7TECeOkCMHGKGP0dOOnUu8y0tFS245JFfZlJZi90pj7uMtBCdhcdzDcoE4xb1hc2Yl64N/5b2lLDfDQW/XqGifIjhPbBSlIYORGsYtQoSjvl1eYUYjqiZtWqW6RpkPFSBJpxia+PnT++n9EdxC2f+6FvPv3VGTwc8N5f0xkUIgzM//Zr7/4Dv/L4ez/6+LnPS+/mOem11BO6isLfk1DTmphL5rVc3cLTDK5oOsKyijvDEmGzfWuv9tqrk/xqdIPd6rEuI/J8d4NyfeHUmqCwThsYj8+3IZVpeelGoem229sCq6poaTzHZvCFggXb4xjb8Vs+3qwyLe1xni+bQ8VYlu1Pmv1qP7CpGFkqZQS78KJxwEpKh4gV6+GlB+YCeXSGp/7j3HMBjw5wcAPJ7pZbbvml97znPW8nowf+6rpmNIBxI/kPD97/DX5t+57tzUE6zJ3A21k35WOTTjUS/Nmi6c8pWWBCw6UPKFJ8JmKSwCXVuhRGX7NFaStrEkater/0k6W02lN+SMyKPOFE1tBwWpJ6mRew9d02URRTwEeRNVUnIZmSAw1KTalZKIB3tX9IMseH56YPMsLBlHiQYkxUhclGObIkX8qE1YgE25FUpsLsR5M6pOYPrRYlBiRl7U9xJI5uAl4o9Hj2C+6GP/2n/8y/ufW2m97ovcjW1hZ3dnZ4zz33HPubf/Nvfv7aN1uMY+CcNKCT6g3s+dJoH17kBR5TZfc6G+W4xyMysZe690B7D8LQ1dUjL/xkzz2Mj/ruyQKUmniBY9eCvNnD35xuL5fwm4RVM3PK7Uh2mee7fReyO9v5PL+fPY4luQeaRXYdGMi2qA2VvX/zRsEf9T8OnXjAOVx8eA5uda5bG93DvPecz+eu7/t/TVKOHDnSrTJEXWMC4NFTcCcEcubDn39LdyuITS6E6EkHKSZUeaDJlpO4wESEeo8MGFsIB5xQiDWc1a3YZF+k0oe3zE6Jrg4yYY3w1zqGxVRwpG1XTnnKGuA5mS6lwjaj0d0X7dGA1kbhUevqqeEuCtsajaP0LvYORDMECxgn7ZsEhbChnJrLvgUhzzmagJYokCUBzscKnfEppU4rJs4Qt8EGbABrA0ZdWTiJjyPR4fMf3bzzoc899L3dF8eDyWKxwB133IF77rnn2l8Vtrcb4YKra3VdDxev03kvL1xy3/vRckz8fbnD5hcBdipXuEh34MABfNM3fdMvnTx5cpUh6iW+3EtR6T8/e0JAyMXhyXu3d3ZA9CP80SDwAftIgPH3+AONHzc6mIuoAAVxOahBch2pXCqvflLZ8lkOVpCkLWKCRcnl9li/bzyTmjbQaFezfthyJW1PxYdGe6aeedh+Lylv2qrGLPE+CGYQwPvxd++BIf4uPtULqekg1IvwnoRgExGfNE5+kJQLOo85k3CW34ltd4lWbJOIC+PjkuZwbHvWDIrPwqB4Ue3R4xExJz38huDZRwYRzwXJgeT2bDYb+r5/77Fjxz4P4NrW/s3noFstjqtrSkYS+7Of+nPdHnpY/Lx0400B2DtsnQX8MyNmYGD70HWd3HDDDR/8oR/6oUeu+XX0uhQABTx5H/wHv/Cfbh3czvfsbAyAdB0wBDOdKEf/8sOLPz78xECL/PdoRm6Vbf3I7vdF/73Xf4sf+ufZjufR3kBPmu3f5YcN/hpeT9CkV5pGb8ZK4ANUzDiepArW0BhXYcxEVLspSqMbsYEcAIeoLRaMoKFxHlDRze2yz5DagXzCCG4kCfBUBdQk+jLkeYl8OqGae64nNp/pcelsz27uexF2wzC42Wzm1tbWTosIjh8/vhKfVtfqWl2ra0ID2EuHrS8Qw6KDCz7c3nusra3xxhtv/Nckt1fr6DUoAD5w8pgDIJ977L33DDN52bAziKcwbuw5pCr8LQGmA8X9id9Z3hNXv6+0WCMEiK6DiWZ6L/mH2fcg+USUNUi23bkNnHjGzGpZ8p603nPQfhOpzVLypv2eLecydmHVrojvp9ok5Xi4EInt0olxFKYKOkGjCqVtG4u74DvUjfwki/bT0M3O5S64AyhaEiKBw79QWlwzzuZ3FzTJrHgm8Xd2AQYmouKP5mVRfXNdh2cfIYbLw5g2a5Q5u67rePfdd38wMOeaPrXOkkZgda2u1bW6XmRdo/PwV4jtL86BfgE/wt2IiHR93298/dd//S8AwP333z+suPXSXi+6D+AnPnGGALDoLv3x2WxHrmxj6LzvPQz6cxGkZEGZ8n1v0kFJxho3kWKUoCmK+dDocrUGYBqwAQUq4slg92lfOOsnaKLeDMggUERITNZh3yvCTmQqqtYGvchECt7y7zKNnYgCyJEWfiESUjdFpUmK8BNJUBs1fwnGW+Hvk4D3TAEdUvqTqQgbOy6+0X41VySmU/IK51HjTaBwWJYs8KW0J74ZtUCV3zhrP2ObAhahjErCZx4VeN+hhwB0AoJra2tPvPa1r/0EAJw4ceKatiPtbM/QTUZmYxcZt4WZMZVf2jXKcaL8bnW2zrQvRrl4UJAXod/PhzafJ88xUe+XgvaLPd7Pl/YUUvd+Hu+Sny817T2WC+swvQDrgu0ngcUzAjdzgCdIDLPZrLv55ptPf9/3fd+jGLNGrMy/15oACJz2IuL+8Ye/+8gmt0jpOSL2OpVqRgGGFnhVRo5RECLCYG5EDkGXlJRdCTCcihC2AoiYqKi89XuxOHYS8x5SkjyahTBvswVMREnmqFZJsAM5qlaMzEhK470ywrakXUSuSQvfECbrQllOdM5V01YrdKYADNWmxO3wt/dAK6GSr/oA1HHX7czForOcIOej1NlfDI8kRh6rwI/J6EITSlML3TIEUzexuNLj3GMC1yFoHb3v+r47dOjQx//cn/tz58KKe21rAOez9B1Rp9gRTiPbVov/rnqARlBR8fFz2YbHF0C7bMOSaiswwOfZ72WAhZNdKvt9NbT9ch5JAT+yawj0CxxvYYL8bvazSgTAJc+LcgZ1ewo4kkvqafVlFyTwqt9F2Qp7by9QQHsd7ynhc2qOlriBrc9uj7Srb3YqzY5AOxLHddj3A2bocf4RQvyATubwXGCx8Lzhhhv48pe//KejG83K/++lv15UE/A4aPC/8Kl/cNfOcPH3LrYEFDoZ9QkgCceY0SFMngpoUkO+B7iB+A5ihoccIaxKpSjUtkOrRvlsl805bvM7LvqMmbyntM9UG1s/TtEiGeCto5Yqlyvrt8+caa/TZXX9E23hLvU7upS7UzEJBiqDqgV0IDsAXTLrkqqPtPzP0bc2A0c0++pxbPEw+u6x6IvTddLyYOxTuUzVfIBpj9YCdIoPHVzf4dIzDptPzdF1Dh5jYveu69D3/U+LCPeL3woD70a/zsAdl3nPYg7Fe2Tj9/i9qR+U9YXNIv2evtH8rbJBB0W95f1cJ3LZOEvCoSDRdvpebqP+Xkw7uEt7YPk03Z9M2/Cn8a222pDdFTS/nXmm+6rbOu4CDdpqvUnjzbzW1GOsaMdvkQVt5ywt/T1qni+bS9B9DO+4xrjrOZf8ii0djfDcpu12HwfacTDPmeupvwdX8Rwovyu0xzvOZejxcBNzsabjWt9i8U2zeW/Jd6fWXQbXGT0HxkcDOtcBl2bY/GIHdjOdF7ZbX1+/8o3f+I3vBVbm32tSA/iGN4yI3Y9c/OzXuwOLA3KFAyidwMEnGBd7crBo51pDpwQkBWgZtTpx8cpaJWfrkgxYWqi/cl3IuXtFslYuaQdj5GqEU6lyIXLUxLUAU1lAlojOcMKk7UuWSWTNY6Jh8EmDOTVXnRPgkSMfYNzvbH3lgRiA6ByiShmpUfCzPjV/yGUOE5GcsyUS8ebPDOEy0nWmc1LA4ShmqMaOpv2sNWTqg9USWu1ky1DhPcyin98XlctZI7mOqeTgelx4zGFxBZith/kHcZ1zw0033fQhZNvxNX5dAeBD5hQNIm6zzzsUmQ6A7Dag7zVyzuh0kBmHMmNjupTRgArMFxa4WWqdhxhdrig6RJVpViQY+0TRDnM5fDtULhQs07rplUWsHlla0FACZcHQddIk99Hin3YxIdoA5dRj09JfpfEqMruI5bkem8gL8740aIvlecoxJNmQmvojVV6Z1Han1plEWwplmjESMFkEWGg0WtlOGNYbo5MSm0uqdHux45D7O/6bU4eacZYCqgswiAM0s9PyLO8qlnbJc6ewU1lguVbfZ8Fxl9x/xFIJc9IBxXdXQizmPYMNC0os61CMDQXwPWYdcfkxwXCe6PouBAVysba21pH8qfvuu++xY8eOdSRXAuC1JgB+4vDo/3d566m3DIcWWIgXhw6Q7AGo08HoD1vUFBJtnpyCSK+su8w23EhNLJhvSrZdpMSIuHkjBIlVdceF3UchpFiARiHUV9m2k95LpMpJGc1qvly0Y8JOgXqmEdnZfi8FqnglIMWk7SMPfGi7Ru+P/dbtj+fl1OwgifqYu5Eo8h8HyJbY59A3ySc7s4yN7oBetXGoBH+9oY04kIGO+HoSFBtxeg9M5uKIGZjarnACs2CuoWFsnjAGYcj7Ac885ADMxghkT08Ht7a29tCP//iPf/onfuInuB/MFjvYDgcbWMHe4FFSCe5l1oDab5SQhplP6o0JMWftWGO1kRjhxX4BEo5rtTVhOYCyM8IXzcZqMUGDlkPEpPfS/V5mKNZolJqLOu+yFZnF2EMkfrNlVhy9oVMUzqZUK9JUKqSaW1Il3TUHNT0H4ndIVoZTKyhILYSH743MwnDN81ZrJafzLO5zynZps3Bag6+03meBu1oLastM/YY/LV4W96y7TjHX9LsiBTZsPbY1HiuqNliqjT1F7Hg3+cPa4yitBkUbvRt9sq98gcDggH7cb/0wuG4+51133fUAVtFn16wJmPcfPT18+MMfPjBg+3s2N7YB0Ilx2I9wGpLy+urfI9SGQJb6a7WW1iw0yOROoeFI9HMvYoU/5SzhU/sb+YH9MJH6SyDNtGBjPd776mQW25d83IqNSsRi5NlmBnrV5iYQH4Wx4jSa8PB81YZB4ihIEcQx1mcifJU/pg+89EbrKkkwtcEgE8j8Vd988U4UMMreihFIzbxLEDQ2o0W7X1awhYRnzmHnksPFx1zw/xvD1vqux/r6+odILo4dO3ZNm3/vD//OZnM457IZMZqSXMO85GqzGl2IjQlZFdI7halx9DoI2Voogd5Yp5SmJhdhhrKZmNqdRJnXQAGdN6Zna5Zz4Vloo4MxZVlTJ0L7Yp9q812io/oz8sqa5RDMkakcvQo4b5gIHRPtBFdEWp7H8h0A50e3K9UmqH8jZnpqYzTvhx8pzYZhXJDqLOYAcr/hZDwU6bGp5spYruKjK03YzGWcmHGLZ9L8bhzvok40TNOuMd66jcldQBSPHJzqtxmrOG+dmpOOlVk79ZuivHYa5vMwNhHGqnSdSDxyBLtMu1Wnpk3Dc7bHJvTb9iePjZ3n8Xvw2T2JOjOMmpOxTiHYDVg812Prix3YU+v03Ww2e/x7vud7PghATp48udL+XWsC4PHjx0lCHp+//9VbfuO1O9sDskcIKh+H0j/N/r3rod2aAyQLK82jWEPE0FCCXAL+vuzZ0jDJZWkaX4ozzvPxid9DO7jET5nWrRJqfVt+NH5R+ysNQ4fskZQ0+tWISBQHzrZx+ZkOm8+OAqBEAbDv5e677/4dALj33nuv6dNrEgADEIw9HEiBASuoQmc4xf9WiI00bLi2TibtSRbcSXuAqNKGqTRVVBqQ+B5LeyoL8q04l5CWsm17bc87Tbu2IS79UCx/kIWClo1BH46o82ZX5VBpcdsp02B4HussNZLlmFkvHinqa9xjfRhkUbYGZhblEmT7zWU8R7HlNEzElQ2X5ljePMhb/rTmZKH5rMZc2hpKLksDKEUm1WXWMdn1oE093tnLx2AisNH31veQfVdhx4bAAI+u67D9OLC46Az482w2wy233PLe7/iO77h87NixbiWWXYsm4KOnHE7An9n41Lfw0ABecAsBeutPhkbUfzTL6ly4zpgM9YJcKHGMjwKVj580FsDC6yHfEytUtoICp3Lt5mdifJ20KWQqyY4sMRMBV5eUqAUKwImlZrdn+nmOpLUCobbQs21pmRAB6/GQXfo9xcMWr6fqpZo/2gwzgla7DInDRlA1BMAc5x8Dho0Os3WEbCO+O3jwIO+5554PAsCDDz54TcO/3A/gRBAAe46Cbk+1jVQbPGvBW++0nD6QZWMSi/NUniVS1JdTMsuSGW/zQdp6yrnjCgFBDJ3cRldIhvX33jpP6/4k+ZBQWJrhZvS5KFNTJipsZr2UpoTTEr6p2muNvTXPLX8S/ygTxspCmmR7FWIl5knNH7NKKBB5FjxnLQqLHp8iAXzKGR75TlEuH9p9gLXoyqn5S+P0sHyucfm8QOkLyOxr2oSxaczdyYO9PuWI8U9NGeiZsXBZfesmjA+ovgf7pYiCAhvxdwGKwDuCg8OlL4ReBogu7707ePAgXvGKV/w0AF7rh+jrVgN46tSYr2/hLn/rDrYpY4gfQiYwFYXPjBVMwMdACI73PQosYeZnoo5HEu4jmC7sD1Q5e0+a93JdmZ6mY+trlQNd+B2mnL5n22Tv6TrRfBemXPmuKD6haLtU78LwAc025nHzqg3Jo6Xoo1R8s/ekaqfto+UdJnmi21eOSV1v8Qxoj6mZcyPNPA/HgBbxwPmH5nApEwp813Xsuu5Tf/kv/+XfBoCTJ0/uC9iCUQMY+JAwysVghAupMLgl/Gi+xnHOJsQ8HyW8yzTHhDKuBRnnO7+f1gokOhqrXMwPIY6JjndS0dHtR+ibWWecfjf0x/RVlTX91u0Z+2P67cTwAGqdS210VPyk4rMkHkCPSeSHszy3fRrr8hXPUfQltrvkRfHcSTHmNP22a3N8B2bdzWWZsOt1nV5jyifTQjHnnL4nKDH8zT7iWN2zfYRdm1zNRz1/fMVDsetkeNerPoqZx3puRzqE1zyLdF3Nn3hgac1B3e5yHxA1Dt7wQs9RqcbCq29Z0vdgv3kxc1f3l+BsgcWzDlce79B1COlMR/Pv+vr6Yz/2Yz92GoCcOHFiZf69FgXAo4B/RD584OLi2W/e2V4gJ4D1OoFs9TfTPQ9KiLnVZbx+RycPLv8ef2TimTTL57plsl6ZoDVFf29lZc91tvqv26vu+VY5qe7trT/5XVZtuNq21/dkaR9lVz5P3/eN+lt06rmo5wCjCc57dE6wuOhw6bEdsIuZQ+Dn8zkWi8V7SV48cuRIfxUK26/8hcE5wI/RmZQROqKTIj+P6BwxOkePVOWijOJYvlvmmgn5ZgQh70zWiTjWuYHU/pjyuozvhvZIbleibcqVuYYk/x3eZTB/M+eESRiJOj9O2W+n4Ott3p6xX0Fma/ChaCeKPDwiKUAn83gZ7ZKnJS8yf2yOIc0jVnxxBc/Ke2Zs1NzpEm023o3jJqo9eQ6YeSNZNxz7WOcvyspdS7tVj80NVNHedbz1PRbjwCKnkeUp1bNMB5PjHTWbFc+reqe/uw6tb4cT36J+X6rvN48N85qh+NR1M2w+2oGX3Eh4vIb5fI5bb731F0heCeZfWYll15gJOII23v0dJ1+5kO2v3tkchDKjRESMZUCr2n2GWdkspd0u+T3QQkKwhkYQNK0KdWKNQmVuAm91o0t4F8hSO6tM2qxb5RqZQ7T5bC90ZCKWS1fRDALkdP9QwNhEkFXjgLJLG1u2Wc2aPZSrxvsq7N2ytFzLbOgstAMBeGLWO5x/0mHjPOF6B4hgGBZcX1/HV3/1V38KAI8ePYrTp0/vk2VhJwh9gHMxApzKIhawrtO4lSYkMbgUKfqahRksReeXvhiw8BHQkcHqfrGejGYlO4GoIDOM76qix6pc3riSZwANckawiEpNu+p3NL1RgZlnc5xr8aLwcaH2TYsQHNQwUMtpVwDFyLQs7XHzj/UQsEDgURA2366kf10KsFftiWqeahzEANnnIAKdfSiMQ8w4pMDgNSyXtdiKtaY35h8b88KJMuGyiI6lnn9i+Jv7qmhr7CRKhgiiGg4FC+aqemhM3yXtWOfkHCh4NfXdJZgjFgZ9NT81AP/u/jhi9opx3/HovINs9bj8UNCGhgxL3otzzg2veMUr/s1KFLuGBcDo/7fwT/2x/qAQF9wAh36EIlCTKJ1m2PD3EjXZypRpym9MSqmtxqVrObZZrKuJRRGshZdSepXCr0Ua34JYn5dWOdvGhmRcSrGyWx9Zpcgr29R+nxNtUt4fUvja7OldNAN+0yIrrCW11ni3JFhpnCJkqs9TpwCLACZG4MxzxmOMAD7/BDBs9pitDzF3Jfu+337lK1/5Aewb/L9gAp7N4MJx3wdtKkMwTNzgTQSVZNiR0aTk0/jGzUyoIJniLAgbmQeUgJRhhTKUEdSmUvur2akmCnczSm9KgFCba5YhxxxDRugyoRB5Q4sbZtt/VW18aRce73kVkZ6hmXIGnYgA5VtnGakFoBbAh8UmFJQpGkHly2cEntEfSwpvNUtbZ11qO3X7csFFHi8pxgEpbedY3AfYIQmMkCxhVe2B3jOU7x7j0sA8V/L8g8IhZEIASNmEEEzNcTySn6LCGTUpTEX1DTbLkklfGgXY3B9GpAei8CPU4xD6oBzNa29JOw8rvETluykKEk1Ya0kiPZ9QFizmq6hyyQ9XAmKnaMQ1nyLxRRzc0EHmHltPOWw/5eA6F78233WdW1tb+60f+ZEfOQ2Aq+jfa9QE/ODZ0yIivOzPf/vOsCDh6DHU2cnSolAKdApU2KuIjCqqV6bVh1W5Aoqkeb9Vr8IxWxL9NVWnVPRQlGv9tNqNXcuxeC7NfkkFjouJctP0sYSHsktdlp5Mjt9EPZOS87Lxa0PDkJWat4geF5vCObzjFw7nHnJwWTj0JN2BAwe++IM/+IOfAoD9l7ZIEvyDcy4h+2dIlUZmllg+way4FCru6FQGmTL7DG3Whka2BOdyNgkDrZKyvqi2hva5KhODS5l4XILKQOqbK7MduFxvhtWoYVDgcjaG6f6MdTlXwplkOtAZS6BhbUL2BldnTXEKrqPKuOJqqJE8DsgZltJ4lZA5SP12Rb/LTC2mPdBtrMfBFe3LUDUuw5KgkYnCZfUdXUmnzEiR5180ESPNzfH9ca6gkd3Czl+d4QSRFykLkR0H5+w8d6o/jm5sh4vlaIDn9TiATs0/VPMvZcNSkC2OsLygHQe6ONfUd8Vy7qKA+0FjbIOJmQ4O6ttKbgQjszoOIAawA7YeARaXHZxLYqrv+xluvfXWnx2GgUeOHFlF/16LAqCI8OR98L/40X9105Wdna/b2tqBF+fEs96apU4OLeWmzhIulab87jZA7SGuTXy7pYhrQZe20tRN1VvSXla2+JG91lWmruMe2qXBFRo8lL3wptWemiec7Fs5ZnvkS9Ue7MIntMvGuabNlSo6yUxLkQxMHkxTG+eBjTMd2PuomfKz2Uxuvvnm013Xyb6ELqCKxYzuGcywDmDOryz6PpDx7or0fjEJYi5L5T2Y00MmPEDjaRA8k8TWqOQYpQlnldpvTCNpVYYjDWcFDZ0yLGkNc1+i13wU7izQVSEQlxlITBsTAKBJ46gFrxEMWPEnae40/mGey8bzS7IHm44j07StgOXAIqsljeeaTtnoitzaebzrcSj6zewZF9efLOjDzgE4JeircaB1ETFtRHRFcMXcUIcWMmS5yXMShj/qP5mmDc0fM97OjrdMjXeu0/ZbzWFp0E5zwIE6MqsYb92eNMNEpxbVLhFqbNVcz0I0CuDp0G8nAX8yY1Aa8OdOgCs9Ln9eABc0ttLBe3Gz2Wzxqle96j0k5Y477lj5/l2LJuCTJ+9zAIaHFh//GjffvF226MV555Kn54TGycBtuJDEw4eP3SWfirhxs4CFyenacgohk6ZJ119YE5oQJjr1GkuztXV3Ks3RuTwtQHH5XpkrmwbAv9I8af2+TilXQpqUbS7rN81iJWdXEDdVFrbJ9hj3ICPwl8+qvhUmCxa4Lq3211AuypLMnJaKhUDHYqPKJpCcHSX5sAUiHh4UD/QOl58Gtp4F3GwMDx6859r6OgH8jPf7NF95EoSVaSfvPmY8Rp7lLDmShDQxBz9Wvq2SzqDZRGUsywYSroRnMXA+YhSX1aGTauKaeYcxS4yBWGmYQ6s0lkUKvAr0xEuKKM+bt5jUeRmeRFlNw5zOKdaYzdbx0KKyj1j3RgXyIWj224hmYYyZLX7ZjJ7Mqm2fa7P+mQWUxtwe7ex12jOJkaBAw5SvYWAodryhU8r5qIG0dg4qPlbrsZ5jUqTqVLArovoE6CxKleNNSFKUMz3V7tU5G07L7RlFWrrWeKe0nbDASNJoj07ekw5wRiOTmZP5kt0tqGA6W99Ovb7S+NU6EAMEXe+wddZj88wMXecC/cGTzq2vr338H/yDf/BbwfzrsbquPQ1gTP+2PTxzzK/tOO/hnR9NuT5Eu0rIpmADMrNWyvuQwQ0uZYzw3udMFeKVITNnoLD1SIpcjfSSuCn2WV5AVB4SrzNfaDrKjJsCRnP9OdtGzuJh6lDZNMZ+qWc+mzmr97yktsegGJ1RI/fD1i8+bwpetB9QjGpFMrUn3kCMr0+so643t8uMg5QZTGJmjTDmKcOJoh0ivDMNS8+MpRoPUfk185jEusISHuZFlM1ywG/M+oLUHvM7YuDvAAgxBDiD84/08IsubmgC0PV9f+Hrvu7rfgMA7r333n13eh2zUGQznHPKpIhoki2SwWtTVMwo4JI1KzmW0yh3Y9aF0UXEOdjfQwRjPBe6lFUhayKdRgiKipZUT6Tt0UATUnQkA02rOrVGzFV1isrKEe/FzAsAO0m+lCy0p1B8KdvuFN3Ux0jXaQ2s7UvO4hBol+Og+pfaGMI4bV1KK+UEroMaI01bVLtzVgqWfSjrT7THfrnGmMQfV/TV9LGgHe9FnjsNSWnaIja7i5lPerzzuLlyHPS8ivztoMa70SeHJp2pfrtivF0xP6p+F/cM/9VYo/U9OKTMJq74/iqem6wyKDKZKA0Agd4RGw/NMGwS7JLo6NfX13HHHXf8H9vb2wjm35UG8FoUAHHqqBeR/tL2pW/e3N4CXU+hK4IoypW5AJTUp6Cw6TdPLGVeXaidQZt7yOXm4ercqf0wGs+MfkybT40KZNIESUyUoy2X/XKZtSJRZR/PzlMgn41+szRhl5ZTVb/mg2hVikrxldT7dThkGaIJk46hBG9lwXMzBlpN2HpJq12zGcioUJTfS+of3QhMKpZD46Ej29KSk74QFAe31eHSI8wZKES86xzn8/nvfP/3f/9jAHjixIl9t3hpkFxrc7MBM9VcVkKdzhogMXsAc9Qi1T2mVGe6XHg3pZPK2Sjye0jl9I/JWKCzZFDfk5yqKtUDex/q3wAPRFO3z+8oelHYhSja6bkKpNEp6WjbS9j+pH9h79Xv5swUNBGnRRtT2ZIXRd2wY2PaqOuU/FwMnSnaeUw0bVb39jbe6Xepy5VzIfO3qA+NcWiMTdkH+66dayznhZnzah7Azj1MjDem+s0l87wa72JOiq/aI0W/0ZxrtJY9ZJDtGQC/SVx4iOhc1p4Ow+DW1tYWr3vd634GWu+vhwABAABJREFUAI4ePbrS/l2LJmARIUn/h//46w5vDZd/3+A9IKMXrEkeFDCdJJp4pU6PXQeDjBu5VoeLyhBCja6vAhRSJFkIcTdp1wVN374a2b6016qyorMIWIFUmuWyICaKtuiNc6IOYykzddKavCb7llX/0hBOWdWfI+e0aaDVrlYU8NiO0paL5ENjMehRmdSUoWRPfK18NAWFQBznnzWPZVmORf9i3xy8AH3fYfvcgCtPzcEuKVBl3ve4+eabPxydl0+fPr3YdxpAuBFbTiTBbdisbTF2tsidDCjzqfXVpdRJpdgIymGZo00ELP0RpJ1bJLuG2G+IhW9Ci3bdxvA9mMggXSfrfje+XzZwqcosXvq7q/lj/aJZ+D6ISdNG66ZhPHAilEuD50v7zSLJiMXGER3LKmqNLo5Fy/mT6VQ8LyKeWY43ltSp21jRluQTp3k5RbseH1tnjUil2ij1QZYoD1ZejUPxPYgdG5NfZMn3gKX9Lu9JtQeW452ip1H66lvaTgRu5nDlSWLnqQ7MKKmDc6674YYbPv6DP/iDv/3X/tpf25cH6OtCA3j/qaMdAPzW+f/y5u7gzrr3XIh4Rt8SLxhNnshmtvh3XJCsuc9+xPYegwkvYENrs6rAmBGj8OIlCwYe9qCSzIVFuWQH1Ica9SwHjIoV6IrAVK9hahS9krY0A1rZDG6V4BNSviPNNmYhTqRsIyfeyz6X0adFBFUusKQxK57ZcbUKO1/yC0W/tRa0DMRWMDF+on7LE1EmcOYxDe96yX2QSgAM8LniwW6Bi0/22L5MuJgTzYOdc/5lL3vZewHsa+flpClR2HNZNPNJY8HkSykBsJnZuT3qWalDHcRGsKqt0Km/o/bKqejUaAmIEYcw7Qp1ig0DcUpooIiNaDTlciBKnFyuiIxNyeFM0ECuE7DZzR3rvKtlGxMd87Zod/y0CTujXFcgw6Q9FDPTtu1hEZyDHGlatoc2N3tFW4p+N/hDlTRNhSgkQ4ejDruQQEfTzv3OFszsBdocx7KNhj8FL2hBp1wRlAMFnG3C6dIcUiDOrOcFGm2E+h6g/DEdy8ApUWMDxYvI8/xuMgFDRWe3+EPd7wx2VPKnnGtxHXWh7TpJoeP4Q0V7zBbS4dJne2DbQYJVxnsv0fxL0q/Mv9e6CRjA5eH8t+5w28X8OAKGRPJa+lE6qOR/5ZumJwPLgTEzg3a2T2CgLK1T0SfMG7BPLWzYg6EvzkB6j5EaSIVWPqRAgSXDOKMz+sclvCcx/c1Ox7ZOFKCbRrCJp0QW5VT7RfdNYMBB2ehb8gJPffPK8V+ZA5DrpIZOSUEnPrdDaYuiIM+i34Dll/YpBFvPlKU5+TYawMXAq+jT6dNcMFoazXfRZbKvqE8n9A4XH5lh2E6LsHfOdQDOvvnNbz4N7J/0b7X0563pSA+28lnK3543+XQ1EC6UCQn04W+fNGopWCKV8+G5KBpUQikViLPP72h3BMKa0pL5Cpm2QQbWJjdr1jX5iFMfJfDI57+RYU1gykkup/ujoWiQaZu2hlReGZJDmVTpkz9XZE4SnNHgOet+pz5qsOISGDgF5CmeR9pFhm9t5kfZRlrhL9UZx5sY+dSYaxnTTvLcZAEwWrgOtPqdIpWpT8va/AnjQGfGO/TbzAsW9RXjPfbHnlTsd6XGWx2j7LwIvDK0dRAWbX3SmmtFGxUWoe43y28x0Y59muCj8qcfJQuBXCGuPOzAfpEOiQC6vu8vvu51r/tXK/PvNSwAksD9R08PIjLf9Fv/3cb2NmTM4IPB+5xhCymjVkLL9ZIBZkV8cMwvAwK8ygbn8/SKgRQY/x1pjXV4AIN4eOH4txdTt/eSAgF8fCf++JHG4Ov3YtDCEOmKh4dgkFwuBncMul7YZ/H+kII3vGqTT20eaeR2pDoDX7336plqv/ixHp/7Jenv8G8RnDO+i4I3uj6pn8V6xY/8Eqn4PdLzRZ2Kf7Evhob+HTU971X7x7kxeD/yU8bDwhD65lXgiUfmY+y3HqcUeBT/Dlrq7U2H84/65L8iAnHO4eDBg7957Nixzf2cuihpWbTDN0YcvrTfmiCDKKC5pBHL93S6aY29FgIhHGB8s5jpaLiTEX8N1hfMZUgRHbygM0sQ5T0qx3dO0k6BLchtTPJB6mtJW2kKi8CKijaLfjtFu8AA1LRzQEnmeeST6Y/pt2TNkGuUczIG9iie6zGE9tF0zuIgAgmH0LSxGm/ZhedixtAV8yfSgdbIKkzAarzRGu+a585pGB4VSGL8BWMbqfijsQrLoA5FG6L4U443J7+H3J8QbGRgj2K/sy8j4zi4Xb4H028x/WY1z0XR0eU0PE8sB3SBj33vcOUJh81nBZj1yfzbdR0PHTr0y+9617seO3bsWLf/8FOvret5+wD+bX/ckSf8e37lH33Vjrtw92JzIQ4z55N6hcbvSowfgw8aplaOMGuCKdSDsJZcDfqr/c9YWE994ReBnGEgaghVUIFBry/eE226Du9J4TshrawTyfdRrAkTpW8HikAX26YK70JDIiifE9OOwnOFZDClZqT8EmRDSn5VdRIWHx8Fv2r/H+1Dhdrbyf7OwsyufVrIZN4tuYJyXkgJRK3GhkUWGRkTmjsP+Bmx84zHxtPd6P8XhrrrOhw4cOD9JOXIkSPct+bfyidNrCa58hHSmoQCfNs4kIky506UQ94oMx1RygwlnEbNhV5b1CG1xFiydHRgVYu27jetZszEv3CaNnanTbPWtPtNTh/Ex399fod5PaER6NkeG07025RzQAGNkwVLQdtnrO7PNM+xZF4UfVX9IMRoP02+NWp/0mnaFt6rTdukEUQx1xpm38nxxl7mRWF6ZWscfJqTUvZbf4v6u0Vrni/nD9lqY95PHeM8cwA9nBALLNBxhosPC7BDYG18z3uRAwcO4I477vhp7z3PnDmzb9fP/W8CPnXKAcCjm7/+LZzvrIm4QbQZL2htsglOwbokqI6pyifyRRSJIUSmco/5bCKENU0aA6QUIFGtTCFVRpASZ2kii4gUTnz67+rZdJ8hWvAsk+lKwZdaYC0cF6HTIFmhrZG3bfKZ7KL4kiVjKVX7lwr7ok2+iudRgG2YeafqTGOlUlDZPo3mE48Fuo64/MQMW5f9mDFAgGEYOJ/Pcffdd/86AOxX/7+dZALWGihtBmVhGi0FB6sdMvdaQVbQAk8Z1V64tjdot88cDdoaSLJ6XrrQl8gBsss9NN4tedHut5T9rsqxSWc5/8Rq6YiqToCVibsG258Y7woVQZp0lvV79zlQRJpXRz0WY4u6PeaAtxtt7IH2buNdCtK5cVQIzcSyulvjzYm5X89jNg7WCax6zzy3dde0s9sTS+zFGTBcJK58pgf7LgSLdRCRbm1t7dIf/IN/8P8HQFbm32tZAAzXhZ0LR7f8IgQnSEPQYg5EiH8n0EwmfLaM/6YDOlCZYeNGHn/3vjQfh3yKMfgg1c8kDMlefrxkbECDi+czNp9vY9iVeIClCdq+6yHwFktQrFk44gXavnrLN0w/k/KZL7D9FLahyPP58bXZvIFNaEz83rf5JhKeaWxBST6fNZ+zcCfKdNyqN5UDGm2KvquA9wQXwIXHCb/oAOejstGtra2d/yN/5I98Etif+H8AMJtZDYT2m7Vyu+QNo8jXzIbKihpiCFAbT5Hv1SADoNp4jMaCLIRPFLRrwShppiqhQoMANw4shaaGVXuo8pxbXkgV9cRKM93Sm08JfqzagwbtFi/QGJtdDk9SHiobsFpkJXjvpd+lD6G1drBxoGU9W8iijRPzz7UENU5YWtp5w8tqa56zAvhOdATGQlU3UaFgFPds1Pgu4829fncACisaoYMIS14Q7bSbcY128Bgw6x0uPzrD5kWicw5OPDz80Pc9b7755g//8T/+xx9fmX+vYRPw6NN/ejgmMv/f3/cd37LY8tnZA5xWCpVaF9apvkRlBzAfP9VHEDNixMVfpsnaE6hb1qjlh+tW3xqnTovv1z4n1u9OnCylpcFAdaotFxIJkW9g2xBL7fyun8aUQBMLU8JnbG1UUzYq00AW/Web/2VqAmTFXdzwpcHZKhvDMgVlmQJGayU7wG8TFx4Buo4QcRDv/Ww26wB8+Nu+7dseDQvY/kxevoMMRguOqd70F1Sa7zghLIktmzciGG2FUGXlqKpnLaCY1GLIKf6UCatyKiEqwcyKWdI0kpn3pU3bmFqNgMyqzfWX3nZ9QGtpgfUFlPIzIaffZdHbxvzPAVbEHj+eot3leKMe7yQHFVxWUEOVaF6Y3qXFC0yMAxv8LXKSwOl+C6YmweRcE0ysq9YAL5wY76YYjIn27K2NYlwlmNZ2raGUlGWrhCFqjXFxjy4FeaW2CyFcwHmHcw8vgMU6sOZHWK1hkBtuugGveMUrTg7DgJX59xoWAO/HcZ7gCf+/fPiHXoV+81U7Wzsi7Fw6trNIW8PC8sYxpZY1F7Ry9qDKlWPOkCLLLY1FWjSTQ0wLSxPp05r1FfmFKrmW0v4y4zNpW0NTGiWRtgCmnwmKPFT1ezaKtqxq+hkotWW2ShsnE5hTu20aS8zBrWcCtHLVaZN3FCoMcLEFFysGaoxQp7BIcZfNzM4BG08LNp/t0XUuRrhK13W48847Pygi+3wBm4XE9oLOiYokl2Ij0huZy4Nj5H1nFgGbNkoddBxqoV/n06oEDJYWtmojJJxND5boSMPBi40zSwGsrn2bm75RmOxjlnLKuckqx2StsbH9zutqQyMzdbAqFjbqvNhsaQyl+m5ah7Jalo10XMGfshgnxtuu/9nvTZmtJgT8shyn5JlGX5oHWDN/l8+15cqB4ughCrQ/zknPes0qx7HVn8bYsJH/lKjHm9UBofBlFy7hodicgAToBegcts93uPJwj75zY0rN0SGxW19f3/j2b//2n/uxH/sxHD161J8+fXolgX2Zr+dnAg7+fxe3n/3v+wM7awIO1BNKRw/WyTaMGQZKoAAaFgZ9k9PO0Ms0eKV/SBW5VSiquMzdhrJcCTjZHmnXSavaX9Y/coKOLOMLl/6567Oq39LQsskeKpfn+Wx6P6PJfkKrpZmKK1JCI6k0n1qgcMSlJ3osLjk4l2CI3Gw2G2677bYPAvvX/89oVUNktWg4CbH+YhUuJrWrhU9QE0mml3o8ItQTqjzbYgRBqdxLoFxF8m4mmnZ5ntBthBh/2PZsjOWCX7GGwBSdnIjJvURDbMTOSnnY03VqC4jUWrNcTrUv+VnbclW/oaE6deCWt5s4Wj7ZqpxagKp+G57X5TJPbb8nabOgXbgz+2q8faaNRhvZom15boPTYgrSEupKm0rac1Knl2zPocbKV2gRWj7Nlj92/srU2NCOzSTPWZqBCsWNlG2Jvv0ZvgcQDBDI3OPSYw5bFwj2AWbLi+/7nocOHfq5d7zjHSvz77UuAL7h6B0iIu7y9rm3bS12QHYNyY0NR1ddxicct2j+qX1L2JYIpXgmLRqNOvRHoia8aOlUaoDj8kfKdHTVM5nULLT9ZzBRJ0y8BQtn/IzzV78n0pKgikWvySdM8lCaEpkeE2nXJ9PtwK7tWDK2KQJb56NFwVM23yftPM0HAcKJw8VHHdwQtKVwAsLN5/Nn/97f+3u/Cexj/D8AO9hRm6TL2RKE9tsTnW4wZBKQnIqLVMZ5yenNtBrXJgPU9/VH6JXQD0PHqZRp8cOO4MIGVbxIEQeBAZvWeKWpLlXWBe1Jym+kaSuUdWeyEsa+WExFo3WSiN2WU6kl2gGnsqRtUp0h9zuDamucOZu+zq4lS/otRcalFCSl0omh5rluoytS6BkdpqGjxkZJjclvTvGuHm8FPB55hnYbqXiOJNjmlH4Vbdo56ZIVKb87AsOofooGULaYfQm0uUibVpxirL+g1OncTH+A3G/Fc4qeu6hStrGa51nJYuZaPJ6oeT3OMweIC/+OWXFIot+Z4fynHZzPooUXL+vr63LzzTe/m6SszL9fOdfVm4AFvI8nh8ce++jBzeHC129tLADvOjF+Ah46b61IGT2aNTc+4INmoGcNipBhSvT8HTUG+jBUwqd4pe5GBUycgKQNFIAYqyOVpKTT1Gk3G30y0hr9sXnKUVzLO15/WNZ3ZmSBzwsvk/U3PtT6mcAXwnv7EWtLSqnhoIIL0DzXen4mCJa2Zk/i+ELzK+RJa7QfjJlFvDG3JGWd1/AHNOZdC7/T5tsI/E1IeFdbxrwZe1Eg4iWEThhnB2xvDLj0+HqGfwF83/XdTTfd8lEAV44dO9adPHly2K+LwiyMqXMhgR/FjFkLPoMVbFLp86ry42JMHC8l7m50TyhmujGgUZSvmtaa0wDfUvktWtO1NZ1RgeFK47khrYHIC0uHLphSZqtduk4FFhrkGioeN26oWinlqKCWDJ4crYamgpWBgpppnK/cLrRp1xt7ni7pFIE2RJWmDaQKsZHK15oo/EQjIHbBcwbfVOMfzQlfUWXaiakNWdqdHBoQVcwA/2jx3OLtSc4C0Ej/p+ekYLkZKfu8G+178t9UEb9E0UbYNjL3W6+D2sJNseOosiigshW7zEMLZQS43mPzmQ6XHwO6zsV9QgD0s9nsiXe+852//BM/8RM8ffr0vl07970GUHCcAPCez/zT34e1zdv9Invz0aSt0UKSGJOdzu9Lnb6mQF6PC4wRaKDqSYtiEReWciMWTsbFWivRpKOEOWo/7BxomIQR62snZlPQfo/6FFlmN9ECUopKVbh8UM9KDRpZYu4Vpm1qmBRUi7MU0AAkazO9ZOFSL+oaAV9vrlSpTHQ+Uh2BTK3BFJgUgBmMtMj2gBy5mzaiMCdShLBkAWPMNZ3pZlOS2EMEdB+zNkXYwfXA5rMzXHmWcP3YxsGLzGYz3HjjjR8i6ff/CXaW+K5xK6U87SS8OZXqL+UBV9lsDPYloSGYNEZozjuQtfLGzGjykdLkG9f6NVGHuhRHXplW7TeUosDTesJChza2x6dPktV6or9ur7bZhB1aHjh1GkatL1J4oVHCjIDmNko5t0dHLnsIJkCtzLt63cvjYHV1kvLzwtJOAgYtL1Bn1DRGYKndfYqcE3Z8lO+iKCHWF+8IGnw0tKlos8CQRTHeapRUCiLLc9rxlqyyENH16blYRLk35lr8fnTdoMKPRZu2oE5tmX/PGK5atZLmmjHIsJGZVOPXSvrb5AESgescLjw8hz/fgV2Svof5fI5bb731vV/zNV9zcZX67RrXAN4/+v/5C9sXvsWvSw/BYtQD6zRbenEpfk9fKtUG3g7lzblpM1p5/IhpNg0xoNIi+RwpKbKjXoyShq84idlFscw4RLuQifXI1UESKMzBlTwnUyH1Ld8ZozNTdRaJy6UFgowG7KBUuFjpRE+a3MBK1CvOkFXVKpCkTjaecwY3ALaTqlMKrYYUvKoTsmsTtPfScI5HoUUs+Rzn5oCZ6/HMozP4zQXQr4W4nUUHYOv222/79wCuAwfmnWye1bys/JCUrq86RLBWpknDYV7soUGnRrRFcw5gKQ5qLDRwOgq+8FOv6rOpyeyG6SjGpSKnWaNSShVR82GeOm25MOZmWpzkApolHzCtn5n2Wx7POzRtjt9A5ouCHmlAHjJp43K7W7EMaCEKVG3P/WohNTTrKzSrUtFX402rlGKZs1nyHKSy+qCYA7qcdeyjHaMliAdEmR9XbNYRNSfz72zEd+T+Ge2p1ApoNL4xM946AKQc58nvTsxeZrJ6CDOvSneFYGVx6ZCfNYlup8PFz/dh3xyjf4dhwYMHD8hrXvOak8D+953e9xpAnDrtRYQLbt23vbOAF+cGQUi/Nv4MAuR7SD+Sfqf6l8U9W1f8exBg8PnZ4CON1rvAIGMUkxfCm7Jl/bR1evtcyjKqHbKk/dLs47JnnPhB1cbn9Uz/HcuhKOtHDDzfqgfxPpa0EXWdFc+X9RuNfnBJH23/orZmL/XUPwJ6h51hwJXHBPR9hDjwjo5ra2uP3n///Q8B4IkTJ/b3IjZDSLEWc+0qx/kqKLGlDPVFDmBXmAgLYVHtqkZ7XkaPNuphIzKKJArbLNgMJOLy+xWeHgtTb4sO1Y8zloBS6Gm5vbJUU6t+1xU0eFli/bFmNmNev9JC0Ixw5cS9KhG7tg1PvFvkSp7EK7T3rCDiUEeBq3EoLUpaSJzAyNMp6drtUSn3GuNdz9NGvxrjbXlRsI97Ge/WsyzgOueW89akLizeJ6rv3UR2M98SenSdw5VnBZce34abhQji0cGrO3To0Jl3vvOdHwLABx54YBX8ca1qAI8L3AnCv+4P/693bg9br9vZ2RGi26M5jF9yve/qqPEi8usaYKa8kDZKD3QLYHMNF58CnHNRkeG7rncHDhz4ZQDbR44c6U6fPr3Y1xNhp8VM5Sjf0la1oHdMZp7yXqmW8qiBhQoH9SagcKFBF60BnipntXDSbJd9p0zXZuuTAvxXJtMwLssoMamuAxv8s2DGGTnFWw0nl+G57Yb5t9uCMD0OlTPuBIgwVSYUqdXMV7EQie122Ua2xhpoYhpO8qjwk5NiDlR7nEyMA65iHFpG/LIfvtmPVlR3y587ainb32ZZp4T0b+GeBwQ94ATnHyb8hTlm6x6DdADo19fnbjab/a+HDx++eOTIkZ7k/l4797MG8A0njxEAntz45a8f5ts3Dx5+Aqp+da2ua0z4FXBGXHnKYeNZBxcC24dhwGw2w+23336a5PVxppgpVYRKeE9y1AwGFYBzLmtkgsZr/FG+wBwjBbOmwaly+f38Ho1Gh+zCj05F19nyyLSdal8up+l0pj+SosAzHSpNWfwRZK2eaWd4F9j9nu071fOyjWXbd6PtFM9cpuOm6NT9q8txghd7vJdouwk6XdKoRf7a8XbJH9rQgR3vinbIT9saB+hxgGvMoW7JOCjNLso5bcehGu9dxmH5vKjHAZyg0/zGOPE91HNgfK8r2pBplPSDIRiOHtxxuPw7c4BuPILQY+G96/vef9VXfdVPA6PrzGqnuYYFwE8cPkMAvLxx/sjQDaC4lZJtde0f/acjLj9B+K2MawzA9X2//VVf9VUfvm4WsR3tTt7OGlMGDnGZ+ZDSeK+V+L5Fw5Yr7+W2lRAr+l4ORCs1SAabdPJ9VOnmpsrpe20e7ZUXrXzbe6O9nM5eae+lj1jKs+V0ahrV+xP3lo8X9jYOLdSrvY4DJ2jz+Y3D3ueaXMV47/Y9lLi39vto8aykFXMbd73gyhnBpaeAbjb6clPEd865tbW1B3/kR37kEwDcCvvvGhcAceq0d+xk019622JnByRX2r/VtT8uAlh0uPCYh0P0M4In6ebz+SN//a//9c8B4N/5O3/nOlnEpOG0IXv8eT7vXOs/11NfVz+rOTa6hDBG/z7UwW84MOiEvKefz+dy++23/wzJnSNHjrjVJnMNC4DH5bg7cQL+P37in7xW1nf+wPbmth+TZq2u1XXtK//gBP7CDBtPEq5Loo+fzWa45ZZb/hvJrSNHjnQi14PSe2dCTbK6VtfqWl358o7Y2epx7vNzlXoRAvhuNpvhta997XsA4NSpUyvt37UsAOL+Mf3bg4995JuH2dYc0vkGcubqWl3X5NV1xNZzDjvn++D/J/Dewznn19fX//N1xYzZrA1Yu7pW1+paXengTLie2HpSsPlEBzfzMdpaSPKGG274+A//8A9/AoAjuRIAr2kB8CggIryyuHBkwDYcvAFgXl2r65pdxyAgHZ55dAfDjtMhqH3XdVuvfe1rfzGcYlcI9qtrda2u1YVgOHE9zn8OWGzmNIjDMPj19XXcfvvtP7sy/+4PAZAn3n560bmZXBgufMvWlkDYOWK1H66u/XENC+DKY0TnZzofOm655ZYzP/ADP3AJ15E9tBcvcn3YulfX6lpdz/OiE/grxIXPzdF3AwaOphMR6Waz2dbrX//6BwBwFf17jQuAx4+P6d9+4v0/9DXsd14t24NAekKY0pxJmXXC5KGVZjmbssyW0YkgzLsS64OpR+fnTX9Lph0o2Heg2ih1GzPN1EL1LLdfamgu1W/V16K9IpY3mWc5G0IrjZzmC4pyIlJlAKlpS6PfMO+lfqs62+NTvFONN6o6BQVt2LR3VV+WzBszRmLzalXzAmJyI8fn7AB/vsPWk3PIfBGD+fx8NkPf9+8hefnIkSPd9QIDsxCZdX3HlQi4ulbX6mpdIoDriStPemycAVzvQC8QiJ/NZuy67gN/9a/+1Y9hFf177QuAODr6/z23OPPd3YFuXbwMgLAlNIhIzgsKBxE35tlsbtpxUyZEnGqOEiKMH5KDhDrH594IR1mwiXkRXUhJZgWsJAR4yW2MtJXwp0TTsR5hKD/SzkKlFXjGfJCBtmpjJXylvjiTu1gLuuMtF+SgTNuUTVIoFY8A7225PAa0/Vbp6yoBOOCKiRkbxW8A4qOgVYx3S7AHAJnmeXO8QznTNmgB04VRCLRVJtY89gJ41e/wXkB/weWnPXYujcIgBfB+4Gw+97fddtsHrp/l4H4BgLX+xie3tzafm80cZOUIuLpW1+rKer8kOMxch/OfW8NiJ2A6QiBeZD6f4xWveMVPA2BUHq2ua1oAPOoJh8tb596yvbMJOo7puAlIAM2Ueo7k5NPECKxG2oD2lOhcp8qOQowtG3GaRKHsCyJtZbMjUwL6nPg6t9HgqbNBm64CwCj1hxEUtszjI2W/EfoNmzA9gpJq2qLqM/o+lYg7eKs1+yPkEtq6XDk2osahNY6W5yh4XtaZ2133G2UbqYX1enzE9IZF4nQ93kV+X7TmZD0vxkRnHnDExSdnkB3CEfCjpq9zzm29/vWv/1Xg+vD/ixrOt/2e735ke3vr0dm8p4xJHLH6Wf2sflY/KbvjDFhc7vDc5zx6BwgWAFzym37jG9/4c0jpg1bXV7Y4v4frkUfkwI9/7A9+dss98wpZOC8ibkRwRyUqtdM2scg0o9Pu6N+dfc285Iumc6Jcg3bVTk17Sh6eamNZZytdUKNc0LSNfPPTtKMJmarfpNLy2aTeWbjapd9VeiZZ0m/N8+Vjk9NkycTYPB+eYw+0c7nchtbYoKItcKCMeSyd9PjsT63hykNzuPUdiPSeIu7w4cO/9sADD3wLyeF6WshEhH/r57/jE5f7s18zbMHz+eQM/wpZ3F4q9eWYfk2+BI3POesodX+ebx9tarv9s5nJS1bni1R7Uc2XbByWNH/vPRMAHSgCrgEXP3kInz4J9K6DuAEiHBy67q6X3/W+n/zJn/wOGc1bKwHwWtYAHnvgWAcA//un/srvW7itly924EXGbOLR+shgHh1PB0FQEYb7bjS9SZ7w+UAh4X0X3svPSuByhnJj2VDeh+0+lRtpU9MO5XJ7RNVX1plplW2EuNzP0B8W7bO0c38YeZM2WF/02zVxdHOdLtCMbYhtp+GppVuU0z57ZRs9DE903/XYpNMfmOplMu8zldX0aHgY+dOos6Ibx0bNCzPeTP6Bdv4wzQUKizqZ6hzr8HCO2DnXYftpAXoP+h4U8X0/w0033fSh6zGKzbEXuh1xhEq9RZuKKyfqMs/G+ejCc6fuqeemHmfrU8npx3KoykHTBtspwnQ5ttrY6EvVR+Q6i7JoledV1FneKeuRopzY9FyTvIhp4So+6367vG6UbZzgebNfibary6aUfi1eF/OiMd5YRrv8j/mJ7g9ITP+naZd1uQbP0JhrbLelycvAd2mMCe3YVN8Kl/HATXxXBb9lek6iOd5FfyNfwkLdocf5zy4gC0A6ANJD/IC19XUcPnz434sIjh8/vor+vdYFwHsPnyEEvDSceZtb83TifPKFVybCpKUy5sp6d8+aL23yjOWYUs2UGiXRBsEkvaEwT0phBtVSjc+J0pnTd1sTsNS0mRWlycRoTJ5S6P2kOtFln7TyvjQ0VdrozKo/kpRrohK/FzwjCl74SkspjXRCxuBK2j5S+TsqHzspeg7DEbFauRaNBi/zeEOVRcOEa+cGoE8N3vCHZGXMBgDXAVeecdi57NB1413vB66tzfGKV7ziAwBw9OjR62xZkNE3VZhmIJW/LwsDgnaGcFACuJnFccEJhzQ11VlqyQWFeKPKiS4tygNAktKYRZ2ls0Y6hEYq5nAkdWo6r2mH2SOi6oy0601VLW0Fz3Q5JJ9faq1+0W/LH/sNQG/wEr4tsanXUj2KP3E80pjoMRYYwcrwU/vmRC+f4G8d68njIEh7hhq/+Gz0w2V1+DX9Tun8SqtG7rs2hFBtbiy4rmmPuWwVY0VrXhvmMinGW+yhwMwLUZtNxUkxY9/6HvL8kWIOF+ONyD/9fSp+6++BnJ7nJW3YbXD81gj0xM5F4NwjRN932YdcXDebzTa/+Zu/+eeUCWd1fQVf/a4ljp72IGX7P5x769BvQiiUtBiJMi2iNonIEkupwgzP1kax0NKiVWFjQAWC+yGqb1SmrbdxkTOWRWm0icqkWphjm6bUJfSn+tikExYeSlF1o41eorRmhSfJvnDJclrQFkhtkU1dFHuvHMtGnTIZFCuN8VMmrLSHSttKqwvG9viS5zLNo8Y4GlqMASWE8x0uP6qihSFCug7AM29605s+BID333//cOLEietsaRhU7s8gLNCNgVvBJpyGSJ37RmywfDhwcTtS5fQmTuP1yWrNSMcHegiZQ5GEyQw72iOYPIMlzCGnt9zo4kv9CatJLQx7I0GKEg9CDla1lkStV/yeGHybSUn/MlhIHI3dOLcvCq+6P/pEltx4vd6O0zImSZsT7jm1hoCjN1ZqlzrQqY2fSojSAioDnTiOLJY9kbHhDpm2iABuFCjFCBIAXRASnV0nmcaxME4zdzSbvaO2Towck/odhcMwOUU0bT0uxUEgCajMS4ZTB1lRgmUundepOD+iIBzriZpPxqOpNzyRNN+CEJ7mcmO8Y4CFFswDz0eWjOPsmL8mF98RneM3tlvxPLQz8VK3L+YHVt+kF6KfDzj3KWLj6TnmfWwjF7PZrHvZy277pT/1p/7UFwF0J06cWOHEXcsaQBHwBOEf+PWfOjzM5Oj25gCIc9Sn1ng6MSZTsQo0AeCDqdVHdbTZ39Nihmjq9E4tBlAnb7UpCQGfNRX1ST8q/4L63btMR52W0jseQU2vtB9aiZjKMpz+cl9MfxJPCPpsYqZ+ztw+ppOaM3UC6uQn6vQXaI/9irxTDrpENpmqvrjitKn7HcdHj41WJsaFRpvgq/ziUow3sklYrekF7WjadnkjEpV03PAn8pNmztnxjqdjOy+SRkLJyXTAzg5w5QkHhy5qEX3XdVhfX/+1++677+y4rvK6i4QlxRzWyDLiPHyTVNH6VK6qkjfPJLSI1XrHcRH1fWXhvNRO00Au6faIOohKGe2UppGFdIqCTBIUkoLEKxqSZDHjasusfdcaalHC3Lgp2qh/qrJxnpv+aH05rfUBqk1V/iVm3iZBkhpVAPU4iD0jSTEOUVA15Sj1HGASAIywRKONz4cFDXCgxzEKl9SKTjMHNOpD9i9JSARJw5UF7DTmLOGhipOtRDB4oyBT80LzQsywxPHWB92srdRaXSb+jkKZGMivDE3Fgj8KTkysEk/TJlFbQUTzN2gCKc3vTs8LPffLAxnh4YYOz31mBg5DCj4chsHNZjPefPPNPy4iOHbs2Eq6utY1gPefOtIBpxdPXfzg98iav0k2OaCTLitdaqU20zIn+eQFQqijOX062UlW/pnVTNQKKebkaxey/BEWJ0tQQcLkBcaL5MN8giUJpZT0YTD/Yh9E2qEMPm8UaZ0RpUWgqsf0Z6RDye0lCa9WKUFpDlJ7q2g6ub5cd17YdL81fmDqd8Fz3VGzrBgGFMZusQ7Tied6vKXWZCTTdjXewT0g0PQFziJR8lyPE8O8EjtekrnlnGD7GWLjLOF6iRuY9H2PQ4cOnQaAI0eO8PTp09fdwpB9iyT7SbEw3UX9Hq2K2zkt7IvyhdKjxiTYaZNV9DkqzfxsBBPlSPz4bjuYqTIbxh6ydOAIRjXa4KiSNsFGIBJrzT0c6EorgtlNNTaAaqegMIwb7bYrtO+5PYWpttCYx7+dETqiNo+GF5aXqj+s+5KFZyl4QUObE2Ozt/EGnGOxzrvaopTaaPUcjtbBxBxDKYUPISb4KFoFAGu1luxbaQLtyvbocsW80gcolHOwxXMroUVtJ5S5l4aQpDkpUnx3jsY8kwV7o3tENwN2zs/x3BfcaP7FAMB5km4+nz/5pje96f0AcPLkyZX5d1+YgAE8de6J1/kbN4RwEtXNmDTGxc2fSiBREyrYArzSVEkwW7AwQY6mlTzJx82c2q1CCYPOnB4h2oSj2+i0e0Q46WZTiU8fKc0HNtJ2WbkQVfZEwt1Lghaz5iNKPhrKRPc7YvxZ6BwWy3/mT4IjTPugU+p5u8yYkyJotAORqFeuIVEIpFIxeBHLQMVzL3kzTOMV+69MbaJ8ADPmIBtmfOZ4XtFwMi3LLkf6zCbwLPBmYR1qbPSGMG4kHTaf7DBsOPSzUWrx3ru+7/Hyl7/8gwDwrne9S65HATDOCedaLg41MLndLFBtenFjFJHCh6+IQQwVcVf3iinXjFJqMvohe0TUH0hccxyL5kjdF0EDWEDa9/QCxIIXXmtNpRCEJJlN62Dj1uqAhitEm180LjG5jRb5W5SgP1W57JEO1erLyveZDb61+y3NeVWPd7tNjoT30hQuk9YTUxHenOhje67kmsvvgYa/Wi2SNKlLeT7Fd2k0M66AYf/iku/O+FfaNru4nnqgmxFPf8Fj8ZxHP+/g4eAA3/U9b7rppvf+hb/wFy4eO3asO3ny5Mr8e62bgE+8/fRCRNwVXvrWxdaCHnA+AD2PPzA/NvuCGB+K0t0rCwdBjS3WgozCVCGSz245k0ayddTly3W4wFbO2S1YlUNJt/AP1gDYIvV6b+nYU2JcKEpreUnPZvew9VXub5JPjfokW/Zba/GSQUqs0i/3Uwx/S3OQMgLafgd/EjsOtAHV2kAk7b6b/bYcb2X6GO9bTzKRehMWEXgPDAJ4D3gZTX0bXySYNwVP0pF8+m1ve9snAODYsWPX5Um26zrz/dZ7T+FNRe2ZhsbmyabmHmUwg/HjxMQmbDVvCmDTtkuKckVdpQ9qlgc5LZxAm2ZppeXmvfrwgkKTLqKD4VAdtpr2XhTICtUhi41gBo2XWoyjSGVuLvVlbYFk0vkGxj9DCatlOSmnAmHW5Wq8MTEvRBptaQhoE/Mv4Yw21vYa6ovVekM1L4hyLtm6S+vO6FeprVY17fZcKKHJWuMtsGcdNsaWE/+qflDARYfzn54Bvoe4BSgOgx/c+vo6X/3qV/80AK7Mv/tAA3hcjrsTPOF/5r/9z189cPvrN66IdI4uIJiE07PSCHE0b2ZtEUtrhzUfGv1aYWot3iFZfbMswIehHG9FbEQym2dFQlIwSKDKeM/S9ihNj0wRxBXt6oToDPAwMFWOzTbahaI0mFmTnBRPEm3RtLPGQBrltE+PjkUW055yHMLCpZ23Tb9b53PV72JtHXESreTN0lwn2jdMCmsIG/Vn3xoPgWOHnS2Hy08Azs1iZhfpug633Xbbb/zRP/pHnxsPv7zuBMCY38XRQVzlBIRi0qv5tWyTbpnUlmzmUStVaWNYzSgx5lM0BDAueV9/u7JE46O/feyiHWrR44Qw2W4PlmnfyMa7DSGarU1ddmnnqHWnWbVaa+jUGLPxxS8fh8TTahz2wtcpXiIFPGgaMsW2Bp3pcizKtcchK9Syy0A2rbP+jqp+Obuet+Zzw/Sf6VnhmK4V2czGvGbdRgHcrMfWMx0ufQHgPMKwDUI61/f9I9/5nd/5gb//9/8+7rvvvpX595rXAJ4an332uS98E2c7Tpx4s9AnrYv6O2TR8BxNeT5pmohBCFH3fbyH0ew6BDllkNG0OL4z+qcNkgUuLx5CW86HcvodLxlGJL9PVTczvJz4sQ2eVT1DMi1ypI1R2zkILG1h6kMEIMn3GrQRaUvoN4MmK/NtkPx7pD0IUn90/wfzbng/Zg5RdadyhrYep9xvH9o5hHK+wfPUxsBzT+R6gklXVH8SkIwa78hzH+bIoDSUPkSdWj4ilcu0EWhpno33fGi7BlNgB+ycF2xdcGA3BMHQS9/3Mp/Pfw4Arjf8v3h9/KmP3TDrZzd4PwRncPszbmQe5BD+HWc9FdzT6Gyu3/GNe8W/jKuBqLp8fleVjXRjgED6QVlOt0eXVXVSAHrbRjTajfHAaN41ba1p1+3e5Xmi7Sfe8Sq4oEXbL6Hjl9KODjCkD/zI7UHVh8wXG/AQeeqrcUFzbLzpezkOe+tXm79Qc0PQGPdUp18yDmEVm5x/utxEe7m8veWczeO5ZLyafPHL6TTHW/IxqjFW8W8ngtlM8NxDwNYFoB8dUSHgMJ/PxTn3r9/61rdePHLkSAdAVqLVtS8AesJhUy7+X7awgS4JfVnE0RFuo4+Ah3g/wrVgCPeHoF3xAQA5JFUIZYyJM9kkY9nx/fi3NjEmPDrxId+upmPNuCOdTF8SbWV+GQNAczl4RVtSJFWOZPQpKk1kgGAwtFGVG1QbVb+jJhJD7g8ktwE5v7EIC/6EuqH6rU3C6rnspd/wacyg6oy5c8XwXDI/4Y05bfzdF88Vba9NCyG6z5c8b4y3ePUzWF4Y0VvXo+ebT20hB2w+4bC40gNdAM4Q9CR52223/WcAOHr06HV1ko3ueZevPHxD52YHx2+5VrU0FRFUEaBLnmu1Snkrg9SWz1lpxY0GibWGkiWdyrLGWt9hGjJ9r0Vb93taGVlqllzS2JBo0C74J0UdqpwGU55SiNl7rNqmeZ80WBPtSW2f6Hc1TlPlNBZOg+ftfrGhbauDONiwxpeA0W1eWCs2mrTZVAhyav4V260ZB1qNoR3PJR4IU3xpeSEU7YlWnsi2UhGtzdkgIJ0Dtxye+bQD2KUoeO9913UdX/WqV/08AF5va+a1fi1ThlNE8D/87Ds+caE//zXYgh93yYYRpHKPqJ1XjCmHtpyYRZopQCJGjmbYF4H1K6Z10i5pszBFSLkSSp3hDRrvqkFH2taNZDaVhtOvao929JXC5Jpxm6hjuyztVr+X0DGOydrJuOCFjrZlw91FZA/j0Bjb1B5Y4NfynjRoi2Cy35a2Ny4J5ZyUFDwUTNhe0M0cnnzvOp77LYdujaDQL/zC3XH4jqf//J//8/d+53d+59NhLK7L0+z9/+Xtv705u/Smxab3jDkfNaZi0kREX1JXwDBKIbigdoWg9V2V4l5cCzR8eQ460lAwRdSi1NG/oiMcy8+F9pvXuHC2jdmVIDtdtP21DIKLaqNtjwoAIZe0seUmUvCn6E/2G1O0jYuhjdgted5a3PU4pEAdg+nJiYCWeryb90jjhtICfq7GO3kgZOzFXcehWqJsAJtpIzVkbMulSAW8NOiA9Xi35mSLP3YbLcah4HlrHOIELukYlwZyia+jKjcjdh6f47f/v8SwsQZ0AyiQYRDeffcrn/pn/+yfve622247LyK8XtfMfaMBPC7HHQD5F6f/p6/dxuIev+WV84LktGOTImUBH44pN6EcBWdRLoNamkW4u8GIixMYdY7hqmliT3VsOiLWJyRVIKGUTKSaTWj7RB3BWJ2ipXFStRtmme1AChDtpjOzAs7X7bEnRLFjxby5sSX8VScF64Nn2oN6HOwWYHlOWGBX68NX+I0CZhzqSNJiXNh2hoYIXCfwmw5XnvIBRHgE3um7HjfccMNHv/M7v/PsyK7rayGLMvynP/2Rm9b79ZtlWMCF44GjB0XgIOgIdEACiulAdBS4wEsHD0egI+DGGHk4xn+BDoKOgi54ijoi3XdAKBvKhbrI+Gz0Ne5CBL8Ldblwz4VFrSMzbQAOfmx3bEeiHZ/ncrmtmeb4LzMdKtqRJ4y0c9scbDkHCbwTVS9yG6jLKl6Q4VnuQxd+7PsI44SaNmPZMSI21tWpfnfI/cm0VXsVbdOH2G/DH5/e7TSfw9jke2FsUr2WP3He2fEOdcf6keu0NMe5YdpoeOzN3Ew/oWwnouZffM8X400z1uNzUXNAjU3qh+I5C/7EOdGYa2m8xfLcsTHX1LzoyESnc5EmU/vHv/M30oW50lHgvKDviGc/57F9wcF1ElKAwq+tzXHLLbe857bbbjt/7NixbiX8XVtXP2H+dQD82SuPvMMd9L1ckIXAp7I+AEqacDJp7yhVVojJ0H193NHhIVKoglCEsckE/QAc15RTG22Q0vFYcoaM4lXZjc6ePoFGqo5m+J9KcSeoy8qy3rUcyVt93mUcounZY2IcZEnfW5AKkb5vlpUCgqKOXlsy5kmD6s00ZNJyjv5/W88Its8Rnesh2MHgBzl08KDcfvvtpwHw+PHj7sSJE9eVOSPG/dxzzzduDE/4ra5z8IsIPsTCibwR76sczWmjeqyQ7+JYDnBam2siiePh0EHEBxy3oN1wzmjkbOVQPmtMDvGsgiMGc+iIkDB0LmmZs4O8TlXpjOYvm+ss7QSMzNbhZuzPmNnIJbiUBEHDqOX0OU0ZA5S7CkyLtCUFXkV/xkbGh3T5nLki6QAkp2JLdVraTvWblW1d+0c6VU+Ji+fzYZc5+jj3O56+fcBPzDzPEDKxnA6QiD5tLoHsSxxvUvUbKgWaKzS9sV8+wRmN5mmX1hQ0aftgSlX8CTwYvwXlcxfGe9oE7Y3mrkU7jXc4bCV6lcZT81yZ0sQZY5nW+onobCKSLVAdgG2Hpz87jyiUUdPpZrOZv+mmm96N3SK/Vte1owHEqRMeIK4Mzx7ZXGzCFeFDNRbT1E+5aS/BL1qGM8bWbi+7SFpyFVNSrqJe1AItr8KwPkln4vdWer0lwt9yYXuJECxLxkF2G4dlXdgjhpsxpyx7vrxPGsDbeAXE2FYhBjpsPTWHbHVA5wO4ou/m8zlf/epXfwCAPPjgg9ftSdax2xn8sJP8WBXCiHEKFKkidEtw5ipykyVsiKtzASv1dILmiDocFll+pQH5EYWlXSNiXdNhUWf0Hbvn0sZtPScakc8sIFkKmjS0Xb1mUJtbQ0YbqqxI1GIYG+86WKeuIu8xVJkUwGfMI0U5h+YCV46DEmwsSHbpVFc6Ftre5jHPtGkO3rqNehycPcWwBYlCxSNVl+FVnJMONawPUKNbOExGJJsI3WK8rQkmmK9jv1zjgNWK/HVIYOxYxnMHSfNXp4fLvtFJGEb2N2fwAe9ngo0ngUuPC7pZyrbjSeLAgQOf+NEf/dGPAZAV9t8+EABFhCdOwP+nj//UXVuLxTu2rniMWQJzJG29OKuJ1nhWvge23rX1SuPZVBtkqj17pNO6v+yeIEcLT7fH7dpGmajb/FsuaLRtaPaH03VLcyHO/WmOHfc2Drptug1le+TFHIecYCvQdXlsxM5JCiH0cN7h4uM+nboB+s51BPDZb/u2b/tVALweF7NoAv71h/7LLWv97Cbvh1HsMFlpciAYVIouhAjOGABUHw7V32nTUdogKbRKMUpRhkq7nrW7PtUpUicIT+0ylgiPNo6gbo+oYKGpcr7oD7L/hTDRSWnggkbPputi4Y+n+yMKiin6rjb63UqMLrpdJe1a62RyXsLD636TJntQyC8JBEQGa03I/YZOf1fxHDWgadLwDkpLmPYklasz0h6qM2Ee73JelOPta2VFDFysfEwGlS8zCODeV8Jlnn85enosJ5WWLdO17SzhzkY4Mz02UHSgMHalEr5zv+ujR8beQOWjGL8vJgQJj871ePbTDv5yB3ajyOC99+vr67zjjjv+E0l//PjxfiVO7QMT8MmT9zkAwyNP/9LvX8y2Dvht8b6na0KtqalMlRzb3msrr4yer4HfBot1OmksTTEcqnwqJy19ojV1tnCh6swRbZ1VCfSfPqAlgRSg7TdZ86KKZ5CYJUWZRdHGvS/rrPWwwZW84es72R5UqVXBsi9tIy08JPmLSmGSLV2pm8kVGuVQjI+YHNF2fTRbrBC+A3DRYeusG1NLjRoE77rO3Xzzzb/yxje+cRuji9t1JwDG/ef3/+53nPuRU287389492Lwwf4rKetMTBQfP7A6qwCVGdUVgcQ+Ad66lDnHJQFTB18gb0N5E1Smw5wQmsqPVtIEJRtgxCkbiVrQnPYJzmZoHwGT4gLjLO0kpBGg+AzbxuyyooPBXBWUFUyv1Sql+m1wfg3oqvoAVVaPYFKNZsKU9jDRFpX7tuG+QWX2Tj7XVFmOtGkWtXDvtL+2GCzHlG0IyjxqPvycQ9lsNCaReBFsonjuogarzLgS+x1POY6QcgWtyqGYa2ogkvlVMc6xygYT0RTNeDvlVkPr6kSdMlTnhdP8Acy3NxJyKfOVyT9Mm+VGm5FpdPnM/aYLpmoB0aFzCyy2ibOfC6n48i7eAbj8e37P7/lflOS7uq51DeAnDp8hAJzdeOzIMNuSvus8JKYHa0SyCUEJ6npxKVcZtSlAEJ7pci4kyKYFl5Xop0BVzqU6qXd3cSPtWK+P5Qr1eWqX/he1mj3W2aCNZrlgKhBVPmn+JfEn9aXkEadpU/ebmpf1c93Gsk7GsYt1SUOaS2Nm2zfZRsnYj7rdNc8dKJ2tE8XGEekYfqt+i1TjzWIOUYp0l3EeiAN8mGPejSdbB2w/QyzOAa4bN9BhGDibzXDzzTefBoDjx49f1/4sHP2KAq67U1oYKTafUn1Aky5GQyZlbYf200T2X2KhVYuivfbjauB6WAip6WwJ8Vs0qQrL06OKIPZFRH2tpYyfZPavSpr6wqwsKkuScpur8+rmhNVZ9gDaGlIl66JAWNAWA0s7Z1xiYaYVFUVKFPxRKdJgzP8593YLYidlFhKbdo/6yFdEiRMTmWca4+2Ur6M+5Om9Sfc7KxVsjviY2alM+SvFocCmdmLhNi51GyEmCt7wnEE7XNIG7LpXRLJTa2WL03PyOy3mjIZ8oXHdEAXNZtNsjoLzADcjLj/a4cITM3QziTz1s9mM8/n8Iz/8wz/8EIDrzl9632oAT5w67QHg/Nb2Wze6rYAg7HJABL0Kt8/pbSodgFrcJKrdVZh//kD0yTIfoMfvWswsF5bBAaVTcrTo5RU24uGRFr4kqwgFlHIfE5jDd/hYy8AEiyQjWfPXyN2h4UuyWUZ0etxy6VRQBWKyfdTaRVEbtGZZLYgnvkJMQAsL7WvuU1jEfAF6UUBKxDozC321eGWNiBoHFUhi+Kn4U6RHrdB9sjZGLfrKXMIApM2BcL3D5bMAtnvImsQNquu6Dq9//es/vDrNIpjYJGtpqLPN5Kw5kbdS5JTVGWta3oCSlBtWUHIBbcY5WpfUuHM1YppIq/11bGTqoG5P2W61XkBj4tlAD7PRKyd+rdFzpY+g1uZAeXsVeW5NMpUClqAOuECmrXQ4tt9F28XWU+dZpsKdU6PFupwZY7H9a/HHaOa5DDmCWesY4VeSPFfUqTMZschyUuDjEctps8Fz+0+j32m+1hmd9ka7gAVqpX+r/K2zlo4oeFQ1usxUose0soM18BezG0bX9zj7O4BcceDBLDB3zuHGG298AACPHDniTp8+vRIAr3UN4PHjxx1OwP/Mx/6fv2tjuPy1i20/Lsfx9MCsqXHogiZIjHsazUflsnYohsCriKToRM2ovRvhpoP5Rpk2GBculzVVsc6E5G81GKNGcCxL7Uchej9RWi90OasASn9fKmff2B/Jmwv1whrKJA1h3liySVP1WxwY+k3dD2p3FKeckzUwlSAHuxGM4ByRNsXawYs2Zi1mbQem5rnXzvq538mcoMY7aUVppURSBwiM4x3HJmZ0sG2EGhuXFi82oX6iti84RVOfZDN/xHXw3mPjsRmUX40niUOHDn32u77ruz4HgKvTLODYGzBfFsZ967APWCBbl4QKyRpFZcKiSqtoBQQW/qZ0Tq092Wk/aQbjPGUHHZzAMqWc2ZxV/Sx/z31I61P5DnT6MmaErEibEynP6KBXHtKKGPnrtLTZCNCQEMma6owRt1Badi1MOWeFEyXAW+gql2iyCgrR4ocLdep1XPHHRK4W5dhOZUa6HIDTRBTX89FZwXWirbpOoAWcrPpjxqWV3xh2PlAH3LAU2et+V8FAdbnSfmXGM22yFleMZeaQWEdan536VsIe7Mpvrg7iZN9hcdHh2c849P2YBQoA/DC4g4cOyR/6Q3/oIwDkjjvuWEG/7AsN4FE4nIB/6PEnvq0/NBzCBRk8XAedDlXryYkCsqNG4ZXy1JLtjs3crfXZq0Bqjn4kLI2OUp+A2Mp7Waj1oU/SjX6w8kAv1vWWJ15JO9+TqLEzJzIpTm51X1Q6yQb0RfmeFDoYxfOKPwbyPvzfV6YVNpPAS60dsCAZlYalpt1qYz3ett3qXuknVAiyedwc4AbI5R6bzwxw3TyW933f88Ybb/zV17zmNZvHjh3rrvdottFHS5mnHBVuI1OwQJodIT1glst91lYESJHow0plOTDm0JTJpdBG6CAHZncS0asEvdIGKv87YTJT5g3SapGy7kmVVdrsDAmS7auShDSvtDlSaLNoTZraN0tyPm5WQrQPTviFHyRz+k0mvzQd5KE+BYlRnNqi4ZUQoceG6lAsxRoS1xwbrTo+G/LBSn3PDNmiKIVfJqXQeoa+CE0b9Tebc86z0Fbl/pilQSI8UHQrGBoavdxvUf0Wo8uTzEfTb19o7/Te5trjzcL/ruLlUGkLcz1U1h/tux3mckRIi4f9ZLXxShTX8465nck6lE0x43wOX7AXzDvi3GPElWc6dH0y5w+z2cwdOHDg/d/7vd/78YceesidOHFiFf27HwTAB8+O0Bfnt59824bbFEovdIMxzZbgvhQr2OTvoow5ow3i0P4jIgWCvKrfiCD5I3UT6CPaVIpCcBGjWc+RjU6p4RX6UWhjWKoTvpTSYIgWcK1fSZlyybRCjHE81SmV/Jj7rHQpCZdPqjxdUgAB2OALXSeNgZ7pDpMFnMmcHfdhnc6qYeSukscvGxttUKzbCJisHyiBx+MmA6CgnUJZzZgi4XJtnCFwsQf6cRC8H7i+vs7ZbPaTbbzC6/fqOoF02oTU8tNSBwh9OFHjJRUSjJgYWCuzs8jiUsKNFC4EyZwbrQu0By7ABB/AzPnwewiWMAKKcXezAR1S4KCKydQhxnpqXB90v+L34OKBtj7DWMuBGgHtS6eitkSBoiffN5VlJ9en+yP570IrV7ptTPLSBO6U2Ut0R/KXGl0/dUaOGLwSs/Zk87rFAzXrkMk4I8p1SCrInrie50jZhtVU01HzgspOb8Y7uhdEt3JpANuLiQwx2aJyek+YtZAmq0iep9ldVfdf7Vostd9qr6U6IKS54u3BJu7D/YDOdXjmdzrIJsEDo3zuvZcDBw7w1ltvfUBF/67Mv/vBBPzAsZP+05/+z2sXtp79lsX2QAGcF5+ml8QTYxBCfJjbXs1xHeCug85trJi6F0FP0UZ5s27hXIo4mP5Wvhl1wD/VPQ0ngiKuq3C0ZYsOLC+iaMUiyJ+5Tl/xRvMCRmy1Ip5T/VFiYcrRKwYWJYI+SFFnpF0CdejN3KetXtFnzUfli67gWBTmXjluovnKgo+5Xal/bI+3N/XnNmoaPmzcuhwdsXWmx7Atyi+Mzjl35fWvf/1vAsADDzxw3S9m1FsRy1GXxnqvonQ1vERyDclm25yMvvFlTuUyrX5CeafdTxT2nqEdNGWmHVTWNBUf71SdhRBmyjHD4Oh6dYRl6pPzdX5ZljlwM19ZtrPUhtL22wrWjTbG7ESmvrLfPrufsNHvaDp0Gv5nuo1MbZTKiqrfGev0yADRli801qapsSnqS2MjjTZaC5Zp41Sdexjv8f4InWLa2IJADPXFOlnUZ8fRg465nah5MLoqRDcoD7raem3mewIqz/NJfx/x++/YY/NCh6c/Q3S9127p3Ww2u3T06NH/VKjoV9e1rAE8fvy4I0/4f/G+j73q0mLz9dvDAhCS4kZ1Wwpt6rJmJYTNmzyxQLElByd8g1cVj0Y+aP3tvdaWJMnkhEIbUazU3luzMnXGCX1PzCm5TTv2wqNOuyt1OnmRKmwf0ZwKKs2DpR35Y+MmStrS6LfOEVeIz7HfUvJcGuZ2385yKVb708p+SiGG1MZpnqc+JpOcz/zxtTl77Dcn+l2aoQs3AXUqFlFm/u0em096OEafSvHOObe2tvbJH/qhH3oE12H6t7YJWEYFilxNMDSvrtwL4vLV1MEXv9zVtFNeZN59Odsoq7GZ/mj22u/n00a2zV2Fbenqv6s2D0SArutw/osdrjzt0M8Yl3M/m826W2655b/9yT/5Jx+7HrMl7V8N4NHx98d2PvXN/oYBAiwYjw5eQX4Upj/xGj5k/BDoFUJ/hGDwI4zHiE8ZcIt88BmJKsRUjql8LEtxkPKej/fC/WHs0ngv0PFQUCBaZRngTFR7chup2gjQ09L2ZXs40vYFJIyE91QbRUGuxH6L4YWq06O4F/vN3G+4wN+CP4Pmo+Yvij6OZfI4uPQ8jq+BwynoiCfoIwSP4rnYe3EOMD0PbfOuMS8ifzEx3i7XKcUckNxfbRZ2Dlhc6LB91gUcsNECPJvN5NZbb/2giOD48ePddS34Bfn6Nx766C2zfu1m733y6lhdq2t1XRenv6BtdTj7ScAvsirRe4/ZbIa77rrr33rveerUKbdi2D4RAE+dOgEAuLRz7lsH2aLz40nAJ9wlJtgGCdhOIlbxFe9H+BXxTO9JTihg8PEk+axETEBlGk11WjiRmNKrVLxpU6aoduc6VX0Ku2vsS2iLwnhK5m7lV2PuRw2TjGbnZCZN5SLeWcxxq/uu2x58Xpgdf6MpM/Ep8a5ujwIfVO8im4Qlm0ZtpgRtaqWBcdMRcpaXig7yAVWKsRENmxVpU5tqa3PdWKeN/muPtzT4KMU8zIcWCWlCt54TDBdGAGiOC5rr+56HDx/+gIjgDW94w3Wt/YueE1/7VV973sviYtd1derr1bW6Vte+vjpHbJ5zeO5zDl0ffUQhJDvn3JPf8A3f8O8AyOnTp1fBH/tBABQIT5/A8JFP/+ebBr/xx7Y2tjHAuRjd5QMenFAwSPw7JCIi0rPon5WeU/0rMpoAOZr3BngIx3RCnvE9r94ff3wsp+r0ou4lpZ4o/zAJSjkfkiWN9IW5fZ6CAfqeKptoS0Ebqo1eKdVGmgNCX0IfU32RzmhXg1d1Zp+3WE5U/WPZ1J7Yb9H9LtuNgm6mM/I6vB/7LaosYv9CH8Wr+nwYY1WnKP6oOZHKpT6O6aUivcizQdR4A6FtjXEQ3xyHyIusQI7jGGmO0AU+QMnsPDFqOWWMRhXnnBORM/fcc88vAsB99923MmcAIDuBDKKhRGqYDQtNUkOV1NAc5X+t+qaecZIeKnpowH7sra7p37FLu7ik/NX088VuA66yDdzT2LbotMdht3a35sTz50EFRrOUV1hC/6UY793asNe+1jxvvYNd298qLwC6OXHuc8Tms0TXzWJgy9D3PW644Yb3/Yk/8Sc2jhw50mN1OLzmrx4A7nvgPof7MHz08V9+3SY2Dw8LL11Ik5B91QqU+Kh4KtA8dHSSSTWko5MqXC40QrFQOMTqDcpG+qWaTfoo2LY23mWzPhiQeq2pI8s6LUwMoTMNNNrd7mIVgcZJwFTaNhZtV9n4KvQalu/vgT8o0nKV7SaXq5My8j/bOKcsPfo4kVd9yRygdbm0i58kMGtszbHxpMCxg4w5a71zfTefz3/9L/7Fv3gRk3g+16EAWGjRM2xRm0Ey8bcUmW6v5t29/m7p1LC8ItPProb+VD/22jd5kZ/ttQ1Xy2vZ89i26q95vZd243nyTpbMOewy3nIVbXipxlueZ19bPN/L97ec5uhnD3rQz3Dmdxy8H6Gz6IHBe66vr+PlL3/5SRHBCvtvH2kA7w3p35688Pm3yXwHFDdAPNPimQImUJjhRJn5cnoZKIiXdL9RRptKc2qavIhU98T+Dmizcw6JT/chqp3q9/iOiGljSVsU7dQOSkVbv2vaGZ+r+mB4Yu8l+Jyqj9P80bQpSvOm2wCpyqf2QJaOAxrjgKJ/tj2oeV6OQ6uNsmS8Cz6350GjHAD40eQ7XO6w/cwM7FzgE6Tve7n11lt/XUR45MiRbrUcFFLgyvtvda2u6+Qa19F+NseVZw/g3OeBWS8xm5IA6NbW1p78H//H//EUAJw8eXJlLdkvGsAHz54WALi4uHBkmws6OPoyv6pN8xm0eESlJfQRj8ol7VGSG5RPmUaeGstKlf4p+uaVmjHvs4Yi5hKVEEnqvVZA0dDXwKEG3kQaGjjVV00n1q/bY8opXzqYPpZ+iu17yS/R9FHfK9qIadotTV7JC4t9RnNP0/FS99uLbaNuR9L9GZ5XysGqjSVtUemmkk9lEpTjAGaAEtLmg/XewXHAxhkAVxzQ+zEAZxi4Np/znnvu+XWs0OyrrcCR6Aigq1OMsfhLwZqX8dhVuVLnKxZ5s6hvWilr6CR/XpmkA4MMKo0Ic4slZ3Xetk6ZbFujzgr7UvFC4aqW5a52vFh8VKaNBZ2aP7btV9MGCSDYGvzgBY/3knGY5OUex6HkmUVzwNJ3sIRnZZ0o2rj3cWh/Q3ttW/3O3sZhXHMHzDrBE58VbJ5zmK+5AKUlw2w262+99db33XXXXZeOHDnSnz59erFaKfeBACgiJOjf/xvvv+XffvJH3rzRbcONSUDVetLYscVC//oCwkRrySoVdoHX6r3FNho1N6hMhNIMWW8jQovU75RtkQnd+q50lpVTdcqudU6/i6t8d+p90x7NC1+vLnu+t0t7pPG+LKlzWb/TYlgmYC9M0rYdYXH0Ao8Feumw+RQhC4HrJe4tbj6fX3nLW97yKwBw7733rgTAgvnJQ4gWXjwK4iaVrvEuYEo6b8zyrZSnMYG2OkSygitiNclY5o+VRg5WYZEKUR/J7HOicCko/DMs5F7pxzGRZ7aARMkp0nJKSuMaA4Jl1ptqhuvsNsjuNEWSbOrvRuHBlfdQCCeoXD40wLdYoSfBRNHARbHBs5qPUrlrlAdCmsxL2amD5bxKLGqNdzEf0HgXqHhOUWk0K1h7tiRwmJTHxT3tN1Onlq7Fs5pjotyQMElftIYFU+Ndfncj0tvQzSGDw9lPeuT4UMEwDDx48KDcfffdJ1dg+fvrcvefur8DIb9+9ue/BYeGu4bFMLAAiN6LaxRfAGRY892V+emlvfgC7r0UdK7i9b3pRMJS2nn4LYfFEw7oXMprMpvN2Pf9h97xjnc8CmCFZ9UQXFI+XDqTU9k5l3KmJiDblEdV5Zw1+WzHTA9Q5QiCDkXeUiZf21Qu5dgNvzsX3kfKc0oFwpzz4wJkl2jnvKqdyoGr8wurXLVUtBXQdM4RrNoLm2OXRa5furpOR2Z+aLBilV831Z3y3jpLT4Mw63EI+Xcz0D5Tzlcpcs4mOg5VG5EOAFQ5ZXXuWjsOhpeAyYGbxps2F7IebzPnkHPYjuPNLCuRKl9yCczcZZ6X4+00j9Qcbo1Dc7wbY0OaHNB6Tqb+qDlAM29ocjRnXrTHm2zzPH4P0vju0Pru0tRxCkBd0HXApaeJc19w6PsuifkEuoMHDz75d//u3z0NAKdOnVpF/+4XARA4BQB48vLDb9t2V9DLbCXir659I+PSdVhcIobzDq7LOfj6vsfNN9/8Ae89jxw5ssKzMuKzwLHII1qK49SqLZ2kHil9VxacxAqDZeBXECpN5SYbA5Lqo7o3bmNFfmwkIcuq2vS93G5Hp6oMIlfp/wLbHqo6U+5hc88VggSTG0mOMNN0ct+cq/tt2qPejXxzivYoQHiTCaPKhsEsrOsIUk2bxbgarR1Zp/JOdOx4Q/O8nANqvC0vRnrOZOTQAp/VBOdxtOMw9scb2nDOzoHWOLA13mjOAWpemvnnkHNolrxU87ea+zDtKQU6ozVJGkVfC8Tld+eiDjUfmmI/B3HoO4fnPkNsXTRr5TBfW8Ptt9/+X0hePHLkSL8Cy99PAuDRo/79739/f2lx5W3Dtl+lQlhd+0iQAXrXYeuMw/ZG3kCGYXBd1+H222//AFb+f9PCc0wDJ15t4FEu9OqZz8KB6CSIvqHdl9qiJtIMf2zFMNZW5BEeSOeMNXJb6ShrKzfBUC0dMppZrXVBMXl60z2IpV0nl6zy1aY+lv4yJtbTYl/GUG0xTZBGe1jx0phLp8ZhiYKdDR41h5tlc9r+HtIwBefx5nIbQXIGLaJ/S1a0kC2l9PBE289lYkbk4MNdYqlFqqxOxtm8Mfva95b/PuXXaHhQaPwJYGebeOqTAocudTJgpQ533nnnPwOwiv7dh+s8/u373337f33i5MMX8ewhjHkqVgbY1XXtC4ACdD3w3Kl1XP5th9lsBg8vwzDw8OHDT7373e++5/DhwxeBoDJZXeHq8I8//G2f2Jo/e+9iE16pilTAj416ZwszSSWul6lgDhHjf5d9nWr/X1L/0qCrdn0BKxgnrXQ0dJRUqQONaO4h+AyW7YG915ASJGqlGnS0oLqsPe02qv4rAH4jkEqttW3zd6rfRYrGRnts51ncslBZNY/G9rgYvFX1uzHeFc8L7KvlLpN7HO8GnYl3q3tg7drXaJMdq93He7d7OsrE9DXSTDd9mMsMUb5ENxNc+uIcH/pXM7gtAi6A2QLulltu+cTP/MzP/D6Sslon95sGEMDntn77m4aDmwcwcABlJf2trv0xuZ0AWz2Gpxycc/AcAMD3fY+DBw9+/K677rp4/PjxlfDXUBWMWgFnNiaBz4nntU6KOmhDChOv1rDVmpLRDGXrzNo8Xaco7aHkd0vNCyWYtcRo3UbrW0HHaMJsnazuoSgnjXel6Mv4e2pngw5YBrYsK1e2UfW/0e7U5j3xd6rfYjSRdXsKrW45ZkW9nGiPlH009e4yDoQph3SvHAe5ivGWPYz3xNiwHAdpjEOjDOSq50CeP/YbMO01bfeKhz4dqtg7nP2dDsMlP3ovjKgcw2w2w6233vqzJIev+7qvW0Fl7bOrB4ArG8/+d94tHIgFvEvLJgrIEBSHiSmVojQCxvQhP8GClCek1olFLY7SKoeJ9yyigHnWumfoJM2FLUdRubmXMIDFgViWnEp13yhFuuWy6nIcOG2pKA/DxhpGu25LOTaKByW/TPMavEbBIwMDMzE25lmrb1M8aVjn8nsCzIDtc8D2+dHPRjBABJjP5+j7/ieHYYj5LFcCYHMS+bSZRscQRhzMwuzJamhq6GU7X6UYwgL8oghfrMvVQmsNqNICNsl06CyUUjJjJ0xRVktM/S20y00J1tOgJpjgUYRSWlZu8nOYHlpT55J+N9rTULk2jbcZDiquCdOANxUdTgHjSFV3rWEe/dxEzYml49DiZdGe3ebFXg5UzW1gD+MwNa456jdDcCwHhynbTogXOOcwbAjOfrILXBsPft4vuvn80PD617/+3wPAa17zGv/Rj350tS7uJyXJpz/96bWLWxe/fntzAYAOPmDpeVh3CPUj0oZfScDQ2QUoQ6/4/Hf68ZLpmLoz5l1S30vhdlQcQE2dsGUTyHK4570CofZS16Fdn+LlbW5bSM0X3YfIt9SOBH5teaH7Y9qv60fmoUijrSjpi6ENH/pctkm1Rzyq3M7QPFQCZNlu+OI9WMzCcmzSPPC7jHcx7nauhXq87b+uk+iwfRbw29A5jF3Xddt33nnnrwCQo0eProS/CQlBICFyUirf9ahRyw75dW7n0d++DkIwkbWprAIFIUxkrSZcBgDkupAiYKPWTddT1slCAMgRnVqrqQUrWiiYot26P4Y2dNt0O5DM47qsbo/Ja9MIfNAxGlREOfUDE7OiooxtYEMjtsMmEFM8t7zQ96iis1XdBSSN7TczT6D4W403zTxsjXe+V5St5oM9MJf3zNxGIwBF99vMNxZjo5/DJFUgS45bOkmxUMyrxF/9jTV5xMa3EgRA9ujWBRef6PDcEwv0s5jhTQbnnLvhhht+52/8jb/xMQA8efLkKvp3vwmAp77w86++IlfuGXaGdDxj+WUCjcW9Tp9mI80ANBaJcvEsVxs2gqXQ+ODK9pmPrWoDq43Jwjs02jqhaEhNLtvBphrEnLZQLf7lCthYsArFBVt8xcTYEM2+LVu4yw0OZVt3GQeU7SrHG41+NMZbyrnQTCU31X8A4iDeYeupDm5wEOcBcd450jn36I/+6I8+CAAnTpxYOTW3FoaoxxN91pIKrDsdNtQzjQHqvc5+ozO+jP5HAnWYpAYoVyijEQjdNiYI/D4fulgcHEy8Rc5aFDXuIo1/i8NtKsv8vu670bOI2MNL3EpTNhxdNvzQ4pNmfmadje530uSHk4/ow7eI7X/Rb0O3Mu5O0VbvJr5l2klTVhxYRcbc4/kw1uAL87cuhZlEUI+j6H6r+VnxXGh4kSwT0jioNudK+4Cdsx4VQPqRjmT+lIkNqvE2bbRaVFNn5LvOjhTLeY3PKYZmLO/1od30XQJU6g6c9Djz4BxbGw4xUF0gfm1tTQ4fPvwzJHdWmZL2qQn4s8/96lu251vrw2XxHaQz8A5KgoiO0Lvij+9pO63twiINEx5s7tvaYswqu0SWl7zyYZJpA4DGQbUYp4hWizKgUL9bOTUXCygb96D9pWUSXtQuNjDuQs8/Y8BE/TrbC5caDiaeFbybqqN6VqD+m6rUM1NHDByQludAmKuO2NkQ7Jx1oHMQ8SDou653N91000cA+GPHjnWrU+2EArBzcCUoMmtg42SijAEHFJsrJIyhSxkSnNq+GYq4YFZWZaOpMAyuI7M5Vxh81DNcRpoXtFGhDEKC05lCZPRxB8q1RjJWnproqawBSq7XL+q+iyiIDhpAc6p2QQV0OHWaCSKyNR3mtCcj9I0y5Sb+KJDkOiOTBL5ZfxoGn7Ixc5Je68M3FhbBjIvszDfvjI0y0BAkWBYzhWKdKj1QbJM2kpr+6PVdn15VIER8N/Yz4eIBBkC5FDTtvBgrcirgxWoHnZprod96o0CtudWg6Xm841i4oq1ieE6xZmGmo5n+ACVrcympf0arqk3MCnNRRDDrBTuXOpz9pEfv+pAPmPCLoTtw4ADuvffenwGAU6dOea6iA/bfQX+zO/cdi2Fn6Fy/ALEAsAA6kQB6KXAjphUdBA6ehJDKVddB0AW/AQeiw/iuS4CWCOXyTxd+4t9UqkerQncknIwLnsalcgToBKQPPwJHGf2WXAC/JCAMEU3qh44QR4gLX3e4B9oybLw7diX+zkzLhQUr1uUCnDbtey49V890HQ62rdGU4lj1RUxbbLuEqs7Yx26iP8zv2T6r/qj6RbWZhhdj+1nwWvOXrmhzqDeZMhrPUpnYZ91GNX4jjQCe2gHD+Q7+HIFuXEy9X6Dve9xyyy2nScqZM2dWK9rUYUGG5EfvyPA1j98i4+/xOzR+9zR/u/B+FOzi1+4kgz2nZ/GehM9D15tWi7ANy1h36ffv4ruhrI4HcFHgDGnYyjpzOUtXx6mYZ5o+xjmm+6z9/p0uF7ZgFwQQo0iXMdOFjnlJdVD1LwoTJc/C2IzvsNEfpv6OY5jHLfOHBiZvXH/tKh75r3lJ5H47wqj7Iv91OScNngsTTyJ/XBDynFJXOhFVxrZLj1nmOao6Y7Yah1wmz0ukOd6MM1HZXEg916jiLiSPXzHe1RwNvMptj2OTx4qivp/4Lal5DUH6TnXdcZxdMTeEglk/x3NPLnD+SWLWuyh0e+ecO3jw4G/9lb/yVz42NpsrV5n9qAHc6t2fAIi1g2u9hBm4s7WNnHjHm9O6Z14MYoSfS+pwwtMndXRUXUkFD8AcfSUSJqPWcEk6BQ+eoGs4hldZerL/iIGWEA+v8tNa514uz087ofGy5YhB/V4+k8KuqeIf1QmcKQrB/q6UCYq2ftOLOluLdpomhim4KONkTKMhyOpYVu2nWHy0AS2NcJ4ZTWdpEwnCRJOKd3Hm6WdeYLQpBcSa0iKPToA9OyyeImQH4IzRAOe6rtt63ete92EAOHr0qD99+vRqFZjWA6q0YMpMW8DpZe2KmDRilEbeKopRa+vyFXQGJ7TcSjPJ0s0itVsqzU9WYmpNmyjXDruumNlLsanspFFGlW1BfND4N2jNYQ1wzULDiGLNItsp11i2TWoXnco9xeQ+15Avje9a8cdb7BQgfae5Ph1JLJKzMOtoNFGqOjHRgWK+d9B++wym+RqRWrkQSGGu1dakMD99FOoYcs9TjNUHSsCKa2c7KCT5C8BrjSQKe3tlLZO8NlLSuihKc2j6Epa5BI+j3DN0+0Rvl8H+HLX16fsB8dTHiWGrR39Agr+49wcPHnQ33XTTPye5HXL/rgTA/SgAumfdX5jLDYJZBywW9BiG7pGb/sazz174Gjh6Dziqnb+jwPUO0okBGBUA6AE3c6MIIzJqDgUQ58E5bXRp/GCcADOdFDwLCJ0TkMN4XiIwpAXTBQWQWiDixOa44Q/hiOo6mMhU4xdSCFRF6kkLbSUq3q14VpqBW2bUVjRwaeYy643UZmW98Ga/KG0ybfdNHVyVPwwNQKsXZc4TYipAW5RJAiGGpxICQx1oPqPF1MrGm7BxiuKx3bC8Wnh9wX+dtwgCDIPH9pkezvdjm4VC0q2trT32Az/wA5/8wR/8wZX/3y4OA8aBXW9aLllis6ZHB4OUUr/OCAKnIEFo6qXLQgiTeaxwT1jiZ2ueS9A263y/Dfy1Cg/PuG3EKFym5cxKwWrtK+Y03ZRmFcpPFdDJQURCkgrU60tMXhGWwqLOBiZc419tIk/ffxKsBP0a4To2fF4CdlwppRvXmRbic2MhLWEJGnWWcycJgtHUGYU7FlJ0UDwkU2mrOaXEXMIekI02SLuNaEne+lspYB5a/QYLbL8w7+G0KJ7aFkGnydbmsgdlhtpPnPPYuQI8/ckZ+s74XvVd122+6U1vel8w/w4r8+8+FQD/xf/1Pf/vwiqM7/4j3/3XNi5sRshQuylAnV5pkcdTzkPpEvrXOG+iuTdOQm9Pmk6dZNOHPJp4wQ4WCmH0LREHoLPgEAIP1wefkkMeN73do+8XGPTpV9oBJpMaBzbKoREUoXaQpd/Kbs+kUWcFG1OnBGLjWQnCyiV0uaSNrHbHWhNT1jHNAwGbPJW6/VU72Oa5FjSEkB4YNh12nhagS+dj3/e9O3To0EcA+HCqXayWgF2maamE0oouM1lbcB2tiSBpnTERAyadWlxrrCrLCpglMm+OSBblKzf6AcIIbCnCUsocG8x7tdGwSa1O03MWtexgp6alnSClCjUmFY36Ey+Blgs/Ni6zXahyqb2qLyJwHfHob85x6XEB5w5uQNJkZhkma+ShAyI0RhZrgbcFSCyFupItK4VuZnUcbZxO0wHQ+oJWvtjLHJqVBJXhrJQ/Z3EYkXoaLnV6Fto50ZSDpR5DgT1QLwOZtv7S7Y9bhOh6j8tPE5efFbjexwO377rO3Xjjjb/0rne965Hv//7v7zhqYVbXfhQAj7//SH8KwB1n73BnDp/xX/++3/vaj//Gp38vZ4LOOWdnEItZ7c1sHJ2LmQ5fDtZxX5G1C2g5vehGn4gBgHRKyJFCk5b/cNGkSGKxPWD+mg10M8HOAslEbU7L6rPy2UBsVOp5RcmaL1GGI0o2I1GZPqlUejq+S2dRsKZhyQERRuxm2syShtQrM1biB5XmRJtgoczCyjE8Lc40ZjujPUwLVtYuxL6lyMSg2RFvN6eSnjUhSZUdQqepSstipG3KIUXPGUd3Xbd4sHPYeQYYLvbounHV9d7jwIEDePnLX36apBw5cmT19S8TAElEt5+2KdPlOaO0HFprZlNPFfhjyBkYMnBz1rZISiNntT+Adc7PmiyGSNvsvKIMphlXTgL1pE1iwqjTJtCo1YqaprFZrILUaCI089/aoqFhPlJEL1VkiXJt0Zk9RB96oqZO48ORKQI7mfekfaASLexSuVyEOvuOeOI3PR7+UIf5gR70vpkFeleV+d6A8WydLcHRhuLsqq1eipk3iRu7B4zAJW1cFr5Xtl//Pc3Lqfr0roNityrEQ+bsKIJyjdRSaQfIAHYDutk8bcLDMMiNN97Iu++++9+TlOPHj/PEiROrBXG/CoAn3j5qQaJG5J6/cM/bh8WwGBbD4On7Ylcopp4+HRGCIS+W6fjEDP5mFI0uCG3S9hOqPlRMO7sAECxI1zmSQhHOX+4o8x1g06X6dCh9FmrKA5tUZiwR+wGJMWdK9fnmza2CwrUpjoz2noaO6JN/wQ4NZVEkAbXmoNaipNplFjd1tI3CqFinRVNHuidaiC1oK7WRqAi3qQVcoHliHH0KnkD5CeW6x6TmwIzE4uwMbqsD1xLUgpvNZpuvfOUrV/5/e91U6QqFr7UxCqRhkrXjb9OO6XVDa704IRxQmS6dceSjimqEiZLMR4qWhoRkVb8z2k2LnaS1nA7ZzUS7ULBQR8eDHLWAXDxLPnlKC6h9kw1tZTNmgXtU8j9GtUplFqxt5/qWI7F2YIEDa+voDgIcXC0gEbXj7QtVMU+aKqfMrS2MAV6llLrMJlKo7TihJdyTOafRxqVCMpebaIS794MWYp3SMmMRoA+Kjx7wQ/y6vXOuB3D2Na95zb8HwPvvv39YCYD7WACMv5w+fVoAYGdn508fPHiwX19f78vCwzDYU2WccN6rxOSoFvY2yrpgsViENKPc0+nOemiL2fz9gtjZ2gZAeg7o7wjzGj6ABeegBiosptwPZh+zQmuXhb78ISZg58JBPj1LshuVdg8ZE6qVEFLhRBE0CPFSCEL1iZZWeI1/p2eahVTmDVamAeOUrE+/0uBJ6Uupn4kVG6TIVVkJfUo7k55p2lFLI+U6r+iJw2Lhsf1USFs2zhUh6Q4dOvTUD/zAD3xq5f+3x+1RYHCLMlQGAfEJikXvcSy0fI6Y0ERoOIpBaaWi4KR87yRE9yfoDxghSsRnLbYGzBOqtsP4c40HHJ/nvIiROazeWUJgwOh8ysZ+bmjrPhqLtWRLCeuymVdZe2P0cEUbrZ5TCu17aU8MK5UG7ktO0cHdBj28DHACiHQQES9+EDRkD77Ar2fX+q5amHvx24jIL73SvNA6izPw3urTaaiWq173zIOIlQoA9PFbXHRd16+trb33ne985xkAK/Pv9SIARhXdPffc80MHDhy4bWNjQ5xLCE/Y2trChQsXmpVcuXIFi60toOswDEDXAcMA3HDDgRsPHz78h6LgmJV/HS5evIBz586h62p8yUuXLmF7exvOOXOCHYYBW1tbY15X70Ndoxv6+oEDd73sZbf9fr8Dvzh4+YbzL/v0zVsLDxecaaW5ptTRF1LlOpsyJTAFQKBInWei4YyWLdPIelGqj9TigFXRZSyE1srho4zUY5W6TmC1M20LBJefzAvQ1JRlozjZemhHdjYwAKPmU7fPalNKvup/NY5geuYGyMYMw7P96Ho6CgrDbDbr19fX3wtgWPn/7WHLIQPMkjIlRv8qlAoSFbEIFDlko/evpENA9pkTFdmY4VGiJjk5nERtmNoEBQFuKCDwOqgDT6GrZ6GNBiW4F6hdUrReTR9ii5R2TvWpzA+nnWVLowV1OX1gnKAd2uWM+j37jdGephvul1L49WrayucygHXTEa4foUGcOAwimPUzN5vPKsDr1bU/v3fvfbe+vo4777zzAQA8duwYTp48uWLOdSIACgD8rb/1tz7yItP4qS/hBD4EYPHjH/qb3/trZx5+99b5jYW4ro8LnzRVHFehiW88k4mT2G6HV+F0Hcvkr6ZMyqtv9/MvzzbfuAt/GhadWs7eowOR4Z3kKEUBut5h6/EO/qJDH8zd3nuur69jPp//HEk5duzYakfbw/c0/uvU2GW/vTZsiQVkjr8LaQSS7BdsYWYk4bWVgRZWi25EMtaHsSxviT1INDSULZR5KfR6unxyoWB257CmcA0oLQXcE2rfVcVbbdGQhgVkmnYdmCWw2nf7jToj4EaJ0jlCRnBUT8IdvuPwr77yla/8W5cuXWLXdSsYkH11LYwIsFiMfx84cED+zJ/5M6f/5b/8l7ICyb++BEAAwLFjx7pjx441C1/taeDMmTM8evRo89mpU6de1I6cPn3ak7wCQN75k/e9+TK2Ae/oKXAi2eeo0EBJw72wxgsss03A+AFWpu9kfq3D81MwhfL50WYiKfRkJPfWDjQD2ao+7/oMDYjF6hmbtJfxbk98LaBfuFu7CpiIMf+Uw/ZTgm4xwK91oKeIiOv7/vJb3/rWj7773e/GvffeuxIAd7lE5UcrgxkjgO6UuM5SCyVW5268aYt5mIMqtAZRUlYIlR1XBTAhm6aLdDlG69g8/El1nmF5VKESOgNwcIIbESkErFzO1qOFVjE8dqrB1P+yMPWK5b2hUeA9ORXwVRs1lBrVB7xGm+/Nz2ade+aZZz707/7dv3vf6mu4vq5/8k/+yYoJ18tBf/90hPjb8rfd/Z+5f/a9v/Zdv3luOPt62aHHCBhjDtM2ZZQFztPRuDZar/FMg1MbYa8BXF1GnrGm3VT/FcCjrXYZ1UYDnLWWnlp1aAmVtZRl8tg1eAAVAd3gSRU8YiNQ2iBtETjW4GQVdQgCrJCDwKPriEs/v4bFIx3czEEEHoA7fPjwRx944IFv5KgWWmkzll4d/vmvveMT2/On711smpyKezh6tJYYqYZ22XcsRfqw3YVVTINGNzSbKWfqru+U0ekvlnA9DUWy7Nmu9U4VW/J+BBWeH3T4rZ+e41M/t4a1G2TRub5fLBb/8vDhw99/8eLF/sYbb1y5TFwn10rzdx1rAK/V66ce+KnuPt43vOoDt3ytwL9ue2vHz9zMiQH61Af00pGt0H5MPEPpi6uzbDd3pvwSTU7Q0q8nBj00wLBgIVhqevFZCf1Sgm616uBkeyc7veSZjRxu8S7vdCbOUUroGlWjhtWRIiEysqkRjsCFGfxzDugcPDwE8Gv9mrv55ps/RHJYodpf5fmw6SYhlUC1XCzRZxsBE5I0GrhxYrEHRYNIt4WolBWDJdxU7fVb5nc1gmfpS1d4C++tv3sQiTnNZy5x1dgtW5FtY24/HascuFU7GQ5SjMZ0Ynt7e3Hy5MnhyJEjfO9737sSClbX6loJgF+Z1ycOf4IA8IXzn3vrprtEJ24Q710yHWm/GZFqMa8xxjRcClXAnFcLrDcYefa9GgomblDWBCzmmV3AvcEXrGFcaGL/WNWfw18YsmxMQsFgot9Y1rcgfBabb5t3mrZfwhMLJ6NTdUk1jkk0HlMKdh22nwX8pQ7SY3RmHxacH5zj8P+fvT+P1iy56gPR347zffdmVpWGKqkKYUBCCMlPAyABYhCgLMANth/GNCaLXraxn5dZfr0svcfD5o3Ne1lp0/282u32srvd7rfa7mZ1t3FTicE2NmAZTKZAQvNQqFJSSSpJlIaqrDGzcrrDid/745yI2HtHnO/7bo5VpRO1buW9Z4hh74g4O/bw23fe+c55uW+so6q0Rx67L881ounOQJfKpkQFh3JPYOCYAKpsIEPJkbFqfWYtsHLf01BABROzxuTT4zMYeT7lHdq4ev5AWa1jiIsN0T586UBTVl7t1Ti1F8GlbGwJo5ZG9Djb1f3x3xFvc4yng4iE3d1dvOpVr3rru971rjBGgh4A4W8uc5nLc6GE58tATj92nCTl8cuPHtntdxAkZNuhYDpKYhXYqHhsiyvY/1a3nf7l9InehvzZeqWtMWjlCG21iqp+/cz6CBGRDepv9qv12avHuIru5SNIBKXh7M8EsE8jCAwSggQ5+03f9E3vAQb8v3nZb6K/GrP6iJTsFWL5njNqJC2cyy+b7tfvq3qzIIicGs7cF6nrHYWznNtX6gwyuq10X1Q71fOw9/y4dJ8Eto7qPalppINEzLWEa+hp0myjdV0crVt09hpIsf+mfnVl7cZILJfLO2bBby5zmTWAz259BSkiEs88eubW8zvn37y32yMghAz83AA0tlqK2rRoIg0rk+eESXJVnaCzsDqQ6MZ7rBqnsmTXZtpN7uXsBs0+oglsXd9zZlnTHg0mIA10R41lNUWvql+T/U2RwAFhP2DvDLImg4j9YrFYLJfL9/6Fv/AXvnT06NHu+PHjsynrSjSBz6pezfLItRf4CYaCNyoAIuPs9zeXucwC4LO7nDhxTwDQ/9ID//3rd7FzZ7/PISogH32j+ngE59pNp6OSGmi5kQHBPhA2OiZLzpCMUYjc1K08HkA7t8F7DWBEkRZNxAaEmM+FrpPVe4RsKENsODaDaF+4xSQQSATOBvBcGPL/ju12XYdbb731JEmcOXNmzmj+3Jf/5nKdStfpw19E7OO8XuYyl+dxeV6YgB+4c/iwP/T4g9+9v9zvAiSKOFhV/3crhVAWXGSCTE28iCLPtW6slmE2l+XaCVlXXGhA68tEfd55Xpteq1Rd3mDNRp1s93lTeUNWaSr882PW6QDsPQXwQhgcxzBkrjl06BBe/epXnwaAKUiiuTQ2Bpm//V9xPA8WfiqB7c9lLnOZBcBnbTn9391Fkov9uPvjly9dBCVIlCEGNAIgA2IURA4ppvrRDBoxZBkgBXFMuxTzf4M5ZPhhqUuG9yLG+jA4URMs7+R3h/o4Zh4YwycQx6wZBBHHoAeOGjj/XhxTUHFsM2m8ItR74zuEbm8YWxxBcvMYhPlv5vGkdkof07tDPZoepc2YxzzUGQlEGd4d7kfXRzU2JJqqtjDWybE/iq6FN+N9ju2ROeVI/1gYnf6JEe5l0XXd0z/4gz/4fgC49957Z/PvQcosA35lsTt0CEFp8ecMIHOZy/O6POdNwKP/X/97n/rwnecuX/jWvb19CLpAg7lXzJPF8jmKUjpFGzkmU891qy+hSrOWc4kWvzZRkCv6msBGOdr8yArmNf2t1IQ6L6/QwdOSDR9B+95wZRRSW9GMsImlWEHF0LkgUoE2K5O4igYmafKgeNibOihG+xMaRGxMQg2b4BAihh7dzhb6x2SIMh36mtK/ve/7vu/7vnTkyJGFiMw+TQdaXDMJvqK0ASGC6JAioPs4n5fmMpdZAHwWl3vvvbsDsP8Hn/znb945dP5w3On2Q8BCZwAgtZDDkqkjQz2kPKNDDt9BwNHySAQZTCTfAMtAlZ4KQ72i0s5Rp7sa34sKgiIJdaISxWeUfzHm10iXOopSUl2Jes8JWJE2VZR/L8bosouOgq1uL/ezRHf4XMcYNahFOHa/G4EytaGhLEThS4sa+ghXEXINWagexgcsFgF8JoBnO0g31BFjxNbWFm6//fZ3zpqMg5fZ+PcVJuuTCJ09CsZ+ngVzmcssAD6Ly8nx3y9dfOzIXtwLAGOBmZNmVt5aIAF85IfNRiWotGFq46y0JrQwJ2vfM/jPqs9V1Q502fRdJjMQtyN9Zf17LQBotug43R7JRtWtCGtLX8MOAgNPWfVXOMCV7Dwl4CWBLIaI4BijbG1t9X/sj/2x3wOAu+66a5YCD6INmtV/X1FFAEgY19d4QDZ4nXOZy1yeh/v8c7zcdfoukpSzl5/6nv29/VGRdJBI2eu9rT5bt/ub8b5c5Wvt9yMFPEN0sctIuSGEbrFYnP2RH/mR+wHgvvvum79mV0J6hz+ncezKfakw6wCLv6cDrkyA1nhPP2dx7FQ7EItzB9vO+Lbpl8HO1H2EmPpK241n3VhtH9W1VjsVrt8UJqFM4vzVNLd4ie0+Fmp4nMKqnfHvxSIYpNFZcT6XucwC4LO2HOOxcOLEif7ffPiXvnG32/22nYu7DJBOOHuvf6WUGAhcDuDjYcAxGz5sfdd1eOELX/jBN77xjecAdCIyf842LgSCEqAoRrDKwoXUB610+Mrp2Yzg7uuxgo8X1nKqP93O6J+qhabkEqAFHzTaMXXnoaq+ie1jqbP0gdWBxLaj3RNa/dHtgTUkgOlbg+YWeqDdR09zA/8EmW4nMPtLb5rybi5zmctztzy3TcD3IgCIH/3i/d99OVw6FGSxDz5/0tvNZY12ioLQEXga6M91kAUgJPoYccstt/DFL37xSRGJY/7fmWCbU7YE9Oiku1T5pVECn6qMuWSjvuQOoQN+xmAfKbmhJQcAwQkt5Z1ywLOA5BagvaSgm2xb9VeM+FvnDm8n4tVp4Fp12iAmNsDoS7DY6AKR29FuJ2IpTOMEgQZwqeWNHrfO2cfkUjH8GwILHujoRzuXucxlFgCfleXk4AEoj5x/+Mje/qUxuGEMxJjLV4CeipBOsPeUIO4S3UKS42IHgLfffvuvAkP6t1kAPKAIKIB0ROikMsGTgk4JGhFoaMaGa2FQJoLj/6PBlSzPCWU0R4zBS1buKYKODHXKKCxFAFEAGXHftdwWxjqTeNfLRGpGioFyjynwSVwU+lifhpdnIhaANNJ0OBFFnyi0QVNKZqzGHcSKzXrcYz+iNLBHx8w7U+MWda3QQCARkACEZRxT3Y3QTrMAOJe5PK/Lc9cETMipe0/1JLuzO+ffsru3D+RY0bl8JZReItgH7D3eIVAA7A/iSRDZ3t7+/Fve8paHAcjx48fnL9mBJcCAyucyR76rS3TCH8t1Uc9MB1GhEew0LfDnCHIpbWdtF1m3vaZO3ypNlhzWApsacw3sXo8xK9ySAOsViys6x8YAfM6dwhfVjntNXF/SGAckg7I0QidZAzgDQc9lLrMA+Kwtx3BMIOD/dOofvPKCnPv6fq+nPE+AreeyifxPCDqEi0vwcUEXsnaKi26BW2+99T0//MM/fAHznLgy+jLWqVmEEz5qOqtM8tGDvUaYYBAbrOHqg05NWPvuZYFG2slmxGnGCgalG0/VagmY8G/4zDnJT86244+gUmCLRlB1iK5OaiFSnIVY0MwC5Gku4me6VOZj6ICRxhi6hUAk5vf392fYzLnM5flcnrMm4NMnTgsAnH789JvZ8RAYekI6HNB5eZMcvnN59ol/wg5c9ujP9eieWYJBIOzQx8jFYhsvfvGLTwHAsWPH5Pjx4zPJDlg6GX6gcC4FXQX9I8pcmXHXTbrAEYp8fC4o6TCo55L5tgQyDJDESZr061RyO7VRk7CVhhDUGJLrWzHXppeMMJTHIy73dQpcluodJbWqSNsBUCeY3pU6xQjHSoajq1JkNHvDUNbQXKkVEzxSac2DrSObuCmj+b0Degq6hk/hXOYyl+dfeU5rR0iGZ3Yu/NilvUvFF6mRGQON877bZ6+yPNejjuUA9+QAz8u1o5NnFCMEAfHJBfp9KncydovFYu+Vr3zl741PznasKxIAR/FsDATRAMEFWoRmRihEEXWNNkxkfEZhkTe88miydds6WYDMdeZu1nXaZxv1TMxme59122ncouqgr49Gviw/jdhoqVeXgWuBxoRno8563PC8GRNK5nGNSOyaF4NGsHSq73vO62cuc3n+luemBpCQE3KiB3H4fH/2+/b399FJyWK5WrzTKdJYbfxc33b9xdBOR42PyfU+SxvsrlUORTLVH67oN921tl+UUa+IG3lWcXAj+rjYydxxfZ0BkNiBZxaqp4yLxaIDcP/P/dzPfeL8+fNh9v+7inkVwqjhotXQsWivtL8cVeaX7ItGIoQxPYvysxtMpTpDTdESjlEh5rk0hciSJaZoznR2naJOG/wVOz1rbJ1pH2BEEDFKsvJcsG3r7DRjexxp5f0EJYiZ/sV/0o1bpp/T1wZtpJhxF0gcvR1J5pvZopykmTWKo7C5WAxZgkQQdnf34lfd9VV/7Ld+67feBOBD9913X7jnnnvm3HBzmcssAN7ccvTE0XACJ/q/+1v/nzfuyOWX7O8wogtBZbBVHwUr51By1rcCp6AxaXUS9IwxRougoD4A2b+IZVe1SAuSU7WVDlGZolBMSaRBbJD0h0KGSFGAFOY2mT+CVLKo1qeMn7oxTzEdTXQKNk238Tts8v+WtG36a1cEQwGqj5kW6kQ5yucsc422Qe+HRaM7oUTwMtA/VUx8AuGI//fuBP8yazCuVPrTgp4VIMo1ZkGDaiKJync9/B6VHio2o4Wl8rEzqqnm/SIEpbZjdsLTfTPrQOMYYvB19IHJ1OrEhoBVNGVD21kITcJmppVKcYg4jXeo01Ia+jggaXMt2rYRMs39oa6sRcvecigbNsRuIdkHkQS6rtu6cOHCi+bFMJe5zALgs6584pGPv+ISLi0B9H2EyZU7nMwlOzyXHLvulO+RHnTu3JzQ12n9dBieaNFm/AYprRgBSNRYakrIFJg+UfkcQUdOilauKaEzOdxTSVJ6U8+Cqv0oMCpH8PFdo52gotn4oSAJoRZuxXxnssZERzpGRcvouih+3MV3TAiTH7jkDC4fsrAE+qcE/QViEVLqKkoIId5yyy0n56V9lRplJq2rFmLsoapckwzLAkxou8YJLA48mQaDz+rlbUYff6BTb+VokLJQKte8NJ8UGArByvxKUI1F7OFFavcSDb4swryuW21nHEOpXVXyPG+6UNRruNDH9d0Jj3r9azhHQ+k0hhAhYTHuYUMQyN7e3hwJMpe5PE/Lc9YHkKTEXu7Zi3sIQSiIo+QQDT7DAHkQIOwAdEWzxAE7jOwAduO/Fsl/gEkQQALIkJ9LTuRZPqSozTuMz3QgQ3KBV9ALSf041IfYjXVbqIjUtiAM9s7cz8Gx3Gg1R8kotTn8KO+fsX+kDHVheBaxA2PI4859zJrBMNyPQx8G01JQ7aJEGjLksZChfPBYNIRZY6mexUijYqWjoqWocThhWbYgjwfIvmI12XVdJ9/93d/9QWDA/5uX+BWsrUzsgd86bVkr48SQRzY47a/LxJHnrVhBxKVWo/GU8yKOflZHPIg5dPn0aKkdgY2+LSncROvJjfDnRWMr8IkRju240/xFlUXFBruI09zZ6yZjin6ikaHEt21/T2nfZNCY63Ryo+DcdQWIGxiAoC9cuDCnVZrLXGYN4LNHQXHinhM9HsT2RZ777r39PQCLoIW2EASRSTNAMPYlis64RVsfZ2Y4WJ9toFL7jYJJOXuXKLzoVIqhvJPqyzqFaM7zHrOsnNJ92wDQ2SwEFGCEcMjKNTZAb3MLUX3oQza3MvdyzM4gtm2DZZHpM7RNY3YKlb4C2RyoAwNCMRqq6MMq5oNFyxEQEPcAPiH5fZAkKXfcccfnvud7vudJDPh/cyjjlS6yMOAR9xM+pVIBOiuNdj5gFfgYnaUDxizc0D5qTTGSRi9UGIQmaUbWlDloGqEXnerZJVJcHcTGMDOvLxgtXOpPCylGYKTR8dd229JIzlG0gXXdYIM+OXUbau2qeIFbC6s20UrXlfUvQxAILl++PC+Gucxl1gA+O8rR+44GAPgvP/G3vuuS7L5U+tCDo1v3mNycKih0ON0mjVQYxS8OvjZJcFMfBqbNdHxOOxyxYZKiz+vk4v2sb5y3JVtth9KnGCiN1EdpCnJaUJRqPOU5Oj2HF4Rtz43AqTQINPUYQAszHu+H6Psohj6jnyNijlQEotUMpn6wQ+yI7iLApwRcxPQFjdvb21gsFv/yta997TNHjx4NmLEsrlwARByEehn/HQGDi+V/uD6cqsq/TL+H4V8iDoEFY/oOCQTQV9eG5+KIE6P+RRyfi/m54RryuzK2O+wCHA9Cqc5RANVth7FOpD70uf40ltyOlOfSmIdI4Di2zdL2eD2PO5SoYZEIolfXohm3HiMULZjpNLad2hnv0dAijlHXMY9ZjyUdECH9iPdHNZ6y94GDj2/f97h06dK8GOYyl1kAfHaU1915RgDIF88//CN7W/sLqigDRpd3U4BIKhR9KoEGozm4ne3A6KKSNtHLekkzkAQZB7yq4bSohTGHU8jk15eCKcgiGKUACaLZ1ySUWU2ZKE0hrDbDZSJQ8iGow2doxyCmj25cJjXBmKmBTmupgj+qbAbK5694LwbntK9GIQI+vUB/SdCNScn62MtyucSdd975LgB43eteN5uurkoAHEX1pFELJQfbGCmqTK/Mz5ighmBx/YyGz4ESi8E9kRKkIOJAo63JV/Lz5UIyaYo0fOjcs1b1OApSuZ1c4XB8FBUyq96zgRoDHH02raa2gxiTcT6CGSRsqemzZvO21mpNc/dvGreoqHqx2sqQk78M6y7GmDWAJ06cmBfFXObyPCvPORPw6cfuIgA+fPbzr9zb2oNA0DOOoLLMZl9rUhQVqeo225xCykcw0j+lrktOyk5Yh26h1wxKDiikMaVq809UViwxgloRL0u0hIwfKoJZ6NXawUhlXnNtiwvy8O+arAmFdEUDBCkCKq27fqGxo51517adNZ+0etLU5+zIDgeV8QQQ9gNkOcQVC6Xrum731a9+9fsTGeblfbUioJ6DYsySOgIeYv3YkhaeY7R44l8W7qWRicOll4ML0BJl9tRTxwXXo5FZzgpo0mpToHcADftidPu6D2qN6MwndEFm+iCmTdZTZt8MTaNo4yF3LOCzrd+MecwNbE5agsHvdoxMTgfLQdhPWsIu7wVzNpC5zGXWAD4ryrFjx8KJe0707/zQb9yJRfiBvcv7pIROo6dSkiZLCSFSUipVh//Rr0iS+UMKjIMW/kyuTcFofsmH6QaYrHo/ueiJc+5m0bQMzyRIF2dEHT+gSSvBkqTAmVLL5p97rtr2yej1u7lO68GUozSTc3x09YkO5zXAu5IHnjQQmSvGPwwZekND1BQRtrQTJYIChH1g76k40o0AYwxdwOHDhz/2mte85ksAZvy/a1AIH4YhRvmd5PkgFmgYFASRfBgSCUa7R5diLufWzWZmmgB8iIVkTlHKgTawI2m5dEBw0AcPKxVaoTWtBw2jJMWtROfUSG1bjb/S7kmpL7hY5jqCuuwBQWs0UbSQJsCFpc7kVyktLWQy71KMc0agFOswQg7yKWMtPSI5+wDOZS6zBvBZov17/ZD+7Tc++Y437S32bo87fQyyCAJBpMWLk6TNkoa502sJsm1SJ9SkSzM1mh5ZBEQKK+AKY9YUGpgYbZOlA+PTRudBgxKrjx5ZY5lpFQm1lTk/V9q2HogqyEVnpBfBEEFjtSPpfZgcraw0JEWbGpTJnQPeWvqQKow/0qeoGgGBE+TMKBTEMZCAAegvBMSnF+g6guwQELlcbvGOO27//e///u/fP3r0aDebrK7yZBgEQTBiLEYlrEnO5lEONUTQmJj5VCQ5Qt3g//h8wpK0vUFdC04YJUK6FkKej0FFu5JlnuVrIkPWGFOfDP54KmpFQshrbph/GPrA5Cun2077THCCbMwCVM4nTDWuDO7cq2jjVOeAYZgFxbE/1AehLmlRiY6d6RcljLBLqf2ISAw0kzgGhITKBkJJYN0DryVpCEfLyCwAzmUuswD4rChn7jwjJOX/9Et/7Ucu71+GMEQSISrQV6ePGoQZc+Jnw+Zk8QPLd0lGO+L4sVF+eNkfTtXF8YIJjKAy8fgMAFB+RizaNkpRzpaI5NoGZiJsyZIBQIX4pchJHeVrwKITAHUy0zX6AxGF2MxmMhRU2GmxgGXHBFMjStAVm1kkVRqL1ofKMEcAYb9DOEzwqYBwXhCWg2iy31NuvW1LvuZrvvb3gNn/79qpAAlhVDwrGj6lLC+q7DwVYr6nXSUGIa23esUUtDVmAilCpEshVx/byhwe5372t8vryJo/M5amKNy8rOnu8zaR8C6F6nCWzzusaYSiCc2A7FrDnf2Iy1bE0e1j8O/tqz4WshY3CKr0bpTerH1wP7tRZC0lMAS45MqiMR/neBkI0EcQXQ6Uee6nt5zLXOay9qD/HOqrnPr+U/vLbsknLj/+Qzt7exCEEJVTTcK6o95EFR5XElKSn0/+SZqoZIrKPkxawCr1lnZKPUVISmZoHYhRBEEqrV5qlyqYJL2jfZkoouJ401gkYxBCQUD450QFkFBnOBUxAR/izHH546yfS3XqthPtJOTxFTWhNpNZ7EJJdEs26vxtleLvpLKxhrgYTMAAwmMLBBARHYBIEXQkn3jDG97wuwDk3nvvnVNWXSMtYJ45CgtQC2/aBFuegTHFQrkkBGVyVIrCHMGbYyJEtYlSn8gg2HQQdKOeebjHwRSdomYDh+c4PNfBnAPHs88QLRuEY32iniudS5G7IdVp2lZKTYl5XGFss0MK1lC+IlKig4MQHUudJdhkoEmKAK7bHqOHMWg8g8gYhDPQIIza0SA2mjn3iaP2VNE3BEHoSrYfktjb25sXwlzmMmsAb3I5BsFx8Jd+4x/f8Yuf/V/vQC9kzMk5TeBAdv83eax0hCxVLk/ko3k+y5NGGZj1BXTZcHVqtljDwmQtgphMqJVmwCoVUltQdjaXf9fVmc2uUrdN7Zxu1TJ1dhNRyU+MZVaH74qR19JPUM8k4ImksRwERq16EIehZrMbRBMuPNQRSTAQsgvEJ1OO1wgQsesW3S233PKhH//xH39i+H7K7P93tactAMI4CC9KM6fnfUmZJmZulRRricFxzIsr2aSvnQdU0KsJNDFpGyuUzHTUSXr6FEyk9dPRRJKEKtJE1xfdqditucm2aS0JlaaSzkfYge+NfrM2nEoHsWmbBqADrEJWABZIq7K/xLy/BNQRKoXmw14YRIYo4BBy1pMY5yCQucxl1gA+G+S/u48FAPjIuY/9CLblzj7uZyc5KpWZ156VSN30ZzF3Ql0r6j1l3h2fhfo3p2gbN059P8PHkNarT8GsVP1Ntak+pPdzPSqSt5zOYe432zECpqtPjY8On6W0M3xcbH80nRW0S4SlQUJSHP2yLI2dgNeguenX2A8EgTyzQLzAZG8DAC6XS956663vJClHjhwJ87K++lIs+tqfDkAY/o05xkcUorA+3xRIE4qMSHQsmj8d0CQjPDitC4eK7VBaRam0jPbfqftF6LHP2neS68fm7YQV7U63U7SaOnhFGu+nv0NVZ6a08jusf4L5mzKoJ2khNgc/yTBCwaDQYPYBnMtcZgHwppfTd5+miOALFx9966W4wyCBcGAJGo7YKbbQxATWyP0uepioIVIADyWjPX5q2Ayr97PPlPd8OzTpUwGvJJTJT7aOfS5aTVb9Ihwkjf5b/Fg9yVxmENdDyUJhA0akocmgRUh09CvCaEr3Gp8C5GIHhIGefd93y+VSXvWqV71TRHjXXXfN4M/XQgMoOv2Y1kpRRdemf3UEuv1F6JObWW1aikhNZtIKUkXPvHww0K4YnPi98Tfg7tc/+gDUvFf1gWvrbP6s7EujbXXYygdSFFyZFIDl64A5UI0bPotvpt4TwggkXYLh5qU0l7k8n8tzxgR8Qk70y7DEhZ2zb9nb2xUwBNaGVWuCrf5V4mAz1WcNF2FStZUIjQnB0MtQ0hSkHKhE1Y6uQ5TwyCSosgBae1RDNMRgL2JWELNicRKlIWRmlz5icpyerrqdHEMCn57O5kgpfo80lcnogxmfEIRehplLMIQgIYTH3vzmN38MAE6cODGbf6+RDlDExnuLjUk1QTxjYC5KmjSUaFpfr6o0R8sqsOYhtzCq1GbVzJUiGGpsvpLyTNpnFe2X0UquIyt+d4H90y/7y5w+vDX7MUb4qmNuMEtmPDyK5oHFMNW4piVDEhVElAbeHkCkQzcs1ojemv3nMpe5zBrAm1GOHRvMv7/wv/zCqy/Ey6/sIzlAWknG96MU2BV7TUqcwQjdUrACRzw/ocGh46i2yPcc7h+N9oqqHQH9f6LuN9LH5Wu5LVb1l+fGvxMEjcbPA+p/8xjsvWbdGV+Q1T3zxthHiNVk6na8RjLRjuLGqegLfw9iaR8iZBfAU0My+1E26buuwx133PGxP/Wn/tSTs9riemgBUWB8tLZXXJLDEjZbwxFBY8wVd4IaALrknqbJnUuVWYbGbSL5v+UIdZbns+uCaJcCGvcJ73JQ3DHcfd1nBYRO3TfvVmHeReUukn+k1Y+xHdHp91jtHTqfeW4jWxZYoJjS2MXuFEqeHCNXmAG8Acw+gHOZyywA3txy8u6TAYB8au+B795b9ofIBBYyLVCZk7S7J2jYmAyAn8+cUUNTUDlqizKP+ZO9z61bYE+ozMJttaPxfTeAhiw4h26cWfdXpyTIpjqd7cMIgU67x4YjvKiPtU5XN6UNrT4y0wonoyGt3hMgPNMBZ7s8pL7vJYRAkr8aY5z9/66p8Gf/DaGkYKt8zqBAyb0/nVhNoQhMFHHxYXNaPuPDhhzdKmNe3fR7fo82y4foCGPCajLFZFuz/nZ6AZiIYZjo5aTVFqrl57KMUNfvlHylbSn7hGtPwRQqWlvAa+2HqJ+zNEyZPoJJk5f9Asc2u1C0iDMQ9FzmMguAz4py15j+7YnLT37vfr+LwDDEElJsKCpFwaO4XV/di6QTqlxYK8o7GqdOw6+AksGci5+O64+CdDF9tbJmPY4kYJlwW9sPTvSZuV/SfE+H8NIGNZrfaeiqNT1OIJ1oa5Lmuj62+q/bTvA8I9TNUwHdbgC7mD5QYblcykte8pLfExHefffds/n3GhWdqk/n1LWiDG3YrotlLdKMcxcwguQYqaqT2oqgNTlEnFSGkl8XSih12CwqD65+vryvc2VAC0yt+/66EqR0+/p9LUFWzwKmzzZjT+3N7NPomWNTldtYnLmcyohe50mWMJjy9UF21gDOZS6zAHhTy4l7TvR8kNuM/I8u7+5BKB3jKFxFGX4oBZ8v/cQAxKDuDc8PsC3q+SggQ64HVO+kunUbUWPxhUZdw3XQv1v6lduLMP0ubac2QvMeUp/Ha7ofcH2HGlv1k6+XuqgELzO23r3TGDdjsPTTdekxRKh2xY0RIAPADnEcZ2RAfBwlhd3okPbCF77wsZ/6qZ/6EgDce++9s/n3WmoAswYuQKRrR7wGNKJN6bRmccTS04KKZK20BFRaqVYUbMEabEXehomo2/U/2PBadQ/Xpi0/7oH+wWk9dQR1K8IYOdNO1valVHKIuS7ffvL1zFiAnRQQp9kHcC5zeV6XZ30QyDEeC8flePyvP/93v39na+/r9871sZNlQNw3KaVKijZnZnWHaFHp3Fo4dFl7KKhy7Bp8CsJi2Y0asJT5gtIyg/pIWBjYjOxP5CJxJUVAqghhk2LLP6fvqeCOJAXnHLrQbcfKGd3An7FkJDB3c1osKT5ORklBr8Rw2T9cbj4VeBBTsvoAdDsL8GxE6EaPJzIuFovu0KFDH/m2b/u2xzDj/11bATCM4MKjcNGKB8+CIlBSjamo1DT3gnRwasAyfYJzDxC0Ifhgc+JWz4pdjz5wZaJ6o2crQVA1dsAmeTHaMSW2hlb7JbAMGYMvRfKn1GzDko55nxhcU4KKZUn7QFDBNcPiMQEyrndJkGVI6eAyX+NyuQhvetObfuhf/+t//c45u85c5jJrAG98OTkgRHzqiQe/8yIuYIlFTAC0GndvcjdWmHU5V60zOYIKeDV9RAiHQ2fvVW5uLB8hg7+nTKMa/6+SAxkrM6wRbvUXQgM0O7OxCYU0FrRirsspsvx7ra+uGxv8GLTQ7Onj7huBmg1eSUABFhE7S89HdM8shkcIxBh56NAhfPVXf/XvkZQUKDSXayL+KQEhBSK0/UHJ1vpTB48ccSvNAAad41pjWhpQI9FTmIhQgRXQYOhFK4+sdQ6jNnnULmvwQfPMCH3itNLSeK78BKPhhvu7WAKGemV8J9UnOgsObMBMOpgNfR4ORln4U9l5SA4kNu4Syj9XbFCWKNFWxKa1lDBmUVHzgOSL5vUwl7nMGsCbUo6fPB4FwkfPPvLNe3EfIkEG7VUoQkkYT8miAjdCpQow2SnMt0pS3JxLGi9WO+ewWdQzzgMdjbShOeG9VFqMqv6WKqFx/hYP5ur/pe2PTNZJHWpYYmml8WwLZNHDYlR/D3/E5DMpOiNBaIxNssYyiQ3xbES3t0C/4JirlV0IIX7N13zNb4+Vzdq/a1aosDGBAcJZ++gN1wxIdKSLqYrQKRSbwVVKUNFwMF79TFoQIxFWmW1EKZRT1HkAVPSwKDilIliWjEDMmrOoLAU5mZDJzlFycue81XEQnlI+8GF4ESWdYXonGu2igZTJ6SZ15K5aw9mvWFT/a2xSm9scSq9JC4VFk7plPIMRZAdgD4zE3t7e7AQ4l7nMGsCbJQEiPvS7Dx06v7P7nbt7PSIRIoHIYaOOEBBh1AqUfLdxDDyISWOQ/gbKvTjcG/4e8szme/k60TNmjUN6j+NnMdVJ1V76vcdYD4a/Cdun1EbP6PrI8pzrSx4DiD5rQ2Cfr8Y2aEs9TWKLJuk5YKJ+R9dG2310NOcg/CUexTiYqoiSISIiZYQoGh6A6CWiZ4A8voTEIVE9EWIIQRaLxefe/va3vw8Ajh8/PguA13RjoMlWkRS0g88fISEoiJIxxy9G7L8xpZgElZ82YPxdyjMpPHaMMA4iWVOfnzU5hUcJL+W9TX3ScR2h+MxlPOOQro+atADze/l3EB5zXuJg8xJjrB/jO6lOEe3HiFwnMi04pNMbEa/FRxUH3XfUNIOKaBZRuZMx4TOJ0XwfMr4fpNDK9FXlXu46gXTRIAPs7u7Opt+5zGUWAG98OXrf0Q4A/sen/+cj/SJ+DfdjFElhvigRvzn3Lw1Gl9FpsGHjFOijdfN3awam0eZN1Z9MWdKs02kGOQFhM/VcsVUbSBY/thJISQdxMzHWKkdxo37BNF2VNlH7hWm+pGuioimhaGXN83HEAhSEywt0TyyQkp8SZNd1ePGLX/zeEEJ/9OgwT+Zy7UqM41GKESFph9LxSoacuyFZGUct4SDPcZDnxiPSEICgjmbpd9JlCBnayveons/BEGmqxfHZmH1aRena9I/WKad+DfXGMUuJyiXcgpFBHPuSodgV/JMoSJmx/xTVvuTnSk5gyWtE0jGIcUjFxjgKbwW+JtMEtEEhaqxB9yHvC0N9QQomoDDBzow5nkdtanqn6wK6DgD6rIGco4DnMpfnb3lWm4DP3Pk6ISh/9eL/8ch+2GOgRApC9vVOcCI1oiySCVHnLjBgXR7mn433oXEAi7AyXYf+3NAmh6/cpFrt0WUIce3pfhg/OVpoFWgUPeMlDwNQNvYx/RVNbhFLkyK4aWHU0xTqgysZzNY/N2AGj2ax0BBiFcxNECBcIMLFHlwsIOwQ4x4PH7oNL3rRi95JErOD+nU4GXaCPuu5R3EjCoIo37NRMwi6OTb6pRUEpmDjrdTBS1TQSGSPksYwOXvCRH+ITnoNGd5nX6WQkwx7ooGqtW+Dygk+eg/kQ4gKoBr6VYSq5LYw5LdWGTZkNHunrCQ5OIpqnPkAU36PNCihQCymWZ92UZlzi8dDgYtiTC4mUfnddsXMnWiuT5jkaHqOIPbRLbqStgfA3t7evBjmMpdZA3jjy6nvP94HdDz3zJm3Xt67LMBCEAOEw0ZOiePHghn6BM6ZW5QTdoFmgYNb0Y7e5Z515LYwJrWzeXLwDuYdKJgZmPsocC2qfjFth2afNcxK3cfUhoWPQaPPKbowjj9SOc9DOcP7cYcRisY71Gvn+HGKRcnPDwKnuBgRH6PJYRyRg3n/SQH2F1nLAUrY2triH//jf/zdAHD69OkZr+JalyTgGZDhOJpD6UCZR7kta+skZ+IZoom1qTQBOEdlOuWY2SYojDxldoVqL6g20vkv6LYDQpDsy5veC8msKwWGJl1DznxBda2YdYf6tKY7KjMsEQKzsBnGHTWIjJo8MWZX5H4mCBwZBOQw5mFTtBr6byGkg3HkjUXQzRpSZrNwCKGY1JP5HDAQMAMIIweTcVf0nElw3N3dBQCcPHlyXhNzmcssAN6o789wDP1vfvefvuyZyxe+qd/bgxCBrdy/HjpCqQirtG0ucb204F4qHRqVo7mxe8ElxILVDzLjm9UADMgBIICFnRGl2GTrnlW1Wcd21cf0ofRQFCbgJH0QjJO4h9t1qega/bKCnM24YrKMeOidyiIdQITB7BZ6gILF46KVRjGEELqu+9hf/+t//TQAnDhxop+X8rUt0XKpzKUc7D2ZWbrMGxEFkE6nH1bAypJd+2x81sQ15VFgM2pkjRiVcKT6OApvZDRZRHxwlBEwFRFEbP5gUUrwXA99Xm6Vck1gsP5MTl/Q6vR1zJnytdTp8gp9Ld1ZWSlSOxgDaGLRemotriQYmFLprAGcy1xmAfCGl3tO3BMA4IE/et8bdrZ2X8gYYorviwkyZfT3G4IyOGacKCCmyacs5/SMxQ+NGP4eohfdc8pfLf8ehwCHLLdE+1zKdJH6l4ShGGOpn6rvK+7lvpn61T3YfuQxg8aPjpGIsbwXGdV44vghsLQCBhrq9qKDqLE0iYZ2NpMJ8xjjaNrS9M5RoSzmsxS0OXyiBItLxOJsAMtMjVtbW1wul78rIvtHjhxZzMv4OmwMYxSsZF5qgYsGYkmLH1QSI7XvqYFyicaXlTZjoTKhFuiX1Act02VYJyNuJe1fsC4SUBEXKNptL2yaMai2bN5jKyA2XGORI6BzJAq8SK26FuCTxQ0HN9sXUc+ZXCvSqDY7RouD0ZERrzEoGJjiVNJ1owl5FJB3dnbmxTCXuTxPy7P+43kRl3/yMvZGgyBCAUwe5VfjIlMAibX2KWsbJIJK8BAHEDt8p4IK4hAT0FH82up7+sMh7neYz9BYf4SCvrB1SlQQHAYo2uEm6345qEDfr1b/s0CntHyDE3sogBFmrFLVr/ulaQflBG+1pVLoLwLEwZw/+AQqp3lGICyx/5Rg62IAB+sYYozSdZ287GUveycA3HXXXbP59zoUUVo1EaftS8KhoMplnTXqLo9tAYiu8YJCEOWnRti0ZqzbzYEUNpdwQWeh00qm92lcUktGErrfpRIuxWgRncQlygKg/RWDV/xLS33v9K0WYNtIw2CmnwTdDylR0Ezp3MZ6ArNGUBqBWnpMAUAUAiwxVX0/K9fnMpdZA3iDy4l7TpDk8uzFJ797b3dPREpfdcLzlB8zbfnU5lLj+KzgEoLkNEmQOPwk47KUCD3opPPG/ynme2EI1VMJ6qP5G+ndYN+ToN4LzKfuAQ6itBVMnb4fpf6ptlNb2V/S9CsBxaq2dR/VMyWVFFVfhp+QaeezjHKEsSj/DR/G4R3r5xTGOvsRj3GovjsnYEwRpgO822KxOP8N3/AN7weA173udbMAeJ1EwDrFW+FtCC4FmclrCwMhoyWaVtqzch0G0kQLomLe18KpF2SsadfXl4SfEHQEr7h3PA2kCippwa+UVHXS6BdMG1YcZBYevYlYTD+8O4lO52ZN0gpKs8D4SOtHm+IFsgimc/txjgKey1xmAfAGljGrQ/xHJ//JK57eufDauEtEdAFUZtuovABTQl1oGBjka5FUZiQqU2QswRhxfDc2nh3NT/r3WNUN8+9g/ilm4wSU6+tN9wY5lcrHifl937Y2G/u2h+el3Y7ql7nm2o4JTqcxfn0vjS1Ge02nuyNj8b40JueSPWT4OxbfsjEoBXsRiydEaQ1BEZHDhw9/6ud+7uf+CIAcP358FgCv6/aQzJgFsE4MMF8wAgQw/ZMEfXstrH4+33fPjX0q/m6S+7qyH6ICv1AOjtJoR9eTTKf1+PV9wHvPpjEMuZQLkIzNCzzmW/bjb9CNo4beCuphXFctPijQP0M/18dRDg0SMcDAjALg7iwAzmUuz9fyrDQBn7z7ZMBxxA8/9O7v6rd2A/bYk7Gjg1Co02DYkj8OUrIJRG2apbMdmTQerQSo1twVV4ge2ggVq9QhdM/5+tejmrCdVbRqGyvqbz9XAC/UJ8ZmEFCPRu1flTMVFLiKbP5LKgqWj5tOCyc6E8KQlwrcicAzA6Bwcqnc2toKL3jBC961t7cnd999d3fq1Kn5C3U9RD8ZTIk6UEo53lnMlaR9b86kqeWjAoQqY207d21B00uavAEnUpQ/YhgBpksGkLzah7zECOOyHx0yZDrnr0GscamMdeeoc+pOjN9YJNaOUbloSIJ3yVgzNsRK1H41mpw1mBRlYgcQsZQf6TZo5Tu1h87nq7nMZRYAb2A59dgpAsBTu2eP7MZ99AzsIrCfNtG8c4lxdvYiVXZyjiULU3p/gBfTOYUFEtXmSJ2yCtnnqXzzbC7NdOpO/bF1oKSty9F7jfrVx8L0nyo1V24bGWdP15HMUKv736hf5wWt7o3vxRLVzITAnUEEBy1G8dSXET9Nsmk94YsN44/FVywJjMIB1JuELIlwPkAuy5B9YdA0hhEA+ndEhEePHp2/TtelCIJ0AwhyOe4YX77ioFr866wE2DjIGIg9KrFRDHYeUECWDcYgCvoldQQtlRlUlM9r5ccH1F65JVGa9r8b6qC64wRVFuw+MbVPUFRagq6Nlhe1D+QIX6o8zLQisN7btDdmyfWb+mlFTYH3aRyAvVOWFmGX6T4DQc9lLs/jg/6zsldHEX/jwd/Yfmb34ndf2t0bz7ZScnYK3AnfGU5EaiFL5fdU6S9HGSYMidmdQKQhVLLgSQ1xQSPsDfASopzkdR1s+DJJlRtVP+eFMfuRUx8KBWorK/tPq61Q+U/T18Zo7dR76TntiC8IQxDHGFGYzL0a5C/hkPnkyGKkaWYBQvLzRHgiYLGXcgcjBgkBwJk//+f//DsA4MSJE3P6t+tUyH48zGhzPp3gVH4v67G+p39oXAS0G0eV+qaR4UZDEfl29OGGjfcx0SesGAuMO0O7D5gc6yp6sPFunXWo1YYXLNGgoad1/S71M8oFI6Qo4HF/mINA5jKXWQC8YeXYsWMBAr7j/e/4mov9hddiNyIQwhHChBjgU+wHqcCjJKgT49uGAvuiryXRMQmCJXUZmnAw5r8GVIz/2/4O53/YqJ8ly4K5F5kjn1v3PA2Sts76FjLLYAZiBhwgYVwfbdtoj1sFL7Z4UWjihQv7cSoZ69RntScWTwZQwhATM0rtt99++5e+7du+7RI2sZPP5SqUgAKscDOYy3NOpF/LbwkpFZzFLZzLXOYyC4A3pJzEyQBAzu6e/f79RS+DKGAwDFZuSis3rFV7mWz43DX5uF5F3za9Jwe4Z8IUr1G/roIs0gGLix26p4HYYcyYiri1tYUXv/jFvy8iPHLkSDdLJ9evdCknbRADRJx9ArN/YLmWc9jqbBfmmv7Bmh823l31zPRzACfqnKqPE78rv0isqmeTOqf6s54+2Ih+q9px40HKlUxIJ8ZHctYAzmUuz9/yrPMBPIVTEQDPXr7wY/vsJcwn0K8sPQUBBg7BH3uDoEEBYt9LCCG+5CUv+ffAjP93vUv2fIso4JM5IpjNACxe8Qln1SmFa04yaDxXh1bY7Bjr+qgB/OxzMWqoP9lwHK1/p34PG5xrBD6DsGx8CpRqvaVKCGKxHKKGk4sIyXkDnstcnqflWaUBJCg4Dv7Ge/6XFz65e/ZNe7u9Vf3N5fkt/I1TUkgsnuwQ+g4MhECiIHTLreWTP/ETP/E7wOz/d0N4kbV9UgIExGPgSYXtZ54f3wlSrgX/nK8vtNoa8QhDUO2Eqh8h1P0KuT5bbwjlR8Tdn7hmnhU03hWDM1rdE9Z9MzSj0brWNBpy/Op6sqa28ayENmZj8M+O+Y5DiBil/rC7u4tXvepVP0BSxmj7eS+ey1xmAfD6lHvuuycA4O8+fP9r9rD3NdKTnDedryi9E0KE7AV0TwMMYcSpJrsu4ND2oY98y7d8y8URJ3LWAF5nXggjukB0GDM0k8hJ1rR5cTTSDz8YnpPxeXIQUNJ9pudlrM+9C/Ue3XUBAqNqJw7X8jNDNGsQW6fouji2DQ6Rr+OP6YfAjDW/03hO6MaN0lamm6j2RcyYhP5dqD4KuopGhDDmMaRxh8Zz6T5UEJrpt5S8wsAgpHfLMNr3Bz/drutundfCXOYyC4DXvZx54IwAwCcf/fRb9sMuKeznU+dXktaJQIgI5xeQCwn+RRAlcrlc4vbbb3+niPDkyZNhptb1LXHEYkQscCQKPMSL7bBYkLDmUZ8OjS30u8Yy1zne6sTDw+WoEwnTqi+rxtebRAuAvLQS/LpxTBhf2ajT02fy/KJSeHDVKYeKjjJdJZmxN1WibhNgnOF2SKDrFYyMoJ+dAOcyl1kAvBHl1OlTJBl66f/Uzv6OzObfrzyxAyFg62yHcBlDVMFwWRaLZbzzzjt/D5j9/27IxhBG/MgEW2SjBUrmChmDBgZVm4oEgY4UKdfCEOST6sFoppQRiFj/lCQh+pqqMww/EjBgF4c1URGpHd1WgK0zjc8/N5pZzXOin4PqY8n0YcZd1SmuztTO+Fyn6pTGc/m+fi5UzwYZg3oglnYjdnQQoAtDrvTFApCUMx3A3t7evAfPZS6zAHh9y7FjxwJOoP/Vd7/jpRf6y2+Nuz0CulnT85U0GRkgUYCnicCAAlyDbnt766mf/dmf/RAw+//dqJLkulFWQCcymkIT1vf492ha7IKMJlnJJsr8DoAgIZuEgwz1dJBBboSgG+vuJNWT2kSpY3wn/4vBvNyN9dVtj3WLM5mi1JPbBNAhjGZqoJOgnhMIJbdTtY3SdjZxp3bGeoKMcirK+4FixyMs41btaPqUMQJdgBmTZDNz4c3g2zfIfZ0MY+gg6CSY5HNBBNJZIO4ZCHouc5kFwOteTr/+tADAf/jcv37Tjlw6JJSemCPQvqL0fwLEXUDOCRgyqHXsug633Xbbh17ykpc8c/To0Rn+5QYJfwlyBCMsCGX4wej3J4w5W0gPQZ/ySAshYcyyAwIScx2AtaxS4YETNJZb5tSAMFZODuFi5d0ow496ArAJF5lyfiszrIFnNlbRoLBAUTLZQOXOVgOo2xZrAU8W7Cje+qpSHyas9PGZsQJK/ZyuN9Eoo9tDZ1QpZvMCcVpycxfejukfmVLjhdK/ORXcXObyvC3PGhiY5P/3xPmn3rpPBgr2Z+nvK6gQYAAWF5YIF1gytZBcLhYAcGLE/5unxY1gRyxZZxIyiU7BBqCYGjluJMrNTHRubegUgDrt2ZBpZMggaIFNQtBpCVE6oECKwfTu+E7ltmfvt66JSpOor1khkS6t3JAto6RFLkKWjMIiS+reIcWhaW912ykNHU1/28/lcat+09Qjo95T5ewGVJ0hqwJEBN1CZzQW7O3tzYthLnN5npZnjQbw1Om7GETw2MXHv293fx8iQZoO2isEiLU3J1NDuQpWOWpzVf2tW1Npsab60EovtWqAByEKUTmCT/WDK+izUR9WPD/BBxFBeDpguRMQuwzqHbrFYvcVr3jF+wDg7rvvns2/N0ID2HVIKfokpeqTCJFowYTBco2xPDv+G0J5dkgxNmgNcw5eyQ6EyRHQXEtpCweTZCiwJUyJD8cc1DoZpKy7ZtsRfU0bRUX/HUqaySwEGgdAaAc+KajNuY9+XP5d059G23A/2Q+zal/RRQFBD0JrHNMuFr4O/BqW1WIhoES1VGcN4FzmMguA11PbQApOnOj/6X/4pa/flfite5d3gR4hRsL8kIgR4w/tv+M9mnvl9yHV2/S98ndqp9RPVe9QB8y99HfzHl0fon6mMY4V7bDRpu9/Xb+lSf59NNe17jGqe/10X2taT9Slaav4wOpaxPJJAhyED5IMImGxWHzpb//tv/1xADh+/Pj8RbpRGwO1GZEqTWER2vPfdb4/kBzTNpa8szp3bTkLlEOJqDzfooJcmessSrjcH33YGIWb0vciyNhcxqUdqkNJymVNccHEefzqGpm1e1T0MP3U7dC27YUrOjpnjadKUSlinzfm8ZSPHD5XuqKnPgiav0dfwYX9LMxBwHOZyywAXtdy78m7OwD40Jc+9D19x1sF2Ec++wd30sZ4Ug/N0zEbJ+URcSuhguX/9L3qJJ/rDmn7rOqX7CuTXL/b90o7QbmHa/NYqMY57PlB9SGoPqBqRyb6Z/sVFA2C6mN612pIho9LUPTWNBpoIqodNOqi16qYe6HQTgLCbkB3jgX/T9CHrsMLX/jC9wPYO3LkyAKz/9+NOJKNQbUqihUJdDgMEcJKayU+ohUlcjXfh45QHWeKQGkLkQUeUaZe/SxE39M4hENKM4wBEMm3Lf2u06GFsb0UFJFMqEZTJnoFWFNtEqJC8o9ESqfGHHABnYIuuDGiTgmnU+zVv5cxoKonBcrTpYobl60R+sRoVBXB8/oczP29Em5lDgKZy1xmAfD6luOPDbAeXz77pSOX+0sIo/dMdlZumEb1dTZNqK3fqd5u3/MfQlYm0Ha7dCbe9e9Nj0df3+wemuNh1dYUDep7m/aBa+rCmntZaxKIxfkOcikMYZkgYh+xvb2NV7ziFZ8UkVnwu2FFEBFzXu0UEZpgRAb/Np/BIwmJHn1FzPVBmCvvwdUhkOod+x6yMGmv6TzgouTQoNoZDjT2XSkZT5SwCpfxxGcAYdX2eJjSY0nmYkMrdQhtZEEp45ZCf5dVpDluNbac6cSNU7JWUyqBMYx9XSwEgj4f72YN4FzmMguA17c88Do++OCD20/vnH3Lzt4ugCBRWXLmn+fnT3JYB0YPpLNAt9uNuLUyfpekv+uuu34ZmPH/bqQGMG0NQhVd2vQhNbZOW0XWPNEBRIuyQuowV8mRJtn8m55T0cHpnrdoOqVhuanjR3QYrjmHiApgoXN9FfVu0ZnbMx8h0u6TaPoYM3jdHzFg2iqYxtfnzlRDcDZVfcrEXNHGm54Lf0OniC0YTfhzmctcno/l5kcBHzsWcPx4/OVvuu1l5/cvvzrugiJBuIGlT3Bl9kD73pXWcjVvttLV3xjbpm5HVKzhjeyDbi/1IEbB9lPdaFUjGNlLCB2A9//Mz/zMx5966qlw/PjxWR1xo0TAvm8LG1lko5avlGeAQCLVZFJgLFEJV8mXzkTWcjgJCGvsF1TOf6oNge2Mvs7G31Ttl+tEsupqbBq7YmwGjlYbE4Kv7mOs265WBks08KhutJI1G21Iiw5K2oyADnHW+Z5TFPYQfb3I5JlNwHOZyywAXrdyBCfDKSA+cvmPfmR/2S+xF3uILPLJFgMgsBZWtHIgGalaAqOoTZdK4NG1+fdb7bjtuylIlVZa98qGW/6ycAu6dtmwP3Rj1c/B0QeNHrAawXDVC8gyObZVNLBjQIPeBCEMiEIsLwXIMxyQcgfNB7uuw0tf+tIHRaQf/f9mdcSNEs6DNhsW02sRvMRgyEH5mkkY+a1h5ohsxpxQ1SHh50nryDJit2QlYTYVF2GOKTJY/NFK913VLqICU3R0L11/xAhZyQReJrSYqs26k8aq8bSEqtMdyKxacRyj6DGKkQMzbdCQC8dnExaiiCaL5IjvVPeYCm5eDHOZyywAXp9yCkMU8NH/4S/8iUv7FyWwG5UCCQiVVaSf9yib0ufRQbtQ6jtecFzdDibucfJeq84BRYxONJx6frP+oOF1KFli0vShEwPrEUz3pk0HGX3GpnpUj6FgucUIsCPkAtBdXGSnhBgjDh06hJe+9KXvmpfpjS9BAqJXPrU0XS5KV5QGywoebJofQY21JxD6g80IkpxgSxSOYHrZKhq1QAhzBEzRsWIRk63wZiKFBeIVeXSKN2eKptInJiGRaq1X7fh8vE5wIxtyMqllzyzYicYx9LmMJ9Ib65VpYn7GF2YT8Fzm8jze529m4yQEx0/1AA6fufDkm7m7NybmLFGyGQxWRaxJKwG7j4Klx8cSoBGRCv88VzxzRT+o2uHKiOU170/85GhbroiIbt3LfkcraILV93QUsjT7DevvNZY4po4NgVicFUhf/P9ijOHQoUP7r33ta98FzPh/N1j/ZzD/TGCRxCGzR0gOaWNU6yigDUebfnwuvRfrA4ACdzZCh6go2JR5JAlIOdiBftkXPDsz/ZifF7MNZKc5G3GsxgMVoQwT3MwslOZAWtNOucfxACvqful3uk7Tjh5PiY5mpoV+Z8DrG38kAiHmDCxI2IwpI4vEAXg78WV8N2VzAeLQhW4MwmLI+6/MKdnnMpdZA3ityz0njgbgRP+f/fN7X7eL/a+KMcYgYx4mp3GIiCNcSCwqB2VaasqDmNBUYIU6Txqn/VW/T9UnDY0Zp/s1XZesvm8F6tXPNscvlRvVpDMgrWzHRttc0Rc6dcbw7Y3oY4dwdvzuDA/2y+Wy6/v+oz/90z/9wBe+8IVw/PjxWQC8kSKgwhS2UCLI2j2t0crmSnWRHAQQGU2tabYloStny6DWeLFYSFG0WlkLKCXtmigNpeT55k3PTUfGPJk55iZWydZyEEqrzqJ1o9P6JcFQMpZg8nc0QqbW3o2gUNAZPpwGUD+vNaXp/M7GBiP6DRWdXZ/9rX8mRSAd9MAT3260e/Bc5jKX57sAmNK/ff6ZL33PLi8vgLDPGEMynwz7X3Top8VzLjlTC2WNhDUl/TiprpV6mBPSI9fIf9nkQuthZ/5OHyFlNvL3stmrHpt93kpeFDbooup046b2HOLUPbRtYVP3VHRhS7AUCvYDIJcWWJ6TUas0vNJ1HV7ykpe8e/b/uxklRQFLNe2UbKAEEaaobZcqDlnI0gIkTcIZ2qkLKGBm5dtLJZD45cgidJURKMkyQvnaTYFR1+uoxJoU/0HfTnWQorYRF19Ie+xxzhcqUITGL7B2ECnm7lYYmSKi0AR82LadP6RoE3QcIG3Gx/q+j/Pam8tcnp/lWQED88ilM2/diXsIozxasMDgUiLZkAaMDtp+o1RneRO6QLQTurPpE1gnldfI/d6/zaL60wh7xYeRDRUZUftW1SEtJotAw0uP3puwkc6u9pRkM+sd1T26DzXB6mNNjedXfd6oUmiJ+X2Q9ASLZyKWFzvEUQUYY8RyueQLXvCCk/MSvUkawKlf9JlizDyRz2OshblBCAogA0gBGQAOfwPldzKAMf0tgwlyfJ4xgFHMe+kdcLhn6lV1kCOIerqGYJ7Vz5e/xdYVZayjPMMV75e2pdkOVtUBX0eAmOdKPmW3OVn1Lbzw6cJDRGAzlzBnNhnAqyExRh4+fPi2f/bP/tntAHDs2LHZFjyXucwawGuiZJBTcmr//vvvv/2vv+P/9pbd3R5LSpe1BnHU/KXTvYgVsjQ2mThBTKQppGnlln3eCW5aIBP7nK2rPJ+gqyunc2WGMX015ql6HLZ+qxP0bXtlJrN5jCZtVaq/RtlQ90btADVNxCr8KMUk55WGFV1H1IsgVkuRdEwksDgnkNgBXZY0FyGEy29605veCwAnT57sZz+kGywAjuDHKZtG0QJbQVDjBFogZm+CZFvArHVvG92TNc/LxPubtrPu3Wozazzd6kPA5l4r7TpcrycGXCJ7nZaSjk9ZAygIErHoQr61v7cX77rzrq/e2tp6A4Dfe/3rXz8vwrnMZdYAXn05cu+RDgD+twdPfEcf+DLsx56gpByZAxA0c77LkttS+dIYEFUVLZx+pz3h5t8HnDkVBVhympLpHsy9nPc0smjEdJ3R1cEhpzBYcnQagFZdpwFvjUWTxmTyikOfVY5R/V4atx5zbOQcTf3PGrvo6sganTbtqnu+/9Bjs7SLJCIjYowZBDoiIu4HLM8GxOKSRBHBC17wgtN/5a/8lUcwgEHP/kc3+nw2zjmMWSFAGwxSUIknrqfAgvz79LvSrAMT9a7+sXXhgHUB7axA6/q1eV+5cfsrxti8BkN3kTX0cf8SERCgWyRhfahxf38fu7u7MxjgXOYyC4DXvjz46Ofe+gwvYCFhcP9OPmfmRCvZtVkD8xdcvwlYFg/CKjr3pd/jxcJ2NVQi9uwtFlzFwJvJCl2B7lNbbyDe1N3w/ZvSHbTeBny/SrqrWh0hk/2pzfBi6MUKwU1c0IdYbW0QbF0SbJ9dIIx+iwDicrnEbbfd9l4R2Tty5EiYl+nNkgIlZQXOKcxSfmrqKHCWf5OZFVXuaJVjmjaSPMYrj373kepkq44N63Jz3OwNB+3Xpj8TdRdzdT0uIrj3wuikJ4buTO/R00W3W3jEOAbtBBgTwc7Ozqz5m8tcZgHw2pW7Tt9Fkt1Te+e/b39/pwTLCattOIt5FYZVOfk6owY0aoR1Sh+fd5KewZT1CecTMr+TjwQum4bBmBUDxyrZB0eDQ1NBqNRQyz7Io4xV3Fi1BoCVTCfKB9JbUjOg7YToZ2mnRW2NFiZODK8F0mIOH/0AKWAAFueI7rIgdj2EghijLBaLeNttt/0KMKd/u1klwaqI0eQxa5dCKOsuQaOEMPxMaaFEYq2lyzAoKPAslXYR01owaWvEao0g6nplhVbSXRPXb2m0IxPt5AjhvL+18rpRQb8U2ofxWqJ35kHQbQ5QLvk93a6CjbH1w2hnRYiIIRdwtwDAmKOy9/b25gUxl7k8D8vN8QEk5ISc6H/x5L988cXLF7457kUEhuCDMkQlny/+aTZqr9b+JZFoQvOW8x+hQvc3oiSNC2Al9NTahaFEeJdCDfOg/KdYfvf3ipO30zI68cz0wwX81e9JUWY0xm21mEZsLhKyiogmfB1+PLWSMkF8RI4qhijYfiydRAQUUES6ruueev3rX/8RADhx4sQcgXjzVIBF8+0d5lS0aXVwEFQHq9a9dEDIAO0pD3AoadBSVHHJ/qGa1huKy36hnVaD2DUw1Ou11+ooJuV0zDxWBUA9Xqv099LQ2lcHxnIypQGBHg5RIfhI5QbAs4N5qTX+tc8l4BOhsABNS8msEjoZYnOUq8nly5fnpTCXucwawGtTjp44GgDgvV96zw/uLC6/gD17UCT7vLlvEMdk7dnVLAuCkl2TTK52la/e/Buh/PSc7x/Q8L2z9Vr/O7h6yi5b3RtFmFjdK33P96K6P7YdXR/t76z64e8lH7zquebfNG3T9IuZ5u32anpoOgsw+FBi9FG8HLD19DILvSRj13XY2tr60E//9E8/jZwYbi43SQ3opZo0kYswYQ5kEyEbKuVYtSZhMGFQosnZzPjDhg+tPTayiow1fndpbiqfYaJRB4o/caWB1D672j9SbT563ut7uWblU0na4KkGoIC6Vta0S8JcPSMOukqqw5kKEhn70wWiC2KwHJMG8MSJE/OamMtcZgHw6sqI/ydPX3r6T+5gL4gIOUYaDg4oAyxCpPd9kSIIqkwCaSjF2DL6IwH5X58BQ2j9ZXSGDoxwDD7TxqDtGu+VdAX5b7I813pPpw9IbcXsj1PqrDOFBBURHUw/iACK6r/qU7o3QGeIraMxtva9sX7U405QHUKbSUX7eo0p5jMch6AbhMFOsLggkMtD9g8OwiEXiwXvuOOOd4pIPHLkyOx7dDPlP5PFo2W21b97U7HNAKJNm0UT2NDTcyowovRBxAeQ+P5FrAyuUJlAtPAzGZTBdaZitRdRjV3apt7VgSawYzJZSbQmEJU52T4zirbOBG5N4hHaxUNIIIzZQ1iQFy5dujQvhrnM5XlYboYJWE4dP9WTlP/ov/qx7768u4tOQoh5L7aGFQuBokysLJAmSb1QY9qNQqAydSZw5HwSV/lHBWI0E3QnaH8yz8CvonwEIeYkDth7OvcpMbQdHUiyxd8rbUt1nbnPdf2un7pfdKZg9x79t5kNuDFqPozaBD02UeDQIgpUlwgkdiG49UnBoge4HD4+BELXdfLSl77094HZ/+9min4DFhwzDIzV6rXZYk2MRVteBD4tDIrBtvRKQ7sDFAw7Gj9Tf88+D2kAoYszoaa+mCwcYjcS8ddsXYOwBXdtqg9o7G5Q4xiN0UK3j7T+LfpNadZJ46TSygKUaBAxQsEsQm47+QDu789BwHOZy6wBvAZlBBPl3/+3//jrz/PiK+NezxH9NJ9KC7BwgR2RBFVgAh1GLRfQgFeYgJ5AVHlKk+DBHGiS2tBioigtgMD2paRrqttOqc6onMZb9WfTVL4Xm21D9bPUb53SSx2s6h/0jaMzfuM9ce+JdjrHkO8190VqOtNoROIwdhn5mXiJfhC69wO2n+wGAWN8QUTC9vb2w0ePHn0PAJn9/54dOsBV9/W/LajGrDB20bbe1UOFbrVESyXqtIUiroR+WS1EVSDqazR0ddto9kua763SAKrkJXEz/mx6ndNe0fYN6RGCzVw0C4BzmcssAF6Tcvr1pwUAPvDl+7/rGVy+JcRlNH4qBuIgFPfulB1gNC1KMu2yvGNNkcW0a34QIOzAKMN7Ut4RaOiFUNqFDDAYHuYiPSch1y8G/iJAhuSao2ZTMLi1KTNpyowhyTw6PCOmjjBq+lS/MpRL6Zcg2PdQIm5FkrA81q/M1IIx24CDhUj3kO6NKQLyOy2oD0P/od5sFqYA7LDfddi+CGydXyCGpGWVuFwscejQoV//9m//9otHjhyZ/f+e5YVTmsAJ8a3KekOv5yPqzDUHhXTGRn062DNyRTORB35WbB7gtfVx4gYP1PcSwzVqLgNN9qM5Cnguc3l+lhtuAk75f586/+SRHe6AEEZtKuWK3KApEtWllmWk2cjYSJEJnZtXpPgQqpM2TWrg5Kitc3yqjCQuz23KXzzgPRc/ncg4QmXIcKpXfjqRJbF7diYfPbXpEtGnzTmSxtamTWwxapOVchYX5YEvKkWUjoAcoxqj6gc1E6DAuEeTWUp1J6JzmNJEOCsGjp0EgD0snjqMbo/gMtE6BoaAbrv71aP3He3wAMLRtx3t5iV6M8p96OXPQEh07NDMOVvxV0e4r5bVMtSSkfeYUzuaZL8ikxorKyCGCc0aFADTpuKZuMFxQsbctE5fX2s8krMYZXxTsiEICshYDoE684fTvLIpTerc6NqvZMAB7LqIZTdo5mUhgETs8lx3331HuwceQHfffUef/9P/KIATwD1HT8SUPlrfvhfHBPeur+bee4ef8SXci3ubE+nee4/JvffeSykI3PPBdy43pMjNaI/k8vv+7o9+5OGdh1+7vbeI/aDiKj7Z2UeIBqfOI+XlfLLKfydtntYnyEEua387Kn+dVIdKOydic2qae8onKYMct+5lH0GOnyrJmTosBmBdJw2gi61Tt2Xp4/qlRidS/CXFQMOwOTZp0cT1Cw7vMNfugaYJ9OgRuIWved82Fs8ExI4QSiQYDm0feuI3/7Pf/Fr5fplxJ25yeefjP/6HvOXhN+xeHDP5idf6ZTR2iwojZra1hccs2EU1s71BVQmAY3ACaAUZjay5WgBjQ5PI+lOb1sCUJDvuUazqW/XdXt+2QKekFFubcPRbpl1bgFln5eBcfBBZ5QfWkcN2j0x/nT8f8N+/fYknvhAQOsRbbrklHIp//Ft+6/f/4f3zqpjL8+6oS3R34isj2PAx3MV75ER/0wTAo/cd7U7cc6L/W//mH3zbv3zw37zvyaeewCJ0oSVE1YIRjCYqbdQC+50oAheb27LU52Czcfp3auEKlRs6JoQ3I1Sae7VLeKvOuo76kwIjDLN6zgug654rQt5Ev5Rfu+1ZUELj4L9Z8QgAQ8ShJ5a49aEOXVgC3B8QAQPCi++444Pf+NZvevvOzgWJMRDYH5XU+2uU2Psrrq27f8B6Fgtgf/+AbR+kP6md1rCnaLHBeBaL8c/9tfUsFofxXW85/Uv99mOv3NthhEhoCmiTgs50phqw4Nn51SYMY95hVyfLms4HFoXp11ocTe3XOCehFdXKsGB7ypwdSFdIfarRAS5qEyoKUXPSLL6QzJKkkXUztbS1Y2Lcg/ZuSvC0O4zQL9qCIaiVW0sAO/tb+MRv7mL37BIx7MVbbz0cXv/tL7n35a/d+Xex3wqRDe/EdUsUbhrur1jJi9EstQ9gscTh5R0ADt+4j9QesFwusewO73/rS+/9iEjYf/Dx//mFANBzh4cWXXfh4tkX7m1v9wG7Ah0gffgwgEtI1/qt/Zd03eKJQ9hikBj2FvGi7B7e7WRbnnzySdxxxx3YfeRs3PkqvpDc47ff9Te/TEYR6W64BlBumk7It1nvKzrrlrhjaP0FB3xIV1sKSBa1r2z3hhvK7SO/e2Rx6vtP7f/F/+Ht/+cPPfmH/+DSuQv7DFxIQ4PW2tjaUYDtYcmkh5I+FBcz56q69Um5rZUDMKF1bGvz7Ieyfm763npNH1fW78XK9eNu9UtWfuStRsKVIAj7giCCGDh89Ec7y2K5xNbWlo3oXsPRTQR8Tgju7VFsMnNa7ZQr9BvNik/09Hhav7XbbmmSscEqaWp6R63cxZ1LiHG/wLa4TZhKdKj7ocQPd1rRWXOSH685kmSBx0M3W1lTpPYWdBcbtHJRvWxvhJwyeTfnCFc8pwVd9ZwHx262LRVu3zrxmo3DJdcsGDEtR+ztCv4Pf/pW/IlvJy7u7KMLEZ0sMSTrvtEfpgCRBa7UB/PK2yZiDNjZ3fks2O8LutvGlUwAnWBxazrhmiOzUfASISxfGLl3bsTJDJD+Esk9eyqJEehuEwgjLj823Av0yUaveyFGWg+uFMEcnDY487We4yoJY3g4EgjYgsii6fe6qr+T8WISYCGoms8xLILs7l96T+z3HocEyb5kN2KOhYCAbYTrGoYRR9QUibe+cCn7577qc2/96n/y3xw7hnD8+ECgG+oDeNdjd5Gk/NDf/XNHdvZ2ygEboqBHpk8DXHtasOeGtXPIwcVM1T2VVaN9T59T2r9j7XNXfw8r2l41nvq59dlP2nSVqTmJGIh+3E6JPp/Gdvb2cWn3QjQClVit7ySaRusrOKg/iibHPZc1ouK0yy3wY7fBUflvmvpSKok1X+VW2w0GZXeIyWsr6DPAJLUjQiuXiFHjlQSQLnQB6BBjcd3UpkqhIApUJDqK36g/pETl66r6maP3aQ9l0O1AmnxunS9SO9p9w/RHrXd9SNHPTc9p7a9bX9PPFXnA++lKUyrT2YNMO85NxfgMK+0jIdN99LxmbUUpsrdgXyLe9ZFL+PZXByzQYx8BIrsxNHEbr6s8Ms3o6y15DutTtg8tXzn4Vu+pZUL0kRs5Hez1RLeQF6a/Q5DbQkPKiXFYLctFePHN1Qft3PAWOzVPeYPZvE/g0G2LV3fhZmXE3UXbHnglkm9TxgVA9H2PWw/dhqfPXv6/AsDddx8Jx4+fuuECoJy450QPYnGuP/8de/uX0ckyzP6uX9mqZ53GSkTQSRfWvVBptWSyYpPaa6Ozw9pg02I+w7o+TMnLskZHJ+22DzLu1jMt7aaHg6yOUS6eR4MQS/Uem8cI7RfoAaCrNHONvN0b8UbVLVP9kQ3aWFP3ZtcO1o5s2E5Nx1Y7nDxiTvZdHRi2loLPngl46Msdvvnrid3LATFw3KfDDd8fbo5FchCZ9y4POZxYMviRFNm0UyIi/X6RYGOuQw0v1wnEPX4Ffwxvjhve7s5+vFkiyACRdj0bCAiBUUIfLjx96KlbHn3VPyEh9+LuCJySGyoAHr3vaDhxz4n+50/8wnftSP8y2ZOIIAFzmcuVageu8bM3p0besJY5DSQyl7kAkVgE4Px+xAcfCHj9K7YQw2XITUoZf9N3mAHnypyhDmSmHIT2OlW2TP49Zz664WKnBAhvUtvXGeRCCImxP3zrdnd5d/HR73/T8aeHG8fzgG/Yyk7p3z799Bf/9EXsLIKEfUEMaJpFVvv34UCeTu17FOTouhbyv4VVaNsXrTK2nYre4TG4dja9d5U0kCrzPAzgGNmsgk0/lBUedBv0OWVe8QEy60SRjWi9kt8yOMNvROu2A3Gbp9iIBimSGirac7ixeR82poHnNxu0btqwrm7dWWt3e21Zj0JpcHh9+xsZQaq1NZEUN6uIuWacEyLzJnPBBZKsJ+012uMUH/y6a67v0SR8eNHhow/v4Imnb8HtL+rQ7/Ng/llzmctzTAx8fh5jBETHsNjCtnzduz7+8Y+/4NDLHukuP/KyHgA+8IEP3LBlLSDQSeCRv/dnT33m4hff2u2xJ6Sb/ty2PoPF9Xz1FrnKUYwOGmX609Xuj+4DK19DHYmEyXZWjw1rPrO1Q37b+bvtpzL9+Wz1Z5PPzorkYE1at/rfpg9NDdN+ndeT36t5tJoGtSg0Vdd0H1aLt7Kh+LR+bOv5MEVrH1S0Ka0xKQSuC9SZ5sPqPmw2btlAQ7p+XWx6tDnYHreaNpZ+B+GDhs8KQXDhcsRf/BMRf/pbFzi/u49ulgDnMpfnnAg45Fdd4tf+3gvOf/H+F+xsHyZiBPq+x2233dbfGA3gsWMCOR5/6/QfvOT/8a9+/g1xd58dlyGdjunz6TolVfn4W/HKbm3uo2B2SYvFRY81W1Q7Cq/PJ3JK13Qf6vao77VO9i7nbw5wo2R0CB/m6NtvZQJtZwl1fUtaz8a3nO4boUG1NTV07mTfDiWl1pMcDEH3taIOVEiBANnPTCw27URkq6GTByDWkBxwfdDvKudAjhfonilzsfDUoIuwnRxMHL91vS1aQymhWnN+VW7s9fx2ykax2Mtm3uY55yPKtSgujg923VVKdeecSLPuxNBa3Nq3GHUarU4qfreDsTZZdzBgyLWirgqjaM55PQ/p6rJzrqxvNnKAY8X+54Gk0loqNCzYm2ytB/UvVR/KUhhoF0ekl/d9MuLIGwQhRJDdbJ+cy1yeSyUKuu2IM59f4FMffua2vQs7t8kFZFitra2td9wQAfDo60/LCQD/7AP3fcsl7N8he4gxjLgC9MBd9gvJStSZ8mVy1xKUBBvnaPfVLplG9MdoXStsSFDuHicifBpf7SzIUfcfmH7RXRMnWeimozkQNPqgM56g8bASECKb2VR9jld6EkXFU7b7oLOnti1mbHQtXYtW0qE0SZTbUXiHdCZpTX6yTftW3zyw9rTkpVqbuqfQlae0PJNWwzQeSs3v1tqiWzNGqGYV2WvpsGrdrVCZUXVT199cqo0+NOZvviEtKdc/N7EemmYFTmp3Sx2x3gvo23EnK70etNBHNjXZNQ30ephYW2ouuCG5PkSDY7gMwENfFDz05R6ve8USl3fjbAaey1yeW/o/hOUCX/gEcfHpBW+5dYEYIyJjf/jw4e7lL3/5iRsShHHmgTNCUi4989SfuRR3iBAiZdT+jUFVJo2vjCdV9Xe6F13aWarnqfPNm2v2Ht2/+TrG+sPwL1c87+tl1VcZf7fP5P2/qlNpEBrjXtcHIqU/FhP1mjVs+ke3A0trTNJTimAyQWfquprjFIP0Q0X3it9YTwNLCzF1tfgdqzlT5pNp5wB8qPnt6IfpeYIVfcUaWlfzF+3+TN3Tc7617jgxbnNvsv+NPkKlhHZja9Fw9Zyv+9CcY4256Xk8NVen5kJVb5PfreeTVlAsH1at0xU0adEOk3ucHXdE414Y08+N9SyC4PLeAu/9RBzzic/hQnOZy3OqCME+4LN/SAgW+atDsjt06NCl7/qu73r3DREATx0/tX9osc0nds7+0O7OJQkSQmWhrbR8tcaBRr+mk8uzeY8NPZU93Jcntf6JjST1nFQg0gG9otn21Nva2MaJ96bNu3Qax7au0qOztXtFg8U0xQc2+MCKIu451n1o6Gdc71rcX8XT1fz2fpktPkilceKENopYqafi9CjasBysauEErdHoAxu0WzXnUc35CX7zStZdPTe9sk7MbGur3jgxV+pZNqUpXK3aE0djNmbMVB9W95uTM6btu1nzEs39j40QtFUUQeUc4m0RojAkc17v8b3IHlvLiI88RDx6TrBY3HhIvrnMZS5XqP3jkHXn/OOCL35CsFgyWWti13WyWCw+cPTo0Y9fdwHw2LFjAQD+v7/1j7/h8UvnXom9SBKBHMxfMSrhZTRLpHuDhUz/rX9QLGjJnGHeQ/49qntU/+pnUlt1Xfo5NvoD976uA1W7uh02+0FXFxv9qeuaol3qv26HFR1sHVPt6D4xskk7TvbZ0te3T8W3Fh+4oh2uoB0n+NjmAzfgwypaY8W4WfFb/123vYoPU32YpgGbfJiiFSrabbruMEETNni5qs/1HGZzPtRz2I8bk3zAivawck2iWrNs8rumARtzfrN112pn9R63dt1FNf+inY+RAVsCPHp2H/d/OmK5XIBcB388l7nM5dkhAQLdVsAjn+lw9jFgsRhCLmKM3N7exgte8IJ/KSK87j6AJwf00Hj6s/d/5wXZPQx2PSV2hDV/VBGKDsWBrNNWmZOuTn4+4fZnUzM1daZWFzIRhicQxOxrxyaOb7OFPCidCb6+VnzSVz3fqt7m8jVpP/O9hhdls06dKJU1rasMxw0+TNIXlS6jrSdt84FVl6djLVeldhOdjzapolv5t9iOu5yM0vS01jAgGhqk8vur+SCNnLmlqmlar0xpNwETM7GP5Haa625iTR6oPwaapo6KmEoA2Jw343gUcq973s/rTZLvaTKp9H6pLccHrhi30dmZ5SAmJWXrvdVr6yrEMkl7mquNAQFbeP/H9/HWb95GF+KYXWb+vs5lLs9uDWCEYAuf+lDE3m7A1q0RjIIYYzh0aJtvfOMb3wvcABzAu15/miKCM+efPLLDXciYXFTn4c0GiiRPCfNmOxitpTKV+I+tSbc0OjKXFFoKZCHlNmUrYpMmIMBGJ4oKcEhtsfp2ipEbHPacj0QFFCx8w4yTPrrCImeyTt5W8q7WQCmi0qCJi3LMH/Zm7t2RhhpDTtFanFEq07r6+EKl/tJ5i0u0sBcuyofOSgCmXvrk3wpnzwknNrinNvRCR3J6QZOb8Vu3mWlt6qkd9+E+9t7PikZsUePKIcO1uOLTxtX3WNbH2J+WIKdp3RI6ROXs9YAsYgKS0py3a8rQT4pGTzw+pMsr7ZPB1/PdHjCkilCmXVtqzBYWxUaDk7W5FWbdOaxGt/fYo4/kNH25fXrnA8ULv8fptnzAS1ofKRUd2cxtLM2DVHkiSofIiENdwINf3sdnHt3HG74WuLQDDOhdET662sjU9tQ9LfY7Rq48SLRSOXNyIcKf7VY909QWsGLjarytVn9W5axVNKtoh7qdJlToJuPlxLkHK/o9eRpElXq7xUfA9Rt1nOJG7fh5McVvP4e4QudwEDSxKT602nbvN+fdqntc8WGZ0FHVfBjWZbcELp8L+PwDgsWiA9kBYOy6LoTQPfSjP/qjH/qZn/kZue4C4Il7TvQL6fDI5affEi/tIDCEGMaNukEA5p16/DhJG+2qyEg+OpOT97RzVtNXaFWwcAvcl2tO4WTbG4tt36bJPY9TXmPr66giK1nTar2nYoO2un5MRYNO8Ei/zfU8RYMPTd+wqXZW+ORZfqzOlEGup3m7/mmcRPvRx0baHR5kPWx6r+FVigPUZWpaMaE4Mb8n+8Qrm/cmzHjiYa7k4yq+rV7fa2m3Id/XzutV644rxGRa2CGOPMsCNwBhxD6IZYh45nLEuz8meMPXRSAAAT3IoKXq/Lt4pnJCYhIr8MNpV9eKg3Roj1QSjsETU+34nIdkPQZ7Wphox/FXQ2tV47HSSKUv54iKmv9ta8HNszVOkMORKnXWOFNS5e+2/PKSpe9Pg9/QfGxIKJQS70ROqMAnxk2LXVndF4/x5fuzAb/F0qcpVTp+i55ruh1a6b7ig8PizFKgtPauhstFRRfPh4AYgeVWhy9/Cnjii8RyEca9oI/Lre1w2223/atXvvKVl48cObK4rgLgsWPHwvHjx+Pf+c2//7/7xff+q1fv95FbCAFxAs5hYpPd0IqxkQnk4Hj6z/9y0HFfHTj0XG4MTz1q3PXl942cf8/v1XWN+bDCjaU6qCVt9KgdFRH0UbC1WOL+T+/hzNMLvOgFAPYjIL2qLaxRpaForMWpalZmYOEa1Vrr3Vi7EkijLy2VVvMap4/GdAJIUnFDJt+1dh7XjqfPlBDmIchW1TlFN933A/EhTvRnVR89fVrPyob89nMs1oLgBnyo+C0b8HtqjOLaIRu0XTWv2KDNRD/X8nsYS1gs8fnTgp0LwC23BkTsgZQQRNh13a8AwF133XV9fQBP3o2A4+BHv/jZP3l52R/qLmE/Bi4IQUgbTQtcyoE0E1PP0WRFF6+haCRizKeQiXabWFdTz29wjxN9mNQ4r1GPb5QGa5PSUFcf9GO0jg+yjgYHHcy14kMNB1cdwKaZtqKdK+QD5eBWiU36pqkuU2tl0nSzem1NJjBdyYeJsV7BupvcO671Orkm9cnG/N5kjyvmHrvHSUs7yZJslk5pYV0v9TMqXl4ilgvBo+cEH3qow4986z4u9AIRgyANcWndC3+Uo4bTBg7mSOVCsob1JJrPZbeDfK1VZ/nelLql0U77u5R8SUXWPKdpbiBuqVJBiutP6RfgfazF8dliRxoXB0Mfiwupx00OMru4MbTpyw1p7t8lyDDME3iat+qUA/DbXm/1pzWXk2a+nhetuTY9fyb7k/ld5l/mLay/sDhXDc+HFn3X0zyAjOg6IO5FfOYPidAdAmUfiIEAw2KxePw7vuM7Pv6Lv/iLct9998XrGgV86uTxKAAfOffo917avYgOnVCpPgUttbk/LKySzP3poJx4RKuMJw32dNQETIhipX6twhfbfaBWAbfqGDcEjzdDdWIgm3UKiQbCbH3iI9vXi02kfd2YcOjG3binv94V7SZoUJ3MaWlQ0btBQ9+WOE3DKj5UvmCO1sIJfk9pIKb6jPqEX0k+yTzVfk7o7mGC35PJ/1wkVXMetHiKSX5b7dEKPjRO3MJN1l2jn6zX9yS/swloCkRmat631g+VqXLNntAcN6s5X6/hDea8upfmssi6Pa4cwso8bzymBUy9/yjFBAG8+3SPy3uhaFfUR71amh5kEeVDKVUq7vr9+oMsjXbEfBTTNQEmBEox3aHfuqD7Xr9bfZBbwgClfMibAosYX1B/ZBaVwUhY2hG1+pKPsRf+KnrR1WmOhj5Dj0zwYTXNU1/bvGnPDS3oZJ4Jmu202xYnONbCn+aD/VRJk17rBE9MzQus57dvu31Il3xIao2nOf+g6VhcXhZLwdkvbeGRTy2xWIYxgxVj13W48847P/i2t73tKQDh+kcBHwe/9JGP3Pqj//b/+eZ+Zx+QIRaZVJGRke67quz06ZQjkh+r1NcU97cSLLQ9P7o2XMKMtuaaKgKZReNstK4NnwTS9QU28pONlAhmF/Ma8fGPyJJVQ6uso2tbD8r3S4xqtRaI0ubuNP1ls2x8bKgEhuhU8L4/0G4n2mfHCR3qvXI6Yq359l7IojYlH3gxZZ+OjXvifTvYbr8R8GC+LobW0uZ3y/TiaNBMX9Pqc7Q8JRzfKt77wxddF12deo6iZVt2fZZ6PZWxSV2f3oCbDqKqLp/GreL3qjnv/HekwVtwYq65uioWuihvaQm8LuZY8zv6d9y9qf7HWrVLvQaBsodACxg+GlqJuxwQDw53AZ/5wh4e/PI2XvfygMu7giAxrws2ohPY8IBvRWXTH67oUQvVO1x/jZUvnf7oK7qA5kMaY9lnqjpbKAls51pmw6ewoFjAZYaxtNI0o9HmenUJm350FlO3HiMb+gFS88YLbe2oi0344Pld80Ea88LXiYk5ZDVzzQ1e8aEl4Lf53W6jRd/2XPPtlLprH3rJQRs1H0RxcSrySGmlOQSAREZ0yy189oGI808KDt9C9DEgxj3ecvgWfO3Xfu07SOLYsWNy/Pjx6xcFnPz//t6Hf+3V53cvv3x/P1K6XoWh1hJyRWyMEY9sqNbpzBZqUdoFqqISp9pIeo3Y6s9YPycUh2M0X1YbU7et0oOxdn/Qppzch0Z+UKk2xzqKOcEzkKkOUe4e2jkYRsAr24RYVxDlC1Q2KZhcohlWR/w3jirnsDSE5qaxGIgur6mnf3ZSF6PENJGxxk1aRpcgsTSPyDmNTXS2putEX41sSLocrC7tmOODMTkousLprcSdOOmVrYSKIoWC+VEuE8qswok5aYRfuHs+IAuN/iuBJ29TtJHntZBmeZrfk4EvWV4xc0AaSjop0d3V+hfFy2Fd6/ldoEykUpqaNez2FsNv766S3tPrTvdPlMZCa2lEOcantaX4mLQ/RbuExh5Hk0fbazGootL1MzBrBDnHsjTssJ0EXLoc8J6P9XjD149tB4CxBVjD6jBcIw+V6Hb606NghRa5JZHH9ubs+lPo0TpFqgPPCg32dDtY8x4a0dhtTbSIFVbb2v+0n8eJVJFTtGi5JtBomgahBFjvC7nK549Gq1zTHNjINw9wY5QVlq362kQ2+Qa/p3httBoToE4rgakw7YG9PhRU3Pw0bgPwh/zhF0bBp+8nyCXGsBBGolssFnsvf/nL/5Ue1HUzAZ8EAkH50u5TP3Q57KELoS++HwJZ4QUjVuSpLRVBZ1GyKmHtiiKiCTNuAJJ+H3+lq1/Kv2kzDEobXe6x8rMKKg2ayPh3vmfrHPpmNyYxHKnhXibEJkszsb4hIkV9LKJMB8J8r6qTajyGAeX3UBpCcCYeQwfUtEtpAFGpuTVt7HX9fNBdSeYRSaaSwpGg31ULSrwPltghBn9P8019IdM4S7+LJCyOBnpuyUSqN9O2ek70PKSdy6Lbh+OpOLZJwxyk1lFQgpZdN1ACrqWpBCnRbm4NoKJ9zdP0b1APBHHj1/0MpT8BlUXFrjdF+6AqM/uAm/vBEU3EmSrFZjtM/Pbj1nMiSN2vvEcoC5q4fUtGGCnxJiDxe5xUdDB7oog5QDT31dSmB2Md58a+RGwtO3zg0z0eObeFrUU/zIfE//wTEILkfWD4NwAIw+8hjFqLMFwXQQjq2RBUPcMzIv4a1DVBCN1Ay6CvlXeSL6K9F8Z5EfKPb0fGvlV1unZKP1Gu5bZ1P4KqG66dkGmV5kw97uDGLUB1zY67vubbU23qcYnrY6jbKWOErTPYdhK/0xxONPPvBEWj8uwwxsIHTI4xjPzU12DqFtW243ej7jIvS3/EvG/b0dcs7xpz2/Rn6pp9R89hUakiRW3IiwXxzGOChz8JbC26BJ4XF4uFbG1t/cFf+2t/7bMAuuPHj19fAfDU8eP9Eh0fOf/4n7mwdwkBIlQYZJExmw5sJggiMhY0e6jsByi27qjfS89gzCySEPS1OpcEETMKfiTr9FqN9ziRTSLb3VWfqFQUVLZ56sT3qW2dmQKoaNDKdOD7w6qP6m80nifBkbbMmsF6LPlddVquMhqgwEeYtmM720Eat89AoXnY4mmdqUPhso1qb0y0R5fBpGQ5aNMOel5kGitYDUcLPSd9Vg9bfxlbjGy8QzcvaOa8xu5jixcqM0RVh2mr0Erz2tALNAEElt+oM4JE20502Vk4mfGEdmwT2WCq9yJqWrv24OZhzHO6dgNcNReg1hIa2Xs03f1ci36fUX/bdQq7X/k10JgrMPMOE/3S9Sg8QNcfu/eoZ5S5qgch+0QXiEfOAh/5ZI+trQ4SgdDw3fQmRfN/6v3W77ni7jfSQ7KRapC1mdbjNioITFWvTtNXt6ODKKwm3rZDemieuMJPmNZMSztuKhcMP0afUJAN3+Dpa8VP1uz3OgGp/s76/rJum87/1OzbTX6j/T339VWmVJeedWKMNCbZ+ptmfVTbaUdXzz/d99U0b/Fb86EFn2b54F0rCB3Yw4bvP6Nga6vDlz8rePpRwWKLGKcil8slb7311t8QkXjkyJF8BrwuJmCSIiL85Xf95l3/+e/+/ddzN4JYBAwiWDHT0AKSRmV6EeUeqE2QOVqKUqmFGZMVRZoOp02fAbqsvNqn0LvV6ON98mMc+xyzmUXyItORZpWfhGiXnBIVltouv4ZazZv7JQ04JynjUW5NEO16VehlTEEtmtBDHI1m2KgcXzP4qJQ+q826RPvBoGha161Cu4hiRoy5v+pe8uFQ9+osMGPkVSNDjMkKwzJnLHSc5H4kAGHK6CaQ5qAy2XnNDNWcJVBFeBlznOljATLPpvVEV8dTHTkIF3Uo2m00zSFxMQ5pjrtIQRpzs207Ko1c6X+wm7RoJ/kU4VauRefKUejDiqdEcSWIeU0FR6+0Teh5UTtME8x7RPl2iVlz8O4CUjv9e54O5l7tJoFqz/EwdMZJntaY5N/zLr7JZl7aEuf6KGWdKiEwRx5We6f6cEoxcsWoI4STi8EC7/74Hn7wjYfAbh9CMZGNbTNjHQma7PfSci8wF0PDdBja7VRwcNJY9NKwrNh5am2X3mwnE5bQ4NWnBnTejKcapDQ02DLsz+LgbNrpbxpR/GKybBWVtsdZbJmCpWGuFLu4U/QqvNpY8cfQXLLFi24d+yhsD68jCOCk+VoDsJd5VZtwpvjQmmtwJvEW8VfZ5lrjmTa7A0AIqPwQtR9kKyjEtyEhQrDAZ+4n4uUl+EJConB/f79bLpfy6le/+l3AAP+iR3zNyz0n7gkA8Hufe983X8be7YgyuqGIMk2OqkulwhRlSsiRV+m//K6zHYmPoJLsEyXejuXvqZD8MknFOI+LaDub8g90/RFns8ybMGw/9PjgIrlSW/T9VzTKUWHix2nvJegA8yxEZQ6w49K0g2sbrn5txy5GV2nQvHyM/HhK6rMJ2gnUPU+HaX7nPoqYNHhFQNJ1ihEuPb9FrF1OvI2vwTdvVKz47fuvPp46hVya75aniuYT88SMSfG+skEXe7ypQ69BU4e2MaZ2IO4jaddytYmu4Lced33P8dvTXNr7gKe5YGqeO78Q1mt4FU+n2m6vYTT3J3sgsfZ/UX2paGB8qjXf0OCnNutaARYUUB2uzZqjII4f1eUCePDzwINf3Meti84cQDVESvWBgkx8xCx98/yZdHYBaqSHgmdTIqP9+rQuBS0XJPH+IkT9pFjxTu8TMhH17H+XINVH3rtFlahcHUHfnovNPU3RsXKngecVGvSWth+MPhAk1UHl08JxrbXHH8IKmru91XO75m3tItZyc2m6lQWZEChVxDb1mFDtr37dCxr+PSKuX6zoTf+t0y5VoeEv5Z1XRBC6gMvnO3z2Y4Kw7JJlgCEE2dra+vRP/uRPvh+AnDhxIl5XAfDMA2dEIPj0I59567n9HQYJfXJgtCj4jYTn5qPBjJXjHdTYiD4zam1nbvT3rImzYZJDbabM5lG0zbJsPdsytVSq4+l7dCah1jjX1unHOtH/KZNTq049ximTZjFtsWnyhb7XMmdjNe1qfrOp+m/SYFN+t2i0AX38vJs0abf4htrUV5uCVsyTiqer+H3wcVbzG9ZkMTnnV/BbpsySK+f1ahpgQ35rTRl9HzHhUjG1Hip+23sJl6yaoy4QpbX2J9fKhC/k5P4ibp2PxjOpfHZF3R9c8bsAXNoL+P3TPSABRO/2ZEEdFUynTdGmWwejQ+2Y4+9bAStCr2mpTJfpJ5LWnFilFZ2CH9JGYqXtpTHiqb9rc29ky5xZBzuQdarT6EwLk6bq5FpgTPDaDIuGOdJ+S9mCRZsM9LC0iqwRCixv7LfaatTowida/LZcM7PD0Te7WdiF4LLuTM1RumAV/70VaxpWrgeJnrExB7zMYhNermqbxhzc1MyqwKbFluDM5zo89llguRWTiS8ul0vecsst/+o1r3nNzpEjRzrN6OsiAJ46fioKgLN75966s3NpcFls5NGqfCc22mTb6d/Itk19ZdqkNdenY3OuyCy++mN/AKGw1eeV9zYd60HqJDeqcxUtV6cpuwKarKzv2vCbm9IOV8bvTeq4Kn4T15Snm875K+XPSt6D14TfV7QvbEg7rhnPteL3OmF9Smis6sAqYXb42C8XxIcfjHj0GcFysRhTUaX/ygdc64kw+p8GIQZHTpeAYhRCDSwRde7u4T3JwuqIo0pth7F4kaL7oCA+RX+AYLEVs0aHVuwaDPGEII7BWLbt4IQXUX0tbdPVWfppfDuYArrqttMYEzrGoPmiwpZUz02Ne4O24dsWwuBDKt6IH3fqz0TbovmdcDZznWjwu4w74SNmmnOqbZebfqNxw9F8qC+M13Tsoug+iuK3alu4SnBm48zhaakOZSaveMzzY1guPRCBZbfEQw8Ql893CKEDGND3Uba3t+UVr3jFHwDA2972Nnqj9zX3/wPAf/reX3/ZYxfOvRH9Pii4roDTz+ci1zLrxDVs+2b2a+bp1TSOmadfoWvlWvSDJBZdh0eeCvjQJyO2lzI4C+qPVo66jvnaYPaj8kAY7oUwfITCeC0LVAlNABzu5WcwfnQxRn0OzyZP1SCqvvFDHUYTYFBm1iD2J7UTkNAD6rZzZLkwty/ZE46mvhypLmosri7ddnlfcsR6MHXAXMs0HgWcqm3YtgtdC33yuN2zYEFayHWSpt1E8+DbRj1u33YRqiwP9bjLs2jQohw0QlDPAgiiromM1y1vwijttdr2tARp0Sngxg037qD7qPqkxzQKb2b+UvOYZv4iP8980BBBmXcQdB2xd5l46A/jGHk9RFuEIB3Jx1/ykpf8LgA5evRo1Ov5mgeB3H3vvR2A/Q888J4f4DZexIvSo0M354Wdy1zmMpfnvKgLkX0QAe8+3ePuNy7QLdhwj2eVRUJDd+kUaah8B3XGFy+80vkzRteucrLXvm+B1TWYOsd3RwHTjldpX4yfWQvjDfU10ZovfwpjDoiox228AkvbATmCr7ir+1y46d9GnlnxbgMW7y5dM2i5ogOCPDJ8g+aaPjoAQuVlTmniiraxDlgxtHC8aT0LEwgyEWyjA2FEZzhKz9T0KZpBz9sy7uK/S0szHcgkJbDFtK3aMaEJZpyDqlQo5hnGgMVWjye+LPjSgwGLJRDRA+hiCKF76Utf+pG/+Tf/5pPDuUriddUA3vX60xQADz/zpSNP755nJ7PsN5e5zGUuz5fSx4DDC8EnHu7x0JcFW1th0EM0ghHaP8q5XTSWoSjc0umAohL4gKru/NEWH5QEhXEnKlhEBRtq/MWkMVSCj+kT0GjfRjlbfEb3XBEv1TUb1GHiD3WwnQ6MzFiFDVqITATmSNWfItB4Wqixq4h8TVPNQ88Hz8M8Av0ufL8dbYIGKJcVdYoL+JEKBxei+S2mL+LnFOCC4xrj0fMquDlk6FvqCaLFe80LVHPVR1DrtVMOQj0Wiw4PP7jA+ad6LBYAGdD3PQ4dOoSXvvSl/waAHDt2rJL3rrkAeOKBExQAn3nqC98U+77olOcyl7nMZS7PfR3gaK46d1nwrj/cRUCXc1YzWid4i/mGCsNMTASww+prKNfoUz9XOZDhAmqMsg0a0s7AbMJBUwI1fBRRaWeafXWFLdxGHYBd3NsULmTjfZVRxWLVttOo+1haNrKumihuOLq4vnvgdHoFXyP+oUo9ZwKQ6qyq1Io7NR/qjI82raiCzbUoMHmuiJk3me5S81DnszZZfMqsNhkm0aAn3BwUaTxjkHVYQUHZOVWQByhWRxw4GII/9YE9xP3lEBE8iHZd13WXv/Ebv/HXURwbr58AeOzYsYDjiP/v/+m/fNnuzu5rud9DMPv/zWUuc5nL80YDGHqQgu2l4L0fBx49G7DVRUQULEAZ8QRLxqPRaV3qaPFWNKYOPBjS7NGZ4Yr0YYMDS5CIroc5v56KTEBdZ8Gl08DB+prvc6krRX3rftv+JDHOPqdBmk3AgmqbLpK0Slun+ki2o3WRoZJt2wVtw0USO1qg9ZwDK/ZIH7odET1uYDI4ojEGNoJ1SmQ9zImAirdU4xXfnwYfknBZaK6RCmjycuZrLZpX6AgwcyingJVSp8DxX9z8TXxPCR1AED26xQLnngj4o48Ty+Uizdm+6zocPnz49Nvf/vaHAEjK/nHdBMCTY30P7T/6w7uH8GLp2XOl2/lc5jKXuczluVQCO+yHHtsLwaNne3zgU8Biq8u5p2XMx1njpHq8UFFproDavGfNmTalmMc6DA7TMTTMyKHCuByu2dReQ53BpDmz17TWMgxJFF1uQ2+KRZUaTrctjbbFAleLN7HD0KOJh+uesZiBrbZd2jOPnyk15msLp1UM7t0qmltsy+n+hGyqLfxuuwZYbMnV/La0kHrcFb9UH+HbCU38VG9mz/M9rxOZfi8DlDfWz5i8kwQW23v48mcWeOpLHZbLrOnlYrHgnXfe+R9I4ujRo01Z75oGgZw6fZwA8NjFp3/s0t5FBiwaqujVxSLwtC40L115/UATafsg7x+kbeDmScRXT7cpKPpr16cWL641v3PGjOvMi6ut/2byi3huntyeT/y+UfvSQd8XAlEiIFuIFLz7D3fwQ9+6QOgAxCFIwZi5jKlPRi2UIIR2qzrggyp9jfZhI4foR5vyJbVdfMsGGhYkPzIBOI+QIjYew2Z40TxgsZGSY+YGWHNo0AmtUxabHPDgvzkywVsPBGzvkbTt5A+LlBiDHFk86JRKRioFcyO6H+0MIDa4RIoZWCxGXhAVQiFKg0ZRgSOs5/SY6ogN3mq/t/KeBUQeaCGlnVFXGHRgC7EhH3zWDTsH9DxO2XJC67mKvjp4qGD2iUvsXZ6zOIA6g5JkRM5h/g4ayAVCEHz2fmL/csDWCwfA8P39/XDbbbfJnXfe+Wur4KzCNdz8BCcQH/3Yx257/JnHv3Vvd6/kkEedJY8+HyYacJPKV8JvVC2QVF8HUGdjFDV5ctti4I2mIUEdYG0NFlu3Z91U3PtTinA2xjAJDuv6TrQhTls5SJu0Ys2v3O9YtT1F67r/LRw3VGOAbE7zVp9b/PZzjeL8ZRp0Q4vmLn/jKn5hom24tlrv1+NGk+Y6LS+a853r+c1V/GaTZ5Pj8P2aeNfPWU9z+z4a/J7+adKssYe0227sDX5+raC5p1lzTrKeJ819LZuh0FzncGu22TYbNPP85qo11t4PIwhhQOQ+Dm0FnP58xIMPA9vdkDcYLHAwOu1jMgdrPyqbmzq6nMrI5jJt3sz9BRxQbvIXG0zG+noZp84L7YC6FVVT7uy8hp1j3mCWngao13C/Am/2LrPK5nNGMWMS7TzTqPNOl5y8DnAZlmaFlnQAzTC8oHUyNDnrNX20aOVzQRfB2+U1h0ri4B0IvWkdBUxd76XauTDxGw3M3zpHL6v86Z4vvh26zZnumgezR6ZvNGnuNM9EatxOEVbfC2txtuslXe66HpcvCD5zf0S3lJSHmiISbrnlli/+1b/6Vz8BADr7x3URAO+572gAwP/fx3/r1U/vnH+5DG4iQmVvp/J/8J6adNg2FozSfuapcyOKRX+XvCE2xAKVycMiLFKFhq9p07xb2haH20Pni0KNfCqoPi0GXFIUnUwovUGiLG1I7Tej+1Des+NmGre0fCxW9RuqbjRFsDYP9NOF3y1fHLSQ9UW3DVRgr873JyPAS83vvOCcv8VG/Na0V/wS9/5U29Vcc/yuaC50NFf1TPBbwBVzjYZ/6+dpoZO4udMEV5UJfhu/LEzzW+ycz/wW2v1B+/G06hDL37XrW7fr2ha91oTNowfdXNH+X3lf0vOM9e9+rlX8BieOanXbeZ6a9zy/Y0McVW239mCleOsC8cxewKkHIpbdYvC/Epv+SkdPltRjPlJVR/baiE34d/V7olJ6qWsQNCJS4aKH7XNtU52NIEUj2rTVju+jN1OK+MhVabah6wuNSFUfMYyJiOtsml8RmYyESeeu+XbqdJN1xO9UaklxEbpGKxfafICL+rbm5ivh90TUr9jx1HzwtHfz2/Q7jCncUEWXa83ugB2YiW8ik9GI7NZZTgFBtyQe+fwSj3xuieVWlw5F/fb2NkMIv/zyl7/8ySNHjiymTEHXzAR85oEzAgAfPPOJ793pdhgYekIWYGt7aauKCFHH9XaGh8k6MCZkn2iPayrTJoqVXZ2omGveq66ZPNtTCadrTVVdn5Rji0oxw1XDlaICI6w6jKtZVJtLVoybaA22zW+u4DfpTJqjWj+dpFa2PUHXKZ6t5XemH6rUTZsYW3k1/Kae5y490STtp94VpdHE+rmrecB1/HYmRbbWp07ftWaRJDMOW4LK6nVpeM3120hzjYlre6Qhp8yoYmmGVfsSV881uvXj+b1urkBERea22pFJ+iV+t0xIcdQe9FGwtSDe9/Eej37fArffusRe7DMwc+k6azvy2tUo63bRUU7nRs+umq0ingYspiHRfdmkjVW7tYDrZ5zrj+V5ewZMzZhVu0JrT7R7w6bvOT32Rs9W+3cOreUK/h+0X+2xJ7y9hs1mg7a5tn4ddW3mTiMvs9cyZqxAEZfqUQyJSGCx7PDp+4FLz+zjtlu30UdB3/fhlltukZe//OV/AEDe9ra38dSpU7iuAuCp06cIAI+fP/fWS3uXJYQgkbFCn8/2b2rtmSi1Ps3Ap97XKleMPhrM4JgTH3Yqs0Re25LNRC17fdVv1wfnBWBy8xlfCS3CkLAWfRpaJNp4X4vWhCiaLu1bYZ2HDM1koJMYIaLtH2F9E8TRftjcI2MlVxr6KyfQqi5FM9/HFs21tnXIf4n1/FZzRJuOEh308mzRuznnaFxYigDu3i9+G1qJ2eB3a75M8Jujqczzv8XvkucW1s/Fgdqu5Lf6GIhI5nc6gVK83xpVDlk0+O01522aV/2kEhm1XcW/jyKFFX5L0c6KZlebZvozpo+jQ8Re212LitbQ85Jor29h2Xt0vymNubEZv+2/Gj6jsZdSrYmpea753diT49iXQ12HLz+5h/c/uIc/850L7F0asNuEQByzdmjYDGExCRdID6uZIsV9KFnJkXZ9pMjjQnORWMkU5bMejDjbEr4FBKUkuNOCmalz9HezgMg0si4r8QyTAmU+zyu8OZIr5GJRhwwd6Suuj3rcdEKQfo4VfYwAK+VTlwIUmNdjRHOZiOYpDeCx4U3VNo2Cw/DGj1tU3mbPbwnqIMIJ2J5G27XORPk36nnRGo/2A6UCQK+/t9ondKBTNEK4FpaZs+102N8P+OxH99BhK68QkRBE5Mw3fdM3vQMA77nnnnh9fQBFgBOIH/vYx247e/7cd/b7HIN72me6fDhMKlFaxHcq1TGdSsREGEkxYnkV8IrOjtQUY0bW6mrtQNo6ABgASq2TlTbWe/rwi/8gukg220XvDOxU6u4oYd+Xmubmg2Sfs2CgqNq1UV1YGX1V0989669muAiZ0L/qd6Wgousxc83cdOj/hpa+Lj9PHb+Vrd9qe7zztuqrQM/ZttBat2/72ATDneS3zpQgbT5I++BqzBRQQK2+7WQCcTupTPSxmG4mxtBYp5Ki36h4pOdw633nKA5v1kN7noqLZISaG+YD4Mahxy2QBm/quZ9oah8pk6rJb2Atv8VlPfB7RqXs8GsZHqAWtVnULiZQgCgCssO77icu7AML9JAYEKW3iSHy3m+hMfx50Qe/VBoS54urzwNg/cH2GHRtUrJJXquxU4eKRjtas6WdNqcCbKamr8eD00Jwe9l7gYcTlgxx9Js0DBk3CksLLfyxpjubujCL/SgOX9D5uxrBL8kHooOB2tY6ejBFLXAfKBbOan31+V5Ef7daB0HNRw8ObvlQ+TmzbX7y+gVhAEl0Wz2e+KLgC5/aGqPwCQCx6wJvv/32B/7yX/7L51aoxq+dAHj0l3+5A8D/8f5/8d2Xtvqvw27sQYTspFo5RjtHfimis9EMJQ2EcozWzq+VmYdsOAUP4KRth34VKcQWvhMaARd1SEkT00rE9bV2xqVzdDUziHasPqk7Gg6vqxK/a6wnmRo3i+2n9b61t63A8tJOrPA8KUfo7ABLQXG4FevoXTnzSvVh0I65k/zmxLidba4V3FOZLJv89k74Nb89vwwvG3xg5SPWaHsFv7VmxM8pGjw0uPqYNVrF70sm+C3N4IMybqn6aLZn50Rt54pRDdQ8WzHPjcaRmMCcs+1NrbEmXVv7WovfPsigxW+n5aawMcfbfZrkN6f4vWJvcDQvz4ldB3lPGnu2D2xvCf7w88SnvxCwOESQvZobCqQ3a8t0G1KdsskpE3XDbMlakCMbQh1be0j9FS9BGv5enWqNtJYfLbSpL3aZ707rUwkQDX1F2Xql0T/bJ3qN4FQKs9a51atYKSs03u2DL9dJWuJ5I5Zm1WAaSQY3gRYRL8y5rlYk4GTbVdAca0uxPYy09xRUfs/6IFgHsmiLjZ7fg7Wyw2IR8PAntnDuMSAsS/+2trbkjjvu+NUYoxw7dqxbRaZrYgI+88A/EgD47ONf/t5ze0P6Nyq/n3yKUjpSK/zIuOnJ5GlFh+FnX7csSKRdXtQHTdCwTRr7vKhwAm3LqvyznJnP9K/h1Oc3H6M5MMKUcsNPdaMO9aOIa1vPT9aGC9br2CweEwJY7JiEOkEVu2hBRQeAyLKbElWIv+5HVKYk6Egw5YdWTDvOF5DjuD3NxNFc+eiQ3g1FzJG0Nu4peAMjqFjNHqM68ZkT2ghjQOM0ZfunVP6oZOAk+FpzraU9J3zYSrhT2aHECWxYge+hxq06RQP7UPfDtN3oT15Hid+iaSvGlEfnNjQ9T+svCNE6E7ixTORmJRvCgoKmYMNnsRp3WjcUa9PUmgjvFpW03RRrMlYPajcFKwSKgxaxZlxjfp74OJKr/h7X66Q7nWSXGTo/pwhgEQTnLgre+dF9fMsrtrEju+g4pIjTuV/Tcs2mzWTtMOtfrOugaEO+aHIWc5p2v8lXpLhcMAxwJSyqKg/NYbSfec7rEWhPzOL0n6BqdD5hqpQWgjCmg5XiSuBFJtFtq3bSN0GZJILImHovXYllvAHOJWhoW5sly1yOddvarGnEo6SpC9l8SRWlTXWt6ExDhtCx5ky712uNs9Xb2eeCFJ5S+cppLX856FuaZ7+6IADduMf5ZwMhbX8Gq11QWUHUPBUA6IZxM/WzjV8XRBpwMXTzlmqdBQMTESSMKT16EFv41If3gbiAII46t9iFEM7feeedk9k/2va5q1IBouN9xPf95z/52584/9Dd2JceRKeTGXOVP93UiWSiw5zY3bjCj03WgMt5/yMDHLYOJIvJV2Rq15U173tnI/u7NM5BXDW2iTE2r020rb/d67Tlq57ZBImu+Uz2oZviN8BJP7ZiqeUGHa/w1lbRSM9Zma52YwQ+1koGkWl+bzKfxFvLpsDlDsrvqwSyXFn9Bvyuk7sfhN9X2NGGP25lLdrAE2Fy8A1+T+4tbJuegQnXdcL6aHLihQ34XYnSrLUouz3xshdH/Nf/6RIvuaXHHrkCx1Bau9nEyKY2SCWYVhFHcIEmbq3r+xS3zwdo0BvLQ12PGGHKbEruUJElBYn2sAiPOajfjaufcyZ1o73KSizvaxaNv2nlwqLapnFPaPAuO3SyNEtRXZigj9ZSZmWM7ktcMTlF8SG6IB2lmNCbsOpjrewRY142NNcfGMMHNhaQGO289oenMpkPAjQdH+nmawuHEkrRIeg64vwzC/y3/xfBUw8fwmKLg1s8GV72spfd/yu/8ivf0vf92q3uqk3AJAUn0P/2+377xY/vnntTv9unaPJJ06o4fyQDqs3GDlRhthGVKiydAlrOvF6TBFZtiQ6t8aixskLFnT5cU2CLIlU4pLT2Op30sII9cRqLibHVjgiObsoE5MDLal+wCgYE04B/K6KvuM404KMp3Yfemt01zRsgk7SWF6qTa93NYluRFR9FNta8GKejVd9OKjQTtgHhpDZNeJrRfAdbmsgWzTXGpd14Wc0PtvmN1jeYqyQ033r92WiGOVt+m7VNbY6WuimfZ9Pz22G01XTjtARNG7jR5jcncAU5vUYa32u06K215RNrjxXXVd81QIA3i2GFGc3NzSr+1eGgpRq3FgFffJx4z6d6bG11iOgn5kdJZZUFg6SNyi3FSvhzSH3K5F2jFVLY5JIkzZ8WGqp93rctdmMBHIxRdEKNX9OJ3tEthhbos3a9sBA4zbbFmlJ122K0jQp+qWUS9XBjEKOZg3FscG2L83EmHOSSG7dOPJxeNzBcqxA1UrtRtS2VNrXQ3O914lyEG3PNZA6BM99GNy/qhWkzrlClQoSB7rIQXjroIwKT8GgRYI/FEvjSpxZ48osLdCX7R1wul3jBC17wG/v7+zLCv1xfAfCeE/cEAPjnHz/5bWdx6QUB0g+pG+mc+9MmKi4bs/WRs9magVYmcTEmYA2Xp7J8V/Ujv9vKCC7NL3Dj/WS+YRGo7Adruu00dmMyZOOjOJphWaGBivIJxAoUaKnaFwNzJpPCQxOVeszFWYGN6MzmNeTiOF/T+1iBeM0JBG2qIDBOfAjdQUD70SX/wkl0bqnrqvhdoqzps8mjwWs4fmdTacuBho5mlt/Clsne+pc1M9qbLOcwvo9GEKv4RbO3c5XNkLZNnwpTJuYRq3435rGDHrFpT+uAAO27WPFb9VUa/OaKfmqBh2zx2wpchl+02d9ZCW90/FbPius3W5Kfei+6rPbuGUGNcs+p/aoSBFnNDQ1YrOeikKB0+L2PEBd3AwKU+wiTeTEgp94yLjBigmHIkJ8nwvj3AkA3frY6I/SUNRbUv934XjeYYcefoS9B1SXqUyCOJOmdrgklVFjn27SmvrLVDQEzuu1CejEA5shth4J86oIIoNomg2pbmqrcoe0FiM5Mo9JHunGHUpeCGitTNxRaUiGyUozncxn3ojluc24aea3HDU2fzJ+xj+hKFDYbn4Zm21ID+FPyfClti+VNfjeYOTSMpaRu07zT/2J8l2oOJ/6VOdrluZp/JI111CgG4tMfiegvC0I30Kjv+3D48GG84hWv+E0R4dve9jZedwHwxD8a8P/OnHvqz/VxPwBCasgGthI7o+G83DZqtJxNxWsDjepXnzJbp1a6w7kTGvJJQn24OaHhoPZdszuq/cZpx3Ht6snmCacKWmg8JZgCEGNDy6L7VOfLIBu0mDKoeXR1XT+8EzyNX2Vx4GeDvw55HXU7lUtuhU6PynsDLlF8W0p1/G5wVKpAjlpVz4Z2ovDbB+6s57enTaXF1oLEhI28yW/zTHTmGou07x1K6XWrBhbGzynn1ExtUvLI//p5Gj/h9jjZgGHyelO/N/ik9aiBz2m8jFE7K2resBo3qrmmFRF2rgmkwa8UWc0Jtxhan1KtMeI63w8FGQWp12JDq11h47XMuipAZHsJPPDZfXziYWJ7Ecbznw124wjhpLMTNTNlZOE1DpqP2COyB9lDGFVmorIubOBcLNpGdS/GdK3Pmshy/otuj+vHemI5GIzCQ6SVplOdA6wMlVARzZoY7sec+aQoeun2wTgCdcdhnarDkf1+xtJHiTmzhMlCRP1sr+qze0rpg6pT7Y36sDWUXtHSfTtM5qjSduKHNktrvuc+JpqbQ6E+bI995D6qrB0mG06jbdHWsOm2dXBggU7zPIyOjqktPRfYCOz0dEAVQFgH/QnCArh8YYGH7ge6RYBSwsv29vajP//zP/9RADh69GhcJ79dfRDI3aciT/LwW/6L/+Q7d3YuYxlEoraw5uAG5aArasMRMRb/ClxXKvGoAclJj8Ki0rAMzs3Jv0jvixEuxNo7ZIrOYiBN85jOSkHvyKUVXQKMXsju1BGVU6x18UoTweIJ1uOubMoma0U9bvq+C6qQ9iwQyTRqVateYy0TE8nfdMmH2E9Qwbpz/GyhWLg0QpCCgpU/r8qdJ2rtl0jtViSb0Rxqbni/utg6yxiax4IHVbnkubalTXNK7USWNzvFby/Gm9REzkWhpCSaaju6AACFp9gSOcSnpLN+WtqlhnB+wSgBQGyOm3auoSE86znVQqXW3kYrxl3akcbeUMegsGEYquH3CATJAsA0zdl2QRYrWkvTlMyJXMIc8f20ycsqozW/bVu0wRv6oze6wYQgOHuxwzs/FvGmb1xA9vaa0FBSueGE+hug8ObSWk5aFhFM+8+uC0SVaZdEkVCEslCCdUD/bSkBJpONMpn8QjOIys/HIcdvcBigYnwZaYIUxD7nzFnDNy00HDfZdJNKSQEmh5PGbTAnW6eUqLSwq9yEGjRvjSe1HQZoKBPMN+FAW2geVrcdQkMIt/KIKNPwZu7PsvaOyLQHyqoqSGC5FfGFTyzw5c8Bi2VmVr+1tbU4fPjwvxeRs0ePHu1EZK0T4NUJgIMHZfwnP/zvDj9y8fHXxNgjyiIMOIYWCLMXBYIsyjep5c/mfIN8LlMZ8cfERcpGvU2Ldaj14dVpA4kJg0hFc5lF4f3ygAqc00S66k1Gm4nTh0btQP6bdq4AAEwDSURBVBzNPQr6dTyZyGhyxXTb44fNBCSqaDg2NHXiohNs30rHs8lVWhtnQ4g1yasF9Bs5i6Bg/P70OFXbxgyGGvzXxgmKSk/lwa39uIfzdJl/RYOiQYCnaO5BgmHmWtufUdRqJ+i0S5IhkMTkQp7gt7ZUa9FANM1Y3I60IJWcjG1gtBUIxfmpVvymMZFpfmNqLWt+On5LmKK5xSl0sa8NEHXXb+07lwRHEatFDuvXWDrFRJfBoQCJu/cUzfU9G9nnDhfr1vc4jgg4EHOHVZYjglVkuqASTlLaNDqtZQWwnfzoVJwE2OqrpX8XBVuLgD84vYv/5Mhh3PECYr/3Hz1q1BTz8a+0yTL9ZZQxEKDGVC0aI6kkZ1bulXBA+CYYUGh9pTO2G4s5mTrVoLJKhbKw7Dcj2ohiKeZFgQ4cUKBpKvBs4HVwmmg2gL2RgZuLoiM6y1viYcgRsTllYQMsHOO4RT1ngxw8qLiOifH4jWlNBXXwZ85VnAWy8bsgg+3TuICZ3FdSglCKcKx9/WBg2ob1HyxvZDzougCopH2rNecOv5cpblwDmEdrY6FTYqwNtizzMUYidB0eeiDg0jPELYeH2vu+l8OHD+P222//VQBy5syZjWTVqxIAj564J5wA+l9+76+8+QIvL0MMfRTpMrSFs5lpW7vaoZQ50Hotp7+tMyqVf4HHOrEbI9mKGBsnlpIECDq1il6swZ78K/Off99DZDizkRHApJEaKIWkW7iSfBDV0AUmVZYyDLNlGNO77ZS3v87QUkcika0d2c5gUrxuosDgZN6E7DtIp+5ttZ2DyNRubpdUaPvaOdgR82mp+NWI5oJOheX47dtozYlK/Vc22JrfQCsymawNrJUHB+sdJNOnwe8IVJtRZdFzmXJW8bu1g2lomyl+t+ZTjpyLbPDbHjgaeXgczVWEqO8nSwZumzHFty3ukNNe3622NfQLnL9bi+aW3woSyvXBz8e8/aQxUmk9OOVWMLUvibdKOyBem2nEa1h6AFtL4OHHlnjfJ3r86Fs67O0DEiLAUEamVKM+/g4uJagoa5HkDB/MvlFGXnN6xiawHlqQUFYBIKL3CbeO1KFHUoYLA5ckje+IWOBmg81Z0lqawFMG6JNh3o8ELiBeTNu6C9Xypw9ekMwPGsWFzbKhNdVF0JOyZozrh9Qa6Jy+08EYKeeaYj1ymk3TtkYeG/sg2rWrDFwHpRQIl7Iu6NHMAIDdkKVHHUbqLCxiDoAi2keQKpV44llQWu+GC4XPlNPy5hn5FoTY39nCJz/YAzwEDplXSDLceuutF//sn/2zH/qH//Af8u67745T6d+umQB44oEzw3r8+7xnl/0ClH1tjimnE6mWnB6dOU3XAYq1RsmE0BUtmln40Kc7J8g1EoialElaVhpNtGz46okyP1GFcssEblol/Tc0OwYjyUEZUB3FtTahSodEOmOL1YpJbbAe2g4W6NZiFzb8EEUUPh/N3/4bl099lEqj4/tZGUmoNagT464Esyn9ulgRj8rUgxa/Wc1ey280+F33oCAS2GhNkbZAaQUkfRyQRoogVDAF0uS3N2OK9ZtpYDoSjblErhy3aXuK3yINc4udK6hS963j95Shy2L/GW2vM/FpQOqqraxwbbfNppjssiBgHb/hck/IxL5kvoRGO2dSGzZS8q3iN6p91AHBi4KwqGbIoDXs+g6UfZz6aMQPfXuHDj32JaCjDD5jbkXBHLe8r6nWmnLUbtJgi0rrPKsUVk03AjYylgsqH1ZrW1Z7hnjNccN3Okdii/VxM/IknYBFa3am02aDKrWa/jKyZel3QmDrO1Hg0wifOs+hHyqhKh8C1LitH6M08u2K0exVVggNvuxSYepMHPSR/dVqV5rLyt++Ts1mBdeosCMVn8naF1KcY1iy5hmthdoRpaXTm3YXsswc/GaXS+CJLwMPfwrY2orDIYExLpfL7tChQ+/9oR/6oc8fO3YsHD9+PG4iw11xEAhJwfFTPcHtJy88/Sd3Lu8gDCA3KvekyqiwujYF8dkQxrxfiD53OxQZL3BoBghkxKeZ6oP1vfMOI5LNo7WPk00C79Njpdx9MslkMSrj2vwhyjxamzhR5RW1AqY08hI3/Ol0vlp1Agoah6xp4iy+dSV9WOl3kNDwYUE7N2xlkbbmdnozgjpeSJOmE2nxlN8ofZ4il1orwqYiovO9rIUgVinB2BBDtfAnlY+hTKZ10rCpmd/iBBy0+O3a0uC3UtbAJL+VOd7w25t+G3MNbo1OCcweJJaN5yf5rdo2c5uK384aYfYP7ccp9d4Amd7NfOpKvz7hDNYtfrfnCpv8xorUgPUasS4oNb/DxI5o9xIxiCnSzGQrEPQgDm0Bf/g54BNf2MZyuxuJGq1mlS4S1KHtJGFDa3+ox66Dultnv9jIAUx18MpClzLRGo1UgM+zm8Gf07Mqz7aI1UyLhKJBdKtAlKXLr9eiARWVvlNyf6idSETvgoo7IiY/sc4tLArcX5IpWfUt+1lq7bYE68Zjxuk1ncFpzQGd6znm5wQunNH5NibBL1QZUWq+wfDGas01PZLAG1SCg2BoWPkAm91LFM0d+AYVLwx8j3iUoubaoXMlsTQJEAqWyw4Pf2KJc2eWWCyGCR5j5Pb2Nl784hf/St/3cvLkyY3luivWAI7wL/3f//f/9A1P7j1zp0RGdl2QMaowgUL6ZPJeO2WjN0X5cYk5gWb7Pq3fE5x1URwjCDodmPq4s5wwm7qilr/saIYwmHOcgGUzJ10xyOdsRAAL0PBPqTskjU3a12covwIh1xriG74/zsHBueY2NaOtD4nmP9HWNrCp43LC90Tt2gLWAs5unaI5yW/n56QgMqQxX1aBk9daWEAbdKwvGCxsy+in0hKUUR0xJsaEem5WQZzCjJWKoII6xNfb0uKzPaGMBsqj7Gu/OFcLfYqk9qnZWHUnhNQi6HFiTqBK9iMOUWATmupDp4g0+V1ryrR21O9JWLkvrVzQbg00g6+EyrIolVbJ7zJs0Ms736euhyjoA7GUDmcv7uPkR3fxLd8IyO7gZUZI7e/peSFFG6i1nkFQaUKzRkrvYx5fUwOFq8N7EGtqEuOLK+pQMFqZxsACkxFZmbET4YPSqyShKYhUYBWisGslqG+Y1KfsJHCHRi7sIlNzNDfC+Ni1FA9GmA+CFtRm8isMo7CU6FOkFEV71Xbqpw4S08e6IKF4Hqr74vB2RYAwBmmEZn5t9ZwfN+txV30MUvm+i9uTxc09uOkfTMAljALE7G5BHQB1PITWfausPmLM4qO/6Tj4Bz+6g7i/BRmgfCgiHcnzL3rRi34dAE+dOhU3leOuWAN45oHByfDf3f+eV5+PO8sAiaRNTUXl96LxdGAkbTGfRIOno8+/LH+PltmCbBChTkblrN8CFNHQA3Qn9db328LVtXKJTgC5Ok2gziE4abpqIbs0c9S6fk18jGh+Xw1avArXWb/PNQbWigSRbcifCtCWVb/9O1OBdkANzZd5oyAQTB7qA/LbJi+f4Bsb9J/gN1fQgz4vLVbgEE9oy1r8QmM9JJWXBo2utK1T703NO3peeigfy4fJOcUWzWp+w801NudRuy5O0A0r11Z73KuF9Hrx6GOpzZWONeuVkzQHG3tJSzPm3qUDdbamc8narry3RrWXs2iNogxYjD2B5WIL7/7YHh57MmC5GNEeJGaQSEEcgxJihnoZPtKEYITiGO/l5yoLyfABkPFZylBHAT4doVFkzLEcxnZ03WNQxqAhjeYH+qvDOH5V1McntTdeKzrkAssi47iQA0BU/fkaVXtxBI0e68z1p8wXI51EAy3HUYCK5kdGeqd+27F5GtD0OY+Huq/pmQKiXHSSmrbjeGSsV/Uj8VISMLejV6lTtz3+KxY83Let+yCieRTrPrL0UwzNh58gmi/6h6oOlnEp+jH1NUQLcu0sUpRa6+jQtMcAVWKxjDj3NPC5P9zG1rJDZADQRxGRF77whZ//hV/4hS/ggAmRrlgDeGo0A3/bvff84KW9HXQSFB7OKGlzfXLoonmKViZdOwRHLoVHRifLsxViQ2x2bZN72OQrexXtXGm/rklerGtQbuZ4rwcfrnc7uAk85XOI3xvQup1e8DqP42by75rzoezJQnH+pMqsBZdtJJ3IRbDVCf7oCcF7PhnwH39nxLn9Ht0YoJK1HtrXTFKqcVu/zo0qrRTsLQggjxDCWhNcpXNkiuBWfukmX7BPywWbw9rgAdkw0qQcabWZg0pU27kaeDeboixppixTmm8dnFA9pw4zGTlC5QCXRh81UVl1rJEPUeq88hpmrGhk1bhbmEfJbcMHZq2CZdH8o9Q+YmXwZcyafXpamghlG3xl/COaSvpGZhhlsq6zHIpNOTjKUhHAckvw6Y9s47EvAN12P4JLRy6X23jRi1706yKCI0eOdKdOndq/rgLgQIdTPe7F9h76P83LuxB0HUUtLMqGwl9J3O1NflwJ6CRWiiZXwiZXFgxgrRlv0+dXidzr26mNcleb03Rdv/3esZo3V1bXQWk3Aet1A/mwug9Xyh9ZUcc6Pkw9c735cK3q2pTfB5m/m/KBV8CzG73uVs3Ba0nrg6y7VvCJ9alqj8lc1cB9CPidD+3iT37rEl3Qsaz6I2ylDalSmknzG1vTX6wpTkPusAgM69ITSyudmwpqMP2ontV+ZlqbIxOpoBOEj/U7nvxySYMB4i46GVPMczbwJxgBWhpfVydc+vqt3Fnnza76aO3y2le8JSiVKdIwAa9bic2Ud03ClJR5es6JxbOQqUTc60QUWZFrXdrP+7GI9AjhEB78cI+9S0ssX9ghxh6x70IIsvvSl770VwBsHP276RCa5ejRo92JEyf6//v/9ve+5X/96G++74mLTy62pAu8lgnZr2FpgcROwe+sguRZlZJ81T1MHKamGMANGXMtnpuiBQ/Qtyupf929TRQbsqautW2LzRF+EH4faPwbLApe6WLckOYtweNKx3ZQfm/K503m3NpxTCWw2WDdHZS+V/Lcqv5fy7qudN0VqCtu2DEbVa5LIBARsB328Pf+0wVe9/U9dnaTz5Z5XR36B9OihlnxsiIbmVkk47iqYDodSZoAkaUB7QGP66hc/w1Ooe6z9Wv2MCWtPmrEC2mgJJS+NjDjqvTjFlqmioaeRG2oZcZWnVVcHNyYxB0aJsCUoQTxTdqeetbEDnifRvrnpK4PGguxaDPpgK8tJqC4QB26NtIcqV0yahWX9vtNh5VY5+vOPGXBgowB6CIQl/hHf3MbD90fsH04gDGShNx+++1f/LVf+7VvEJFd3AgT8JnXDf5/nzv35Z/cDbtbC2I/dgzicd2eJWUVZMPVWKR4gHuNPXPlczzAx+haWYPa4yHamIJXX/+6ewcdE1fwYZUv15XyG1fA72vBy03Ehk1ocTVj41W2fVAabDwOXt26O9jc25wP2LD/17Kuq/JY2FRCNuDNtvQCLEE8fhk4dX/Et3zDAvvcLdEXCqhZdBREsgmF4ECGdZOh0l2GoD/kAdmErbVLImCMFkPPKMh01K02+xWBQJzZeQhUsIKCuCjtSI7BFP59JcipQAQqPEItibb6ndvNEg4MoLSGmPGKNG0q9trOWojz9JKSwlKsUGy1lsHRjbYdqVNRidRJGSY1WKIF8eDWZQBU9pSi6SvtFHxAqQR6CaES6GzUtg9IlaZNJaN45ACn6IKoZILeARRiuezwpU8HfOmzgyl4FEL7xaJb3Hrrrb8DYO/IkSOLg5h/r1gATP5/b7r3x19zafcSAhboY4Q0ogRlA7PHQU0w16KOqzHvXGk719IMdaX92YQP9fObxyIetP7ryYdVptWrMUMe6L01MsKV85uTWqCr5/e1u3ctzarPznXHjczbN5sPV0v7TfkglYBJbIUF3nl/xE/+QIc7Di0QY49eaDP3aB8wE6jFWksIOPRqi5spMgUzJEqrqEXgUH43ObrXneTEaBrBGotBQ/eQ7SOraGxHs99qR0Ou33VdeiIjvLbA6wGDB7jaxtI6UG2oRqHGUG18TVq8Etbg7asCozi14qbGpXMWD3SKcapeX1edw9vDlTXxKqjjobW2k40+S86IQgLdAvjMAx0uPE3cehsQIxBjlEOHDuH222//NyLCo0ePHnjphyvaF46f2gewfObihTfH/R4UdIEWtLHkHqf9Nz2gcXF0/vnqSOsmNksCZ/s+G/da7bBW/1ThgG5y0kV6Ui1Y+jpc4nnVH1Zhpqj6YKwQTRroBOpT/XFgQ3Tj2LQd1OOu+AA2ecMmbdC+to4PnOoP63Gr3+n53ZqTG/Cbbu7YOWxTatHPRW+n5gH4zRXzD3oc6rPRXA9wtJjgKdxYV647S/P63tScZ0Xrqj+N+TrN01XrDnUfJmjdnues6LJqHzB7HPzedtD13ZoLjg+Y4kNr3a3feyb5Xc2L6XVHc4/YB3F4SXzuTI/3fPwytpaCXUQF6eU/kA2kOWMG9gSurT1shYg39Z6p3miEMS9QcI1e2i6XaUGKEyHuLWSJejJOi91t5dhmOv1VfvbUUBsTQpfIelWx5gc36WOVZpHtN0Wu0KZEw3edgq79XlypWxdpI4RMC6gKCYVTY6QxS8fdJT75gUGLXMDYGQ4fPnzhB3/wB98PAK973esOLAAeWAN47NgxOX78OP/if/ufveF8t/cy7CFKYCgpT6DUwU5VunrGto+SLYfSpvdXy4NyZdZvq0PGxGuyyvFzlQenNN7399Dug6xY4TJRx2T9nj44WDsrySr2xDbpYr3BtVV80PdE+6BM0PxK+bCW3636nClgsj8r5o73DhZZQ6eSnLzuV2s9uGsbkKs9H9d6LB+MDxuvrSvh6YZ9lc3WvjSdt1ftPZzm40brW//N6X1NsOG623Dvueo5IM132XU4+eEe//tvA7rQQRhG2I11H4ApE6CseUtWfP5l5XMeWHtTX/86raGNGpUNzeoi2Jgu0/TZ7F7LH3GT9/T9TZ87iAC5ts6DyBIHpOWVfL9ErsSLXR0O6hqzALhYEk89CvzRx4HFcgnGHiT7xWLRHT58+D0/8RM/8bmjR492x48f76+7AHgcJwOAeGb/iT93CXtbEsN+FITpuLdVatxrEfO2zsiyLq4RWBcPh4pFU2NY1870BKgFWmzQn6kxtJ6/ktjDVX24WXzAVc6lTWg9dS807m3K01XzJTT6tIoPckB+Y0N+b8L7qblwtfw+CB/kOvHhoOtuHV2u1brDdVh3B4l5xwH2uLqdKMShRYePPBRx+gvAt7xCcGG3R7hmYU/X57N/1e3IzRnfwfp4M9t+9tNnMyHu+sxJkQFRabEUfO4TAWcfI7a3Y8Ls5HK5xOHDh/9F3/c4c+bMFRFzccAxC3Cq571cfM/f+Us/tnPpIpbsQiSx2n1b58Vbra6tM2VyRZaJVmIaTng7TL0/5ZvADdqfUjm3bfpoZmvgFKEn2mXzPMtJG/Z61bhsBPN8sHtXysfp57iWZgdrB5UXXZ3b9CB8QIMPWMHvFs2wER+ult/r+dUe9+r+sSHa8AD8toLDQdf9uk16Uz5c2bpbNy/b+19rjFP70OZ04No21o97k/Y34/cY64guRDx1XvDOD0d88yu7wbz4XP7+z2UuN0DITGn4Pv4hQdzrIIeG/L8xxrC9vd2/8Y1vfC8A3HXXXVckkR7MB3A0W3/kIydv+8LTj3zVGMgyLcfz4NIyr1LOZpuEa9+Y2nR5lQy0eU6ufXTvZmO8+rbkqvlwY85V3HAcnJgDvMZ84DXmw7Xg9ybznNd5Tq7iw7U8X69zH5cbsu64MfWvdeDUjVt3nKBtcY5fLgPe+THi8XPAVicbR8fPZS5fqQJg1wWcf7rD5x6IWCy7lHEnLhaLsFgsTr/97W+/H0A4ceJEfyUtHEgAPHrf0QAAf+u3/8W3Xoy7dwjRY3Ru0ICOGbgzSP5bTNi1+kHJAWyeg39Omtd0m9U19bO27ZXXVD3qOazqj3p+vDjdH0gFG2D7M9F382+DPmKTg6/nA9pt6HHLOj5gJc0nr7XqTIngW+1O8Rur25nkA9p9xLp5UdFsmg/++lo+QGoeG5pP0ELRbiOa46Bz/+rXHVasu8z3yXWHit7tdmT1utPrs9UfqcfY4vfUPgBMrNW1c39iLA1+pfFgEz5gs3VX+DC9R1e0aPAhJcBKv293wGcejXjPacGh7VkAnMtcVop/scNyax9f+vQWHns4YLE1ppOLjMvlEl/91V/9XhHZP3LkyBWn9D2QCfjEkP9XHt59/Acuy64EBCYk8xzA7vKhpjPgqlyqdQh7uVZ5mTRy7+Z2aHNc5rZNlQ4MTOoKmzACbJ/cp3LKerMKJxLZ+tyjMhKrMmO78aTclcMQWClbVaC/7af5d01IPjmdLYJQyb7p+MA1457QlbHORlUZpyesUK25VrVDlYKo1Y7LTSxs6GdaqcaoosE8H8RG9XECkHCK3zmFlQty9V2y05jVXG/mMG6sO2n0USbw8zZfdzUf1q27Vs7mqRzRWLPmq2toAQE39htFw9Rds+6kTvstU/uDitqt+oI6IfJkHqXGPNBzhZvye8U1s1/nNc/1wIuc0AaOOZZFhgyq7/jQPn742wVBImY78Fzm0rZNED1C6PDgR4m9C4LuBcOGE7kn29u34uu+7uv+9dW2Eg7Uo+On+kPLLe7u7/3HO5d2gCCiE4GTYXRQlPwDCGJCCeB46mMBqMzXIPl3csgJSah6mOqxz6X6yn113bUdczvIic3prxGIka4/Ytqp++/7g7E/0hgj7Bhp24lxFB0pqp5Cn1SnftePm9C0avVzBS2R6A0QodF2eRcUxEjLhxa/G+P2NIwUxW+Y+cMmHaU5PkuLkqieVAnt6fvDij50fPBtx0YbMdr+ACM/Db9R87vBGzvu4K412nHzvBrP1Lpr8MG2I24t2rli53mZB9Hze+26SzhcbX77dQdM7ANo9AeuP7HFhzEdZXO/kDxnDW0Vv1tzH801WM+/ak5DGvyWTDu/nlbtf5y8Jm6NYXL+wc391v6Xxp95q/ocx72k5wBi+9HP7OFTD3fY3urQU/DsTB8wl7ncPNMvGBGCYOfSFh58PxG6Ub9OIUS6ra2tR3/sx37sJAA5efJkf/0FwGPHBAD/q9/6717xxMVzL5ceREQgUqLkgm2jzRKkABIKREzOBhly88rIMF4vdeWE1uaa5PeHAOTUZqpTAIRx00rPpcOomPpL3SG3LQhj3hYZ61TPZxTwUPoswxhTHXT9zT8U1T9Lq6GdgS75I6mfpSgE8uE6s8mntJ0TrEtwtIR6N02zUl95V4+n0N4inIvCYRrbljBqJkTxASMfbDvFIzJAWjAaoqYlC79F9b+YsRQfHC2KT5/tO/L4pPA7m7mCWhoyJiCv+aDnb03foa+s+F36anJZZxOhqi/RzM0/qdpKaqiRhwqlXtzYiDJPDT2g12dNL2vyHd/X9DM0Co4OIe8Dfm2z1TZF8aEIJ0OyejX3mUzddo5ngVHxoV53UP0WQx8iVHxI7WTha1x3RNlfSj/TWlLrS+1/rfe8GdnQXhy/E9hxejePv97/oGghuo95LRWaA3oPkrz/6TWaMkroNaFN7dRzTjR9U274gG0JOHt+gd/58B66LkCwj4hu/ubPZS5G+wcsl8CjD0c88jliudWl016/WCyxWCz+7Wtf+9pnjhw50onPRXc9BMCjrz8tAPCO0x/5jgu4fNuYy8TB8TD78FAhl4o3t6goRovJztpES5/CRpmIUjvNnF5UKV6KICDav8h87qj8VahAwl20ZTbvsmkG1ONKtjObLMlF341I4BoQUmWCtJF1dAiy5p1CPVEjKmO16Xo0zzzlK1BL+nd0VeP7DVOQmOhaO56EUN9COBONDyWs50YCkTUAoxYtV1NCWtBwKnWP9lOiQ4AW0kTcsmqvmJV9+zXE2tiOh2ITqd0TWujomg8t1PjKRE1j8pZs26ODdfPrTh1fcnIGmejXJIK7oZesgCE0CeRVHtfa74K1tsilWhFVRzajSm07164LaT8SsqIFK4RsZ/Y0xwxRdLfrxPKh8M67iVTrjnRrFWaf4Mp+uZyp+cCq52x5LOejNXbgem6YdTeuD2qQdLHm+NKDiMjBmf137484c3aJrY6I1zQT9lzm8jzQAZJYLgIeuv8wnnkqoFsMy67ve2xvb+Orv/qrfxsA7r777htjAj7xwBkhKY889djdu3GPQYQRUAKVwvUh7AlTpNpU0wfB+qxYsMxha6DzDVJ5IemiN8V+3ArIpRIxxw1M1MaW8xm6usUIL+XTnvpNJfyI3maTUGE+B8UPRu+75V3Xhns2b/lVLsc2MEd2wVZo7kK6RNy1kEItQaB+1vDBCdlaMIcXkCbqE4H1IXRI/CPmkTkAsAH1Ay3kmCMFTLopw2MktPvUn3YUb5Nn4oWJliI/68eLoJHmlZv7LRq1+pLXQzNymRZURazgpfld+exJQ6QRGp88n9mEzu9Q/Pr2Poh0czaj78Ok0/ICzzDe6CCtpWqH7jc9xub8cz5rROOg0Ji/+QDr1g2dMCxqDrTWnfEZnZg/2dfQ7X9ozQFNs4oPSphjPf/yfuzWSk0Lddif6jXp9oKie+0ZcGjZ43NnBH/wiV1sby0h3IPMVuC5zMV81fq+w4Mf3YFgobUtXdd1l9785je/e3ww3ggBUHD8VL/sFnzqwtPfu7cXJSCEslHoNEC0HxuzmUhzE4SIEf6MNjEJlNl6Jy5JiP6Yl01VlElIJpJmaOtK2izzN0jqD0LJ91cSaKsutj8yWTi2fRR10XysdT10ycBz3kEn+VTCg85P6LUA9cdeGn0X1uNGo49kfQCg+sBkgUOPW38RHH1JZuuTeDOd57cSvpr9MRof+0fujzgewtMcbZqzDWRazTWdJ1JsYIOt0/LWwA03ae4/ulBRwD4YZjW/xY2xmucykSTGzN/Q4INfc6zUvYUPZSFQa0YVJTS/0WhH1MmvnpMNOlbrrua3F0TrOYDGXJOGLrQW7rRmVGvMJvsjq/ro54Ws4EM9/5JsX9Fycv8Lk7D/WoNOqsAYypACDh0iA/7DB/extxcg6JQtaS5z+UpX/wHLpeDpJwK+8AnBctml/aFfLpdy2223/d5f+kt/6fPHjh0Lx48fvwEC4Oj/9zP3/Z1XPB4vvSrs9owcEvmk3I9x8Jp3QmC5n66Xe8qROEaQETHGwfleOeJDOc8jAoxEJFXwgYxBG9ZSE5Vmxzqjj07/UfUvls2KJp9l6h/M2PJ9IPdDjzeqrNK5PxG2P0D1nP+Juu8xDnVXwSpwTtnKNKPHqHgyOMGrsUS4sVtapLbTc4OPKpXD/IpxkzmVInUO2zjyULcdaayKkRGMHOcGXWCAHcNwnyY1aaTN1Vk0UdHOi0j9zarma3TPFj7QjrsKfNA8ZBmf50N0jvpunhX62nnpcy+beVPNK5o8s3qe6/Ehr0fVdhx/SBVAUcat+xrdvIh+P4h2fth+xzKeKlDDtxPt35qPeg5Euw+kNYsGfcoao5mTJVhHj9vuGZF1fSafbN7HHF1zGy1+2+ChYf+LzTk5tf+hwQe77ur9r+yPjt/ugK9/jyzrAia4qNxLvO1jxKFFh/d/qsfpLwK3LAP6GRNmLnMZvxnA1hbx0McCHv9Sh8VWP+5BEcvlErfeeuuvxxhx8uTJcLVtbVTBkSH9Gz7+xc/9aN/xVpKRAgkUp+lyJh+BMY3qD4HAuLhY85ODICjmpuLTZDQcOfKsPOfbMxtkDlyp2zWRct54Qpr2aFQRqCBwdK5607YX1PQHuDEu8RkNWPwK7TvaL8fj8es+c5LmOshjCuImGdpZ8aE1bqny0XvtiOW3WFpkM5I4QTuZVOsOevrZKEhU9VT8riCLxGh9sweeVmhlX6jGXHPwMnR91Bou1oggap6J4wMnNE1u3M4wWs1dFP9Hb17XvEna9xbUk6E50Fh3VkBfuR70uKWxzhvrQany1SGh3gemo2OtiqxorizNBfUcqtYGtQaOro2a5k6p6Hjj97/0tkzP88o/T61r1m039z+nRawmQ2NuJ+2h7qMJBEGBnQldj/PnA/7DRwSLpRQTcCs3c/Ma2vnKZU2OcXFq34O203pfVvS7lfd5qp1mf6Tdl7XtYIO85q6NTeizim4y0U+5QXzACjo2+YDVfJAGH3AlfMBmfFCmP7LDxz9IxL0ACengFsNyuYyvf/3r3wMAJ0+evCrtH7AhDuCp03cxSMCXn3r8e3d29hhCyF50JUKMgPOi0htZjScnyhF5KiGyvlabMjUyHdW/4jdPXYcUnz/9LH1PLYCb8uhTwleFKVe3C7UZWjd/mRir7aP+AOp3YzMVlbgPZh2AQtdynY1VjIO4HrenuR/PNN9o8AN1P6sE2Gjwhj7TqJjwETsGPwecfxek8XfL98/xW/QcV3lO3dzmhvxuz0kvhHNi3KqPqnHLW1Zjbs41wKxDKlO8+DVGtgx9VR+n2p7K/Cv5LMoKsE+bEKf3ATt/9L92FniRzq87ceuOFR/iZLCC3Q+kSSepdgdW4TzOvYHceP+TRjus9gGu6F+7TqjDHuCTW5b2Ilt4i/obF7KAHwDIcoGTH9nDX/oTC9y2LdiLQEBEwCL7fKJxsLC4lFLM4VTXMHGNdfJH3U7rmmmnsUes7qNUAUGYbLtxyJfhQGN9JK+iHXGYle6gY/AuNd89LVr0bdCnya8N2vH9NjybakcatFxJn6ACwYAWRLBeagOSwZXy216j6qvnw2IBXDy3wGc/RiyWAYwCIMbFYhG2trb+8Gd/9mc/+jf+xt8IInJjBECcONH35OLV/68f+Y79/X1ZQgJUMET+LGmVkEwIQ+M9o71wvk/ttOITuScJlCjo6XRr1FPFOY7bj0Qsn9oq4MJqcmrtCxsiEtxHVmmMpN6GraKAycLrNurRzCYGprV5wvBCRP1RaNQN7WzvaUSzOvJnwvhf1uJh84MkqPIFl/daYlyd27TWKNJTckIwTWyISJlsivBZCxglOIbVnGzRswmGW60Jls+I1OOsPgqNlGFeseQPJYIqUNYGazQFOR0kYHMkZzqxnpetca/LEF6vO6xfd4Sll/t6iKNT5Zcm0qDF+J5bd+tSOLLaYTRtpeKfbEQLG8SRa2a9tu3+h832v8YzUu1h9Qyn63CFya72/fS3YIx6HzXAJdoe2F4IPv/oHt57OuBHv5M4d6lDCIQgNg8tTcVJ449112TT+g7S9jW+Num/rAUOucJ2ZDUt5GppfiVjxHpF3vXpj2zOb7l2/G4pRAEBYsTWFvC50ws8/gUZs39EjOnf5M4773y/iOyNsttVC4BrAZiOHj3anT59mp978YVvfuDsH/3c5Z3LEAmhFnGsBDyVQYIrPsZm6+P6DwcaJ+fpD3J7a0wnUq+JbNUpq4SZFf1ZJZBgA5qsEjBkw/6satOYJxvagtXvapFtlQZ3HR/a+Wg34i2n+S0T/M6Lf8N5Nnltqm2yOQdk4oO/jpZtfrOpYb4yPrTXHVe+f+34sKqdTdfdFB+wgg/NOZ0hoDblw9S640a5hkkcaN3J2rlysP2v1qBu5o83tc9jjSUn7TKdALv7AbEHfuBNW0DcQ0CHBn7SVRWuEe6utM6bGrciN67fDX3Oc5Nm17hcj/EQEYeWW3jXO4CPvavHoe0lCKDve952223hNa95zc+fOnXqU0ePHpXTp09ftePsWg3gmdcN6d8+eenM916IlxZj/l9lurDinRi1rDWZcULggTHP0KVuk4ktsWHiq8y29bbUuga2N0iaM4LazgUmH1NtyLYmHKvfmtiIzRlcmrpoog73K+Nefc6n+dC2tEt6BNL4QEqDY9LUH9SmyhYfGp87Tr9f910sH9jqozTmhRT/JXDy62/yE6h2mp9/TvCbE/2p+K1FuCmay4SOeYoPMqE1bETW+icJ4xzhzfxcNc/pwbe5ct1Naw2l1m5Prjs3V66AD4bftLabTMvmumu5iTQil8nVWlGi6dTBph50Yt012znI/uf5XBu0204NRYtdUuXJShGRGD4ky2XABz61g098aYE3fG3E5d2AwIApXJh1woi/X0XcbyjotNqZRJQ4oDDQamfqcHmlgtfUu00NtMZd3Xg8q59otn8FEtNBaXCQ55t84Go0j4PK4FPzT9dZ5gAhEnFpF/jkhwIWYTH6M8cYQuhCCF/8xm/8xt8HICdOnLji7B8HEgBP3XuqX/6tjpf3do/u9D0WoTN8LCYmLRLKGsXtlO5PmsDA3q/FfxbNtilXo4Tf8MAl03WI0+vKinFu1KfWaXhiZWs6tL2dkqdVq081TyzNpQHbrBaNux6aY5xSt8va+uzbspo+kPU0XDkHZILN6+sQaQn5U3pu2dgksW6Mxf/F8yGsODxZoUjW8FXMN9wKrCJX2G+sMkdO2bhkLdUkRyTw4Pye4pmsWp8rvHulvR5aHnneg3mKFs11Igfjd6u+tneVt5HICu9fZJcK63AmjV2eWHaCc+cX+N0P7uNbX3EYF+USApcbfYCbnGxslZsGGK9rYtV9WSvcKBpKfV2uoD+r2mniN3oBafxjnXAj10hokxug/lvfxho+NPst17w/us7h9x5gwHKrwxceWuDhTwxpE4kIEOy6Di95yUs++FM/9VPnMFhur4kAGNbQSiDgBz/64dufvvDUa/v9HgBDxvMa/5WUjc1ct8/Ya2g+x/x3+cl+bupfwmVn8G1AvSM2lhcy8YMVvyv/L/j+oNEGVtfJVf1ZdQ0Tvxtajedrab/DyXawkj6U2OwXJ8ZBuYIxpvqmxu35IFfIhzV0nOQd1vDEvI/pPsoqPrTGgtXzN62IZjux3U5+Ds37LT5QLL+5ig/r1h0a8wdr5s46fjbHuJoPG627le1Aaasm2mGb33TrrrVmKWv2ED8PJK6ghd+LJ/g9/risdOZ9MfPGPaPrytnp6DLxJR/yiLAU/M5H9/Hlc8Sh0I38//+3d20xdl1n+fvX2nvPGY8vsR3fUrekwXWqJIWKRkVVUWypiBeKUB7sCiF44olUyUP7wJszEi8oVAqIigckqEAIsFV4oKRNG9EMVLRN4tSBOJdJYteO4/iSOL4cz2TOOXv9POzbuu69z8w5YzfavzXyzD7r7HX51/rXt/7bqioXQmi5YvVIUNJPvyZ00XIXOnkV/aGexjMhQoc98v9NRqUeKOVeG6lfAVqnMLEjqf3AJFRPAbpN0JO9UljAvA3Q0a+19B3MqczhWtVnJt318yFwsKOQ96afD+TjgxHF644PEUG04ENNuPYqgKF7SFRgRJLw85PAzWsob/9gZk6SBNu3b38KAI5kafkmQrUawEPHDoljOJb++XP/9NnrWN5BI2YWgphVrnGwNG++kxp7NDDsLpQyrYfXK8rcB41M/Gw+s81R8JiozKhO7Vzquc7MY5syDHaerCqa4oG0Eyhr0Uum+dExtjU53rF58qxuC9DMLsz+fms8Iw6PWTutKFWO3cq6VkvXRrLfVGhGW8JoU4gPtlKnHR+KujXDmNZmY64ETcMehZLu82b0MedwaP7ZV78FyoU0DVzHh5q5X36XyH99IsOj8fWsO+/YuJ+ZVyWaicKd73GAD+zT9fl9hF1+V/O8UkjpbSTHBaF23TXwAUSAYv88h5nypbxX1yrnjrlzw2X1PULpBu6Tf6F1Z4wPkXHDj3eTYktu25q5IvkfkZGiKmjw4cr8r8BIYoHTFxgvLDJ++8EIg+XUDOxjN72GLicq053W9+KuJ66RXZbnqf7Mu3Z12cF1dftN8rqmni07ms/NqUyMDz0oyPdOfz1sbM3alZHsar3NBGvm7TOlblrLhOCru/iO7YJRhb26k8Hbdi8OcJ0jfHxgS2du56swzLyO2LH50IbfrO0trqtS+X0t9FfHGuV7WIAphUKMxeMKxMbtH1EURR/u37//P1AsmwlRbRDIjvt2yDPP/pzj7/7tH7679MEBHo1S68jSUUcdddRRR6s3Q5HAcEhQI+BLn2NAEWBYHCotKdmWJF1bQ1x9Dx4rk6EBVTUWqpBVBO4z2M+M07ZVh6+cxxJjf47Q99UY9ViafiAbAwT6DhVuT+ux8PHBeuarx8uThvY08iH0LGBVauojm6fBEhX5LJ269r1Id2WqwwEGokTh6ns9PPX3jOGyLLTQSkopZmZmfvCNb3zjrwGIhYWFiQHAWjC38PhCGpHgG0s3HxoMBkRC0Fgqoo466qijjjqqIcUKUSzx08UUr58T6CUqy7lm+Ff671OvNlwF4/pQBFwovM8KjZK9WdsR0dziGdfUBa2N3OJ9TfU01G/UY2vfQiGZLdvTMD5hPqx2HAPtWRW/PW2kMdtpAdri+lPn6kiy6i+BrDJ+FBiJlHh7cYT3LwhEMRU3GRXm3x8wMw4cODBRBVz4Zbmm8m9++K93XF6+9iucjqDh3I466qijjjpaMzEDUaTQvwk886KCFBJGLLXh/0eOCkYHbsyubxyR+VO8k7Q76MtI3OK5cVc4GXe6172rMqHadZLn3mn9nfYzt83wPbP6Z/tK6nXr7ddGx3hvVbc9RvoPDPuyfuNL9XnJmCogq/jcqpO0C8fJ8N2sbl1y+w2NTz6eUunqRYH+GXzQbnpq4jc0xTPpuXi122wMdyGvz6MGRJH5wjIYrx2XGK2IAmkxM0shBO6///7/AoCdO3dOVAMXBHSHjh0VAPDUGz/6LU74TjCn3F3Z3VFHHXXU0USJwIpAUYRnT4xw+QYQSQFmWSWucfz6XUBFHgDRFNVJZEAh67kbdME1gRgFEPVG1Xoi2G3Q5wNodj3mzSrUeDObPWbmd8mMn4E/UKZuDP2xL9V7TaBaaMHqbmYj81IIz7VrNngO8pQC2QFq+GBgPNJTSFnjZgHG4j3ljR4FqDcALIxx0UGljAj9fozF44Q4koV/upJSUpIkL33ta187gQmmf2kEgJdOfpMIhIvvXX5oebDCgiSLzvrbUUcdddTRJDWAYDArJDHw1jsSP3mV0IsUFCtUPlO3C1Rt+HyKuU4I65NKpe0otO8r+VN4rWGs/VVPfnDCaVzg3IMNhPNEGi305JdMYuDCKYnL5xSiROQHDcVRFHGv1/sOEaUHDhyQk+5fEAAuzC+kihVd+ODKFwejEQmQ6NR/HXXUUUcdTR4CCkikYB7iqedHWOEEkoaBy/OmDuM6lkyYvx+teurB4bgtZTAiRHj9Z8DyTUBGKQBCmrJIkoTuueeeHwPAI488MvEOegEg5/lE/uSfn/ylq+nyp3mUMgChupncUUcdddTRROFYZhcbQSJKYrz4xhBvnBOYiSMwRlmKjIkCtgnto+uljvNedtsyUfmawWzbjM5t25OX5VXWfZsBdubVzTzKU7UxZ+kYByOJ10+MICgu3yyEEMx8/q677loAQIcPH544BPMCwMPHjgkAeP7Maw8uY9CTIPVRu8evo4466qij2wQEZhlvEUcC169LPPPih4iFzM3A4b2Hg4Bu/N2KASNX6MR3/1WjjHZ1M4+RyHItlXO7chwcH54wmLh1LgK+6wLr5qGW+TjzD+QUcQxcvgCceytGlEhkU57SSErevXv3ia9+9at9TMkXwgsAj508yRKEm+rDryzzEIKo8/7rqKOOOupoqkhHQYGiGN9/aYT3bgr0hICq2X4oiMPG37JuHx+72xPsrH8bbnfYQQ74c+cP1/SOwZCIiPDmCcaNCzOIY5GnfxlSMjNDd955578BoEne/tEEAAnz82r0wrkN7/ev/ppaGYC69C8dddRRRx1Ne8tXQJIAp98h/PhVYCYR5o09ns21itjtbFQd3Tog7LsErR4/5glgOMYrzxNAA0AMQCAmlhLAjd27d38XAD/++OPpNHrgALsCaf7x4rf2Xfvwxj2UMrjpzuCOOuqoo446msSmRAyMEjz93DIGSgKCtPvTfXfDFtttjbaFzfLs/fw2oAliWL7lL1hrx2+hb1+bMlz/NzXMK1aAjBWuvsc49QohSmIoRWCkSkiJzZs3v/L1r3/9HQBEU7LCOsDuWTwrANDJU2/8xhIGLIhGnUjqqKOOOupoPUixQtRL8ZNXCYtvS8xGDKQRmOWqUYl+Q4M/P9xt0vkJbvN0y1+w1o7f3ibgNnPI9RHU7khmIJYRziwyrl4kxFF+DSIESyl48+bN3wOAaaR/CQLAhVcWWAB8aeX6gZV0QII6tXpHHXXUUUfrBAVYIIqAfl/imZcGiIQAMACgwEjbIZMimXDLAIpJYLLOUf6jQ7TGQhw8iOha6BQEYPFnEYbLAMnsW6PRSG7YsIH27dv3HWbGwYMHp5aARThdOgaV8uLMlZvXP480BZPozL8dddRRRx2tFwQEqwgiZnz/hRSXbkSIIgYpAUJLLWCl7Msx3+rgmf9r1IAHyAMCaMwRGKc9axnpaQB43zNep3omCvFajZ/PFEwt2i4jgZtLAq+fEIijqLjGkIUQlCTJ4sMPP7wIgObn56d2tjDA3aGjRwUA/qNv/csXlEzv5qFiEHcAsKOOOuqoo/WDgJwijiVOvZviucUUvbiXa/9WR023VnAAQBD5UFLTfsweiDHeHh7MoDdhg9xU0mzT+OO/mpbWmVybgSBPbPyc6/ha3FLCzEgi4PxbwLunFeKZzCTMzGmv1+M4jr+9f//+67n5d30A4KWTJwkAzlw6+9CyGrAgkYZS9kx64tAUyk4hBeYtTU05aT7QLRQe68Xv262Na94AuvWw7vzu5N+t4TcRA0ri6ecYK0qBSDXcDMIAVP7Tfs/kPH6EmVv5cU0P9P4CAPM1PFvbWLBf49cahNLU12aYf95TBAQJvPmSxId9QEgCM5CmSkgpae/evf8DgHbu3DnVWRHpfyzMzysJ4Py1yw+tDAckSBI4nSJ+bv8+fQjbluWx2DHZPo7Tn7FmIq+9jU3jM6k+Nn2XWvJoLfzmdeofr56FY72P1zDX6oQl8+3D70lvRm15wes096c9124X+bdWfjOAaEbip6+uYPHcLPbvBUYDBYg6qD6mqdXI3dagJWQGERl9o7HrqAO8/vGnhndl5lVqrCPUDl8/6urRC3vL5UmO7UqYxjhAeBrk0yLSOqxYblkoPP7upk1CYZjO4LUXJSTl/oAkmFmJubm5G1/+8pePP/HEE3z06FE1zfulI425RETqz374j3c+8Z2/+5xaGUGKmJhFFoJP2fUlpS2/2DX0lZw/y/6zlri94gvdul6OtGWlR8uAjWJlPcYr87/szawsVJVmfcFb9RC5fdSfsVZP7cwo+wdLXBRt1N9Drsj0PKq+o7Xb00Y/H4orhKyTlI8PIIDY5XfZEB+/XT408bvkg103GOzrYxt+1x7hisLVd40+wje+4d3MGfOS355Jn7+zYod9m3hgLMhaD+W6882B1fHbGFOrP741b4LzluvBWIZuH7mpjzX1ePlgdMzlQzUVLJuR95AVWA/cLC8qPsBzezy34zf8c2Aa8q9Jtowj/5gD8o1Q8dsj10ueKiAWjBvXBf7zRYUHPiExYHYd143xbgalPqDhB0fWCOcFaFxt6Nj7N5Uj3eZdLkDwMyfUP/I9I9+zlmZYeNpDa7zVmWjM40P7I2Xb+TMZNSFBcYokYVx6W+DsImMmicCsAMUqjmORJMl/Hzx48N0jR44IIprqDbwlADx87LAAkP7XiefuW1bDOyQLhXKtkba3kSnN2ZXwJhgIwGj2LCUOLa9APT4ucB34puCzYikY+aKM/lB9Pajrn9Uvhv93XxvZs1yb2ljLB2rmQ16Og7wJ8dtuYxt++/ng7WMbfjcewEw+cHCuhflgqvxrxqduvXDd+tDGgqnmPWF+l+KvDb99dXO+HlDPhyC/G3kxZh9r+L12PoTGAkYbvWPRSl6E+E0165Ma5WQrPrSWf/n7Ji3/uK38M+tm7dAr4gRP/2wFf/Cbs9jQG2CUmtqutps31YBCP0ibQuBCK6zAa3zfWuKW/c/0etpqNKczjhzQjYbrbBpzXkVU+PhgtjgIKkAJRCRx+hWBa1dSzPUAxQKKFeZ6G2j79u3f5kwoCmT+DFOj8jB16ZuXiABcWe4fHvKIiUjxGhh3OyWPoXWeotMi/gXgA9/i79/KOTTp769G0NCU+UChcjx9ftMt4iOP+ca130kxvvcdt3ob1XyfA9obtO7fJP0Yi88VA3GS4vT5CD95DZiJZO2Gzase6Wl6/NJE5/DE1gSvrp7bKzMcNfaLxh4Srh2u1fkE6laZERgpXn0eQCrzARVMRIIZ1+69996nAPD8/Hw67dErAeDCwoJSL7wQf7B09QuDwQoJIT4yCQC7/Ey3Ysx51ev3dkR/vMZsYLxOc5fXfS3ZZkXPhtHAc6rRzviVpLkWgDw/Tl1a2fz2Tbccm5qFgt+kfW4kEvaNiNU6R7nH7hzK25T1n/MfgKC0v4sfZZXz/cD7rNzUyAqO8NxbyqScsXT4QICCVY4YTP7ZwVSMRzXOzkYb+JxA2U0gKeF7z32IgYqqsr70G1yvNwqvTuUpS40wwXwnBZ5zw+rx/x/+oZo3UjmCTIzqH9zfCNoTgEP/iDWuhD5369GfBd9ONe/11pPPbCpcR5TWg2pdsbbW3bebYwGtb1QjkcjHNarZ84w5DQAjsGJEUYQP3kvw5v8pxLGAYgKQMhHR5s2bX3vssccuYJVhAuNSBABHjhwR8/Pz6i9OHd/7wc2rD2CUAhoCrEwf46umJ+n0vZpvrca+n5lDbm09ofe1bRsZfCA4anytHjBbHnjteBc0qZCZCYuZvG0oF01RnteSOGH186p5TLny4SLK/6TAgtdabvWnbo6sZs6F+hsaA8qP72PPU5+fJams1SzyLSf7G5RvpVSYkdnUKzFA+Thyzbyi0j+uIkV63wqjpyhqLoW/491Y3BVLmmA3XGvI2HYzkyDD9HVzQaA7zm4OEdb8qfR+VWZlG7VwjaqBXVWELyLBWmSCCaXLA1m+g6T/R+aLcwut0IBfNc7CgO+EFMwiL6DMWc353Cff0YADQqt4rkApIZ4BnnuN8NZ5if27gaUhg0iA2OB+NhfYOwwmO0U1v9iBb+Td0r3BH4V7Zr5+ScP2rAFg8jBU7yZpLphmM8gLdt30NBVk1se58vIrG6r9V87IqvXWoJlTjLRRMncJGytQCUZ131HtfWz5omr7Ayox68hIkydku3RXq0yb51kRUfmk6n+X3xDWCULl7ReZvDKUAVTuV2wsFzLWSOFGUxYhAaUEZpIUZ94ErlwAkkSCWUEpVr3ejNi1a9ePRqMRHTx4UC4sLEz9FrYIAJ7Nbc0L517+/BKNIgKNGCwzX/yCFZ5VFQqHYluw+BED1b3LEHJsBp2E9LLsynRi9j4P1mM7wdYJWMN3m/16Yq7bmRmCoPne6IubvXWT4+Du9k2fryLftPQ9phRKReoDVIF1ZLlYKOOdmiMwm2KSDJ8uwDYmUR6MICygCGWVJC2qTTM3OKCULf99TYAGpoJjriyFjJX+wWE3k+3DXgllvZOqQgbkgwXKk2aCq5Ni3VoxNR1cAvcy+s+an05gI1eBBFS7hqqB1QMZqk01F6cqC9RhID/BigAUCvhuNmoZyeIHez6jTBOlGzCJMzZwtcFV7VYmb0uRQvkMzsBxtj4yngvS/OM0QFRua/kmoMcAkQZWM2iUK8sKluV7TbH2qi3Y7C/pY0f2mvOIEzJlA+laGwW/W6Xx9bL1JkC3QYEjsIqNW1X+nGSVKeedAhXg0XAmU84RoHouIIlw9Srw3eM38cDvSgwlQdIo27gNXZsOd0h74j9wmSCIynlighs98reSdfpxlnKNkgm4XDlovsctWyvYDa6z1jKp9Zm134q2qsAGyUHFTfgUoize+MRVMV6qRZ98mxkb/HPb640ztngPZ16gztJgQFcFICoPtuzhIVps826YnQBjhFkIvHYcGC4L9LYw0hRQSonZ2Vns27fvGSLio0eP8sLCwtSNWxEALGAeALB49eKB66NlIQFOWVExIKTvaAHbTskSMkegXOOlgCyiyqpDJGsh3kbaabLSuVMDwqQ6FGrvkOSiUH9Ik6kFsPto12ObJcjdWE3UAjfO30RvpmbAkytAh+iu6MmFgRZdB+ccZZ14y6aSsajKN3Iu7Ehon7CpKTYQJ4X3fcHVd7Vy1KSHpAotU6HBJFO820CkrIcsjRzBQIRUAmbSgjSpPLoqUbCPIVjTpBYn0uL0L9kCUigjj42o03HN4oaJkit1m15HQ3ZSYzp6HHyIMlVeZUoxxXuao/dIMiRlQMxWgHq555GkXr9Fy+QoCJiByN6pqEzHYcYjk2fOmhtJtbWQ4/dWzOkort6phgykOpQCsis7qTpE+bZJAmS+/6WUK5wKcZLfaSsE5wcWCirwuOW2GTr0gBlxLCEkA5TmYIFy8Ok7eFWBu8QU8A3kUo4XGt0RAYlkzMTm+DNs7afEYAUAyxy6mZOgGiMNwJACC0I6G+GNl4GX7o4RJ0MwR9lYkgcksFdNZkFtj/mUtNOxsQW5mnPf/LI5wrk8AblcLPbBCuyzNzUR2ap4KxBbjVKkI8pvSQmID9ZP9zVxzGybLgNl2XKxaIyNtsox1ZiSuGb2h9ts6laUJvKEd0ALGagcDTjjw2UGKwEigmIFUcib/EvFPlj+rltKrOdVDpwUSGPMbOjhzReXkMQRVFZASSlFFEVvP/rooz987LHHcPjw4akGf5QAME//ki4uLm7+vX+Y/50tKlZRMpMFJYMxUCpNh2lM+Wk102JwAA16Mwo55Vz8rp32WUAoU4AZaSF08ORNkKQlHGJXn02cbV4CBMGcBzqzc+IzQFJhwrDMML5nutpecFaHYVxwzIS23l9oGir9/RRKzlSOj1Bk4wDt9CssrQB5Ng/yLAUbrxFkKnKz0qTId4asLHVSM1Ebop48gMPie5VdxZUSpBsrFNfgL7IETagseYSjVhMDkgHJBDeZxWRJ789YfMjbLKWAaAyyUxCCEInCFBcICiH3TOexkFvaKDLWkyQgEsU2qTS8KsrUN0TWYbJIjVNusKJKlwM94wobGuS4GApBGA0ZaSqqlEGl7PJpKYq6hKF3sgGdyA2GIte62QAQE15ZQhBIEMBKM92ixcmjXWgJWOX15KYkFQKzmTPgcJBm5Yu1VMpS1s7YVOXdYwJIgJgwfJ3xV88oQObmOeiHMwpozKg65+eyITT3yDKDc1DjwYYEZctkRLrcp7BHLDE8mk+23AiKucqahoTLtaFGAioVCGeAXO3saggpG9vfZtwQNd3Ehnr1tZMuQxr9Duk7CxBuk1K6wkXUaGMrKxGRPv4eUEwSrASiZAVS9BDNAJzJaZUkidi4ceNTQoiVQ4cOyWPHjk09AAQAIsrR3PXr15fvv/PuL92TbFUzvRmsDJelmN00Uq+/+6fn3nn799PBKBUECeeUYg9yk820HiASo9KqsACCG6U90duVIxBSquoxTaPmhCj7U2qGLGUzmSYRtk7JFALJurDg0NGePD5lqNEYUun0HeIMWkJ0E+0IHVWAmHK+EKYcoQ4g9y9jBBT4Pr+COvnCLhihwsjENZqBtW/CxSZBPJ4IHIdjkwXiIW96/ZAkNb5IGGnfJopmqQScDAZzpGFt8pjXdD2Va5pyy5ndW9HPVgKWNpkMTTcb7dPPZBqo4xw25huEspz4px8HlZvJedz4ZGpfrATT1BhJTCS186zpbuA3+olSX0uUWx5GNbW0sHZSm/7Ao7jj8UeK1gKcKBzYUnwuCJBxaN9t0yr2ay4JNe+s01Gzpdug8ImwtZ671Hc2aBuplSax0ptw4Jo6gq14ravHTp9pG/NK6UEEVmYku1JKRFGErVu3/juv83UwZR7ABx98cAjgLWP7JcJXDn/lgZmbCkQil1qyhnkhxrV/VkQG0dibCbUuJcuFRa4Gh732trBGyHpmHTQt6Enw58ZCQ0omanUwZ6sN5NW/Nj8zOEL65pdpQpTIIrLElCcrGz4mbYRbmzlXgUBR+kURUjgbF3PjFm06VgfZx5X7dGr7co51Em6rnfGIPBp3DemJhdmTuFpHsqa/GjWxpE50sG9p5DKh1K7APRy1kgjs07E4z8z2mxqAPK22KrSUrgggz9ZDzu/jJhNeE34uZTa3DhgaB6dkGs8x0mN4dW0UnIWmfaLlPUa0OizbWH6s/YjHfH9AtrVGuoyQj1YFxjhLOgyhAR+ylASU+2wXB3zpvS3FNMpl2mV9dvuSSdt1WyFirqHPuOGELPzBZd1E0ho5NjTPtiKkPLNRSPXBunjTRJ+yTBmZVpY1RYlT1thUhCWXiZVSmJ2dvfHwww+/+OSTT+K+++5bNxRoXAV35MgRMQ/g0P3307GTJ/kvd+y45+mnn/70SKVpJGWOAVVxemOwUiGcXifX6+I9iDW1OXPD/XqOB37jamPHSbY+liW0lEPRsqXLrYMRbX0EtVNnN0odHWIqszT7HOf9G4H9pjDsoMwNQOgJfBmsik2aAm7X4283xmUphYlRsaEg5Rpg69drVVvIyDhdcxmoAgBSSElSWDc11Iw/+xVXVeMy/gugxh15kpu+rQTidtG/BI8IrSKIvYdrKvzy8jM6c72SAJa3hL589QRw1rSoppvKi6hK9822n6Lrgq2bcH2+bRxAqwylzQtBSZIIO7ASpexy3UlslwEViJOY2kGKAboFydua5xuPUdaUm4VPHtFHJlvZKpXjvqj+KjhM9/2urowTMBPHm/O+uFEoA1WaKZutuW3woHinuyu65UxNo90fpRSIKNA3Mspk9cTOTpC5hhR7vajZX7WwnNKM67ZJ/98VbuNcKum+P0kS9Hq95w4ePPjuoUOH5Hrk//MCwPn5eQUAh44elcfm59Wrjz7yxdFoNBPJrNjKyqAUaCIThHK9hMikFjrbMJ2onB5KudGgaKFsrjts6iHkFXApJrYat9VjQQASAlEUOcHzhscqBYzEzI7fE2tXg9n8iOPY8b+yB8W8ds0CShyGvZV7DyGO46kKUWaGlBJLS0vD4XDYz73QeQKV6HrUMh3Lem1gUkokSTLmRltB1VGaIk1TCCHKtEF62/V1miSJ5zRlfsfb9xo1kjG38mLZXHA3OnOJu/U0jTtbd6lFkYSUkqWQNBgOrl66dOnEWAKn5R2tURRl4ztFUkpBSgkppy66IXL509T3mZlk1e0hIvR6PSRJ0shn399omJP2etHBTNv122YPazMnQ5/r71dK8ezsLK2srJw/ffr0/+7Zs+duZh4OBoPhjh079l28ePGVc+fOnd+4ceOGu++++z4iivr9/sUtW7bc1e/3L0dRNBtFkZRSbnjppZd+1OvN9Xbu3L5DKYW5ubmtV69ef3fbtjv2LC0t3QCgZmdn7zh16tTJwWAw+vjHP75327Ztdy8vL18DkAohpBBCKKXU7Ozs9itXrpw+c+bMmZ079+yMYyFnZ2e3KKXSTZs27ej3+5fm5uZ23bhx4929e/d+9ty5cyfOnj17avfu3R+76667PkNEcmVl5YOtW7fuPn369PFdu3Y9cPny5Vd27Nhx3+XL77+6efPGXUtLS1dv3rx5ZfPmzbuXlpbe27Vr12c2bNiw4Z133nl5ZmZmLkmSLcycbtu2bcfFixffPn/+/Buf/OQnf1VKOTsajZZmZ+fulJJw4cKFk3Nzczu3bdu248qVKxcvXrz4xrVr196LokgppSa6PphZbdmyZfOnPvWpN5mZ1lP75wDAgk6ePEkAMPxw+MtSyheGw+HFubm5Oz/xiU/8ulKKhRQ0Go4u9/v948xMPGHDtRACxUBLKTE3NzfVjbJYXLOzs9MWjBxFEaVp+r6UJDZs2LB1NEqZaHJeU8zMURRRv7/0/tmzbz8vpfxACEFKVVEBRR/TNA2ChbrPber1etjzsY8BSlXfkQBSuL/rfxdD7fvM05Y4jrF3715jfkxqvhU0Go14y5Yt1O/3X37++efP9no9iuN4aoty48aNAIB+vz/Vhb5nzx7s37+/elBUt9Es1+/3yzbZz8+fP49NmzYF67hx4wY2bdpk1jNFWq967r33Xv3PZSK6iY466qijCdP8/Py6AsD/B2IKhgz6kY7GAAAAAElFTkSuQmCC";
  }
});

// ../netlify/functions/lib/docEmail.mjs
function docsUrl(key2) {
  return `${SITE2}/.netlify/functions/docs?key=${encodeURIComponent(key2)}`;
}
function decodePdfB64(b64) {
  const raw = String(b64 || "").replace(/^data:[^;]*;base64,/, "").trim();
  if (!raw) return null;
  const buf = Buffer.from(raw, "base64");
  return buf.length > 4 && buf.slice(0, 4).toString("latin1") === "%PDF" ? buf : null;
}
async function sendDocEmail({
  job,
  kind = "invoice",
  to,
  includePaymentLink = true,
  pdfB64,
  filename: filenameIn,
  message = "",
  probe = false,
  officeOnly = false
}) {
  const email = String(to || job?.email || "").trim();
  if (probe) {
    const apiKey2 = String(process.env.RESEND_API_KEY || "").trim();
    const testMode2 = isEmailTestMode();
    return {
      ok: true,
      probe: true,
      hasResendKey: !!apiKey2,
      testMode: testMode2,
      from: resolveFromAddress(),
      wouldSendTo: officeOnly ? OFFICE_EMAIL : resolveRecipient(email) || "(unset)",
      testEmailConfigured: !!String(process.env.PAYMENT_CONFIRM_TEST_EMAIL || "").trim()
    };
  }
  if (!email && !officeOnly) return { ok: false, reason: "no_recipient" };
  const docData = mapJobToQbDocData(job, kind);
  let pdfBuffer = decodePdfB64(pdfB64);
  let docKey = "";
  if (!pdfBuffer) {
    return { ok: false, reason: pdfB64 ? "bad_client_pdf" : "pdf_required" };
  }
  const isInvoice = kind === "invoice";
  const docWord = isInvoice ? "Invoice" : "Estimate";
  const viewLink = docKey ? docsUrl(docKey) : "";
  let payLink;
  if (isInvoice && includePaymentLink && docData.amountDue > 0.01) {
    payLink = buildPayLink({
      amount: docData.amountDue,
      invoiceNumber: docData.docNumber,
      customerName: docData.billTo.name,
      customerEmail: email
    });
  }
  const customTop = String(message || "").trim();
  const defaultPayTop = isInvoice && payLink ? `You can pay this invoice securely online:
${payLink}

Thank you \u2014 BLZ Electric` : void 0;
  const html = buildEmailHTML({
    ...docData,
    viewLink,
    payLink,
    logoSrc: "cid:companylogo",
    topMessage: customTop ? payLink ? `${customTop}

You can pay this invoice securely online:
${payLink}` : customTop : defaultPayTop,
    paymentMessage: isInvoice ? 'To make a payment, please follow one of these options:\n\nOnline Payment: Click the "View invoice" button in the email and pay via the provided credit card payment link.\n-Zelle: Send payment to Office@LeElectrical.us.\n-Check: Make checks payable to "BLZ Electric Inc." and either: Mail it or Email a clear picture of the check to Office@LeElectrical.us.' : void 0
  });
  const recipient = officeOnly ? OFFICE_EMAIL : resolveRecipient(email);
  const testMode = isEmailTestMode();
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = resolveFromAddress();
  const subject = `${docWord} #${docData.docNumber} from ${docData.company.name}`;
  const meta = {
    testMode,
    officeOnly,
    intendedTo: email || OFFICE_EMAIL,
    to: recipient || "(unset)",
    from,
    subject,
    kind,
    docNumber: docData.docNumber
  };
  if (!recipient) {
    return { ok: false, skipped: true, reason: testMode ? "test_email_unset" : "no_recipient", ...meta };
  }
  if (officeOnly && recipient.toLowerCase() !== OFFICE_EMAIL) {
    return { ok: false, skipped: true, reason: "office_only_guard", ...meta };
  }
  const pdfAttachB64 = pdfBuffer.toString("base64");
  const filename = filenameIn || docPdfFilename(kind, job, docData.docNumber);
  const text = `${docWord} ${docData.docNumber} from ${docData.company.name}
` + (isInvoice ? `Due ${docData.dueDate} \u2014 $${docData.amountDue}

` : `Total \u2014 $${docData.amountDue}

`) + (payLink ? `Pay online: ${payLink}

` : "") + (viewLink ? `View PDF: ${viewLink}` : "");
  if (!apiKey) {
    console.log("[doc-email] DRY-RUN (no RESEND_API_KEY)", JSON.stringify(meta));
    return { ok: false, dryRun: true, reason: "no_api_key", viewLink, payLink: payLink || "", ...meta };
  }
  const payload = {
    from: `${docData.company.name} <${from}>`,
    to: [recipient],
    subject: testMode ? `[TEST] ${subject}` : subject,
    html,
    text,
    attachments: [
      { filename, content: pdfAttachB64 },
      { filename: "logo.png", content: LOGO_PNG_BASE64, content_id: "companylogo" }
    ]
  };
  if (testMode && email !== recipient) {
    payload.headers = { "X-Intended-Recipient": email };
  }
  try {
    const res = await fetch(RESEND_URL2, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[doc-email] Resend error", res.status, body);
      return { ok: false, reason: "resend_error", status: res.status, error: body, ...meta };
    }
    console.log("[doc-email] SENT", JSON.stringify({ ...meta, resendId: body.id }));
    return { ok: true, sent: true, resendId: body.id, viewLink, payLink: payLink || "", docKey, ...meta };
  } catch (err) {
    console.error("[doc-email] fetch failed", err);
    return { ok: false, reason: "fetch_failed", error: String(err?.message || err), ...meta };
  }
}
var import_email_template, buildEmailHTML, buildPayLink, RESEND_URL2, SITE2, OFFICE_EMAIL;
var init_docEmail = __esm({
  "../netlify/functions/lib/docEmail.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_paymentConfirmEnv();
    init_jobToQbDoc();
    import_email_template = __toESM(require_email_template(), 1);
    init_logoBase64();
    ({ buildEmailHTML, buildPayLink } = import_email_template.default);
    RESEND_URL2 = "https://api.resend.com/emails";
    SITE2 = "https://leelectrical.us";
    OFFICE_EMAIL = "office@leelectrical.us";
    __name(docsUrl, "docsUrl");
    __name(decodePdfB64, "decodePdfB64");
    __name(sendDocEmail, "sendDocEmail");
  }
});

// ../netlify/functions/lib/statementEmailServer.mjs
function money(n) {
  return (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function decodePdfB642(b64) {
  const raw = String(b64 || "").replace(/^data:[^;]*;base64,/, "").trim();
  if (!raw) return null;
  const buf = Buffer.from(raw, "base64");
  return buf.length > 4 && buf.slice(0, 4).toString("latin1") === "%PDF" ? buf : null;
}
function buildStatementHtml(st) {
  const companyName = esc(st.company?.name || "BLZ Electric");
  const rows = (st.payRows || []).map(
    (r) => `<tr>
           <td style="padding:6px 0;border-bottom:1px solid #eee;font-size:13px;">Invoice #${esc(r.inv)}</td>
           <td style="padding:6px 0;border-bottom:1px solid #eee;font-size:13px;text-align:right;">$${money(r.amount)}</td>
           <td style="padding:6px 0 6px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:right;">
             <a href="${esc(r.url)}" style="color:${GREEN};font-weight:bold;text-decoration:none;">View &amp; Pay \u203A</a>
           </td>
         </tr>`
  ).join("");
  return `<!doctype html><html><body style="margin:0;background:#f6f7f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="max-width:600px;margin:0 auto;background:#fff;">
    <div style="background:${GREEN};padding:16px 24px;">
      <img src="cid:companylogo" alt="${companyName}" height="40" style="vertical-align:middle;" />
      <span style="color:#fff;font-weight:bold;font-size:16px;margin-left:10px;vertical-align:middle;">${companyName}</span>
    </div>
    <div style="padding:24px;">
      <h2 style="color:${GREEN};margin:0 0 4px;font-size:20px;">Account Statement</h2>
      <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">${esc(st.typeLabel || "")}${st.periodLabel ? " \xB7 " + esc(st.periodLabel) : ""}</p>
      <p style="font-size:14px;">Dear ${esc(st.billToName || "Customer")},</p>
      <p style="font-size:14px;">Your account statement is attached. Balance due:
        <b style="color:${GREEN};">$${money(st.totalDue || 0)}</b>.</p>
      ${rows ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;">
               <thead><tr>
                 <th style="text-align:left;font-size:11px;color:#9ca3af;border-bottom:2px solid ${GREEN};padding-bottom:4px;">INVOICE</th>
                 <th style="text-align:right;font-size:11px;color:#9ca3af;border-bottom:2px solid ${GREEN};padding-bottom:4px;">BALANCE</th>
                 <th style="text-align:right;font-size:11px;color:#9ca3af;border-bottom:2px solid ${GREEN};padding-bottom:4px;"></th>
               </tr></thead>
               <tbody>${rows}</tbody>
             </table>
             <p style="font-size:12px;color:#6b7280;">Each invoice in the attached PDF is also individually clickable to view and pay.</p>` : `<p style="font-size:13px;color:#6b7280;">See the attached PDF for full details.</p>`}
      <p style="font-size:13px;color:#6b7280;margin-top:20px;">Questions? Reply to this email or call us anytime.<br/>Thank you \u2014 ${companyName}</p>
    </div>
  </div></body></html>`;
}
async function sendStatementEmail({ to, officeOnly = false, probe = false, pdfB64, filename, statement = {} }) {
  const email = String(to || statement.email || "").trim();
  if (probe) {
    const apiKey2 = String(process.env.RESEND_API_KEY || "").trim();
    return {
      ok: true,
      probe: true,
      hasResendKey: !!apiKey2,
      testMode: isEmailTestMode(),
      from: resolveFromAddress(),
      wouldSendTo: officeOnly ? OFFICE_EMAIL2 : resolveRecipient(email) || "(unset)",
      kind: "statement"
    };
  }
  const pdfBuffer = decodePdfB642(pdfB64);
  if (!pdfBuffer) return { ok: false, reason: pdfB64 ? "bad_client_pdf" : "pdf_required", kind: "statement" };
  const recipient = officeOnly ? OFFICE_EMAIL2 : resolveRecipient(email);
  const testMode = isEmailTestMode();
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = resolveFromAddress();
  const companyName = statement.company?.name || "BLZ Electric";
  const subject = statement.subject || `Statement from ${companyName} \u2014 $${money(statement.totalDue || 0)} due`;
  const meta = {
    testMode,
    officeOnly,
    kind: "statement",
    intendedTo: email || OFFICE_EMAIL2,
    to: recipient || "(unset)",
    from,
    subject
  };
  if (!recipient) return { ok: false, skipped: true, reason: testMode ? "test_email_unset" : "no_recipient", ...meta };
  if (officeOnly && recipient.toLowerCase() !== OFFICE_EMAIL2) {
    return { ok: false, skipped: true, reason: "office_only_guard", ...meta };
  }
  const html = buildStatementHtml(statement);
  const text = `Account statement from ${companyName}
Balance due: $${money(statement.totalDue || 0)}

` + (statement.payRows || []).map((r) => `Invoice #${r.inv}: $${money(r.amount)} \u2014 ${r.url}`).join("\n");
  if (!apiKey) {
    console.log("[statement-email] DRY-RUN (no RESEND_API_KEY)", JSON.stringify(meta));
    return { ok: true, dryRun: true, reason: "no_api_key", ...meta };
  }
  const payload = {
    from: `${companyName} <${from}>`,
    to: [recipient],
    subject: testMode ? `[TEST] ${subject}` : subject,
    html,
    text,
    attachments: [
      { filename: filename || "Statement.pdf", content: pdfBuffer.toString("base64") },
      { filename: "logo.png", content: LOGO_PNG_BASE64, content_id: "companylogo" }
    ]
  };
  if (testMode && email && email !== recipient) payload.headers = { "X-Intended-Recipient": email };
  try {
    const res = await fetch(RESEND_URL3, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const bodyJson = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[statement-email] Resend error", res.status, bodyJson);
      return { ok: false, reason: "resend_error", status: res.status, error: bodyJson, ...meta };
    }
    console.log("[statement-email] SENT", JSON.stringify({ ...meta, resendId: bodyJson.id }));
    return { ok: true, sent: true, resendId: bodyJson.id, ...meta };
  } catch (err) {
    console.error("[statement-email] fetch failed", err);
    return { ok: false, reason: "fetch_failed", error: String(err?.message || err), ...meta };
  }
}
var RESEND_URL3, OFFICE_EMAIL2, GREEN;
var init_statementEmailServer = __esm({
  "../netlify/functions/lib/statementEmailServer.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_paymentConfirmEnv();
    init_logoBase64();
    RESEND_URL3 = "https://api.resend.com/emails";
    OFFICE_EMAIL2 = "office@leelectrical.us";
    GREEN = "#066a34";
    __name(money, "money");
    __name(esc, "esc");
    __name(decodePdfB642, "decodePdfB64");
    __name(buildStatementHtml, "buildStatementHtml");
    __name(sendStatementEmail, "sendStatementEmail");
  }
});

// ../netlify/functions/send-doc-email.mjs
function json18(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
var send_doc_email_default;
var init_send_doc_email = __esm({
  "../netlify/functions/send-doc-email.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_docEmail();
    init_statementEmailServer();
    __name(json18, "json");
    send_doc_email_default = /* @__PURE__ */ __name(async (req) => {
      if (req.method === "OPTIONS") return json18({ ok: true });
      if (req.method !== "POST") return json18({ ok: false, error: "POST only" }, 405);
      let body = {};
      try {
        body = await req.json();
      } catch {
        return json18({ ok: false, error: "invalid json" }, 400);
      }
      const kind = String(body.kind || "invoice").toLowerCase();
      if (kind !== "invoice" && kind !== "estimate" && kind !== "statement") {
        return json18({ ok: false, error: "bad kind" }, 400);
      }
      const job = body.job || {};
      const email = String(body.email || body.to || job.email || "").trim();
      const probe = body.probe === true || body.probe === 1;
      const officeOnly = body.officeOnly === true || body.officeOnly === 1;
      if (!email && !probe && !officeOnly) return json18({ ok: false, error: "missing email" }, 400);
      try {
        if (kind === "statement") {
          const result2 = await sendStatementEmail({
            to: email,
            officeOnly,
            probe,
            pdfB64: body.pdfB64 || body.pdfBase64 || "",
            filename: body.filename || "Statement.pdf",
            statement: body.statement || {}
          });
          return json18(result2, result2.ok ? 200 : 502);
        }
        const includePaymentLink = kind === "invoice" && body.includePaymentLink !== false && body.includePaymentLink !== 0;
        const result = await sendDocEmail({
          job,
          kind,
          to: email,
          includePaymentLink,
          pdfB64: body.pdfB64 || body.pdfBase64 || "",
          filename: body.filename || "",
          message: body.message || body.topMessage || "",
          probe,
          officeOnly
        });
        return json18(result, result.ok ? 200 : 502);
      } catch (err) {
        console.error("[send-doc-email]", err);
        return json18({ ok: false, error: String(err?.message || err) }, 500);
      }
    }, "default");
  }
});

// .netlify/functions/send-doc-email.js
var onRequest22;
var init_send_doc_email2 = __esm({
  ".netlify/functions/send-doc-email.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_send_doc_email();
    init_pagesAdapter();
    onRequest22 = toPagesFunction(send_doc_email_default);
  }
});

// ../netlify/functions/settings.mjs
function json19(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
function normalizeProfile(raw) {
  const p = { ...DEFAULT_PROFILE, ...raw && typeof raw === "object" ? raw : {} };
  p.paymentMethods = {
    ...DEFAULT_PROFILE.paymentMethods,
    ...p.paymentMethods && typeof p.paymentMethods === "object" ? p.paymentMethods : {}
  };
  return p;
}
function normalizeFeatures(raw) {
  return { ...DEFAULT_FEATURES, ...raw && typeof raw === "object" ? raw : {} };
}
async function load8(store) {
  const cur = await store.get(KEY10, { type: "json", consistency: "strong" }) || {};
  return {
    profile: normalizeProfile(cur.profile),
    features: normalizeFeatures(cur.features),
    updatedAt: cur.updatedAt || 0,
    ts: cur.ts || 0
  };
}
var KEY10, DEFAULT_PROFILE, DEFAULT_FEATURES, settings_default;
var init_settings = __esm({
  "../netlify/functions/settings.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    init_blob_backup();
    KEY10 = "tenant-settings-v1";
    DEFAULT_PROFILE = {
      companyName: "BLZ Electric Inc.",
      license: "Lic #11212",
      street: "383 Kingston Ave",
      cityStateZip: "Brooklyn, NY 11213",
      phone: "(718) 594-1850",
      email: "Office@LeElectrical.us",
      brandColor: "#2d8a3e",
      logoDataUrl: "",
      paymentMethods: { card: true, zelle: true, check: true },
      zelleInstructions: "Zelle: Send payment to Office@LeElectrical.us.",
      checkInstructions: 'Check: Make checks payable to "BLZ Electric Inc." and either mail it or email a clear picture to Office@LeElectrical.us.',
      payLinkBase: "https://secure.cardknox.com/blzelectric",
      emailFrom: "payments@leelectrical.us",
      defaultTerms: "Net 30",
      taxRate: 0,
      invoiceStart: "",
      estimateStart: "",
      calendarAccount: "office@leelectrical.us"
    };
    DEFAULT_FEATURES = {
      requisitions: true,
      timeTracking: true,
      changeOrders: true,
      estimates: true,
      statements: true,
      letterhead: true,
      quickbooks: true,
      calendar: true,
      reminders: true,
      progressDashboard: true,
      subCompanies: true,
      paymentCard: true,
      paymentZelle: true,
      paymentCheck: true,
      aiFeatures: true,
      speechToText: true
    };
    __name(json19, "json");
    __name(normalizeProfile, "normalizeProfile");
    __name(normalizeFeatures, "normalizeFeatures");
    __name(load8, "load");
    settings_default = /* @__PURE__ */ __name(async (req) => {
      const store = getStore2("settings");
      if (req.method === "OPTIONS") return json19({ ok: true });
      if (req.method === "POST") {
        let body = {};
        try {
          body = await req.json();
        } catch {
          body = {};
        }
        const cur = await load8(store);
        const next = {
          profile: normalizeProfile(body.profile != null ? body.profile : cur.profile),
          features: normalizeFeatures(body.features != null ? body.features : cur.features),
          updatedAt: Date.now(),
          ts: Date.now()
        };
        await rotateJsonBackup(store, KEY10, next);
        return json19({ ok: true, ...next });
      }
      return json19(await load8(store));
    }, "default");
  }
});

// .netlify/functions/settings.js
var onRequest23;
var init_settings2 = __esm({
  ".netlify/functions/settings.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_settings();
    init_pagesAdapter();
    onRequest23 = toPagesFunction(settings_default);
  }
});

// ../netlify/functions/sola-shared.mjs
function todayISO2() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function fmtAmt(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "";
  return v % 1 === 0 ? String(Math.round(v)) : v.toFixed(2);
}
function parseMoney(raw) {
  const n = parseFloat(String(raw || "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function fmtMoney(n) {
  return n % 1 ? "$" + n.toFixed(2) : "$" + Math.round(n);
}
function normalizeCardMethod(raw) {
  const s = String(raw || "").trim();
  if (!s || /^card$/i.test(s)) return "Credit card";
  if (/^visa$|^mastercard$|^mc$|^amex$|^discover$/i.test(s)) return "Credit card";
  return s;
}
function chargeFromPrincipal(principal, includeFee = true) {
  const base = parseMoney(principal);
  if (!base) return 0;
  if (!includeFee) return base;
  return Math.round(base * (1 + FEE_RATE) * 100) / 100;
}
function normalizePayments(job) {
  const list = Array.isArray(job?.payments) ? job.payments.map((p) => ({ ...p })) : [];
  const legacy = job?.payment;
  if (legacy && (legacy.amount || legacy.method || legacy.ref)) {
    const lid = legacy.id || "legacy-" + (legacy.date || legacy.ref || "0");
    if (!list.some((p) => p.id === lid)) list.push({ ...legacy, id: lid });
  }
  return list.filter((p) => parseMoney(p.amount) > 0 || p.method || p.ref);
}
function owedAtStart(job, payments) {
  if (job?.paymentBaseline != null && job.paymentBaseline !== "") return parseMoney(job.paymentBaseline);
  const paidSum = payments.reduce((s, p) => s + parseMoney(p.amount), 0);
  const curOpen = job?.openBalance != null && job.openBalance !== "" ? parseMoney(job.openBalance) : null;
  if (curOpen != null && paidSum > 0) return curOpen + paidSum;
  const hay = [job?.notes, job?.followUp?.text].filter(Boolean).join(" ");
  const m = hay.match(/(?:open\s*balance|balance\s*due|balance|owes?|remaining)\D{0,8}\$?\s*([\d,]+(?:\.\d+)?)/i);
  if (m) return parseMoney(m[1]);
  return parseMoney(job?.amount) || parseMoney(job?.openBalance);
}
async function findJobId(invoiceNo, jobHint) {
  const hint = String(jobHint || "").trim();
  if (hint) return hint;
  const store = getStore2("jobsdata");
  const doc = await store.get(JOBS_KEY2, { type: "json", consistency: "strong" }) || {};
  const inv = String(invoiceNo || "").trim();
  const job = (doc.jobs || []).find((j) => String(j.invoiceNo || "").trim() === inv);
  return job?.id || "";
}
async function loadJobEmail(jobId, invoiceNo) {
  const jobsStore = getStore2("jobsdata");
  const stateStore = getStore2("jobstate");
  const jobsDoc = await jobsStore.get(JOBS_KEY2, { type: "json", consistency: "strong" }) || { jobs: [] };
  let job = (jobsDoc.jobs || []).find((j) => String(j.id) === String(jobId)) || (jobsDoc.jobs || []).find((j) => String(j.invoiceNo || "").trim() === String(invoiceNo || "").trim()) || {};
  const cur = await stateStore.get(STATE_KEY2, { type: "json", consistency: "strong" }) || { ov: {} };
  const ov = (cur.ov || {})[job.id] || {};
  return String(ov.email || job.email || "").trim();
}
async function enqueueRecordPayment({ jobId, invoiceNo, amount, ref: ref2, method, note }) {
  const store = getStore2("commands");
  const doc = await store.get(COMMANDS_KEY2, { type: "json", consistency: "strong" }) || { commands: [], seq: 0, ts: 0 };
  const idk = ref2 ? `sola-pay:${invoiceNo}:${ref2}` : `sola-pay:${invoiceNo}:${amount}`;
  const existing = (doc.commands || []).find(
    (c) => c.idempotencyKey === idk && c.status !== "failed"
  );
  if (existing) return { deduped: true, command: existing };
  const email = await loadJobEmail(jobId, invoiceNo);
  const now = Date.now();
  doc.seq = (doc.seq || 0) + 1;
  const command = {
    id: "c" + now + Math.random().toString(36).slice(2, 6),
    num: doc.seq,
    type: "record_payment",
    jobId: jobId || "",
    lane: "deterministic",
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    payload: {
      invoiceNo: String(invoiceNo),
      amount: fmtAmt(amount),
      method: normalizeCardMethod(method),
      ref: ref2 || "",
      date: todayISO2(),
      note: note || "Sola card payment",
      email,
      sendReceipt: true
    },
    idempotencyKey: idk,
    createdAt: now,
    updatedAt: now,
    result: null,
    error: null,
    escalatedAt: 0,
    audit: [{ ts: now, status: "queued", note: "sola-payment" }]
  };
  doc.commands = doc.commands || [];
  doc.commands.push(command);
  doc.ts = now;
  await store.setJSON(COMMANDS_KEY2, doc);
  return { deduped: false, command };
}
async function patchJobPayment(jobId, amount, ref2, method) {
  if (!jobId) return;
  const jobsStore = getStore2("jobsdata");
  const stateStore = getStore2("jobstate");
  const jobsDoc = await jobsStore.get(JOBS_KEY2, { type: "json", consistency: "strong" }) || { jobs: [] };
  const baseJob = (jobsDoc.jobs || []).find((j) => String(j.id) === String(jobId)) || {};
  const cur = await stateStore.get(STATE_KEY2, { type: "json", consistency: "strong" }) || { ov: {}, ts: 0 };
  const ov = cur.ov || {};
  const prev = ov[jobId] || {};
  const merged = { ...baseJob, ...prev };
  const payId = ref2 ? "sola-" + ref2 : "sola-" + Date.now();
  const existing = normalizePayments(merged);
  if (existing.some((p) => p.id === payId)) return;
  const entry = {
    id: payId,
    amount: fmtMoney(amount),
    method: normalizeCardMethod(method),
    ref: ref2 || "",
    date: todayISO2(),
    recorded: false,
    source: "sola"
  };
  const list = [...existing, entry];
  const owed = owedAtStart(merged, list);
  const paidSum = list.reduce((s, p) => s + parseMoney(p.amount), 0);
  const remaining = Math.max(0, owed - paidSum);
  const fullPay = remaining <= 0.01;
  const latest = list.slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))).pop();
  const patch = {
    ...prev,
    payments: list,
    paymentBaseline: prev.paymentBaseline != null ? prev.paymentBaseline : owed,
    openBalance: fullPay ? 0 : remaining,
    paid: fullPay,
    payment: latest || null,
    status: fullPay ? { Paid: { s: "done", d: entry.date }, "Follow-up": { s: "done", d: entry.date } } : { Paid: { s: "" }, "Follow-up": { s: "" } }
  };
  ov[jobId] = patch;
  await stateStore.setJSON(STATE_KEY2, { ov, ts: Date.now() });
}
async function patchJobCardOnFile(jobId, cardToken, cardMasked) {
  if (!jobId || !cardToken) return;
  const stateStore = getStore2("jobstate");
  const cur = await stateStore.get(STATE_KEY2, { type: "json", consistency: "strong" }) || { ov: {}, ts: 0 };
  const ov = cur.ov || {};
  ov[jobId] = {
    ...ov[jobId] || {},
    solaCardToken: cardToken,
    solaCardMasked: cardMasked || ov[jobId]?.solaCardMasked || ""
  };
  await stateStore.setJSON(STATE_KEY2, { ov, ts: Date.now() });
}
async function applyApprovedSolaPayment({
  jobId,
  invoiceNo,
  amount,
  ref: ref2,
  method,
  note,
  cardToken,
  cardMasked
}) {
  const jid = jobId || await findJobId(invoiceNo, jobId);
  await enqueueRecordPayment({ jobId: jid, invoiceNo, amount, ref: ref2, method, note });
  await patchJobPayment(jid, amount, ref2, method);
  if (cardToken) await patchJobCardOnFile(jid, cardToken, cardMasked);
  return jid;
}
var COMMANDS_KEY2, JOBS_KEY2, STATE_KEY2, FEE_RATE;
var init_sola_shared = __esm({
  "../netlify/functions/sola-shared.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    COMMANDS_KEY2 = "commands-v1";
    JOBS_KEY2 = "jobsdata-v1";
    STATE_KEY2 = "ov-v1";
    FEE_RATE = 0.035;
    __name(todayISO2, "todayISO");
    __name(fmtAmt, "fmtAmt");
    __name(parseMoney, "parseMoney");
    __name(fmtMoney, "fmtMoney");
    __name(normalizeCardMethod, "normalizeCardMethod");
    __name(chargeFromPrincipal, "chargeFromPrincipal");
    __name(normalizePayments, "normalizePayments");
    __name(owedAtStart, "owedAtStart");
    __name(findJobId, "findJobId");
    __name(loadJobEmail, "loadJobEmail");
    __name(enqueueRecordPayment, "enqueueRecordPayment");
    __name(patchJobPayment, "patchJobPayment");
    __name(patchJobCardOnFile, "patchJobCardOnFile");
    __name(applyApprovedSolaPayment, "applyApprovedSolaPayment");
  }
});

// ../netlify/functions/lib/paymentConfirmEmail.mjs
function parseMoney2(raw) {
  const n = parseFloat(String(raw ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function fmtMoneyPrecise(v) {
  const n = typeof v === "number" ? v : parseMoney2(v);
  if (n == null || Number.isNaN(n)) return "";
  const abs = Math.abs(n);
  const str = abs % 1 === 0 ? "$" + Math.round(abs).toLocaleString("en-US") : "$" + abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? "-" + str : str;
}
function fmtBalanceNow(bal) {
  if (bal == null || Number.isNaN(bal)) return "";
  if (bal <= 0.01) return "Paid in full";
  return fmtMoneyPrecise(bal);
}
function fmtPayDate(iso) {
  const d = iso ? /* @__PURE__ */ new Date(iso + "T12:00:00") : /* @__PURE__ */ new Date();
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
function buildPaymentConfirmEmail({
  firstName = "there",
  invoiceNo = "",
  amountPaid: amountPaid2,
  balanceNow,
  payDate
}) {
  const inv = String(invoiceNo || "").trim();
  const amt = fmtMoneyPrecise(amountPaid2);
  const balance = fmtBalanceNow(balanceNow);
  const dateStr = fmtPayDate(payDate);
  const balanceClass = balanceNow != null && balanceNow <= 0.01 ? "#047857" : "#0f172a";
  const subject = inv ? `Payment received \u2014 Invoice #${inv} \u2014 ${COMPANY2}` : `Payment received \u2014 ${COMPANY2}`;
  const receiptRows = [
    inv ? `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Invoice</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a;font-size:14px;">#${escapeHtml(inv)}</td></tr>` : "",
    amt ? `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Amount paid</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#2563eb;font-size:16px;">${escapeHtml(amt)}</td></tr>` : "",
    `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;">Date</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0f172a;font-size:14px;">${escapeHtml(dateStr)}</td></tr>`,
    balance ? `<tr><td style="padding:10px 0 6px;border-top:1px solid #e2e8f0;color:#334155;font-weight:600;font-size:14px;">Balance now</td><td style="padding:10px 0 6px;border-top:1px solid #e2e8f0;text-align:right;font-weight:800;color:${balanceClass};font-size:16px;">${escapeHtml(balance)}</td></tr>` : ""
  ].filter(Boolean).join("");
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.08);">
        <tr><td style="background:#ffffff;border-bottom:1px solid #e2e8f0;padding:28px 24px;text-align:center;">
          <img src="${LOGO}" alt="${COMPANY2}" width="200" style="display:block;margin:0 auto 16px;max-width:100%;height:auto;" />
          <div style="font-size:20px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;">${COMPANY2}</div>
          <div style="font-size:13px;color:#64748b;margin-top:4px;">${TAGLINE}</div>
        </td></tr>
        <tr><td style="padding:28px 24px;text-align:center;">
          <div style="font-size:42px;line-height:1;margin-bottom:12px;color:#16a34a;">\u2713</div>
          <h1 style="margin:0 0 20px;font-size:20px;font-weight:800;color:#0f172a;">Payment received</h1>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:4px 16px;margin-bottom:20px;">
            ${receiptRows}
          </table>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">
            Thank you. Your payment is being applied to your invoice and will appear in our records shortly.
          </p>
        </td></tr>
        <tr><td style="padding:16px 24px 24px;text-align:center;font-size:11px;color:#64748b;">
          <a href="${SITE3}" style="color:#64748b;text-decoration:none;">leelectrical.us</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  const text = [
    `Hi ${firstName},`,
    "",
    "Payment received \u2014 thank you.",
    inv ? `Invoice #${inv}` : "",
    amt ? `Amount paid: ${amt}` : "",
    `Date: ${dateStr}`,
    balance ? `Balance now: ${balance}` : "",
    "",
    "Your payment is being applied to your invoice.",
    "",
    COMPANY2,
    SITE3
  ].filter(Boolean).join("\n");
  return { subject, html, text, company: COMPANY2 };
}
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
var SITE3, LOGO, PAYMENT_CONFIRM_COMPANY, COMPANY2, TAGLINE;
var init_paymentConfirmEmail = __esm({
  "../netlify/functions/lib/paymentConfirmEmail.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    SITE3 = "https://leelectrical.us";
    LOGO = `${SITE3}/app/pro/le-logo.png?v=5`;
    PAYMENT_CONFIRM_COMPANY = "BLZ Electric";
    COMPANY2 = PAYMENT_CONFIRM_COMPANY;
    TAGLINE = "Brooklyn, NY \xB7 Licensed & insured";
    __name(parseMoney2, "parseMoney");
    __name(fmtMoneyPrecise, "fmtMoneyPrecise");
    __name(fmtBalanceNow, "fmtBalanceNow");
    __name(fmtPayDate, "fmtPayDate");
    __name(buildPaymentConfirmEmail, "buildPaymentConfirmEmail");
    __name(escapeHtml, "escapeHtml");
  }
});

// ../netlify/functions/payment-confirm-email.mjs
function parseMoney3(raw) {
  const n = parseFloat(String(raw ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}
async function loadJob(jobId) {
  if (!jobId) return null;
  const jobsStore = getStore2("jobsdata");
  const stateStore = getStore2("jobstate");
  const jobsDoc = await jobsStore.get(JOBS_KEY3, { type: "json", consistency: "strong" }) || { jobs: [] };
  const baseJob = (jobsDoc.jobs || []).find((j) => String(j.id) === String(jobId)) || {};
  const cur = await stateStore.get(STATE_KEY3, { type: "json", consistency: "strong" }) || { ov: {}, ts: 0 };
  return { ...baseJob, ...(cur.ov || {})[jobId] };
}
async function loadJobContact(jobId) {
  const merged = await loadJob(jobId) || {};
  const customer = String(merged.customer || "").trim();
  const email = String(merged.email || "").trim();
  const first = customer.split(/\s+/)[0] || "there";
  return { email, first, customer };
}
async function loadJobBalance(jobId) {
  const merged = await loadJob(jobId);
  if (!merged) return null;
  if (merged.paid) return 0;
  return parseMoney3(merged.openBalance);
}
async function alreadySent(idempotencyKey) {
  if (!idempotencyKey) return false;
  const store = getStore2("commands");
  const doc = await store.get(SENT_KEY, { type: "json" }) || { sent: {} };
  return Boolean(doc.sent?.[idempotencyKey]);
}
async function markSent(idempotencyKey, meta) {
  if (!idempotencyKey) return;
  const store = getStore2("commands");
  const doc = await store.get(SENT_KEY, { type: "json" }) || { sent: {} };
  doc.sent = doc.sent || {};
  doc.sent[idempotencyKey] = { ...meta, ts: Date.now() };
  await store.setJSON(SENT_KEY, doc);
}
async function sendPaymentConfirmEmail({
  jobId,
  invoiceNo,
  amount,
  balance,
  ref: ref2,
  payDate
}) {
  const idk = ref2 ? `pay-confirm:${invoiceNo}:${ref2}` : `pay-confirm:${invoiceNo}:${amount}:${payDate || "nodate"}`;
  if (await alreadySent(idk)) {
    return { ok: true, skipped: true, reason: "deduped", idempotencyKey: idk };
  }
  const { email: customerEmail, first } = await loadJobContact(jobId);
  const balanceNow = balance != null && balance !== "" ? Number(balance) : await loadJobBalance(jobId);
  const to = resolveRecipient(customerEmail);
  const testMode = isEmailTestMode();
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = resolveFromAddress();
  const { subject, html, text } = buildPaymentConfirmEmail({
    firstName: first,
    invoiceNo,
    amountPaid: amount,
    balanceNow,
    payDate
  });
  const meta = {
    testMode,
    intendedTo: customerEmail || "(no email on job)",
    to: to || "(unset)",
    invoiceNo,
    amount,
    balance: balanceNow,
    ref: ref2 || "",
    from
  };
  if (!to) {
    console.log("[payment-confirm-email] SKIP no recipient", JSON.stringify(meta));
    return { ok: false, skipped: true, reason: testMode ? "test_email_unset" : "no_customer_email", ...meta };
  }
  if (!customerEmail && !testMode) {
    console.log("[payment-confirm-email] SKIP no customer email on job", JSON.stringify(meta));
    return { ok: false, skipped: true, reason: "no_customer_email", ...meta };
  }
  if (!apiKey) {
    console.log("[payment-confirm-email] DRY-RUN (no RESEND_API_KEY)", JSON.stringify({ ...meta, subject }));
    await markSent(idk, { ...meta, dryRun: true });
    return { ok: true, dryRun: true, reason: "no_api_key", subject, ...meta };
  }
  const payload = {
    from: `${PAYMENT_CONFIRM_COMPANY} <${from}>`,
    to: [to],
    subject: testMode ? `[TEST] ${subject}` : subject,
    html,
    text
  };
  if (testMode && customerEmail && customerEmail !== to) {
    payload.headers = { "X-Intended-Recipient": customerEmail };
  }
  try {
    const res = await fetch(RESEND_URL4, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[payment-confirm-email] Resend error", res.status, body);
      return { ok: false, reason: "resend_error", status: res.status, error: body, ...meta };
    }
    await markSent(idk, { ...meta, resendId: body.id || "" });
    console.log("[payment-confirm-email] SENT", JSON.stringify({ ...meta, resendId: body.id }));
    return { ok: true, sent: true, resendId: body.id, ...meta };
  } catch (err) {
    console.error("[payment-confirm-email] fetch failed", err);
    return { ok: false, reason: "fetch_failed", error: String(err?.message || err), ...meta };
  }
}
var JOBS_KEY3, STATE_KEY3, SENT_KEY, RESEND_URL4;
var init_payment_confirm_email = __esm({
  "../netlify/functions/payment-confirm-email.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    init_paymentConfirmEmail();
    init_paymentConfirmEnv();
    JOBS_KEY3 = "jobsdata-v1";
    STATE_KEY3 = "ov-v1";
    SENT_KEY = "payment-confirm-sent-v1";
    RESEND_URL4 = "https://api.resend.com/emails";
    __name(parseMoney3, "parseMoney");
    __name(loadJob, "loadJob");
    __name(loadJobContact, "loadJobContact");
    __name(loadJobBalance, "loadJobBalance");
    __name(alreadySent, "alreadySent");
    __name(markSent, "markSent");
    __name(sendPaymentConfirmEmail, "sendPaymentConfirmEmail");
  }
});

// ../netlify/functions/sola-keys.mjs
function solaEnvironment() {
  const env2 = String(process.env.SOLA_ENV || "production").trim().toLowerCase();
  return env2 === "dev" || env2 === "sandbox" || env2 === "test" ? "dev" : "production";
}
function merchantSlugFromKey(key2) {
  const k = String(key2 || "").trim().toLowerCase();
  if (!k) return "";
  const hit = KNOWN_MERCHANT_SLUGS.find((slug) => k.includes(slug));
  return hit || "";
}
function resolveIfieldsKey() {
  const isDev = solaEnvironment() === "dev";
  return isDev ? process.env.SOLA_IFIELDS_KEY_DEV || process.env.SOLA_IFIELDS_KEY || "" : process.env.SOLA_IFIELDS_KEY || "";
}
function resolveXKey() {
  const isDev = solaEnvironment() === "dev";
  return isDev ? process.env.SOLA_X_KEY_DEV || process.env.SOLA_X_KEY || "" : process.env.SOLA_X_KEY || "";
}
function keysLookPaired() {
  const ifields = resolveIfieldsKey();
  const xKey = resolveXKey();
  if (!ifields || !xKey) return false;
  const a = merchantSlugFromKey(ifields);
  const b = merchantSlugFromKey(xKey);
  return !!(a && b && a === b);
}
function sutMismatchHint(gatewayError) {
  const err = String(gatewayError || "");
  if (!/unauthorized token|invalid token|invalid xcardnum/i.test(err)) return "";
  if (!keysLookPaired()) {
    return " Card processing keys on the server may be mismatched \u2014 both Sola keys must be from the same merchant account.";
  }
  return " Try entering the card again (tokens expire quickly) or use Payment link instead.";
}
var KNOWN_MERCHANT_SLUGS;
var init_sola_keys = __esm({
  "../netlify/functions/sola-keys.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    __name(solaEnvironment, "solaEnvironment");
    KNOWN_MERCHANT_SLUGS = ["blzelectric", "lepaymentsdev", "lepaymendev"];
    __name(merchantSlugFromKey, "merchantSlugFromKey");
    __name(resolveIfieldsKey, "resolveIfieldsKey");
    __name(resolveXKey, "resolveXKey");
    __name(keysLookPaired, "keysLookPaired");
    __name(sutMismatchHint, "sutMismatchHint");
  }
});

// ../netlify/functions/sola-charge.mjs
function corsHeaders2() {
  return {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}
function json20(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders2() });
}
function normExp(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 4) return digits;
  if (digits.length === 6) return digits.slice(0, 4);
  return "";
}
async function solaSave(body) {
  const xKey = resolveXKey();
  if (!xKey) return { ok: false, error: "SOLA_X_KEY not configured on Netlify" };
  const payload = {
    xKey,
    xVersion: "5.0.0",
    xSoftwareName: "LE Pro",
    xSoftwareVersion: "1.0.0",
    xCommand: "cc:save",
    xCardNum: body.xCardNum,
    xCVV: body.xCVV || "",
    xExp: body.xExp,
    xInvoice: body.xInvoice || ""
  };
  const bill = body.billing || {};
  if (bill.name) payload.xBillLastName = bill.name;
  if (bill.email) payload.xEmail = bill.email;
  if (bill.street) payload.xBillStreet = bill.street;
  if (bill.zip) payload.xBillZip = bill.zip;
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: "Invalid save response from gateway" };
  }
  return { ok: true, data };
}
async function solaSale(body) {
  const xKey = resolveXKey();
  if (!xKey) {
    return { ok: false, error: "SOLA_X_KEY not configured on Netlify" };
  }
  const payload = {
    xKey,
    xVersion: "5.0.0",
    xSoftwareName: "LE Pro",
    xSoftwareVersion: "1.0.0",
    xCommand: "cc:sale",
    xAmount: body.xAmount,
    xCVV: body.xCVV || "",
    xExp: body.xExp || "",
    xInvoice: body.xInvoice,
    xCustom01: body.xCustom01 || "",
    xCustom02: body.xCustom02 || ""
  };
  if (body.xToken) payload.xToken = body.xToken;
  else payload.xCardNum = body.xCardNum;
  const bill = body.billing || {};
  if (bill.name) payload.xBillLastName = bill.name;
  if (bill.email) payload.xEmail = bill.email;
  if (bill.phone) payload.xBillPhone = bill.phone;
  if (bill.street) payload.xBillStreet = bill.street;
  if (bill.city) payload.xBillCity = bill.city;
  if (bill.state) payload.xBillState = bill.state;
  if (bill.zip) payload.xBillZip = bill.zip;
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: "Invalid response from payment gateway" };
  }
  return { ok: true, data };
}
var GATEWAY, sola_charge_default;
var init_sola_charge = __esm({
  "../netlify/functions/sola-charge.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_sola_shared();
    init_payment_confirm_email();
    init_sola_keys();
    GATEWAY = "https://x1.cardknox.com/gatewayjson";
    __name(corsHeaders2, "corsHeaders");
    __name(json20, "json");
    __name(normExp, "normExp");
    __name(solaSave, "solaSave");
    __name(solaSale, "solaSale");
    sola_charge_default = /* @__PURE__ */ __name(async (req) => {
      if (req.method === "OPTIONS") return json20({ ok: true });
      if (req.method !== "POST") return json20({ ok: false, error: "POST only" }, 405);
      let body = {};
      try {
        body = await req.json();
      } catch {
        return json20({ ok: false, error: "Invalid JSON body" }, 400);
      }
      const invoiceNo = String(body.invoiceNo || "").trim();
      const jobId = String(body.jobId || "").trim();
      const principal = parseMoney(body.principalAmount ?? body.amount);
      const includeFee = body.includeFee !== false && body.includeFee !== 0;
      const chargeAmount = chargeFromPrincipal(principal, includeFee);
      const saveOnFile = Boolean(body.saveOnFile);
      const xToken = String(body.xToken || "").trim();
      const xCardNum = String(body.xCardNum || "").trim();
      const xCVV = String(body.xCVV || "").trim();
      const xExp = normExp(body.xExp);
      if (!invoiceNo) return json20({ ok: false, error: "invoiceNo required" }, 400);
      if (principal <= 0) return json20({ ok: false, error: "Enter a payment amount" }, 400);
      if (!xToken && !xCardNum) return json20({ ok: false, error: "Card number required" }, 400);
      if (!xToken && (!xExp || xExp.length !== 4)) return json20({ ok: false, error: "Expiration must be MMYY" }, 400);
      const sale = await solaSale({
        xAmount: fmtAmt(chargeAmount),
        xCardNum: xToken ? "" : xCardNum,
        xCVV: xToken ? "" : xCVV,
        xExp: xToken ? "" : xExp,
        xToken,
        xInvoice: invoiceNo,
        xCustom01: fmtAmt(principal),
        xCustom02: jobId,
        billing: body.billing || {}
      });
      if (!sale.ok) return json20({ ok: false, error: sale.error }, 503);
      const data = sale.data || {};
      const result = String(data.xResult || "").toUpperCase();
      if (result === "V") {
        return json20({
          ok: false,
          error: "This card requires extra verification \u2014 use Payment link instead.",
          needs3ds: true,
          gateway: data
        }, 402);
      }
      if (result !== "A" && result !== "APPROVED") {
        const base = String(data.xError || data.xStatus || "Payment declined").slice(0, 200);
        const hint = sutMismatchHint(base);
        return json20({
          ok: false,
          error: (base + hint).slice(0, 280),
          gateway: data
        }, 402);
      }
      const ref2 = String(data.xRefNum || "").trim();
      const method = String(data.xCardType || data.xPaymentType || "Credit card").trim();
      let cardToken = String(data.xToken || "").trim();
      let cardMasked = String(data.xMaskedCardNumber || "").trim();
      if (saveOnFile && !cardToken && xCardNum && xExp) {
        const saved = await solaSave({
          xCardNum,
          xCVV,
          xExp,
          xInvoice: invoiceNo,
          billing: body.billing || {}
        });
        if (saved.ok) {
          const sd = saved.data || {};
          if (String(sd.xResult || "").toUpperCase() === "A" || String(sd.xStatus || "").toLowerCase() === "approved") {
            cardToken = String(sd.xToken || "").trim() || cardToken;
            cardMasked = String(sd.xMaskedCardNumber || "").trim() || cardMasked;
          }
        }
      }
      const appliedJobId = await applyApprovedSolaPayment({
        jobId,
        invoiceNo,
        amount: principal,
        ref: ref2,
        method,
        note: "LE Pro in-app card payment",
        cardToken: saveOnFile ? cardToken : "",
        cardMasked: saveOnFile ? cardMasked : ""
      });
      await sendPaymentConfirmEmail({
        jobId: appliedJobId || jobId,
        invoiceNo,
        amount: principal,
        ref: ref2,
        payDate: todayISO2()
      });
      return json20({
        ok: true,
        approved: true,
        amount: principal,
        chargeAmount,
        ref: ref2,
        method: method || "Credit card",
        cardType: data.xCardType || "",
        authCode: data.xAuthCode || "",
        cardToken: saveOnFile ? cardToken : "",
        cardMasked: saveOnFile ? cardMasked : ""
      });
    }, "default");
  }
});

// .netlify/functions/sola-charge.js
var onRequest24;
var init_sola_charge2 = __esm({
  ".netlify/functions/sola-charge.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_sola_charge();
    init_pagesAdapter();
    onRequest24 = toPagesFunction(sola_charge_default);
  }
});

// ../netlify/functions/sola-ifields-config.mjs
function corsHeaders3() {
  return {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}
function resolveKeys() {
  const ifieldsKey = resolveIfieldsKey();
  return { ifieldsKey, environment: solaEnvironment() === "dev" ? "dev" : "production" };
}
var IFIELDS_VERSION, sola_ifields_config_default;
var init_sola_ifields_config = __esm({
  "../netlify/functions/sola-ifields-config.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_sola_keys();
    IFIELDS_VERSION = "2.15.2409.2601";
    __name(corsHeaders3, "corsHeaders");
    __name(resolveKeys, "resolveKeys");
    sola_ifields_config_default = /* @__PURE__ */ __name(async (req) => {
      if (req.method === "OPTIONS") {
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders3() });
      }
      const { ifieldsKey, environment } = resolveKeys();
      if (!ifieldsKey) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "SOLA_IFIELDS_KEY not configured on Netlify"
          }),
          { status: 503, headers: corsHeaders3() }
        );
      }
      const achEnabled = String(process.env.SOLA_ACH_ENABLED || "").trim() === "1" || String(process.env.SOLA_ACH_ENABLED || "").trim().toLowerCase() === "true";
      return new Response(
        JSON.stringify({
          ok: true,
          ifieldsKey,
          version: IFIELDS_VERSION,
          environment,
          softwareName: "LE Pro",
          softwareVersion: "1.0.0",
          achEnabled
        }),
        { headers: corsHeaders3() }
      );
    }, "default");
  }
});

// .netlify/functions/sola-ifields-config.js
var onRequest25;
var init_sola_ifields_config2 = __esm({
  ".netlify/functions/sola-ifields-config.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_sola_ifields_config();
    init_pagesAdapter();
    onRequest25 = toPagesFunction(sola_ifields_config_default);
  }
});

// ../netlify/functions/sola-payment.mjs
function todayISO3() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
function fmtAmt2(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "";
  return v % 1 === 0 ? String(Math.round(v)) : v.toFixed(2);
}
async function parsePayload(req) {
  const url = new URL(req.url);
  const out = Object.fromEntries(url.searchParams.entries());
  if (req.method === "POST") {
    const ct = req.headers.get("content-type") || "";
    try {
      if (ct.includes("json")) {
        Object.assign(out, await req.json());
      } else {
        const fd = await req.formData();
        for (const [k, v] of fd.entries()) out[k] = String(v);
      }
    } catch {
    }
  }
  return out;
}
function approved(p) {
  const r = String(p.xResult || p.xresult || "").toUpperCase();
  const st = String(p.xStatus || "").toLowerCase();
  return r === "A" || r === "APPROVED" || st === "approved";
}
function principalAmount(p) {
  const custom = p.xCustom01 || p.xcustom01;
  if (custom) {
    const n = parseFloat(String(custom).replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
  }
  const auth = parseFloat(String(p.xAuthAmount || p.xAmount || "").replace(/[^0-9.]/g, ""));
  if (Number.isFinite(auth) && auth > 0) {
    return Math.round(auth / (1 + FEE_RATE2) * 100) / 100;
  }
  return 0;
}
async function findJobId2(invoiceNo, jobHint) {
  const hint = String(jobHint || "").trim();
  if (hint) return hint;
  const store = getStore2("jobsdata");
  const doc = await store.get(JOBS_KEY4, { type: "json", consistency: "strong" }) || {};
  const inv = String(invoiceNo || "").trim();
  const job = (doc.jobs || []).find((j) => String(j.invoiceNo || "").trim() === inv);
  return job?.id || "";
}
async function loadJobEmail2(jobId, invoiceNo) {
  const jobsStore = getStore2("jobsdata");
  const stateStore = getStore2("jobstate");
  const jobsDoc = await jobsStore.get(JOBS_KEY4, { type: "json", consistency: "strong" }) || { jobs: [] };
  let job = (jobsDoc.jobs || []).find((j) => String(j.id) === String(jobId)) || (jobsDoc.jobs || []).find((j) => String(j.invoiceNo || "").trim() === String(invoiceNo || "").trim()) || {};
  const cur = await stateStore.get(STATE_KEY4, { type: "json", consistency: "strong" }) || { ov: {} };
  const ov = (cur.ov || {})[job.id] || {};
  return String(ov.email || job.email || "").trim();
}
async function enqueueRecordPayment2({ jobId, invoiceNo, amount, ref: ref2, method }) {
  const store = getStore2("commands");
  const doc = await store.get(COMMANDS_KEY3, { type: "json", consistency: "strong" }) || { commands: [], seq: 0, ts: 0 };
  const idk = ref2 ? `sola-pay:${invoiceNo}:${ref2}` : `sola-pay:${invoiceNo}:${amount}`;
  const existing = (doc.commands || []).find(
    (c) => c.idempotencyKey === idk && c.status !== "failed"
  );
  if (existing) return { deduped: true, command: existing };
  const email = await loadJobEmail2(jobId, invoiceNo);
  const now = Date.now();
  doc.seq = (doc.seq || 0) + 1;
  const command = {
    id: "c" + now + Math.random().toString(36).slice(2, 6),
    num: doc.seq,
    type: "record_payment",
    jobId: jobId || "",
    lane: "deterministic",
    status: "queued",
    attempts: 0,
    maxAttempts: 3,
    payload: {
      invoiceNo: String(invoiceNo),
      amount: fmtAmt2(amount),
      method: normalizeCardMethod2(method),
      ref: ref2 || "",
      date: todayISO3(),
      note: "Sola online payment",
      email,
      sendReceipt: true
    },
    idempotencyKey: idk,
    createdAt: now,
    updatedAt: now,
    result: null,
    error: null,
    escalatedAt: 0,
    audit: [{ ts: now, status: "queued", note: "sola-payment" }]
  };
  doc.commands = doc.commands || [];
  doc.commands.push(command);
  doc.ts = now;
  await store.setJSON(COMMANDS_KEY3, doc);
  return { deduped: false, command };
}
function parseMoney4(raw) {
  const n = parseFloat(String(raw || "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function fmtMoney2(n) {
  return n % 1 ? "$" + n.toFixed(2) : "$" + Math.round(n);
}
function normalizeCardMethod2(raw) {
  const s = String(raw || "").trim();
  if (!s || /^card$/i.test(s)) return "Credit card";
  if (/^visa$|^mastercard$|^mc$|^amex$|^discover$/i.test(s)) return "Credit card";
  return s;
}
function normalizePayments2(job) {
  const list = Array.isArray(job?.payments) ? job.payments.map((p) => ({ ...p })) : [];
  const legacy = job?.payment;
  if (legacy && (legacy.amount || legacy.method || legacy.ref)) {
    const lid = legacy.id || "legacy-" + (legacy.date || legacy.ref || "0");
    if (!list.some((p) => p.id === lid)) list.push({ ...legacy, id: lid });
  }
  return list.filter((p) => parseMoney4(p.amount) > 0 || p.method || p.ref);
}
function owedAtStart2(job, payments) {
  if (job?.paymentBaseline != null && job.paymentBaseline !== "") return parseMoney4(job.paymentBaseline);
  const paidSum = payments.reduce((s, p) => s + parseMoney4(p.amount), 0);
  const curOpen = job?.openBalance != null && job.openBalance !== "" ? parseMoney4(job.openBalance) : null;
  if (curOpen != null && paidSum > 0) return curOpen + paidSum;
  const hay = [job?.notes, job?.followUp?.text].filter(Boolean).join(" ");
  const m = hay.match(/(?:open\s*balance|balance\s*due|balance|owes?|remaining)\D{0,8}\$?\s*([\d,]+(?:\.\d+)?)/i);
  if (m) return parseMoney4(m[1]);
  return parseMoney4(job?.amount) || parseMoney4(job?.openBalance);
}
async function patchJobPayment2(jobId, amount, ref2, method) {
  if (!jobId) return null;
  const jobsStore = getStore2("jobsdata");
  const stateStore = getStore2("jobstate");
  const jobsDoc = await jobsStore.get(JOBS_KEY4, { type: "json", consistency: "strong" }) || { jobs: [] };
  const baseJob = (jobsDoc.jobs || []).find((j) => String(j.id) === String(jobId)) || {};
  const cur = await stateStore.get(STATE_KEY4, { type: "json", consistency: "strong" }) || { ov: {}, ts: 0 };
  const ov = cur.ov || {};
  const prev = ov[jobId] || {};
  const merged = { ...baseJob, ...prev };
  const payId = ref2 ? "sola-" + ref2 : "sola-" + Date.now();
  const existing = normalizePayments2(merged);
  if (existing.some((p) => p.id === payId)) {
    const owed2 = owedAtStart2(merged, existing);
    const paidSum2 = existing.reduce((s, p) => s + parseMoney4(p.amount), 0);
    return Math.max(0, owed2 - paidSum2);
  }
  const entry = {
    id: payId,
    amount: fmtMoney2(amount),
    method: normalizeCardMethod2(method),
    ref: ref2 || "",
    date: todayISO3(),
    recorded: false,
    source: "sola"
  };
  const list = [...existing, entry];
  const owed = owedAtStart2(merged, list);
  const paidSum = list.reduce((s, p) => s + parseMoney4(p.amount), 0);
  const remaining = Math.max(0, owed - paidSum);
  const fullPay = remaining <= 0.01;
  const latest = list.slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))).pop();
  ov[jobId] = {
    ...prev,
    payments: list,
    paymentBaseline: prev.paymentBaseline != null ? prev.paymentBaseline : owed,
    openBalance: fullPay ? 0 : remaining,
    paid: fullPay,
    payment: latest || null,
    status: fullPay ? { Paid: { s: "done", d: entry.date }, "Follow-up": { s: "done", d: entry.date } } : { Paid: { s: "" }, "Follow-up": { s: "" } }
  };
  await stateStore.setJSON(STATE_KEY4, { ov, ts: Date.now() });
  return fullPay ? 0 : remaining;
}
function thanksRedirect(params) {
  const q = new URLSearchParams(params);
  return Response.redirect(`${THANKS}?${q}`, 302);
}
var COMMANDS_KEY3, JOBS_KEY4, STATE_KEY4, SITE4, THANKS, FEE_RATE2, sola_payment_default;
var init_sola_payment = __esm({
  "../netlify/functions/sola-payment.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    init_payment_confirm_email();
    COMMANDS_KEY3 = "commands-v1";
    JOBS_KEY4 = "jobsdata-v1";
    STATE_KEY4 = "ov-v1";
    SITE4 = "https://leelectrical.us";
    THANKS = `${SITE4}/app/pro/#/pay/thanks`;
    FEE_RATE2 = 0.035;
    __name(todayISO3, "todayISO");
    __name(fmtAmt2, "fmtAmt");
    __name(parsePayload, "parsePayload");
    __name(approved, "approved");
    __name(principalAmount, "principalAmount");
    __name(findJobId2, "findJobId");
    __name(loadJobEmail2, "loadJobEmail");
    __name(enqueueRecordPayment2, "enqueueRecordPayment");
    __name(parseMoney4, "parseMoney");
    __name(fmtMoney2, "fmtMoney");
    __name(normalizeCardMethod2, "normalizeCardMethod");
    __name(normalizePayments2, "normalizePayments");
    __name(owedAtStart2, "owedAtStart");
    __name(patchJobPayment2, "patchJobPayment");
    __name(thanksRedirect, "thanksRedirect");
    sola_payment_default = /* @__PURE__ */ __name(async (req) => {
      if (req.method === "OPTIONS") {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" }
        });
      }
      const p = await parsePayload(req);
      const invoiceNo = String(p.xinvoice || p.xInvoice || "").trim();
      const ref2 = String(p.xRefNum || p.xrefnum || "").trim();
      const method = String(p.xCardType || p.xPaymentType || "Card").trim();
      const isWebhook = req.method === "POST";
      if (!approved(p)) {
        if (isWebhook) return new Response("DECLINED", { status: 200 });
        return thanksRedirect({
          ok: "0",
          inv: invoiceNo,
          msg: String(p.xError || p.xStatus || "Payment not approved").slice(0, 120)
        });
      }
      const amount = principalAmount(p);
      if (!invoiceNo || amount <= 0) {
        if (isWebhook) return new Response("BAD REQUEST", { status: 400 });
        return thanksRedirect({ ok: "0", inv: invoiceNo, msg: "Missing invoice or amount" });
      }
      const jobId = await findJobId2(invoiceNo, p.xCustom02 || p.xcustom02);
      await enqueueRecordPayment2({ jobId, invoiceNo, amount, ref: ref2, method });
      const balance = await patchJobPayment2(jobId, amount, ref2, method);
      await sendPaymentConfirmEmail({
        jobId,
        invoiceNo,
        amount,
        balance,
        ref: ref2,
        payDate: todayISO3()
      });
      if (isWebhook) return new Response("OK", { status: 200 });
      const thanks = {
        ok: "1",
        inv: invoiceNo,
        amt: fmtAmt2(amount),
        ref: ref2
      };
      if (balance != null) thanks.bal = fmtAmt2(balance);
      return thanksRedirect(thanks);
    }, "default");
  }
});

// .netlify/functions/sola-payment.js
var onRequest26;
var init_sola_payment2 = __esm({
  ".netlify/functions/sola-payment.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_sola_payment();
    init_pagesAdapter();
    onRequest26 = toPagesFunction(sola_payment_default);
  }
});

// ../netlify/functions/state.mjs
function json21(o) {
  return new Response(JSON.stringify(o), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
var KEY11, state_default;
var init_state = __esm({
  "../netlify/functions/state.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    init_blob_backup();
    KEY11 = "ov-v1";
    __name(json21, "json");
    state_default = /* @__PURE__ */ __name(async (req) => {
      const store = getStore2("jobstate");
      if (req.method === "OPTIONS") return json21({ ok: true });
      if (req.method === "POST") {
        let body = {};
        try {
          body = await req.json();
        } catch (e) {
        }
        const ov = body.ov || {};
        const ts = Date.now();
        await rotateJsonBackup(store, KEY11, { ov, ts });
        return json21({ ok: true, ts });
      }
      const cur = await store.get(KEY11, { type: "json" }) || { ov: {}, ts: 0 };
      return json21(cur);
    }, "default");
  }
});

// .netlify/functions/state.js
var onRequest27;
var init_state2 = __esm({
  ".netlify/functions/state.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_state();
    init_pagesAdapter();
    onRequest27 = toPagesFunction(state_default);
  }
});

// ../netlify/functions/timetrack.mjs
function json22(o) {
  return new Response(JSON.stringify(o), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
function blankDoc() {
  return {
    employees: [{ id: "emp-levi", name: "Levi", color: COLORS[0], active: true }],
    active: {},
    entries: [],
    ts: 0
  };
}
async function load9(store) {
  const doc = await store.get(KEY12, { type: "json", consistency: "strong" }) || blankDoc();
  doc.employees = doc.employees || [];
  doc.active = doc.active || {};
  doc.entries = doc.entries || [];
  if (!doc.employees.length) doc.employees = blankDoc().employees;
  return doc;
}
function empName(doc, id) {
  const e = doc.employees.find((x) => x.id === id);
  return e ? e.name : "Unknown";
}
function closeActive(doc, employeeId, endedAt = Date.now()) {
  const sess = doc.active[employeeId];
  if (!sess) return null;
  const entry = {
    id: "ent-" + endedAt + "-" + Math.random().toString(36).slice(2, 6),
    employeeId,
    employeeName: empName(doc, employeeId),
    kind: sess.kind || "shift",
    jobId: sess.jobId || null,
    jobLabel: sess.jobLabel || "",
    startedAt: sess.startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - (sess.startedAt || endedAt)),
    note: sess.note || ""
  };
  doc.entries.unshift(entry);
  if (doc.entries.length > 500) doc.entries.length = 500;
  delete doc.active[employeeId];
  return entry;
}
var KEY12, COLORS, timetrack_default;
var init_timetrack = __esm({
  "../netlify/functions/timetrack.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_storage();
    KEY12 = "timetrack-v1";
    COLORS = ["#2563eb", "#059669", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#4f46e5"];
    __name(json22, "json");
    __name(blankDoc, "blankDoc");
    __name(load9, "load");
    __name(empName, "empName");
    __name(closeActive, "closeActive");
    timetrack_default = /* @__PURE__ */ __name(async (req) => {
      const store = getStore2("timetrack");
      if (req.method === "OPTIONS") return json22({ ok: true });
      if (req.method === "POST") {
        let b = {};
        try {
          b = await req.json();
        } catch (e) {
        }
        const doc = await load9(store);
        const now = Date.now();
        if (b.op === "clock_in") {
          const employeeId = String(b.employeeId || "").trim();
          if (!employeeId) return json22({ ok: false, error: "employee required" });
          const kind = b.kind === "job" ? "job" : "shift";
          if (doc.active[employeeId]) closeActive(doc, employeeId, now);
          doc.active[employeeId] = {
            id: "sess-" + now,
            kind,
            jobId: kind === "job" ? String(b.jobId || "").trim() || null : null,
            jobLabel: kind === "job" ? String(b.jobLabel || "").trim() : "",
            startedAt: now,
            note: String(b.note || "").trim(),
            lastSeen: now
          };
        } else if (b.op === "clock_out") {
          const employeeId = String(b.employeeId || "").trim();
          if (!employeeId || !doc.active[employeeId]) return json22({ ok: false, error: "not clocked in" });
          closeActive(doc, employeeId, now);
        } else if (b.op === "add_employee") {
          const name = String(b.name || "").trim();
          if (!name) return json22({ ok: false, error: "name required" });
          const id = "emp-" + now;
          doc.employees.push({
            id,
            name,
            color: COLORS[doc.employees.length % COLORS.length],
            active: true
          });
        } else if (b.op === "remove_employee") {
          const id = String(b.id || "").trim();
          if (!id || id === "emp-levi") return json22({ ok: false, error: "cannot remove" });
          if (doc.active[id]) return json22({ ok: false, error: "clocked in" });
          doc.employees = doc.employees.filter((e) => e.id !== id);
        } else if (b.op === "patch_entry") {
          const ent = doc.entries.find((x) => x.id === b.id);
          if (ent && b.patch) {
            const p = b.patch;
            if ("note" in p) ent.note = String(p.note || "");
            if ("kind" in p) ent.kind = p.kind === "job" ? "job" : "shift";
            if ("jobId" in p) ent.jobId = String(p.jobId || "").trim() || null;
            if ("jobLabel" in p) ent.jobLabel = String(p.jobLabel || "");
            if ("startedAt" in p) ent.startedAt = Number(p.startedAt) || ent.startedAt;
            if ("endedAt" in p) ent.endedAt = Number(p.endedAt) || ent.endedAt;
            if (ent.startedAt && ent.endedAt) {
              ent.durationMs = Math.max(0, ent.endedAt - ent.startedAt);
            }
          }
        } else if (b.op === "add_entry") {
          const employeeId = String(b.employeeId || "").trim();
          const startedAt = Number(b.startedAt);
          const endedAt = Number(b.endedAt);
          if (!employeeId || !startedAt || !endedAt || endedAt <= startedAt) {
            return json22({ ok: false, error: "invalid entry" });
          }
          const kind = b.kind === "job" ? "job" : "shift";
          doc.entries.unshift({
            id: "ent-" + now + "-" + Math.random().toString(36).slice(2, 6),
            employeeId,
            employeeName: empName(doc, employeeId),
            kind,
            jobId: kind === "job" ? String(b.jobId || "").trim() || null : null,
            jobLabel: kind === "job" ? String(b.jobLabel || "").trim() : "",
            startedAt,
            endedAt,
            durationMs: endedAt - startedAt,
            note: String(b.note || "").trim()
          });
          if (doc.entries.length > 500) doc.entries.length = 500;
        } else if (b.op === "delete_entry") {
          const rid = String(b.id || "").trim();
          if (!rid) return json22({ ok: false, error: "id required" });
          doc.entries = doc.entries.filter((x) => x.id !== rid);
        } else if (b.op === "heartbeat") {
          const employeeId = String(b.employeeId || "").trim();
          if (doc.active[employeeId]) doc.active[employeeId].lastSeen = now;
        } else {
          return json22({ ok: false, error: "bad op" });
        }
        doc.ts = now;
        await store.setJSON(KEY12, doc);
        return json22({ ok: true, ...doc });
      }
      return json22(await load9(store));
    }, "default");
  }
});

// .netlify/functions/timetrack.js
var onRequest28;
var init_timetrack2 = __esm({
  ".netlify/functions/timetrack.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_timetrack();
    init_pagesAdapter();
    onRequest28 = toPagesFunction(timetrack_default);
  }
});

// ../netlify/functions/lib/voicePolish.mjs
function needsSmartPolish(raw) {
  const t = String(raw || "").trim();
  if (t.length < 60) return false;
  const lower = t.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  if (words.length < 12) return false;
  for (let win = Math.min(10, Math.floor(words.length / 3)); win >= 5; win--) {
    for (let i = 0; i <= words.length - win * 2; i++) {
      const slice = words.slice(i, i + win).join(" ");
      const rest = words.slice(i + win).join(" ");
      if (slice.length > 18 && rest.includes(slice)) return true;
    }
  }
  if (/\b[1-6]\.\s/.test(t) && t.length > 120) return true;
  return t.length > 240;
}
async function rewriteVoiceDictation({ text, prePolished }) {
  const apiKey = process.env.XAI_API_KEY;
  const source = String(prePolished || text || "").trim();
  if (!source) return { ok: false, text: "", error: "empty" };
  if (!apiKey) return { dryRun: true, text: source, error: "XAI_API_KEY not set" };
  const model = process.env.XAI_VOICE_MODEL || process.env.XAI_CHAT_MODEL || "grok-3-mini";
  const r = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Raw dictation:
${String(text || "").trim()}

Rule-polished draft:
${source}`
        }
      ],
      temperature: 0.2,
      max_tokens: 1024
    })
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`xAI voice polish ${r.status}: ${err.slice(0, 200)}`);
  }
  const body = await r.json();
  const out = String(body?.choices?.[0]?.message?.content || "").trim();
  if (!out) throw new Error("Empty voice polish response");
  return { ok: true, text: out, model, dryRun: false };
}
var SYSTEM;
var init_voicePolish = __esm({
  "../netlify/functions/lib/voicePolish.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    SYSTEM = `You rewrite voice dictation for a professional electrical contractor messaging colleagues or customers.

The input is raw speech-to-text. It may repeat ideas, ramble, or list steps awkwardly.

Rules:
- Consolidate repetition \u2014 each idea appears once
- Friendly, clear, professional \u2014 for humans, not AI
- Use a short numbered list only when the speaker clearly listed separate steps
- Fix punctuation and capitalization
- Do NOT invent facts not in the input
- Preserve Hebrew if the input is Hebrew
- Return ONLY the polished text \u2014 no quotes, labels, or explanation`;
    __name(needsSmartPolish, "needsSmartPolish");
    __name(rewriteVoiceDictation, "rewriteVoiceDictation");
  }
});

// ../netlify/functions/voice-polish.mjs
function json23(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    }
  });
}
var voice_polish_default;
var init_voice_polish = __esm({
  "../netlify/functions/voice-polish.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_voicePolish();
    __name(json23, "json");
    voice_polish_default = /* @__PURE__ */ __name(async (req) => {
      if (req.method === "OPTIONS") return json23({ ok: true });
      if (req.method !== "POST") return json23({ ok: false, error: "POST only" }, 405);
      let body = {};
      try {
        body = await req.json();
      } catch {
        return json23({ ok: false, error: "invalid json" }, 400);
      }
      const raw = String(body.raw || "").trim();
      const prePolished = String(body.prePolished || body.text || "").trim();
      if (!prePolished && !raw) return json23({ ok: false, error: "empty" }, 400);
      try {
        const result = await rewriteVoiceDictation({ text: raw, prePolished });
        return json23({
          ok: true,
          text: result.text,
          smart: true,
          dryRun: !!result.dryRun,
          model: result.model || null,
          needsSmart: needsSmartPolish(raw || prePolished)
        });
      } catch (e) {
        return json23({
          ok: false,
          error: String(e?.message || e).slice(0, 300),
          fallback: prePolished
        });
      }
    }, "default");
  }
});

// .netlify/functions/voice-polish.js
var onRequest29;
var init_voice_polish2 = __esm({
  ".netlify/functions/voice-polish.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_voice_polish();
    init_pagesAdapter();
    onRequest29 = toPagesFunction(voice_polish_default);
  }
});

// ../netlify/functions/zelle-vision.mjs
function json24(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    }
  });
}
var zelle_vision_default;
var init_zelle_vision = __esm({
  "../netlify/functions/zelle-vision.mjs"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_paymentVision();
    __name(json24, "json");
    zelle_vision_default = /* @__PURE__ */ __name(async (req) => {
      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS" }
        });
      }
      if (req.method !== "POST") return json24({ ok: false, error: "POST only" }, 405);
      let body = {};
      try {
        body = await req.json();
      } catch {
        return json24({ ok: false, error: "invalid JSON" }, 400);
      }
      const image = String(body.image || "").trim();
      const mime = String(body.mime || "image/jpeg").trim();
      if (!image) return json24({ ok: false, error: "image required" }, 400);
      if (image.length > 28e6) return json24({ ok: false, error: "image too large" }, 413);
      try {
        const result = await extractPaymentFromImage({ imageBase64: image, mime, kind: "zelle" });
        if (result.dryRun) {
          return json24({
            ok: false,
            dryRun: true,
            error: result.error || "Vision API not configured \u2014 set XAI_API_KEY on Netlify"
          });
        }
        return json24({ ok: true, extracted: result.extracted, model: result.model });
      } catch (e) {
        return json24({ ok: false, error: String(e.message || e).slice(0, 300) }, 502);
      }
    }, "default");
  }
});

// .netlify/functions/zelle-vision.js
var onRequest30;
var init_zelle_vision2 = __esm({
  ".netlify/functions/zelle-vision.js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_zelle_vision();
    init_pagesAdapter();
    onRequest30 = toPagesFunction(zelle_vision_default);
  }
});

// pay/[code].js
async function onRequest31(context2) {
  bindStorageEnv(context2.env);
  const target = new URL(context2.request.url);
  target.pathname = "/.netlify/functions/pay-link";
  target.search = "";
  target.searchParams.set("code", context2.params.code);
  const req = new Request(target.toString(), { headers: context2.request.headers });
  return pay_link_default(req, context2.env, context2);
}
var init_code = __esm({
  "pay/[code].js"() {
    init_functionsRoutes_0_0868240934927007();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
    init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
    init_performance2();
    init_pay_link();
    init_storage();
    __name(onRequest31, "onRequest");
  }
});

// ../.wrangler/tmp/pages-jCwAVD/functionsRoutes-0.0868240934927007.mjs
var routes;
var init_functionsRoutes_0_0868240934927007 = __esm({
  "../.wrangler/tmp/pages-jCwAVD/functionsRoutes-0.0868240934927007.mjs"() {
    init_address_suggest2();
    init_calendar2();
    init_chat2();
    init_command2();
    init_customer_email2();
    init_customers2();
    init_devtasks2();
    init_docs2();
    init_docs_cleanup2();
    init_docs_fetch2();
    init_email_insights2();
    init_generate_doc();
    init_inbox2();
    init_items2();
    init_iterate2();
    init_jobsdata2();
    init_pay_link2();
    init_payment_vision2();
    init_progress2();
    init_qbo_exec2();
    init_sas_inbound2();
    init_send_doc_email2();
    init_settings2();
    init_sola_charge2();
    init_sola_ifields_config2();
    init_sola_payment2();
    init_state2();
    init_timetrack2();
    init_voice_polish2();
    init_zelle_vision2();
    init_code();
    routes = [
      {
        routePath: "/.netlify/functions/address-suggest",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest]
      },
      {
        routePath: "/.netlify/functions/calendar",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest2]
      },
      {
        routePath: "/.netlify/functions/chat",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest3]
      },
      {
        routePath: "/.netlify/functions/command",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest4]
      },
      {
        routePath: "/.netlify/functions/customer-email",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest5]
      },
      {
        routePath: "/.netlify/functions/customers",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest6]
      },
      {
        routePath: "/.netlify/functions/devtasks",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest7]
      },
      {
        routePath: "/.netlify/functions/docs",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest8]
      },
      {
        routePath: "/.netlify/functions/docs-cleanup",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest9]
      },
      {
        routePath: "/.netlify/functions/docs-fetch",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest10]
      },
      {
        routePath: "/.netlify/functions/email-insights",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest11]
      },
      {
        routePath: "/.netlify/functions/generate-doc",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest12]
      },
      {
        routePath: "/.netlify/functions/inbox",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest13]
      },
      {
        routePath: "/.netlify/functions/items",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest14]
      },
      {
        routePath: "/.netlify/functions/iterate",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest15]
      },
      {
        routePath: "/.netlify/functions/jobsdata",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest16]
      },
      {
        routePath: "/.netlify/functions/pay-link",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest17]
      },
      {
        routePath: "/.netlify/functions/payment-vision",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest18]
      },
      {
        routePath: "/.netlify/functions/progress",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest19]
      },
      {
        routePath: "/.netlify/functions/qbo-exec",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest20]
      },
      {
        routePath: "/.netlify/functions/sas-inbound",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest21]
      },
      {
        routePath: "/.netlify/functions/send-doc-email",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest22]
      },
      {
        routePath: "/.netlify/functions/settings",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest23]
      },
      {
        routePath: "/.netlify/functions/sola-charge",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest24]
      },
      {
        routePath: "/.netlify/functions/sola-ifields-config",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest25]
      },
      {
        routePath: "/.netlify/functions/sola-payment",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest26]
      },
      {
        routePath: "/.netlify/functions/state",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest27]
      },
      {
        routePath: "/.netlify/functions/timetrack",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest28]
      },
      {
        routePath: "/.netlify/functions/voice-polish",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest29]
      },
      {
        routePath: "/.netlify/functions/zelle-vision",
        mountPath: "/.netlify/functions",
        method: "",
        middlewares: [],
        modules: [onRequest30]
      },
      {
        routePath: "/pay/:code",
        mountPath: "/pay",
        method: "",
        middlewares: [],
        modules: [onRequest31]
      }
    ];
  }
});

// ../../../../../opt/homebrew/lib/node_modules/wrangler/templates/pages-template-worker.ts
init_functionsRoutes_0_0868240934927007();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();

// ../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/path-to-regexp/dist.es2015/index.js
init_functionsRoutes_0_0868240934927007();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_process();
init_virtual_unenv_global_polyfill_cloudflare_unenv_preset_node_console();
init_performance2();
function lexer(str) {
  var tokens2 = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens2.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens2.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens2.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens2.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens2.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count3 = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count3--;
          if (count3 === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count3++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count3)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens2.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens2.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens2.push({ type: "END", index: i, value: "" });
  return tokens2;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens2 = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key2 = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens2.length && tokens2[i].type === type)
      return tokens2[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens2[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens2.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key2++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key2++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key2 = keys[i2 - 1];
      if (key2.modifier === "*" || key2.modifier === "+") {
        params[key2.name] = m[i2].split(key2.prefix + key2.suffix).map(function(value) {
          return decode(value, key2);
        });
      } else {
        params[key2.name] = decode(m[i2], key2);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens2, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens2; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens2[tokens2.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../../opt/homebrew/lib/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env2, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context2 = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env: env2,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context2);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env2["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error3) {
      if (isFailOpen) {
        const response = await env2["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error3;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
