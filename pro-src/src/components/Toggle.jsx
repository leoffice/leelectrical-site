import React from "react";

export default function Toggle({ on, onChange, small, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!on}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange && onChange(!on);
      }}
      className={`relative rounded-full transition-colors shrink-0 ${small ? "w-8 h-5" : "w-10 h-6"} ${
        on ? "bg-emerald-500" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 bg-white rounded-full shadow transition-transform ${
          small ? "w-4 h-4" : "w-5 h-5"
        } ${on ? (small ? "translate-x-3" : "translate-x-4") : ""}`}
      />
    </button>
  );
}
