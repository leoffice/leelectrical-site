// Dev board — submit build requests to Dispatch (photos, paste-image,
// priority, build-for targets incl. Pro), track status, approve/verify/edit.
import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store.jsx";
import Sheet, { Fld } from "../components/Sheet.jsx";
import { logOff } from "../lib/lock.js";

export const DVLBL = {
  new: "New",
  understood: "Understood",
  question: "Question",
  approved: "Working on it",
  verify: "Testing",
  done: "Done",
};
const DV_TONES = {
  new: "bg-yellow-100 text-yellow-800",
  understood: "bg-blue-100 text-blue-800",
  question: "bg-rose-100 text-rose-800",
  approved: "bg-amber-100 text-amber-800",
  verify: "bg-violet-100 text-violet-800",
  done: "bg-emerald-100 text-emerald-800",
};
const ORDER = { question: 0, verify: 1, approved: 2, understood: 3, new: 4, done: 5 };
// LE Pro is the ONLY active target (Levi 2026-07-06 — Command Center, Dashboard,
// Beta, Sleek are officially PAUSED). The paused targets stay defined so existing
// tasks still render, but are tucked under a collapsible "Development" section.
const TARGETS = [
  ["pro", "LE Pro"],
  ["dashboard", "Dashboard"],
  ["beta", "Beta"],
  ["sleek", "Sleek"],
];
const PAUSED_TARGETS = [
  ["dashboard", "Dashboard"],
  ["beta", "Beta"],
  ["sleek", "Sleek"],
];

// Draft survives tab switches / re-renders (sleek keeps DEVDRAFT globally).
const draft = { desc: "", images: [], priority: "Normal", target: { sleek: false, beta: false, dashboard: false, pro: true } };

export default function Dev() {
  const { devTasks, addDevTask, patchDevTask, refreshDev, showToast } = useStore();
  const [desc, setDesc] = useState(draft.desc);
  const [images, setImages] = useState(draft.images);
  const [priority, setPriority] = useState(draft.priority);
  const [target, setTarget] = useState(draft.target);
  const [devOpen, setDevOpen] = useState(false); // "Development" (paused targets) expander
  const [edit, setEdit] = useState(null); // task being edited
  const [showArch, setShowArch] = useState(false); // archived section expanded
  const fileRef = useRef(null);

  useEffect(() => {
    refreshDev();
  }, [refreshDev]);

  // keep the module-level draft in sync
  useEffect(() => {
    draft.desc = desc;
    draft.images = images;
    draft.priority = priority;
    draft.target = target;
  }, [desc, images, priority, target]);

  const readImg = (f) => {
    const r = new FileReader();
    r.onload = () => setImages((im) => [...im, r.result]);
    r.readAsDataURL(f);
  };

  useEffect(() => {
    const onPaste = (e) => {
      const items = (e.clipboardData || {}).items || [];
      for (const it of items) {
        if (it.type && it.type.startsWith("image")) {
          const f = it.getAsFile();
          if (f) readImg(f);
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const submit = async () => {
    const d = desc.trim();
    if (!d && !images.length) return showToast("Describe it first");
    const ok = await addDevTask({
      title: "",
      desc: d,
      images,
      priority,
      category: "build",
      target: { ...target },
    });
    if (ok === false) return; // network error — keep the draft
    setDesc("");
    setImages([]);
  };

  const sorted = devTasks
    .slice()
    .sort(
      (a, b) =>
        (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) ||
        (b.priority === "High") - (a.priority === "High") ||
        (b.ts || 0) - (a.ts || 0)
    );
  const ts = sorted.filter((t) => !t.archived);
  const archived = sorted.filter((t) => t.archived);

  return (
    <div className="space-y-3">
      {/* submit form */}
      <div className="card px-4 py-4">
        <Fld label="New request for Dispatch">
          <textarea
            className="input min-h-[74px]"
            placeholder="Describe what you want built or changed…"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            aria-label="Dev request description"
          />
        </Fld>
        {images.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-2">
            {images.map((im, i) => (
              <span key={i} className="relative">
                <img src={im} alt="" className="h-[52px] rounded-lg border border-slate-200" />
                <button
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] leading-none"
                  onClick={() => setImages((a) => a.filter((_, x) => x !== i))}
                  aria-label="Remove image"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap mb-2.5 text-xs text-slate-500">
          Build for:
          <label className="pill bg-brand-soft text-brand cursor-pointer gap-1.5 font-semibold">
            <input
              type="checkbox"
              checked={!!target.pro}
              onChange={(e) => setTarget((t) => ({ ...t, pro: e.target.checked }))}
            />
            LE Pro
          </label>
          <button
            type="button"
            onClick={() => setDevOpen((v) => !v)}
            className="pill bg-slate-100 text-slate-500 cursor-pointer"
          >
            {devOpen ? "▾" : "▸"} Development (paused)
          </button>
          {devOpen &&
            PAUSED_TARGETS.map(([k, l]) => (
              <label key={k} className="pill bg-slate-100 text-slate-400 cursor-pointer gap-1.5">
                <input
                  type="checkbox"
                  checked={!!target[k]}
                  onChange={(e) => setTarget((t) => ({ ...t, [k]: e.target.checked }))}
                />
                {l}
              </label>
            ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="btn-ghost !py-2 cursor-pointer">
            📎 Photo
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                if (f) readImg(f);
                e.target.value = "";
              }}
            />
          </label>
          <span className="text-xs text-slate-400 flex-1">or paste a screenshot</span>
          <select className="input !w-[110px]" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
            <option>Normal</option>
            <option>High</option>
          </select>
          <button className="btn-brand !py-2" onClick={submit}>
            Submit
          </button>
        </div>
      </div>

      {/* task cards */}
      {ts.map((t) => (
        <TaskCard key={t.id} t={t} patchDevTask={patchDevTask} onEdit={() => setEdit(t)} />
      ))}
      {!ts.length && (
        <div className="card px-4 py-8 text-center text-sm text-slate-400">No dev tasks yet.</div>
      )}

      {/* archived — collapsed at the bottom, tap to expand */}
      {archived.length > 0 && (
        <div>
          <button
            className="w-full card px-4 py-3 flex items-center gap-2 text-sm font-bold text-slate-500"
            onClick={() => setShowArch((v) => !v)}
            aria-expanded={showArch}
          >
            <span className={`text-slate-400 transition-transform ${showArch ? "rotate-90" : ""}`}>›</span>
            Archived ({archived.length})
          </button>
          {showArch && (
            <div className="space-y-3 mt-3">
              {archived.map((t) => (
                <TaskCard key={t.id} t={t} archived patchDevTask={patchDevTask} onEdit={() => setEdit(t)} />
              ))}
            </div>
          )}
        </div>
      )}

      {edit && <EditSheet task={edit} onClose={() => setEdit(null)} onSave={patchDevTask} />}

      <button
        type="button"
        onClick={() => logOff()}
        className="w-full text-center text-sm font-semibold text-slate-500 py-4 lg:hidden"
        data-testid="log-off-btn-mobile"
      >
        Log off
      </button>
    </div>
  );
}

function TaskCard({ t, archived, patchDevTask, onEdit }) {
  return (
    <div className={`card px-4 py-3.5 ${archived ? "opacity-80" : ""}`}>
      <div className="flex items-start gap-2 text-sm font-bold">
        <span className="text-slate-400 font-extrabold">#{t.num}</span>
        <span className="flex-1 min-w-0">{t.title || "(untitled — I'll name it when I pick it up)"}</span>
        <span className={`pill uppercase !text-[10px] tracking-wide shrink-0 ${DV_TONES[t.status] || "bg-slate-100 text-slate-600"}`}>
          {DVLBL[t.status] || t.status}
        </span>
      </div>
      {t.desc && <div className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{t.desc}</div>}
      {(t.images || []).length > 0 && (
        <div className="flex gap-2 flex-wrap mt-2">
          {t.images.map((im, i) => (
            <a key={i} href={im} target="_blank" rel="noreferrer">
              <img src={im} alt={`attachment ${i + 1}`} className="h-[52px] rounded-lg border border-slate-200" />
            </a>
          ))}
        </div>
      )}
      {t.understanding && <DevBox label="My understanding">{t.understanding}</DevBox>}
      {t.question && <DevBox label="Question for you" tone="border-rose-200">{t.question}</DevBox>}
      {t.report && <DevBox label="Report" tone="border-emerald-200">{t.report}</DevBox>}
      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        {t.status === "understood" && (
          <button className="btn bg-emerald-100 text-emerald-700 !py-1.5" onClick={() => patchDevTask(t.id, { status: "approved" })}>
            👍 Approve
          </button>
        )}
        {t.status === "verify" && (
          <button className="btn bg-emerald-100 text-emerald-700 !py-1.5" onClick={() => patchDevTask(t.id, { status: "done" })}>
            ✓ Verified
          </button>
        )}
        <button className="btn-ghost !py-1.5" onClick={onEdit}>
          ✏️ Edit
        </button>
        {archived ? (
          <button
            className="btn bg-slate-100 text-slate-600 !py-1.5"
            onClick={() => patchDevTask(t.id, { archived: false })}
          >
            📤 Unarchive
          </button>
        ) : (
          <button
            className="btn bg-emerald-100 text-emerald-700 !py-1.5"
            onClick={() => patchDevTask(t.id, { status: "done", archived: true })}
          >
            ✓ Mark complete
          </button>
        )}
        <span className="flex-1" />
        {(t.target ? TARGETS.map(([k]) => k).filter((k) => t.target[k]) : []).map((k) => (
          <span key={k} className="pill bg-slate-100 text-slate-500">{k}</span>
        ))}
        {t.priority === "High" && <span className="pill bg-red-100 text-red-700">High</span>}
      </div>
    </div>
  );
}

function DevBox({ label, tone, children }) {
  return (
    <div className={`text-xs bg-slate-50 border ${tone || "border-slate-200"} rounded-xl px-3 py-2 mt-2 whitespace-pre-wrap`}>
      <b className="block uppercase tracking-wide text-slate-400 text-[10px] mb-0.5">{label}</b>
      {children}
    </div>
  );
}

function EditSheet({ task, onClose, onSave }) {
  const [title, setTitle] = useState(task.title || "");
  const [desc, setDesc] = useState(task.desc || "");
  const [priority, setPriority] = useState(task.priority === "High" ? "High" : "Normal");
  return (
    <Sheet title={"Edit task #" + task.num} onClose={onClose}>
      <Fld label="Title">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Task title" />
      </Fld>
      <Fld label="Description">
        <textarea className="input min-h-[74px]" value={desc} onChange={(e) => setDesc(e.target.value)} aria-label="Task description" />
      </Fld>
      <Fld label="Priority">
        <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option>Normal</option>
          <option>High</option>
        </select>
      </Fld>
      <button
        className="btn-brand w-full"
        onClick={async () => {
          await onSave(task.id, { title, desc, priority });
          onClose();
        }}
      >
        Save task
      </button>
    </Sheet>
  );
}
