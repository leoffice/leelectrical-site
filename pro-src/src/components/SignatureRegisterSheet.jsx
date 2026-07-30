// Register a signature (draw on canvas OR upload) for a tenant owner.
// Stored on the company profile via onSave — shared by letters + Con Ed Part E.
import React, { useEffect, useRef, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import {
  listSignatures,
  ownersFromProfile,
  registerSignature,
  newOwnerId,
} from "../lib/signatureService.js";

/**
 * @param {object} props
 * @param {object} props.profile — current tenant profile
 * @param {(nextProfile: object) => void} props.onSave
 * @param {() => void} props.onClose
 */
export default function SignatureRegisterSheet({ profile, onSave, onClose }) {
  const owners = ownersFromProfile(profile);
  const [ownerId, setOwnerId] = useState(owners.find((o) => o.isDefaultSigner)?.id || owners[0]?.id || "");
  const [mode, setMode] = useState("draw"); // draw | upload
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [mode, ownerId]);

  const pos = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return {
      x: ((src.clientX - r.left) / r.width) * c.width,
      y: ((src.clientY - r.top) / r.height) * c.height,
    };
  };

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const end = () => {
    drawing.current = false;
  };

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
  };

  const saveDataUrl = (dataUrl) => {
    setErr("");
    setOk("");
    try {
      if (!ownerId) throw new Error("Pick a signer first.");
      const next = registerSignature(profile, { ownerId, dataUrl, makeDefault: true });
      onSave?.(next);
      setOk("Signature saved for this signer. Letters and Con Ed Form A will use it.");
    } catch (ex) {
      setErr(ex?.message || "Could not save signature");
    }
  };

  const saveDraw = () => {
    const c = canvasRef.current;
    if (!c) return;
    // Reject blank-ish canvas
    const ctx = c.getContext("2d");
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) ink++;
    }
    if (ink < 40) {
      setErr("Draw a signature first.");
      return;
    }
    saveDataUrl(c.toDataURL("image/png"));
  };

  const onUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setErr("Upload a PNG or JPG of the signature.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => saveDataUrl(String(reader.result || ""));
    reader.onerror = () => setErr("Could not read that image.");
    reader.readAsDataURL(file);
  };

  const sigs = listSignatures(profile);

  return (
    <Sheet title="Signatures" onClose={onClose} wide testId="signature-register-sheet">
      <p className="text-sm text-slate-500 mb-3">
        Draw or upload a signature once. The app applies it to letters and the Con Ed application
        for the selected signer.
      </p>

      <Fld label="Signer">
        <select
          className="input text-base min-h-[44px]"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          data-testid="signature-owner"
        >
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.fullName}
              {o.title ? ` — ${o.title}` : ""}
            </option>
          ))}
        </select>
      </Fld>

      <div className="flex gap-2 mb-3">
        <button
          type="button"
          className={"btn flex-1 !py-2.5 " + (mode === "draw" ? "bg-emerald-700 text-white" : "btn-ghost")}
          onClick={() => setMode("draw")}
        >
          Draw
        </button>
        <button
          type="button"
          className={"btn flex-1 !py-2.5 " + (mode === "upload" ? "bg-emerald-700 text-white" : "btn-ghost")}
          onClick={() => setMode("upload")}
        >
          Upload
        </button>
      </div>

      {mode === "draw" ? (
        <div className="mb-3">
          <canvas
            ref={canvasRef}
            width={560}
            height={180}
            className="w-full border-2 border-dashed border-slate-300 rounded-2xl bg-white touch-none"
            style={{ maxHeight: 180 }}
            onMouseDown={start}
            onMouseMove={move}
            onMouseUp={end}
            onMouseLeave={end}
            onTouchStart={start}
            onTouchMove={move}
            onTouchEnd={end}
            data-testid="signature-canvas"
          />
          <div className="flex gap-2 mt-2">
            <button type="button" className="btn-ghost flex-1 !py-2.5" onClick={clear}>
              Clear
            </button>
            <button
              type="button"
              className="btn bg-emerald-700 text-white flex-1 !py-2.5 font-bold"
              onClick={saveDraw}
              data-testid="signature-save-draw"
            >
              Save signature
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-3">
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            className="block w-full text-sm"
            onChange={onUpload}
            data-testid="signature-upload"
          />
        </div>
      )}

      {sigs.length ? (
        <div className="border border-slate-200 rounded-2xl p-3 mb-3" data-testid="signature-list">
          <div className="text-xs font-bold uppercase text-slate-400 mb-2">Saved</div>
          {sigs.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2 border-t border-slate-100 first:border-0">
              {s.dataUrl ? (
                <img src={s.dataUrl} alt="" className="h-10 max-w-[120px] object-contain bg-white border rounded" />
              ) : (
                <span className="text-xs text-slate-400">R2 key only</span>
              )}
              <div className="text-sm font-semibold text-slate-800">{s.label || s.id}</div>
            </div>
          ))}
        </div>
      ) : null}

      {err ? <p className="text-sm text-red-600 font-semibold mb-2">{err}</p> : null}
      {ok ? <p className="text-sm text-emerald-700 font-semibold mb-2" data-testid="signature-ok">{ok}</p> : null}

      <button type="button" className="btn-ghost w-full !py-3" onClick={onClose}>
        Done
      </button>
    </Sheet>
  );
}
