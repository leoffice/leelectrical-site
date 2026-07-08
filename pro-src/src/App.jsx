// Shell: bottom tab nav on mobile, left sidebar on desktop (>=1024px),
// header sync chip, + FAB, chat bubble, approval watcher, leave-guard
// sheet, sticky SaveBar and toast. Hash routing.
import React from "react";
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useStore } from "./state/store.jsx";
import Jobs from "./views/Jobs.jsx";
import JobDetail from "./views/JobDetail.jsx";
import CustomerView from "./views/CustomerView.jsx";
import Today from "./views/Today.jsx";
import Calls from "./views/Calls.jsx";
import Dev from "./views/Dev.jsx";
import Archive from "./views/Archive.jsx";
import Placeholder from "./views/Placeholder.jsx";
import SaveBar from "./components/SaveBar.jsx";
import SyncChip from "./components/SyncChip.jsx";
import ChatBubble from "./components/ChatBubble.jsx";
import ApprovalWatcher from "./components/ApprovalWatcher.jsx";
import DocConfirmWatcher from "./components/DocConfirmWatcher.jsx";
import { docConfirmMessage } from "./lib/docConfirm.js";
import NewJobFlow from "./components/NewJobFlow.jsx";
import Sheet, { Opt } from "./components/Sheet.jsx";
import { appointmentContextFromRoute } from "./lib/appointmentContext.js";

const TABS = [
  { to: "/", label: "Jobs", ic: "🗂️", end: true },
  { to: "/today", label: "Calendar", ic: "📅" },
  { to: "/calls", label: "Calls", ic: "📞" },
  { to: "/dev", label: "Dev", ic: "🛠️" },
  { to: "/archive", label: "Archive", ic: "📦" },
];

function Tab({ t, sidebar }) {
  const { devBadge, sasBadge, guardNav, dirtyJobs } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const badge = t.to === "/dev" ? devBadge : t.to === "/calls" ? sasBadge : 0;
  return (
    <NavLink
      to={t.to}
      end={t.end}
      onClick={(e) => {
        // Leave guard: unsaved edits + leaving a job detail page.
        if (dirtyJobs > 0 && loc.pathname.startsWith("/job/")) {
          e.preventDefault();
          guardNav(() => nav(t.to));
        }
      }}
      className={({ isActive }) =>
        sidebar
          ? `relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
              isActive ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
            }`
          : `relative flex flex-col items-center gap-0.5 py-1.5 flex-1 text-[10px] font-medium ${
              isActive ? "text-brand" : "text-slate-500"
            }`
      }
    >
      <span className={sidebar ? "text-base" : "text-lg leading-none"}>{t.ic}</span>
      <span>{t.label}</span>
      {badge > 0 && (
        <span
          className={`absolute bg-red-600 text-white text-[9px] font-extrabold rounded-full min-w-[15px] h-[15px] leading-[15px] text-center px-0.5 ${
            sidebar ? "right-3 top-1/2 -translate-y-1/2" : "top-1 right-[22%]"
          }`}
        >
          {badge}
        </span>
      )}
    </NavLink>
  );
}

function LeaveSheet() {
  const { leaveReq, setLeaveReq, saveAll, discardAll, dirtyCount } = useStore();
  if (!leaveReq) return null;
  const close = () => setLeaveReq(null);
  const go = leaveReq.cb;
  return (
    <Sheet title="Unsaved changes" onClose={close}>
      <p className="text-sm text-slate-500 mb-3">
        You have <b>{dirtyCount}</b> unsaved change{dirtyCount > 1 ? "s" : ""} on this job.
      </p>
      <Opt
        icon="💾"
        title="Save & continue"
        note="Apply changes, sync, then leave"
        onClick={async () => {
          close();
          await saveAll();
          go && go();
        }}
      />
      <Opt
        icon="🗑️"
        title="Discard"
        note="Throw away the edits"
        onClick={() => {
          close();
          discardAll();
          go && go();
        }}
      />
      <Opt icon="↩️" title="Stay here" onClick={close} />
    </Sheet>
  );
}

export default function App() {
  const { toast, docConfirm, error, setNewJob, refresh, dirtyCount, effectiveJob, jobs } = useStore();
  const loc = useLocation();
  const inDetail = loc.pathname.startsWith("/job/");
  const inCustomer = loc.pathname.startsWith("/customer/");
  const showFab = loc.pathname === "/" || loc.pathname === "/today" || inDetail || inCustomer;
  const fabContext = appointmentContextFromRoute(loc.pathname, { effectiveJob, jobs });

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar — fixed so it never scrolls away */}
      <aside
        className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:flex-col border-r border-slate-200 bg-white p-4 gap-1 overflow-y-auto"
        data-testid="sidebar"
      >
        <div className="flex flex-col items-center px-2 py-4 mb-2">
          <img
            src={import.meta.env.BASE_URL + "le-logo.png?v=4"}
            alt="LE Electric"
            className="h-32 w-auto max-w-[280px] object-contain shrink-0"
            data-testid="app-logo"
          />
          <div className="mt-2 text-center">
            <div className="font-extrabold tracking-tight text-slate-900 leading-none text-lg">LE Pro</div>
            <div className="text-[11px] text-slate-400 mt-0.5">LE Electric · Brooklyn</div>
          </div>
        </div>
        <div className="px-2 mb-3">
          <SyncChip />
        </div>
        {TABS.map((t) => (
          <Tab key={t.to} t={t} sidebar />
        ))}
        <div className="mt-auto px-2 text-[11px] text-slate-400">LE Pro · full parity build</div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col lg:pl-64">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm pt-safe">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <img
              src={import.meta.env.BASE_URL + "le-logo.png?v=4"}
              alt=""
              className="h-16 w-auto max-w-[160px] object-contain"
            />
            <span className="text-sm font-bold tracking-tight text-slate-900">LE Pro</span>
            <span className="ml-auto">
              <SyncChip />
            </span>
          </div>
        </header>

        {error && (
          <div className="mx-4 mt-3 card border-red-200 bg-red-50 text-red-700 text-sm px-4 py-2.5 flex items-center gap-3">
            <span className="flex-1 min-w-0">Couldn’t reach the server — {error}</span>
            <button className="btn bg-red-100 text-red-700 !py-1.5 shrink-0" onClick={() => refresh()}>
              ↻ Retry
            </button>
          </div>
        )}

        <main
          className={`flex-1 w-full mx-auto px-4 pt-4 pb-40 lg:pb-20 ${
            inDetail || inCustomer ? "max-w-3xl lg:max-w-6xl" : "max-w-3xl"
          }`}
        >
          <Routes>
            <Route path="/" element={<Jobs />} />
            <Route path="/job/:id" element={<JobDetail />} />
            <Route path="/customer/:key" element={<CustomerView />} />
            <Route path="/today" element={<Today />} />
            <Route path="/calls" element={<Calls />} />
            <Route path="/dev" element={<Dev />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="*" element={<Placeholder icon="🤔" title="Not found" note="That page doesn’t exist." />} />
          </Routes>
        </main>

        <SaveBar />

        {/* + FAB — Jobs, Today, and open job detail */}
        {showFab && (
          <button
            onClick={() => setNewJob({ step: "choose", context: fabContext })}
            aria-label="New job"
            data-testid="fab-add"
            className={`fixed z-40 right-4 lg:right-24 w-12 h-12 rounded-2xl bg-slate-900 text-white text-xl shadow-xl lg:w-[54px] lg:h-[54px] lg:text-2xl ${
              dirtyCount ? "bottom-[150px] lg:bottom-24" : "bottom-[86px] lg:bottom-6" // clear the SaveBar
            }`}
          >
            ＋
          </button>
        )}

        <ChatBubble />
        <NewJobFlow />
        <ApprovalWatcher />
        <DocConfirmWatcher />
        <LeaveSheet />

        {/* Mobile bottom tab nav */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 pb-safe" data-testid="bottom-nav">
          <div className="flex max-w-3xl mx-auto">
            {TABS.map((t) => (
              <Tab key={t.to} t={t} />
            ))}
          </div>
        </nav>

        {docConfirm && (
          <div
            className="fixed top-16 lg:top-4 left-1/2 -translate-x-1/2 z-[70] bg-emerald-600 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl max-w-[92vw] text-center"
            data-testid="doc-confirm-banner"
          >
            ✓ {docConfirmMessage(docConfirm)}
          </div>
        )}
        {toast && (
          <div className="fixed bottom-24 lg:bottom-8 left-1/2 -translate-x-1/2 z-[70] bg-slate-900 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg max-w-[86vw] text-center" data-testid="toast">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
