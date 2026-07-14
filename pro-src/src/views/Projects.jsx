// Joy Construction customer hub — customer card, job info, requisition billing.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../data/adapter.js";
import Sheet, { Fld, Opt } from "../components/Sheet.jsx";
import CustomerCard from "../components/CustomerCard.jsx";
import { useStore } from "../state/store.jsx";
import { buildG702, overallPct } from "../lib/requisitionCalc.js";
import {
  BAEZ_PROJECT_ID,
  ensureProjectDefaults,
  findBaezJob,
  findProject,
  fmtUsd,
  JOY_CONSTRUCTION_NAME,
  joyCustomerKey,
  normalizeProjects,
  projectCustomerContact,
  seedBaezProject,
  upsertProject,
} from "../lib/requisitionData.js";
import { customerAmountSummary } from "../lib/customers.js";
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

function JobInfoCard({ job, project, onAddJob }) {
  if (job) {
    return (
      <div className="card px-4 py-3 space-y-2" data-testid="requisition-job-card">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-extrabold text-slate-700 uppercase tracking-wide">Job</h2>
          <Link to={"/job/" + encodeURIComponent(job.id)} className="text-sm font-semibold text-brand">
            Open job →
          </Link>
        </div>
        <div className="font-bold text-slate-900">{job.title || project.name}</div>
        <div className="text-xs text-slate-500">{job.serviceAddress || job.address || project.address}</div>
        {job.customer ? <div className="text-sm text-slate-600">{job.customer}</div> : null}
      </div>
    );
  }
  return (
    <div className="card px-4 py-3 space-y-2" data-testid="requisition-job-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold text-slate-700 uppercase tracking-wide">Job</h2>
        <button type="button" className="text-sm font-semibold text-brand" onClick={onAddJob} data-testid="add-job-btn">
          Add a job
        </button>
      </div>
      <div className="font-bold text-slate-900">{project.name}</div>
      <div className="text-xs text-slate-500">{project.address}</div>
      <p className="text-xs text-slate-400">No linked job yet — tap Add a job to connect this project.</p>
    </div>
  );
}

function DriveAttachSheet({ project, onSave, onClose }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const links = project.driveLinks || [];

  const add = () => {
    const u = url.trim();
    if (!u) return;
    const next = {
      ...project,
      driveLinks: [...links, { label: label.trim() || "Google Drive file", url: u, addedAt: Date.now() }],
    };
    onSave(next);
    setLabel("");
    setUrl("");
  };

  return (
    <Sheet title="Attach Google Drive" onClose={onClose} testId="drive-attach-sheet">
      <p className="text-sm text-slate-500 mb-3">
        Paste a Google Drive folder or file link — SOV spreadsheets and requisition docs pull from here.
      </p>
      <Fld label="Label (optional)" value={label} onChange={setLabel} placeholder="SOV, Req 12, etc." />
      <Fld label="Google Drive link" value={url} onChange={setUrl} placeholder="https://drive.google.com/..." />
      <button type="button" className="btn w-full mt-2" onClick={add} disabled={!url.trim()} data-testid="drive-attach-save">
        Attach file
      </button>
      {links.length ? (
        <div className="mt-4 space-y-2" data-testid="drive-links-list">
          {links.map((l, i) => (
            <a
              key={l.url + i}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="block card px-3 py-2 text-sm text-brand font-semibold truncate"
            >
              📎 {l.label}
            </a>
          ))}
        </div>
      ) : null}
    </Sheet>
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

function RequisitionPanel({ project, onSave, busy }) {
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
    <div className="space-y-4" data-testid="requisition-panel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold text-slate-700 uppercase tracking-wide">Requisition</h2>
        <span className="text-xs text-slate-500">
          {fmtUsd(draft.contractSum)} · {overallPct(draft.items)}% · {draft.retainagePct}% retainage
        </span>
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
  const { jobs, setNewJob, showToast } = useStore();
  const [projects, setProjects] = useState({ list: [] });
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [booted, setBooted] = useState(false);

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

  // Auto-seed Baez Place pilot on first visit.
  useEffect(() => {
    if (booted) return;
    const list = projects?.list || [];
    if (!list.length) {
      (async () => {
        const seeded = seedBaezProject();
        const next = upsertProject(projects, seeded);
        await persist(next);
        setBooted(true);
        if (!projectId) navigate("/projects/" + BAEZ_PROJECT_ID, { replace: true });
      })();
      return;
    }
    setBooted(true);
    const target = projectId || BAEZ_PROJECT_ID;
    if (!projectId && findProject(projects, BAEZ_PROJECT_ID)) {
      navigate("/projects/" + BAEZ_PROJECT_ID, { replace: true });
    } else if (projectId && !findProject(projects, projectId) && findProject(projects, BAEZ_PROJECT_ID)) {
      navigate("/projects/" + BAEZ_PROJECT_ID, { replace: true });
    }
  }, [projects, booted, projectId, navigate]);

  const rawProject = findProject(projects, projectId || BAEZ_PROJECT_ID);
  const project = rawProject ? ensureProjectDefaults(rawProject) : null;
  const linkedJob = useMemo(() => {
    if (!project) return null;
    if (project.jobId) return (jobs || []).find((j) => j.id === project.jobId) || null;
    return findBaezJob(jobs);
  }, [project, jobs]);

  const contact = useMemo(
    () => (project ? projectCustomerContact(project, linkedJob) : null),
    [project, linkedJob]
  );
  const summary = useMemo(
    () => (linkedJob ? customerAmountSummary([linkedJob]) : { due: 0, invoiced: 0, paid: 0, openInvoices: 0, jobCount: 0 }),
    [linkedJob]
  );

  const onEnableRequisitions = async () => {
    if (!project) return;
    await persist(upsertProject(projects, { ...project, requisitionEnabled: true }));
    showToast?.("Requisition system enabled for " + project.name);
  };

  const onAddJob = () => {
    setNewJob?.({
      step: "form",
      prefill: {
        customer: JOY_CONSTRUCTION_NAME,
        businessName: project?.gc || JOY_CONSTRUCTION_NAME,
        title: project?.name || "Baez Place",
        serviceAddress: project?.address || "",
        address: project?.address || "",
      },
    });
  };

  const onSaveProject = async (p) => {
    const patch = { ...p };
    if (linkedJob && !patch.jobId) patch.jobId = linkedJob.id;
    const next = upsertProject(projects, patch);
    await persist(next);
  };

  const onNewFromSov = async (parsed) => {
    const id = "proj-" + Date.now();
    const fresh = ensureProjectDefaults({
      id,
      name: parsed.name || "New Project",
      address: "",
      contractor: "Martin Dorkin",
      gc: project?.gc || "",
      customerKey: joyCustomerKey(),
      contractSum: parsed.contractSum,
      retainagePct: 10,
      changeOrders: 0,
      items: parsed.items,
      requisitions: [],
      requisitionEnabled: true,
      driveLinks: [],
      jobId: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const next = upsertProject(projects, fresh);
    await persist(next);
    setSheet(null);
    navigate("/projects/" + id);
  };

  if (!project) {
    return (
      <div className="card px-6 py-12 text-center text-slate-400 text-sm" data-testid="projects-loading">
        Loading Joy Construction…
      </div>
    );
  }

  const custKey = project.customerKey || joyCustomerKey();
  const projectList = (projects?.list || []).filter((p) => (p.customerKey || joyCustomerKey()) === custKey);

  return (
    <div className="space-y-4 pb-8" data-testid="joy-requisition-hub">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-slate-900">{JOY_CONSTRUCTION_NAME}</h1>
        <Link
          to={"/customer/" + encodeURIComponent(custKey)}
          className="text-sm font-semibold text-brand shrink-0"
          data-testid="joy-customer-link"
        >
          Customer →
        </Link>
      </div>

      <CustomerCard
        contact={contact}
        summary={summary}
        mapAddress={project.address}
        primaryJob={linkedJob}
        showSummary={!!linkedJob}
      />

      {projectList.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1" data-testid="joy-project-tabs">
          {projectList.map((p) => (
            <Link
              key={p.id}
              to={"/projects/" + p.id}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold border ${
                p.id === project.id ? "bg-brand text-white border-brand" : "bg-white text-slate-600 border-slate-200"
              }`}
            >
              {p.name}
            </Link>
          ))}
        </div>
      ) : null}

      <JobInfoCard job={linkedJob} project={project} onAddJob={onAddJob} />

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm" onClick={onAddJob} data-testid="hub-add-job">
          Add a job
        </button>
        {!project.requisitionEnabled ? (
          <button
            type="button"
            className="btn btn-sm bg-brand text-white"
            onClick={onEnableRequisitions}
            disabled={busy}
            data-testid="enable-requisition"
          >
            Enable requisitions
          </button>
        ) : (
          <span className="text-xs font-semibold text-emerald-700 self-center px-2" data-testid="requisition-enabled-badge">
            Requisitions on
          </span>
        )}
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setSheet({ kind: "drive" })}
          data-testid="attach-drive"
        >
          Attach Google Drive
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setSheet({ kind: "sov" })}>
          Upload SOV
        </button>
      </div>

      {(project.driveLinks || []).length ? (
        <div className="flex flex-wrap gap-2" data-testid="drive-links-chips">
          {(project.driveLinks || []).map((l, i) => (
            <a
              key={l.url + i}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-brand bg-slate-50 border border-slate-200 rounded-full px-3 py-1"
            >
              📎 {l.label}
            </a>
          ))}
        </div>
      ) : null}

      {project.requisitionEnabled ? (
        <RequisitionPanel project={project} onSave={onSaveProject} busy={busy} />
      ) : (
        <div className="card px-4 py-6 text-center text-sm text-slate-500" data-testid="requisition-disabled">
          Tap Enable requisitions to unlock SOV progress billing for this project.
        </div>
      )}

      {sheet?.kind === "drive" ? (
        <DriveAttachSheet project={project} onSave={onSaveProject} onClose={() => setSheet(null)} />
      ) : null}
      {sheet?.kind === "sov" ? (
        <Sheet title="New project from SOV" onClose={() => setSheet(null)}>
          <SovUpload onParsed={onNewFromSov} />
        </Sheet>
      ) : null}
    </div>
  );
}