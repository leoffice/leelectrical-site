// Build a QuickBooks estimate or invoice — line items, service address, attachments.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import { useStore } from "../state/store.jsx";
import { DEFAULT_QBO_ITEMS, filterQboItems } from "../data/qboItems.js";
import { serviceAddressHint, serviceAddressLabel } from "../lib/customerSync.js";
import { emptyLine, initialLines, lineAmount, linesTotal } from "../lib/qboDoc.js";
import { planDocSaveSync } from "../lib/docSync.js";
import { fmt$ } from "../lib/format.js";

function LineRow({ line, index, items, onChange, onRemove, canRemove }) {
  const [itemQ, setItemQ] = useState(line.itemName || "");
  const [open, setOpen] = useState(false);
  const picks = useMemo(() => filterQboItems(items, itemQ), [items, itemQ]);

  const pick = (it) => {
    onChange(index, {
      itemName: it.name,
      itemId: it.id || "",
      unitPrice: it.price != null ? it.price : line.unitPrice,
      description: line.description || it.description || "",
    });
    setItemQ(it.name);
    setOpen(false);
  };

  return (
    <div className="card px-3 py-3 mb-2 space-y-2" data-testid="doc-line-row">
      <Fld label={"Line " + (index + 1) + " — Product/Service"}>
        <div className="relative">
          <input
            className="input"
            value={itemQ}
            onChange={(e) => {
              setItemQ(e.target.value);
              onChange(index, { itemName: e.target.value });
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search QuickBooks items…"
            aria-label={"Product service line " + (index + 1)}
          />
          {open && picks.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
              {picks.map((it) => (
                <button
                  key={it.name}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0"
                  onClick={() => pick(it)}
                >
                  <span className="font-semibold text-slate-800 block truncate">{it.name}</span>
                  <span className="text-xs text-slate-500">
                    {it.price ? fmt$(it.price) : "custom price"}
                    {it.description ? " · " + it.description.slice(0, 40) : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Fld>
      <Fld label="Description">
        <input
          className="input"
          value={line.description || ""}
          onChange={(e) => onChange(index, { description: e.target.value })}
          placeholder="Work performed, scope notes…"
          aria-label={"Description line " + (index + 1)}
        />
      </Fld>
      <div className="flex gap-2">
        <Fld label="Qty">
          <input
            className="input"
            inputMode="decimal"
            value={line.qty}
            onChange={(e) => onChange(index, { qty: e.target.value })}
            aria-label={"Quantity line " + (index + 1)}
          />
        </Fld>
        <Fld label="Rate">
          <input
            className="input"
            inputMode="decimal"
            value={line.unitPrice}
            onChange={(e) => onChange(index, { unitPrice: e.target.value })}
            aria-label={"Rate line " + (index + 1)}
          />
        </Fld>
        <div className="shrink-0 pt-6 text-sm font-bold text-slate-700 w-20 text-right">{fmt$(lineAmount(line))}</div>
      </div>
      {canRemove ? (
        <button type="button" className="text-xs font-semibold text-red-500" onClick={() => onRemove(index)}>
          Remove line
        </button>
      ) : null}
    </div>
  );
}

export default function DocBuilderSheet({
  job,
  kind,
  mode = "create",
  progressPct,
  onClose,
  onDone,
}) {
  const { patchAndSave, enqueue, logSend, showToast, api } = useStore();
  const [serviceAddress, setServiceAddress] = useState(job.serviceAddress || job.address || "");
  const [apartment, setApartment] = useState(job.apartment || "");
  const [lines, setLines] = useState(() => initialLines(job, { kind, mode, progressPct }));
  const [attachments, setAttachments] = useState([]);
  const [attName, setAttName] = useState("");
  const [attUrl, setAttUrl] = useState("");
  const [items, setItems] = useState(DEFAULT_QBO_ITEMS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await api.searchItems("");
        if (!cancelled && remote && remote.length) setItems(remote);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const total = useMemo(() => linesTotal(lines), [lines]);
  const title =
    mode === "edit"
      ? "Edit " + (kind === "estimate" ? "estimate" : "invoice")
      : kind === "estimate"
      ? "Generate estimate"
      : mode === "from_estimate" || mode === "turn_from_estimate"
      ? "Invoice from estimate" + (progressPct != null ? " (" + progressPct + "%)" : "")
      : "Create invoice";

  const changeLine = useCallback((i, patch) => {
    setLines((rows) => rows.map((ln, idx) => (idx === i ? { ...ln, ...patch } : ln)));
  }, []);

  const addAtt = () => {
    const n = attName.trim();
    const u = attUrl.trim();
    if (!n) return showToast("Name the attachment");
    setAttachments((a) => a.concat([{ name: n, url: u }]));
    setAttName("");
    setAttUrl("");
  };

  const submit = async (send) => {
    const valid = lines.filter((ln) => (ln.itemName || "").trim());
    if (!valid.length) return showToast("Add at least one product/service line");
    if (!serviceAddress.trim()) return showToast("Service address is required");
    if (send && !job.email) return showToast("Add customer email to send");

    setSaving(true);
    try {
      const { jobPatch, commands } = planDocSaveSync(job, {
        kind,
        mode,
        lines: valid,
        serviceAddress,
        apartment,
        progressPct,
        send,
      });

      await patchAndSave(job.id, jobPatch);
      for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i];
        const payload = { ...cmd.payload, attachments: i === 0 ? attachments : [] };
        await enqueue(cmd.type, job.id, payload, "judgment", cmd.idk);
      }

      for (const att of attachments) {
        const attachType = kind === "estimate" ? "attach_to_estimate" : "attach_to_invoice";
        const docNo = kind === "estimate" ? job.estimateNo : job.invoiceNo;
        await enqueue(
          attachType,
          job.id,
          {
            estimateNo: job.estimateNo || "",
            invoiceNo: job.invoiceNo || "",
            name: att.name,
            url: att.url || "",
            pendingDoc: true,
          },
          "deterministic",
          "att:" + kind + ":" + job.id + ":" + att.name
        );
      }

      if (send && job.email) {
        const noKey = kind === "estimate" ? "estimateNo" : "invoiceNo";
        const no = job[noKey];
        if (no) {
          await enqueue(
            "send_" + kind,
            job.id,
            { email: job.email, [noKey]: no },
            "deterministic",
            "send_" + kind + ":" + no
          );
          logSend(job.id, (kind === "estimate" ? "Estimate" : "Invoice") + " send queued after create", job.email);
        }
      }

      showToast(
        send
          ? "Queued — " + (mode === "edit" ? "updating" : "creating") + " in QuickBooks & sending to " + job.email
          : "Queued — Save & sync to QuickBooks"
      );
      onDone && onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title={title + " — " + (job.customer || "")} onClose={onClose} wide>
      <p className="text-[11px] text-slate-400 -mt-1 mb-3">
        Pre-filled from job info. Line items use exact QuickBooks Products &amp; Services names.
      </p>

      <Fld label={serviceAddressLabel(job)} hint={serviceAddressHint(job)}>
        <input
          className="input"
          value={serviceAddress}
          onChange={(e) => setServiceAddress(e.target.value)}
          aria-label="Service address"
          data-testid="doc-service-address"
        />
      </Fld>
      <Fld label="Apartment / unit" hint="Optional — appended to ShipAddr in QuickBooks">
        <input className="input" value={apartment} onChange={(e) => setApartment(e.target.value)} aria-label="Apartment" />
      </Fld>

      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mt-2 mb-2">Line items</p>
      {lines.map((ln, i) => (
        <LineRow
          key={i}
          line={ln}
          index={i}
          items={items}
          onChange={changeLine}
          onRemove={(idx) => setLines((rows) => rows.filter((_, j) => j !== idx))}
          canRemove={lines.length > 1}
        />
      ))}
      <button type="button" className="btn-ghost w-full !py-2 mb-3" onClick={() => setLines((rows) => rows.concat([emptyLine()]))}>
        ＋ Add line
      </button>

      <div className="flex justify-between items-center px-1 mb-3">
        <span className="text-sm font-bold text-slate-600">Total</span>
        <span className="text-lg font-extrabold text-slate-900" data-testid="doc-total">
          {fmt$(total) || "$0"}
        </span>
      </div>

      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Attachments</p>
      {attachments.map((a, i) => (
        <div key={i} className="text-sm flex gap-2 py-1 border-b border-dashed border-slate-200">
          <span className="flex-1 truncate">📎 {a.name}</span>
          <button type="button" className="text-red-500 text-xs" onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <div className="flex gap-2 mb-1">
        <input className="input flex-1" placeholder="Name" value={attName} onChange={(e) => setAttName(e.target.value)} aria-label="Attachment name" />
        <input className="input flex-1" placeholder="Link (optional)" value={attUrl} onChange={(e) => setAttUrl(e.target.value)} aria-label="Attachment URL" />
      </div>
      <button type="button" className="btn-ghost w-full !py-1.5 mb-4" onClick={addAtt}>
        ＋ Add attachment
      </button>

      <button type="button" className="btn-brand w-full mb-2" disabled={saving} onClick={() => submit(false)} data-testid="doc-save-sync">
        Save &amp; sync
      </button>
      <button
        type="button"
        className="btn bg-brand-soft text-brand w-full"
        disabled={saving || !job.email}
        onClick={() => submit(true)}
        data-testid="doc-save-send"
      >
        Save &amp; send{job.email ? " to " + job.email : ""}
      </button>
      {!job.email ? <p className="text-[11px] text-slate-400 text-center mt-2">Add email on the customer card to enable Send.</p> : null}
    </Sheet>
  );
}