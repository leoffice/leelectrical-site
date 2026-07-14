// Big-project requisitions — SOV upload, progress %, G702/G703 generation.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../data/adapter.js";
import Sheet from "../components/Sheet.jsx";
import { buildG702, overallPct } from "../lib/requisitionCalc.js";
import {
  findProject,
  fmtUsd,
  normalizeProjects,
  seedBaezProject,
  upsertProject,
} from "../lib/requisitionData.js";
import { parseSovCsv } from "../lib/sovParser.js";

function pctInput(val, onChange) {
  return (
    <input
      type="number"
      min={0}
      max={100}
      step={1}
      className="w-16 text-right border rounded px-1 py-0.5 text-sm"
      value={val}
      onChange={(e) => onChange(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
      data-testid="sov-pct-input"
    />
  );
}

function ProjectList({ projects, onSeed, busy }) {
  const list = projects?.list || [];
  return (
    <div className="space-y-3" data-testid="projects-list">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-slate-900">Requisition</h1>
        <button type="button" className="btn btn-sm" onClick={onSeed} disabled={busy}>
          + Add Baez Place
        </button>
      </div>
      <p className="text-sm text-slate-500">
        Schedule of Values, progress billing, and requisitions for big GC jobs.
      </p>
      {list.length === 0 ? (
        <div className="card px-4 py-8 text-center text-slate-500 text-sm">
          No projects yet. Tap Add Baez Place or upload an SOV on a new project.
        </div>
      ) : (
        list.map((p) => {
          const pct = overallPct(p.items);
          return (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="card block px-4 py-4 hover:border-brand transition-colors"
              data-testid={`project-card-${p.id}`}
            >
              <div className="font-bold text-slate-900">{p.name}</div>
              <div className="text-xs text-slate-500 mt-0.5">{p.address}</div>
              <div className="flex gap-4 mt-2 text-sm">
                <span>{fmtUsd(p.contractSum)} contract</span>
                <span>{pct}% complete</span>
                <span>{(p.requisitions || []).length} requisitions</span>
              </div>
            </Link>
          );
        })
      )}
    </div>
  );
}

function SovUpload({ onParsed }) {
  const [err, setErr] = useState("");
  const onFile = (e) => {
    setErr("");
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseSovCsv(reader.result);
        if (!parsed.items.length) throw new Error("No line items found");
        onParsed(parsed);
      } catch (ex) {
        setErr(ex.message || "Could not read file");
      }
    };
    reader.readAsText(file);
  };
  return (
    <div className="card px-4 py-3 space-y-2" data-testid="sov-upload">
      <div className="text-sm font-bold text-slate-700">Upload SOV (CSV)</div>
      <input type="file" accept=".csv,.txt" onChange={onFile} className="text-sm" />
      {err ? <p className="text-xs text-red-600">{err}</p> : null}
    </div>
  );
}

function ProjectDetail({ project, onSave, busy }) {
  const [draft, setDraft] = useState(project);
  const [preview, setPreview] = useState(null);
  const [periodTo, setPeriodTo] = useState(new Date().toISOString().slice(0, 10));
  const dirty = JSON.stringify(draft.items) !== JSON.stringify(project.items);

  useEffect(() => setDraft(project), [project]);

  const g702 = useMemo(() => buildG702(draft, { periodTo }), [draft, periodTo]);

  const setItemPct = (id, completedPct) => {
    setDraft((d) => ({
      ...d,
      items: d.items.map((it) => (it.id === id ? { ...it, completedPct } : it)),
    }));
  };

  const saveProgress = async () => {
    await onSave({ ...draft, updatedAt: Date.now() });
  };

  const generateReq = async () => {
    const snap = draft.items.map((it) => ({ id: it.id, completedPct: it.completedPct }));
    const req = {
      num: (draft.requisitions?.length || 0) + 1,
      periodTo,
      amountCertified: g702.currentPaymentDue,
      currentPaymentDue: g702.currentPaymentDue,
      previousCertificates: g702.previousCertificates,
      totalCompleted: g702.totalCompleted,
      itemsSnapshot: snap,
      createdAt: Date.now(),
    };
    const next = { ...draft, requisitions: [...(draft.requisitions || []), req] };
    await onSave(next);
    setPreview(g702);
  };

  const sections = useMemo(() => {
    const groups = [];
    let cur = { name: "General", items: [] };
    for (const it of draft.items || []) {
      if (it.section && it.section !== cur.name) {
        if (cur.items.length) groups.push(cur);
        cur = { name: it.section, items: [] };
      }
      cur.items.push(it);
    }
    if (cur.items.length) groups.push(cur);
    return groups;
  }, [draft.items]);

  return (
    <div className="space-y-4 pb-8" data-testid="project-detail">
      <div>
        <Link to="/projects" className="text-sm text-brand font-semibold">
          ← Requisition
        </Link>
        <h1 className="text-xl font-extrabold mt-1">{draft.name}</h1>
        <p className="text-sm text-slate-500">{draft.address}</p>
        <p className="text-sm text-slate-600 mt-1">
          {fmtUsd(draft.contractSum)} · {overallPct(draft.items)}% complete · {draft.retainagePct}% retainage
        </p>
      </div>

      <div className="card px-4 py-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-slate-500">GC</span>
          <div className="font-semibold">{draft.gc}</div>
        </div>
        <div>
          <span className="text-slate-500">Contractor</span>
          <div className="font-semibold">{draft.contractor}</div>
        </div>
      </div>

      {dirty ? (
        <button type="button" className="btn w-full" onClick={saveProgress} disabled={busy}>
          Save progress %
        </button>
      ) : null}

      <div className="flex gap-2 items-end flex-wrap">
        <label className="text-sm">
          Period to
          <input
            type="date"
            className="block border rounded px-2 py-1 mt-1"
            value={periodTo}
            onChange={(e) => setPeriodTo(e.target.value)}
          />
        </label>
        <button type="button" className="btn flex-1" onClick={generateReq} disabled={busy} data-testid="generate-requisition">
          Generate requisition
        </button>
      </div>

      {preview ? (
        <div className="card px-4 py-4 space-y-2 text-sm" data-testid="requisition-preview">
          <div className="font-bold text-base">{preview.applicationNumber}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-slate-500">Total completed</span>
            <span className="text-right font-semibold">{fmtUsd(preview.totalCompleted)}</span>
            <span className="text-slate-500">Retainage ({preview.retainagePct}%)</span>
            <span className="text-right">{fmtUsd(preview.totalRetainage)}</span>
            <span className="text-slate-500">Previously paid</span>
            <span className="text-right">{fmtUsd(preview.previousCertificates)}</span>
            <span className="text-slate-500 font-bold">Current payment due</span>
            <span className="text-right font-extrabold text-brand">{fmtUsd(preview.currentPaymentDue)}</span>
            <span className="text-slate-500">Balance to finish</span>
            <span className="text-right">{fmtUsd(preview.balanceToFinish)}</span>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {sections.map((sec) => (
          <div key={sec.name} className="card overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 font-bold text-sm border-b">{sec.name}</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b">
                  <th className="text-left px-3 py-2">Item</th>
                  <th className="text-right px-2 py-2">Value</th>
                  <th className="text-right px-2 py-2">Done %</th>
                  <th className="text-right px-3 py-2">Earned</th>
                </tr>
              </thead>
              <tbody>
                {sec.items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">{it.description}</td>
                    <td className="text-right px-2 py-2 tabular-nums">{fmtUsd(it.value)}</td>
                    <td className="text-right px-2 py-2">{pctInput(it.completedPct, (v) => setItemPct(it.id, v))}</td>
                    <td className="text-right px-3 py-2 tabular-nums">
                      {fmtUsd((it.value * (it.completedPct || 0)) / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Projects() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [projects, setProjects] = useState({ list: [] });
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    const raw = await api.getProjects?.().catch(() => ({ list: [] }));
    setProjects(normalizeProjects(raw));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const persist = async (next) => {
    setBusy(true);
    try {
      const normalized = normalizeProjects(next);
      await api.saveProjects?.(normalized);
      setProjects(normalized);
    } finally {
      setBusy(false);
    }
  };

  const onSeed = async () => {
    const seeded = seedBaezProject();
    const next = upsertProject(projects, seeded);
    await persist(next);
    navigate(`/projects/${seeded.id}`);
  };

  const onNewFromSov = async (parsed) => {
    const id = `proj-${Date.now()}`;
    const project = {
      id,
      name: parsed.name || "New Project",
      address: "",
      contractor: "Martin Dorkin",
      gc: "",
      contractSum: parsed.contractSum,
      retainagePct: 10,
      changeOrders: 0,
      items: parsed.items,
      requisitions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = upsertProject(projects, project);
    await persist(next);
    setShowNew(false);
    navigate(`/projects/${id}`);
  };

  const project = projectId ? findProject(projects, projectId) : null;

  if (projectId && project) {
    return (
      <ProjectDetail
        project={project}
        busy={busy}
        onSave={async (p) => {
          const next = upsertProject(projects, p);
          await persist(next);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <ProjectList projects={projects} onSeed={onSeed} busy={busy} />
      <button type="button" className="btn w-full" onClick={() => setShowNew(true)}>
        Upload new SOV
      </button>
      {showNew ? (
        <Sheet title="New project from SOV" onClose={() => setShowNew(false)}>
          <SovUpload onParsed={onNewFromSov} />
        </Sheet>
      ) : null}
    </div>
  );
}