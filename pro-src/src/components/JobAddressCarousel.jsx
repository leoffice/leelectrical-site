// Horizontal job cards at one service address — swipe or tap peek to switch.
import React, { useCallback, useEffect, useRef, useState } from "react";
import JobInfoCard from "./JobInfoCard.jsx";

// A tap-driven scroll settles well inside this window; a real swipe does not.
const TAP_GUARD_MS = 700;

export default function JobAddressCarousel({
  jobs,
  activeId,
  events,
  commands,
  sasCalls,
  onSelectJob,
  onAddChangeOrder,
  canAddChangeOrder = true,
  onAddAttachment,
  onEstimate,
  onInvoice,
  onPayment,
  onCalendar,
  onChangeOrders,
  changeOrdersActive = false,
  onBubbleTap,
  onCardTap,
  onEditJob,
  onAddJob,
  requisitionEnabled = false,
  onToggleRequisition,
  requisitionHref,
}) {
  const list = jobs || [];
  const scrollRef = useRef(null);
  const [index, setIndex] = useState(() => Math.max(0, list.findIndex((j) => j.id === activeId)));

  useEffect(() => {
    const i = list.findIndex((j) => j.id === activeId);
    if (i >= 0) setIndex(i);
  }, [activeId, list]);

  const scrollToIndex = useCallback(
    (i) => {
      const el = scrollRef.current;
      if (!el || !list.length) return;
      const clamped = Math.max(0, Math.min(i, list.length - 1));
      const child = el.children[clamped];
      if (child) child.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
      setIndex(clamped);
      const job = list[clamped];
      if (job && job.id !== activeId) onSelectJob?.(job);
    },
    [list, activeId, onSelectJob]
  );

  // Tapping a control on a partially-visible card scrolls that card into view
  // (focus scroll + scroll-snap). That scroll must NOT be read as "the user
  // swiped to a different job" — it would navigate away and race the tap the
  // user actually made. A tap wins for a short window after it fires.
  const tapGuardUntil = useRef(0);
  const markCardActionTap = useCallback(() => {
    tapGuardUntil.current = Date.now() + TAP_GUARD_MS;
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || !list.length) return;
    const w = el.clientWidth * 0.88;
    if (!w) return;
    const i = Math.round(el.scrollLeft / w);
    const clamped = Math.max(0, Math.min(i, list.length - 1));
    if (clamped !== index) {
      setIndex(clamped);
      // Scroll caused by a tap on a card control: keep the visual snap, but
      // don't navigate — the tap's own handler owns what happens next.
      if (Date.now() < tapGuardUntil.current) return;
      const job = list[clamped];
      if (job && job.id !== activeId) onSelectJob?.(job);
    }
  };

  if (!list.length) return null;
  const multi = list.length > 1;
  const showAddPeek = canAddChangeOrder && onAddChangeOrder;

  return (
    <div className="space-y-2" data-testid="job-address-carousel">
      {multi ? (
        <div className="flex items-center justify-between px-1 gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {list.length} jobs at this address · swipe →
          </p>
          <div className="flex gap-1">
            {list.map((j, i) => (
              <button
                key={j.id}
                type="button"
                className={`w-2 h-2 rounded-full ${i === index ? "bg-brand" : "bg-slate-200"}`}
                aria-label={`Job ${i + 1}`}
                onClick={() => scrollToIndex(i)}
              />
            ))}
            {showAddPeek ? (
              <button
                type="button"
                className="w-2 h-2 rounded-sm border border-dashed border-slate-300 bg-slate-50"
                aria-label="Add change order at this address"
                data-testid="carousel-add-slot"
                onClick={onAddChangeOrder}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className={`flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 -mx-1 px-1 [scrollbar-width:none] ${
          multi ? "scroll-smooth" : ""
        }`}
        onScroll={multi ? onScroll : undefined}
        data-testid="job-address-scroll"
      >
        {list.map((j) => (
          <div
            key={j.id}
            className={`snap-start shrink-0 ${multi ? "w-[88%] max-w-[88%]" : "w-full"}`}
            data-testid={"carousel-job-" + j.id}
          >
            <JobInfoCard
              job={j}
              jobs={list}
              events={events}
              commands={commands}
              sasCalls={sasCalls}
              showOpenLink={false}
              onCardTap={j.id === activeId ? onCardTap : () => onSelectJob?.(j)}
              onEditJob={j.id === activeId ? onEditJob : undefined}
              onAddJob={j.id === activeId ? onAddJob : undefined}
              onAddChangeOrder={j.id === activeId ? onAddChangeOrder : undefined}
              canAddChangeOrder={canAddChangeOrder}
              onAddAttachment={j.id === activeId ? onAddAttachment : undefined}
              onEstimate={() => { markCardActionTap(); onEstimate?.(j); }}
              onInvoice={() => { markCardActionTap(); onInvoice?.(j); }}
              onPayment={() => { markCardActionTap(); onPayment?.(j); }}
              onCalendar={() => { markCardActionTap(); onCalendar?.(j); }}
              onChangeOrders={j.id === activeId ? onChangeOrders : undefined}
              changeOrdersActive={j.id === activeId && changeOrdersActive}
              onBubbleTap={(b) => { markCardActionTap(); onBubbleTap?.(j, b); }}
              requisitionEnabled={j.id === activeId ? requisitionEnabled : !!(j.requisitionFlowEnabled || j.requisitionEnabled)}
              onToggleRequisition={j.id === activeId ? onToggleRequisition : undefined}
              requisitionHref={j.id === activeId ? requisitionHref : undefined}
            />
          </div>
        ))}
        {multi && showAddPeek ? (
          <button
            type="button"
            className="snap-start shrink-0 w-[10%] min-w-[2.5rem] rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/80 flex items-center justify-center text-slate-400 text-lg active:bg-slate-100"
            aria-label="Add change order at this address"
            data-testid="carousel-add-peek"
            onClick={onAddChangeOrder}
          >
            +
          </button>
        ) : null}
      </div>
    </div>
  );
}