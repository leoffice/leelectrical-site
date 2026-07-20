// Takeoff Sheet — attach blueprints → process on the server → edit the detected
// line items → submit them onto the requisition/invoice SOV, and export the
// sheet (PDF / Excel / CSV). The correction diff (skill output vs human final)
// is logged for later skill calibration.
//
// Server processing runs the blueprint-symbol-takeoff skill (vector-PDF path).
// It CANNOT run in the browser (PyMuPDF/OpenCV are native), so files are sent to
// the `takeoff` function which stores them in R2 and returns worker-output JSON.
// In a demo build the fetch interceptor answers synthetically — the whole flow
// still works end to end.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../data/adapter.js";
import {
  normalizeWorkerOutput,
  blankManualItem,
  totalQty,
  totalValue,
  lineValue,
  takeoffItemsToSovItems,
  correctionDiff,
} from "../lib/takeoffModel.js";
import { buildTakeoffCsv, buildTakeoffXlsx } from "../lib/takeoffExport.js";
import { buildTakeoffPdf } from "../lib/takeoffPdf.js";
import { downloadPdfBlob } from "../lib/pdfOpen.js";
import {
  ensureProjectDefaults,
  findProject,
  normalizeProjects,
  projectDisplayName,
  upsertProject,
} from "../lib/requisitionData.js";

const ACCEPT = ".pdf,application/pdf,image/*";

function fileToB64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error || new Error("read failed"));
    r.onloadend = () => {
      const s = String(r.result || "");
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    r.readAsDataURL(file);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function fmtUsd(n) {
  return (Number(n) || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const CONF_STYLE = {
  direct: "bg-emerald-100 text-emerald-800",
  supported: "bg-sky-100 text-sky-800",
  inferred: "bg-amber-100 text-amber-800",
  unconfirmed: "bg-rose-100 text-rose-800",
  manual: "bg-slate-200 text-slate-700",
};

export default function Takeoff() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [projects, setProjects] = useState({ list: [] });
  const [targetId, setTargetId] = useState(projectId || "");
  const [files, setFiles] = useState([]); // { id, name, mime, size, b64, selected }
  const [phase, setPhase] = useState("attach"); // attach | review
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // normalized worker-output meta
  const [skillItems, setSkillItems] = useState([]); // snapshot for the diff
  const [items, setItems] = useState([]); // editable rows
  const [submitInfo, setSubmitInfo] = useState(null);
  const manualSeq = useRef(0);
  const fileInput = useRef(null);

  // Load projects once so we can target one and read its name.
  useEffect(() => {
    let alive = true;
    (async () => {
      const raw = await api.getProjects?.().catch(() => ({ list: [] }));
      const norm = normalizeProjects(raw);
      if (!alive) return;
      setProjects(norm);
      if (!projectId) {
        const first = (norm.list || [])[0];
        if (first) setTargetId(first.id);
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  const targetProject = useMemo(
    () => (targetId ? findProject(projects, targetId) : null),
    [projects, targetId]
  );
  const targetName = targetProject ? projectDisplayName(ensureProjectDefaults(targetProject)) : "";

  const selectedFiles = files.filter((f) => f.selected);

  /* ─────────────────────────── attach files ─────────────────────────── */

  const onPick = useCallback(async (fileList) => {
    setError("");
    const arr = Array.from(fileList || []);
    const added = [];
    for (const file of arr) {
      try {
        const b64 = await fileToB64(file);
        added.push({
          id: `f-${Date.now()}-${Math.round(added.length)}-${file.name}`,
          name: file.name,
          mime: file.type || "application/octet-stream",
          size: file.size,
          b64,
          selected: true,
        });
      } catch {
        /* skip unreadable file */
      }
    }
    setFiles((prev) => [...prev, ...added]);
  }, []);

  const toggleFile = (id) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f)));
  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));

  /* ───────────────────────────── process ────────────────────────────── */

  const runProcess = async () => {
    if (!selectedFiles.length) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.processTakeoff({
        projectId: targetId,
        jobId: targetProject?.jobId || "",
        symbolClasses: [],
        files: selectedFiles.map((f) => ({ name: f.name, mime: f.mime, b64: f.b64 })),
      });
      // The endpoint returns worker-output (single doc or { documents:[...] }).
      const payload = res && res.documents ? res.documents : res;
      const norm = normalizeWorkerOutput(payload);
      if (!norm.items.length && res && res.error) {
        setError(String(res.error));
      }
      setResult(norm);
      setSkillItems(norm.items.map((it) => ({ ...it })));
      setItems(norm.items.map((it) => ({ ...it })));
      setPhase("review");
    } catch (e) {
      setError(e && e.message ? e.message : "Processing failed.");
    } finally {
      setBusy(false);
    }
  };

  /* ───────────────────────────── edit rows ──────────────────────────── */

  const patchItem = (id, patch) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id) => setItems((prev) => prev.filter((it) => it.id !== id));
  const addManual = () => setItems((prev) => [...prev, blankManualItem(manualSeq.current++)]);

  /* ───────────────────────────── exports ────────────────────────────── */

  const exportMeta = () => ({
    number: `TK-${new Date().toISOString().slice(0, 10)}`,
    date: new Date().toISOString().slice(0, 10),
    jobName: targetName,
    addressLines: [],
    engineNote: result
      ? `Detected by: ${result.engine}. Counts are a takeoff estimate.`
      : "",
    title: `Takeoff — ${targetName || "Job"}`,
    subtitle: result ? `Engine: ${result.engine}` : "",
  });

  const exportPdf = () => {
    try {
      const blob = buildTakeoffPdf(items, exportMeta());
      downloadPdfBlob(blob, `takeoff-${targetName || "job"}.pdf`.replace(/\s+/g, "-"));
    } catch (e) {
      setError("PDF export failed: " + (e && e.message));
    }
  };
  const exportXlsx = () => {
    const blob = buildTakeoffXlsx(items, exportMeta());
    downloadBlob(blob, `takeoff-${targetName || "job"}.xlsx`.replace(/\s+/g, "-"));
  };
  const exportCsv = () => {
    const csv = buildTakeoffCsv(items, exportMeta());
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `takeoff-${targetName || "job"}.csv`.replace(/\s+/g, "-"));
  };

  /* ───────────────────────────── submit ─────────────────────────────── */

  const submit = async () => {
    if (!items.length) return;
    setBusy(true);
    setError("");
    try {
      const raw = await api.getProjects?.().catch(() => ({ list: [] }));
      const list = normalizeProjects(raw);
      let proj = targetId ? findProject(list, targetId) : null;
      if (!proj) {
        proj = ensureProjectDefaults({
          id: targetId || `proj-${Date.now()}`,
          name: targetName || "Takeoff project",
          items: [],
          requisitionEnabled: true,
        });
      }
      const sov = takeoffItemsToSovItems(items, { idPrefix: `tk${Date.now()}` });
      const patched = ensureProjectDefaults({
        ...proj,
        items: [...(proj.items || []), ...sov],
        requisitionEnabled: true,
      });
      const next = upsertProject(list, patched);
      await api.saveProjects?.(next);

      // Log the correction diff (skill output vs human final) for calibration.
      const diff = correctionDiff(skillItems, items);
      await api.appendTakeoffFeedback?.({
        projectId: patched.id,
        engine: result?.engine || "unknown",
        files: selectedFiles.map((f) => f.name),
        itemCount: items.length,
        addedLines: sov.length,
        diff,
      });

      setSubmitInfo({ projectId: patched.id, added: sov.length, changed: diff.changedCount });
    } catch (e) {
      setError("Submit failed: " + (e && e.message));
    } finally {
      setBusy(false);
    }
  };

  /* ──────────────────────────────── UI ──────────────────────────────── */

  return (
    <div className="mx-auto max-w-4xl p-4 pb-24">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">📐 Takeoff Sheet</h1>
          <p className="text-sm text-slate-500">
            Generate an editable material/device count from job blueprints, then push it onto the requisition.
          </p>
        </div>
        <button
          className="text-sm text-slate-500 hover:text-slate-700"
          onClick={() => navigate(targetId ? `/projects/${targetId}` : "/projects")}
        >
          ← Requisition
        </button>
      </div>

      {/* Target project */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Takeoff for
        </label>
        <div className="mt-1 flex items-center gap-2">
          <select
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            {!targetId && <option value="">Select a project…</option>}
            {(projects.list || []).map((p) => (
              <option key={p.id} value={p.id}>
                {projectDisplayName(ensureProjectDefaults(p))}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {/* ───── attach + choose files ───── */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700">1. Attach blueprints</h2>
          <button
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            onClick={() => fileInput.current?.click()}
          >
            + Add files
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              onPick(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        {!files.length ? (
          <p className="mt-2 text-sm text-slate-400">
            Attach PDF plan sets or images. Vector PDFs give the most accurate counts.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  checked={f.selected}
                  onChange={() => toggleFile(f.id)}
                  className="h-4 w-4"
                />
                <span className="flex-1 truncate text-sm text-slate-700">{f.name}</span>
                <span className="text-xs text-slate-400">{Math.round((f.size || 0) / 1024)} KB</span>
                <button className="text-xs text-rose-500 hover:text-rose-700" onClick={() => removeFile(f.id)}>
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <button
            disabled={!selectedFiles.length || busy || !targetId}
            onClick={runProcess}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy && phase === "attach" ? "Processing…" : `Create Takeoff Sheet (${selectedFiles.length})`}
          </button>
        </div>
      </div>

      {/* ───── review + edit ───── */}
      {phase === "review" && result && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700">2. Review &amp; adjust</h2>
            <span className="text-xs text-slate-400">
              {totalQty(items)} pieces · {items.length} lines
            </span>
          </div>

          <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <b>Engine:</b> {result.engine}. {result.notes || "Counts are a takeoff estimate — verify before ordering."}
            {result.anomalies?.length ? ` · Flags: ${result.anomalies.join("; ")}` : ""}
          </div>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-400">
                  <th className="py-1 pr-2">Symbol</th>
                  <th className="py-1 pr-2">Description</th>
                  <th className="py-1 pr-2 text-right">Qty</th>
                  <th className="py-1 pr-2">Unit</th>
                  <th className="py-1 pr-2 text-right">Unit&nbsp;$</th>
                  <th className="py-1 pr-2 text-right">Amount</th>
                  <th className="py-1 pr-2">Conf.</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-slate-100">
                    <td className="py-1 pr-2">
                      <input
                        className="w-16 rounded border border-slate-200 px-1 py-0.5"
                        value={it.symbol || ""}
                        onChange={(e) => patchItem(it.id, { symbol: e.target.value })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        className="w-full min-w-[140px] rounded border border-slate-200 px-1 py-0.5"
                        value={it.description || ""}
                        onChange={(e) => patchItem(it.id, { description: e.target.value, symbolClass: it.symbolClass || e.target.value })}
                      />
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <input
                        type="number"
                        min="0"
                        className="w-16 rounded border border-slate-200 px-1 py-0.5 text-right"
                        value={it.qty}
                        onChange={(e) => patchItem(it.id, { qty: Number(e.target.value) })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        className="w-12 rounded border border-slate-200 px-1 py-0.5"
                        value={it.unit || "EA"}
                        onChange={(e) => patchItem(it.id, { unit: e.target.value })}
                      />
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-20 rounded border border-slate-200 px-1 py-0.5 text-right"
                        value={it.unitPrice}
                        onChange={(e) => patchItem(it.id, { unitPrice: Number(e.target.value) })}
                      />
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-slate-600">{fmtUsd(lineValue(it))}</td>
                    <td className="py-1 pr-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${CONF_STYLE[it.manual ? "manual" : it.confidence] || CONF_STYLE.unconfirmed}`}>
                        {it.manual ? "manual" : it.confidence}
                      </span>
                    </td>
                    <td className="py-1 text-right">
                      <button className="text-xs text-rose-400 hover:text-rose-600" onClick={() => removeItem(it.id)}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold text-slate-700">
                  <td className="py-1 pr-2" colSpan={2}>Total</td>
                  <td className="py-1 pr-2 text-right">{totalQty(items)}</td>
                  <td colSpan={2}></td>
                  <td className="py-1 pr-2 text-right tabular-nums">{fmtUsd(totalValue(items))}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-2">
            <button className="text-sm font-semibold text-brand hover:underline" onClick={addManual}>
              + Add item
            </button>
          </div>

          {/* exports */}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <span className="self-center text-xs font-semibold uppercase text-slate-400">Export</span>
            <button className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200" onClick={exportPdf}>
              PDF
            </button>
            <button className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200" onClick={exportXlsx}>
              Excel
            </button>
            <button className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200" onClick={exportCsv}>
              CSV
            </button>
          </div>

          {/* submit */}
          <div className="mt-4 border-t border-slate-100 pt-3">
            {submitInfo ? (
              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Added {submitInfo.added} line item{submitInfo.added === 1 ? "" : "s"} to the requisition.
                {" "}
                Correction log saved ({submitInfo.changed} adjustment{submitInfo.changed === 1 ? "" : "s"}).{" "}
                <button className="font-bold underline" onClick={() => navigate(`/projects/${submitInfo.projectId}`)}>
                  Open requisition →
                </button>
              </div>
            ) : (
              <button
                disabled={busy || !items.length || !targetId}
                onClick={submit}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                {busy ? "Submitting…" : "Submit → add to requisition"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
