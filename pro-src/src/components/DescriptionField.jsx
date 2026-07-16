// Description input with optional ✨ Polish — work-scope language for estimates & invoices.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Fld } from "./Sheet.jsx";
import { WORK_DESCRIPTION_STYLES, polishWorkDescription } from "../lib/workDescriptionPolish.js";

const MIN_TEXTAREA_PX = 96;
const MAX_TEXTAREA_PX = 320;

/** Compact polish control — sits next to amount (or anywhere). */
export function PolishButton({
  value,
  onChange,
  context = {},
  testId = "description-field",
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const [lastStyle, setLastStyle] = useState(null);
  const [prePolish, setPrePolish] = useState(null);

  const apply = (key) => {
    setPrePolish(value ?? "");
    setLastStyle(key);
    onChange(polishWorkDescription(value, key, context));
    setOpen(false);
  };

  const revert = () => {
    if (prePolish == null) return;
    onChange(prePolish);
    setPrePolish(null);
    setLastStyle(null);
    setOpen(false);
  };

  const styleLabel = WORK_DESCRIPTION_STYLES.find((s) => s.key === lastStyle)?.label || "";

  return (
    <div className={compact ? "relative shrink-0" : "relative"}>
      <button
        type="button"
        className={
          compact
            ? "btn !py-1.5 !px-2.5 text-xs bg-purple-50 text-purple-900 border border-purple-200 whitespace-nowrap"
            : "btn w-full !py-2 bg-purple-50 text-purple-900 border border-purple-200"
        }
        onClick={() => setOpen((v) => !v)}
        data-testid={testId + "-polish-btn"}
      >
        ✨ Polish{styleLabel && !compact ? " — " + styleLabel : ""}
      </button>
      {open ? (
        <div
          className={
            "absolute z-20 flex flex-col gap-1 p-2 bg-white border border-purple-200 rounded-2xl shadow-lg max-h-56 overflow-y-auto " +
            (compact ? "right-0 top-full mt-1 w-48" : "left-0 right-0 top-full mt-1")
          }
          data-testid={testId + "-polish-menu"}
        >
          {prePolish != null ? (
            <button
              type="button"
              className="btn w-full text-left !py-2 !px-3 text-sm leading-snug bg-amber-50 text-amber-950 border border-amber-200"
              onClick={revert}
              data-testid={testId + "-polish-revert"}
            >
              ↩ Revert
            </button>
          ) : null}
          {WORK_DESCRIPTION_STYLES.map((s) => (
            <button
              key={s.key}
              type="button"
              className={
                "btn w-full text-left !py-2 !px-3 text-sm leading-snug " +
                (lastStyle === s.key ? "bg-purple-100 text-purple-900 ring-2 ring-purple-300" : "bg-slate-50 text-slate-800")
              }
              onClick={() => apply(s.key)}
              data-testid={testId + "-polish-" + s.key}
            >
              <span className="mr-1">{s.emoji}</span>
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
      {prePolish != null && !open && !compact ? (
        <button
          type="button"
          className="btn w-full !py-1.5 mt-1 text-sm bg-amber-50 text-amber-950 border border-amber-200"
          onClick={revert}
          data-testid={testId + "-polish-revert-btn"}
        >
          ↩ Revert to previous
        </button>
      ) : null}
    </div>
  );
}

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
  showPolish = true,
}) {
  const taRef = useRef(null);

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
      {showPolish ? (
        <div className="mt-2">
          <PolishButton value={value} onChange={onChange} context={context} testId={testId} />
        </div>
      ) : null}
    </Fld>
  );
}
