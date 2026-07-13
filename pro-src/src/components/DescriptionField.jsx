// Description input with ✨ Polish — work-scope language tuned for estimates & invoices.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Fld } from "./Sheet.jsx";
import { WORK_DESCRIPTION_STYLES, polishWorkDescription } from "../lib/workDescriptionPolish.js";
import { buildDescriptionPdf } from "../lib/descriptionPdf.js";
import { todayStr } from "../lib/format.js";

const MIN_TEXTAREA_PX = 96;
const MAX_TEXTAREA_PX = 320;

export default function DescriptionField({
  label = "Description",
  hint,
  value,
  onChange,
  placeholder = "Work performed, scope notes…",
  multiline = true,
  minRows,
  context = {},
  testId = "description-field",
  ariaLabel = "Description",
}) {
  const [open, setOpen] = useState(false);
  const [lastStyle, setLastStyle] = useState(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const taRef = useRef(null);
  const pdfUrlRef = useRef("");

  const resize = useCallback(() => {
    const el = taRef.current;
    if (!el || !multiline) return;
    el.style.height = "auto";
    const next = Math.min(MAX_TEXTAREA_PX, Math.max(MIN_TEXTAREA_PX, el.scrollHeight));
    el.style.height = next + "px";
  }, [multiline]);

  useEffect(() => {
    resize();
  }, [value, resize]);

  useEffect(
    () => () => {
      if (pdfUrlRef.current && URL.revokeObjectURL) URL.revokeObjectURL(pdfUrlRef.current);
    },
    []
  );

  const apply = (key) => {
    setLastStyle(key);
    onChange(polishWorkDescription(value, key, context));
    setOpen(false);
  };

  const viewPdf = () => {
    const text = String(value || "").trim();
    if (!text) return;
    if (pdfUrlRef.current && URL.revokeObjectURL) URL.revokeObjectURL(pdfUrlRef.current);
    const blob = buildDescriptionPdf({
      title: "LE Electrical",
      subtitle: [context.jobTitle, context.address].filter(Boolean).join(" · ") || label,
      body: text,
      footer: "Generated " + todayStr() + " · LE Pro",
    });
    const url = URL.createObjectURL(blob);
    pdfUrlRef.current = url;
    setPdfUrl(url);
  };

  const closePdf = () => {
    if (pdfUrlRef.current && URL.revokeObjectURL) URL.revokeObjectURL(pdfUrlRef.current);
    pdfUrlRef.current = "";
    setPdfUrl("");
  };

  const styleLabel = WORK_DESCRIPTION_STYLES.find((s) => s.key === lastStyle)?.label || "";
  const minH = minRows ? minRows + "px" : MIN_TEXTAREA_PX + "px";
  const inputProps = {
    className: multiline ? "input resize-y leading-relaxed" : "input",
    value: value || "",
    onChange: (e) => onChange(e.target.value),
    placeholder,
    "aria-label": ariaLabel,
    "data-testid": testId,
    ...(multiline
      ? {
          ref: taRef,
          rows: 4,
          style: { minHeight: minH, maxHeight: MAX_TEXTAREA_PX + "px" },
          onInput: resize,
        }
      : {}),
  };

  return (
    <Fld label={label} hint={hint}>
      {multiline ? <textarea {...inputProps} /> : <input {...inputProps} />}
      <div className="grid grid-cols-2 gap-2 mt-2">
        <div className="relative">
          <button
            type="button"
            className="btn w-full !py-2 bg-purple-50 text-purple-900 border border-purple-200"
            onClick={() => setOpen((v) => !v)}
            data-testid={testId + "-polish-btn"}
          >
            ✨ Polish{styleLabel ? " — " + styleLabel : ""}
          </button>
          {open ? (
            <div
              className="absolute left-0 right-0 top-full mt-1 z-20 grid grid-cols-2 gap-1.5 p-2 bg-white border border-purple-200 rounded-2xl shadow-lg max-h-52 overflow-y-auto"
              data-testid={testId + "-polish-menu"}
            >
              {WORK_DESCRIPTION_STYLES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={
                    "btn text-left !py-2 !px-2.5 text-xs " +
                    (lastStyle === s.key ? "bg-purple-100 text-purple-900 ring-2 ring-purple-300" : "bg-slate-50 text-slate-800")
                  }
                  onClick={() => apply(s.key)}
                  data-testid={testId + "-polish-" + s.key}
                >
                  <span className="mr-0.5">{s.emoji}</span> {s.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="btn w-full !py-2 bg-slate-50 text-slate-800 border border-slate-200 disabled:opacity-40"
          onClick={viewPdf}
          disabled={!String(value || "").trim()}
          data-testid={testId + "-view-pdf-btn"}
        >
          📄 View in PDF
        </button>
      </div>

      {pdfUrl ? (
        <div className="fixed inset-0 z-[70] bg-slate-900 flex flex-col" data-fullscreen-pdf data-testid={testId + "-pdf-overlay"}>
          <div className="flex items-center gap-2 px-4 py-2.5 text-white shrink-0 pt-safe">
            <span className="font-bold text-sm flex-1 truncate">{label} preview</span>
            <button
              type="button"
              className="text-xs font-bold bg-white/15 rounded-lg px-3 py-1.5"
              onClick={() => window.open(pdfUrl)}
            >
              ⤢ Open in new tab
            </button>
            <button
              type="button"
              aria-label="Close PDF"
              className="w-8 h-8 rounded-full bg-white/15 text-white font-bold text-sm shrink-0"
              onClick={closePdf}
              data-testid={testId + "-pdf-close"}
            >
              ✕
            </button>
          </div>
          <iframe src={pdfUrl} title={label + " PDF"} className="flex-1 w-full bg-white border-0" data-testid={testId + "-pdf-frame"} />
        </div>
      ) : null}
    </Fld>
  );
}