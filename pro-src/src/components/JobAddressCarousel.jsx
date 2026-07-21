// Job card at one service address — count label only (no swipe).
// Switch jobs via the same-address invoice list under the card when progress is folded.
import React from "react";
import JobInfoCard from "./JobInfoCard.jsx";

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
  if (!list.length) return null;

  const active = list.find((j) => j.id === activeId) || list[0];
  const multi = list.length > 1;
  const n = list.length;

  return (
    <div className="space-y-2" data-testid="job-address-carousel">
      {multi ? (
        <div className="flex items-center justify-between px-1 gap-2">
          <p
            className="text-[10px] font-bold uppercase tracking-wider text-slate-400"
            data-testid="jobs-at-address-count"
          >
            {n} job{n === 1 ? "" : "s"} at this address
          </p>
          {canAddChangeOrder && onAddChangeOrder ? (
            <button
              type="button"
              className="text-[10px] font-bold text-brand shrink-0"
              aria-label="Add change order at this address"
              data-testid="carousel-add-slot"
              onClick={onAddChangeOrder}
            >
              ＋ CO
            </button>
          ) : null}
        </div>
      ) : null}

      <div data-testid={"carousel-job-" + active.id}>
        <JobInfoCard
          job={active}
          jobs={list}
          events={events}
          commands={commands}
          sasCalls={sasCalls}
          showOpenLink={false}
          onCardTap={onCardTap}
          onEditJob={onEditJob}
          onAddJob={onAddJob}
          onAddChangeOrder={onAddChangeOrder}
          canAddChangeOrder={canAddChangeOrder}
          onAddAttachment={onAddAttachment}
          onEstimate={() => onEstimate?.(active)}
          onInvoice={() => onInvoice?.(active)}
          onPayment={() => onPayment?.(active)}
          onCalendar={() => onCalendar?.(active)}
          onChangeOrders={onChangeOrders}
          changeOrdersActive={changeOrdersActive}
          onBubbleTap={(b) => onBubbleTap?.(active, b)}
          requisitionEnabled={requisitionEnabled}
          onToggleRequisition={onToggleRequisition}
          requisitionHref={requisitionHref}
        />
      </div>
    </div>
  );
}
