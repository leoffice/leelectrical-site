// Horizontal job cards at one service address — swipe or tap peek to switch.
import React, { useCallback, useEffect, useRef, useState } from "react";
import JobInfoCard from "./JobInfoCard.jsx";

export default function JobAddressCarousel({
  jobs,
  activeId,
  events,
  commands,
  onSelectJob,
  onNewInvoice,
  onEstimate,
  onInvoice,
  onPayment,
  onCalendar,
  onBubbleTap,
  onCardTap,
  onEditJob,
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

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || !list.length) return;
    const w = el.clientWidth * 0.88;
    const i = Math.round(el.scrollLeft / w);
    const clamped = Math.max(0, Math.min(i, list.length - 1));
    if (clamped !== index) {
      setIndex(clamped);
      const job = list[clamped];
      if (job && job.id !== activeId) onSelectJob?.(job);
    }
  };

  if (!list.length) return null;
  const multi = list.length > 1;
  const job = list[index] || list[0];

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
            <button
              type="button"
              className="w-2 h-2 rounded-sm border border-dashed border-slate-300 bg-slate-50"
              aria-label="Add job at this address"
              data-testid="carousel-add-slot"
              onClick={onNewInvoice}
            />
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
        {list.map((j, i) => (
          <div
            key={j.id}
            className={`snap-start shrink-0 ${multi ? "w-[88%] max-w-[88%]" : "w-full"}`}
            data-testid={"carousel-job-" + j.id}
          >
            <JobInfoCard
              job={j}
              events={events}
              commands={commands}
              showOpenLink={false}
              onCardTap={j.id === activeId ? onCardTap : () => onSelectJob?.(j)}
              onEditJob={j.id === activeId ? onEditJob : undefined}
              onEstimate={() => onEstimate?.(j)}
              onInvoice={() => onInvoice?.(j)}
              onPayment={() => onPayment?.(j)}
              onCalendar={() => onCalendar?.(j)}
              onBubbleTap={(b) => onBubbleTap?.(j, b)}
            />
          </div>
        ))}
        {multi ? (
          <button
            type="button"
            className="snap-start shrink-0 w-[10%] min-w-[2.5rem] rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/80 flex items-center justify-center text-slate-400 text-lg active:bg-slate-100"
            aria-label="New invoice at this address"
            data-testid="carousel-add-peek"
            onClick={onNewInvoice}
          >
            +
          </button>
        ) : null}
      </div>

      {!multi && onNewInvoice ? (
        <button
          type="button"
          className="w-full text-center text-xs font-semibold text-brand py-1"
          data-testid="add-invoice-same-address"
          onClick={onNewInvoice}
        >
          ＋ New invoice at this address
        </button>
      ) : null}

      {multi && job ? (
        <button
          type="button"
          className="w-full text-center text-xs font-semibold text-brand py-0.5"
          data-testid="add-invoice-same-address"
          onClick={onNewInvoice}
        >
          ＋ New invoice at this address
        </button>
      ) : null}
    </div>
  );
}