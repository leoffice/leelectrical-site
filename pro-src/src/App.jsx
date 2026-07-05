// Shell: bottom tab nav on mobile, left sidebar on desktop (>=1024px),
// sticky SaveBar for the staged-changes model, toast, hash routing.
import React from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useStore } from "./state/store.jsx";
import Jobs from "./views/Jobs.jsx";
import JobDetail from "./views/JobDetail.jsx";
import Today from "./views/Today.jsx";
import Placeholder from "./views/Placeholder.jsx";
import SaveBar from "./components/SaveBar.jsx";

const TABS = [
  { to: "/", label: "Jobs", ic: "🗂️", end: true },
  { to: "/today", label: "Today", ic: "📅" },
  { to: "/invoices", label: "Invoices", ic: "🧾" },
  { to: "/chat", label: "Chat", ic: "💬" },
];

function Tab({ t, sidebar }) {
  return (
    <NavLink
      to={t.to}
      end={t.end}
      className={({ isActive }) =>
        sidebar
          ? `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
              isActive ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
            }`
          : `flex flex-col items-center gap-0.5 py-2 flex-1 text-[11px] font-medium ${
              isActive ? "text-brand" : "text-slate-500"
            }`
      }
    >
      <span className={sidebar ? "text-base" : "text-xl leading-none"}>{t.ic}</span>
      <span>{t.label}</span>
    </NavLink>
  );
}

export default function App() {
  const { toast, error, loading } = useStore();
  const loc = useLocation();
  const inDetail = loc.pathname.startsWith("/job/");

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 border-r border-slate-200 bg-white min-h-screen sticky top-0 p-4 gap-1">
        <div className="flex items-center gap-2.5 px-2 py-4 mb-2">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand to-accent text-white text-lg">
            ⚡
          </span>
          <div>
            <div className="font-extrabold tracking-tight text-slate-900 leading-none">LE Pro</div>
            <div className="text-[11px] text-slate-400">LE Electric · Brooklyn</div>
          </div>
        </div>
        {TABS.map((t) => (
          <Tab key={t.to} t={t} sidebar />
        ))}
        <div className="mt-auto px-2 text-[11px] text-slate-400">Module 1 · Jobs</div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 bg-gradient-to-r from-brand to-accent text-white shadow-sm">
          <div className="flex items-center gap-2 px-4 py-3">
            <span className="text-lg">⚡</span>
            <span className="font-extrabold tracking-tight">LE Pro</span>
            <span className="ml-auto text-xs opacity-80">{loading ? "syncing…" : "LE Electric"}</span>
          </div>
        </header>

        {error && (
          <div className="mx-4 mt-3 card border-red-200 bg-red-50 text-red-700 text-sm px-4 py-2.5">
            Couldn’t reach the server — {error}
          </div>
        )}

        <main className={`flex-1 w-full max-w-3xl mx-auto px-4 pt-4 ${inDetail ? "pb-40" : "pb-36"} lg:pb-16`}>
          <Routes>
            <Route path="/" element={<Jobs />} />
            <Route path="/job/:id" element={<JobDetail />} />
            <Route path="/today" element={<Today />} />
            <Route
              path="/invoices"
              element={<Placeholder icon="🧾" title="Invoices" note="Estimates, invoices and payment links land here in module 2." />}
            />
            <Route
              path="/chat"
              element={<Placeholder icon="💬" title="Chat" note="Dispatch chat + customer messages arrive in module 3." />}
            />
            <Route path="*" element={<Placeholder icon="🤔" title="Not found" note="That page doesn’t exist." />} />
          </Routes>
        </main>

        <SaveBar />

        {/* Mobile bottom tab nav */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 pb-safe">
          <div className="flex max-w-3xl mx-auto">
            {TABS.map((t) => (
              <Tab key={t.to} t={t} />
            ))}
          </div>
        </nav>

        {toast && (
          <div className="fixed bottom-24 lg:bottom-8 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
