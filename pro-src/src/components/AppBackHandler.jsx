// Trap hardware back on home tabs; close overlays first; double-back to exit.
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStore } from "../state/store.jsx";
import { useLiveEdit } from "./LiveEditProvider.jsx";
import {
  detailBackTarget,
  isDetailRoute,
  isDoubleBack,
  isRootRoute,
  parseHashPath,
  parseHashSearch,
} from "../lib/appBack.js";

const IS_TEST = import.meta.env.MODE === "test" || !!import.meta.env.VITEST;

function dispatchEscape() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

function closeVoiceFlow() {
  const expanded = document.querySelector('[data-testid="voice-flow-expanded"]');
  if (!expanded) return false;
  const cancel = document.querySelector('[data-testid="voice-flow-cancel"]');
  if (cancel) {
    cancel.click();
    return true;
  }
  return false;
}

function pushRootTrap() {
  window.history.pushState({ leProTrap: 1 }, "", window.location.href);
}

export default function AppBackHandler() {
  const loc = useLocation();
  const nav = useNavigate();
  const store = useStore();
  const live = useLiveEdit();
  const prevPathRef = useRef(loc.pathname);
  const lastRootBackRef = useRef(0);
  const storeRef = useRef(store);
  const liveRef = useRef(live);
  const navRef = useRef(nav);
  storeRef.current = store;
  liveRef.current = live;
  navRef.current = nav;

  useEffect(() => {
    prevPathRef.current = loc.pathname;
  }, [loc.pathname]);

  useEffect(() => {
    if (IS_TEST) return;
    if (isRootRoute(loc.pathname) && !window.history.state?.leProTrap) {
      pushRootTrap();
    }
  }, []);

  useEffect(() => {
    if (IS_TEST) return;

    const onPop = () => {
      const beforePath = prevPathRef.current;
      const afterPath = parseHashPath();
      const afterSearch = parseHashSearch();
      prevPathRef.current = afterPath;

      const s = storeRef.current;
      const le = liveRef.current;
      const go = navRef.current;

      const closeOverlays = () => {
        if (s.leaveReq) {
          s.setLeaveReq(null);
          return true;
        }
        if (le.styleTarget) {
          le.setStyleTarget(null);
          return true;
        }
        if (le.suggestTarget) {
          le.setSuggestTarget(null);
          return true;
        }
        if (le.chooser) {
          le.setChooser(null);
          return true;
        }
        if (le.menu) {
          le.setMenu(null);
          return true;
        }
        if (s.newJob) {
          s.setNewJob(null);
          return true;
        }
        if (s.chatOpen) {
          s.setChatOpen(false);
          return true;
        }
        if (le.devMode) {
          le.exitDevMode();
          return true;
        }
        if (closeVoiceFlow()) return true;
        if (document.querySelector("[data-sheet]") || document.querySelector("[data-floating-panel]")) {
          dispatchEscape();
          return true;
        }
        return false;
      };

      if (closeOverlays()) {
        if (isRootRoute(afterPath)) pushRootTrap();
        return;
      }

      if (beforePath !== afterPath) {
        if (isRootRoute(afterPath)) pushRootTrap();
        return;
      }

      if (isDetailRoute(afterPath)) {
        const target = detailBackTarget(afterPath, afterSearch);
        s.guardNav(() => go(target));
        if (isRootRoute(target.split("?")[0])) pushRootTrap();
        return;
      }

      if (isRootRoute(afterPath)) {
        const now = Date.now();
        if (isDoubleBack(now, lastRootBackRef.current)) {
          lastRootBackRef.current = 0;
          window.history.back();
          return;
        }
        lastRootBackRef.current = now;
        s.showToast("Press back again to close");
        pushRootTrap();
      }
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return null;
}