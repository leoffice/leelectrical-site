// Adjust font size, colors, and size — live preview as you change.
import React, { useEffect, useMemo, useState } from "react";
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

function buildStyle(fontSize, color, backgroundColor, extra = {}) {
  const style = { ...extra };
  if (fontSize) style.fontSize = fontSize;
  if (color) style.color = color;
  if (backgroundColor) style.backgroundColor = backgroundColor;
  return style;
}

export default function LiveEditStylePanel({ target, currentStyle = {}, onChange, onClose }) {
  const [fontSize, setFontSize] = useState(currentStyle.fontSize || "");
  const [color, setColor] = useState(currentStyle.color || "");
  const [backgroundColor, setBackgroundColor] = useState(currentStyle.backgroundColor || "");

  useEffect(() => {
    setFontSize(currentStyle.fontSize || "");
    setColor(currentStyle.color || "");
    setBackgroundColor(currentStyle.backgroundColor || "");
  }, [target?.key, currentStyle.fontSize, currentStyle.color, currentStyle.backgroundColor]);

  const sizeStyle = useMemo(
    () => ({
      width: currentStyle.width,
      height: currentStyle.height,
      minHeight: currentStyle.minHeight,
    }),
    [currentStyle.height, currentStyle.minHeight, currentStyle.width]
  );

  const emit = (nextFont, nextColor, nextBg, extra = sizeStyle) => {
    onChange?.(buildStyle(nextFont, nextColor, nextBg, extra));
  };

  if (!target) return null;

  return (
    <FloatingPanel title="Adjust style" onClose={onClose} testId="live-edit-style">
      <p className="text-xs text-slate-500 mb-3">
        Styling <b className="text-slate-700">{target.label}</b> — changes show live. Drag corners to resize.
      </p>
      <div className="mb-3">
        <div className="text-xs font-bold text-slate-500 mb-1.5">Text size</div>
        <div className="flex flex-wrap gap-1.5">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className={`btn text-xs !py-1.5 !px-2.5 ${fontSize === s ? "bg-brand text-white" : "bg-slate-100 text-slate-700"}`}
              onClick={() => {
                const next = fontSize === s ? "" : s;
                setFontSize(next);
                emit(next, color, backgroundColor);
              }}
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
              onClick={() => {
                const next = color === c.value ? "" : c.value;
                setColor(next);
                emit(fontSize, next, backgroundColor);
              }}
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
              onClick={() => {
                const next = backgroundColor === c.value ? "" : c.value;
                setBackgroundColor(next);
                emit(fontSize, color, next);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="btn-brand w-full" onClick={onClose} data-testid="live-edit-style-done">
        Done
      </button>
    </FloatingPanel>
  );
}