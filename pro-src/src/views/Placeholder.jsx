import React from "react";

export default function Placeholder({ icon, title, note }) {
  return (
    <div className="card px-6 py-14 text-center">
      <div className="text-4xl mb-3">{icon}</div>
      <h1 className="font-extrabold text-lg text-slate-900">{title}</h1>
      <p className="text-sm text-slate-500 mt-1 max-w-xs mx-auto">{note}</p>
      <span className="pill bg-accent-soft text-accent mt-4">coming soon</span>
    </div>
  );
}
