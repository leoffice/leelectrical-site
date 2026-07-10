// Zoomable payment proof image — wheel/pinch zoom, drag to pan, +/- buttons.
import React, { useCallback, useRef, useState } from "react";

const MIN_Z = 1;
const MAX_Z = 4;

export default function PaymentImageZoom({ src, alt = "Payment attachment" }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  const pinch = useRef(null);
  const box = useRef(null);

  const clampZoom = (z) => Math.min(MAX_Z, Math.max(MIN_Z, z));

  const setZoomPan = useCallback((z, p) => {
    setZoom(clampZoom(z));
    setPan(p || { x: 0, y: 0 });
  }, []);

  const onWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    const next = clampZoom(zoom + delta);
    if (next <= MIN_Z) setZoomPan(MIN_Z, { x: 0, y: 0 });
    else setZoom(next);
  };

  const onPointerDown = (e) => {
    if (zoom <= MIN_Z) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const onPointerMove = (e) => {
    if (pinch.current) {
      const pts = [...(pinch.current.points || [])];
      const idx = pts.findIndex((p) => p.id === e.pointerId);
      if (idx >= 0) pts[idx] = { id: e.pointerId, x: e.clientX, y: e.clientY };
      pinch.current.points = pts;
      if (pts.length === 2) {
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const ratio = d / (pinch.current.startDist || d);
        setZoom(clampZoom((pinch.current.startZoom || 1) * ratio));
      }
      return;
    }
    if (!drag.current || drag.current.id !== e.pointerId) return;
    setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  };

  const onPointerUp = (e) => {
    if (pinch.current?.points) {
      pinch.current.points = pinch.current.points.filter((p) => p.id !== e.pointerId);
      if (pinch.current.points.length < 2) pinch.current = null;
    }
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      const [a, b] = e.touches;
      pinch.current = {
        startDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        startZoom: zoom,
        points: [
          { id: 0, x: a.clientX, y: a.clientY },
          { id: 1, x: b.clientX, y: b.clientY },
        ],
      };
      drag.current = null;
    }
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
        className="relative rounded-xl border border-slate-200 bg-slate-50 overflow-hidden h-36 touch-none select-none"
        onWheel={onWheel}
        onTouchStart={onTouchStart}
      >
        <div
          className="w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <img src={src} alt={alt} className="max-h-32 max-w-full object-contain pointer-events-none" draggable={false} />
        </div>
        <div className="absolute top-2 right-2 flex gap-1">
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