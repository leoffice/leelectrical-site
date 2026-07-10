// Zoomable payment proof image — wheel/pinch zoom, drag to pan, +/- buttons.
import React, { useCallback, useRef, useState } from "react";

const MIN_Z = 1;
const MAX_Z = 4;

export default function PaymentImageZoom({ src, alt = "Payment attachment" }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const drag = useRef(null);
  const box = useRef(null);

  const clampZoom = (z) => Math.min(MAX_Z, Math.max(MIN_Z, z));

  const setZoomPan = useCallback((z, p) => {
    setZoom(clampZoom(z));
    setPan(p || { x: 0, y: 0 });
  }, []);

  const pointerList = () => [...pointers.current.values()];

  const startPinch = () => {
    const pts = pointerList();
    if (pts.length < 2) return;
    pinch.current = {
      startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
      startZoom: zoom,
      startPan: { ...pan },
      midX: (pts[0].x + pts[1].x) / 2,
      midY: (pts[0].y + pts[1].y) / 2,
    };
    drag.current = null;
  };

  const onWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    const next = clampZoom(zoom + delta);
    if (next <= MIN_Z) setZoomPan(MIN_Z, { x: 0, y: 0 });
    else setZoom(next);
  };

  const onPointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try {
      box.current?.setPointerCapture?.(e.pointerId);
    } catch {}
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      startPinch();
      return;
    }
    if (pointers.current.size === 1 && zoom > MIN_Z) {
      drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinch.current) {
      const pts = pointerList();
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const ratio = d / (pinch.current.startDist || d);
      const nextZoom = clampZoom((pinch.current.startZoom || 1) * ratio);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const dx = midX - pinch.current.midX;
      const dy = midY - pinch.current.midY;
      setZoom(nextZoom);
      setPan({
        x: pinch.current.startPan.x + dx,
        y: pinch.current.startPan.y + dy,
      });
      return;
    }

    if (pointers.current.size === 1 && drag.current && zoom > MIN_Z) {
      setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
    }
  };

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
    else if (pointers.current.size === 1 && zoom > MIN_Z) {
      const pt = pointerList()[0];
      drag.current = { x: pt.x - pan.x, y: pt.y - pan.y };
    }
    try {
      box.current?.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const zoomIn = () => setZoom((z) => clampZoom(z + 0.5));
  const zoomOut = () => {
    const next = clampZoom(zoom - 0.5);
    if (next <= MIN_Z) setZoomPan(MIN_Z, { x: 0, y: 0 });
    else setZoom(next);
  };

  if (!src) return null;

  return (
    <div className="mb-3" data-testid="payment-image-zoom">
      <div
        ref={box}
        className="relative rounded-xl border border-slate-200 bg-slate-50 overflow-hidden h-48 touch-none select-none cursor-grab active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: "none" }}
      >
        <div
          className="w-full h-full flex items-center justify-center"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            willChange: "transform",
          }}
        >
          <img src={src} alt={alt} className="max-h-44 max-w-full object-contain pointer-events-none" draggable={false} />
        </div>
        <div className="absolute top-2 right-2 flex gap-1 pointer-events-auto">
          <button
            type="button"
            className="w-7 h-7 rounded-full bg-white/90 border border-slate-200 text-sm font-bold shadow"
            onClick={zoomOut}
            aria-label="Zoom out"
            data-testid="zoom-out"
          >
            −
          </button>
          <button
            type="button"
            className="w-7 h-7 rounded-full bg-white/90 border border-slate-200 text-sm font-bold shadow"
            onClick={zoomIn}
            aria-label="Zoom in"
            data-testid="zoom-in"
          >
            +
          </button>
        </div>
      </div>
      <p className="text-[10px] text-slate-400 mt-1">Pinch or scroll to zoom · drag to pan</p>
    </div>
  );
}