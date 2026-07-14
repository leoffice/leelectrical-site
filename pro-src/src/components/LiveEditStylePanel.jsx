// Adjust font size and colors for a live-edited element.
import React, { useState } from "react";
import FloatingPanel from "./FloatingPanel.jsx";

const SIZES = ["12px", "14px", "16px", "18px", "20px", "24px"];
const COLORS = [
  { label: "Default", value: "" },
  { label: "Brand", value: "#4f46e5" },
  { label: "Green", value: "#059669" },
  { label: "Red", value: "#dc2626" },
  { label: "Amber", value: "#d97706" },
  { label: "White", value: "#ffffff" },
];

export default function LiveEditStylePanel({ target, currentStyle = {}, onSave, onClose }) {
  const [fontSize, setFontSize] = useState(currentStyle.fontSize || "");
  const [color, setColor] = useState(currentStyle.color || "");
  const [backgroundColor, setBackgroundColor] = useState(currentStyle.backgroundColor || "");

  if (!target) return null;

  const save = () => {
    const style = {};
    if (fontSize) style.fontSize = fontSize;
    if (color) style.color = color;
    if (backgroundColor) style.backgroundColor = backgroundColor;
    onSave(style);
  };

  return (
    <FloatingPanel title="Adjust style" onClose={onClose} testId="live-edit-style">
      <p className="text-xs text-slate-500 mb-3">
        Styling <b className="text-slate-700">{target.label}</b>
      </p>
      <div className="mb-3">
        <div className="text-xs font-bold text-slate-500 mb-1.5">Text size</div>
        <div className="flex flex-wrap gap-1.5">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className={`btn text-xs !py-1.5 !px-2.5 ${fontSize === s ? "bg-brand text-white" : "bg-slate-100 text-slate-700"}`}
              onClick={() => setFontSize(fontSize === s ? "" : s)}
              data-testid={`style-size-${s}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-3">
        <div className="text-xs font-bold text-slate-500 mb-1.5">Text color</div>
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c.label}
              type="button"
              className={`btn text-xs !py-1.5 !px-2.5 ${color === c.value ? "ring-2 ring-brand" : ""}`}
              style={c.value ? { backgroundColor: c.value, color: c.value === "#ffffff" ? "#333" : "#fff" } : undefined}
              onClick={() => setColor(color === c.value ? "" : c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4">
        <div className="text-xs font-bold text-slate-500 mb-1.5">Background</div>
        <div className="flex flex-wrap gap-1.5">
          {COLORS.slice(0, 4).map((c) => (
            <button
              key={"bg-" + c.label}
              type="button"
              className={`btn text-xs !py-1.5 !px-2.5 ${backgroundColor === c.value ? "ring-2 ring-brand" : ""}`}
              style={c.value ? { backgroundColor: c.value, color: "#fff" } : undefined}
              onClick={() => setBackgroundColor(backgroundColor === c.value ? "" : c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="btn-brand w-full" onClick={save} data-testid="live-edit-style-save">
        Apply style
      </button>
    </FloatingPanel>
  );
}