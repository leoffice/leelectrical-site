// Description input with ✨ Polish — work-scope language tuned for estimates & invoices.
import React, { useState } from "react";
import { Fld } from "./Sheet.jsx";
import { WORK_DESCRIPTION_STYLES, polishWorkDescription } from "../lib/workDescriptionPolish.js";

export default function DescriptionField({
  label = "Description",
  hint,
  value,
  onChange,
  placeholder = "Work performed, scope notes…",
  multiline = false,
  minRows,
  context = {},
  testId = "description-field",
  ariaLabel = "Description",
}) {
  const [open, setOpen] = useState(false);
  const [lastStyle, setLastStyle] = useState(null);

  const apply = (key) => {
    setLastStyle(key);
    onChange(polishWorkDescription(value, key, context));
    setOpen(false);
  };

  const styleLabel = WORK_DESCRIPTION_STYLES.find((s) => s.key === lastStyle)?.label || "";
  const sizeClass = multiline ? "input min-h-[60px]" : "input";
  const inputProps = {
    className: sizeClass,
    value: value || "",
    onChange: (e) => onChange(e.target.value),
    placeholder,
    "aria-label": ariaLabel,
    "data-testid": testId,
    ...(multiline && minRows ? { style: { minHeight: minRows + "px" } } : {}),
  };

  return (
    <Fld label={label} hint={hint}>
      {multiline ? <textarea {...inputProps} /> : <input {...inputProps} />}
      <div className="relative mt-2">
        <button
          type="button"
          className="btn w-full !py-2 bg-purple-50 text-purple-900 border border-purple-200"
          onClick={() => setOpen((v) => !v)}
          data-testid={testId + "-polish-btn"}
        >
          ✨ Polish the language{styleLabel ? " — " + styleLabel : ""}
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
    </Fld>
  );
}