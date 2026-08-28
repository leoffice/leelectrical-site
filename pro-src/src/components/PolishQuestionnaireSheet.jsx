// Polish clarifying questionnaire — Codex design (2026-08-28).
// Optional facts after Professional / Invoice-ready polish; skip OK.
import React, { useMemo, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import {
  polishClarifyingQuestions,
  polishWorkDescription,
  polishWorkDescriptionWithAnswers,
} from "../lib/workDescriptionPolish.js";

const INITIAL_VISIBLE = 5;

export default function PolishQuestionnaireSheet({
  roughText = "",
  styleKey = "professional",
  context = {},
  onClose,
  onApply,
}) {
  const questions = useMemo(
    () => polishClarifyingQuestions(roughText, context),
    [roughText, context]
  );
  const [answers, setAnswers] = useState({});
  const [skipped, setSkipped] = useState({});
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? questions : questions.slice(0, INITIAL_VISIBLE);
  const answeredCount = questions.filter((q) => {
    if (skipped[q.id]) return false;
    return String(answers[q.id] || "").trim().length > 0;
  }).length;
  const skippedCount = questions.filter((q) => skipped[q.id]).length;

  const setAnswer = (id, value) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    if (String(value || "").trim()) {
      setSkipped((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const skipOne = (id) => {
    setSkipped((prev) => ({ ...prev, [id]: true }));
    setAnswers((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const unskip = (id) => {
    setSkipped((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const activeAnswers = () => {
    const out = {};
    for (const q of questions) {
      if (skipped[q.id]) continue;
      const v = String(answers[q.id] || "").trim();
      if (v) out[q.id] = v;
    }
    return out;
  };

  const polishWithout = () => {
    const text = polishWorkDescription(roughText, styleKey, context);
    onApply?.(text, { answers: {}, skipped: true });
    onClose?.();
  };

  const apply = () => {
    const ans = activeAnswers();
    const text =
      Object.keys(ans).length > 0
        ? polishWorkDescriptionWithAnswers(roughText, styleKey, context, ans)
        : polishWorkDescription(roughText, styleKey, context);
    onApply?.(text, { answers: ans, skipped: false });
    onClose?.();
  };

  if (!questions.length) {
    // Nothing useful to ask — polish immediately.
    // Caller should usually skip opening; keep a safe escape hatch.
    return (
      <Sheet title="A few details for a sharper SOW" onClose={polishWithout} testId="polish-q-sheet">
        <p className="text-sm text-slate-500 mb-4" data-testid="polish-q-empty">
          No extra details needed — polishing from your notes.
        </p>
        <button type="button" className="btn-primary w-full" onClick={polishWithout} data-testid="polish-q-polish-now">
          Polish now
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet title="A few details for a sharper SOW" onClose={polishWithout} wide tall testId="polish-q-sheet">
      <p className="text-sm text-slate-500 mb-3" data-testid="polish-q-hint">
        Answer what you know. Everything is optional.
      </p>
      <div className="flex items-center justify-between gap-2 mb-3 px-0.5">
        <span className="text-[11px] font-extrabold uppercase tracking-wide text-purple-900">Clarifications</span>
        <span className="text-xs text-slate-500" data-testid="polish-q-progress">
          {answeredCount} of {questions.length} answered
          {skippedCount ? ` · ${skippedCount} skipped` : ""}
        </span>
      </div>

      {visible.map((q, i) => {
        const isSkipped = !!skipped[q.id];
        return (
          <div
            key={q.id}
            className="mb-3 p-3.5 rounded-2xl border border-purple-200 bg-purple-50/70"
            data-testid={"polish-q-card-" + q.id}
          >
            <div className="flex items-start gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-extrabold text-purple-900 mb-0.5">Q{i + 1}</div>
                <p className="text-sm text-slate-800 font-semibold leading-snug">{q.prompt}</p>
              </div>
              {isSkipped ? (
                <button
                  type="button"
                  className="shrink-0 text-xs font-bold text-purple-800 px-2 py-1 rounded-lg hover:bg-purple-100"
                  onClick={() => unskip(q.id)}
                  data-testid={"polish-q-unskip-" + q.id}
                >
                  Answer instead
                </button>
              ) : (
                <button
                  type="button"
                  className="shrink-0 text-xs font-bold text-purple-800 px-2 py-1 rounded-lg hover:bg-purple-100"
                  onClick={() => skipOne(q.id)}
                  data-testid={"polish-q-skip-" + q.id}
                  aria-label={"Skip " + q.prompt}
                >
                  Skip
                </button>
              )}
            </div>
            {isSkipped ? (
              <p className="text-xs text-slate-500 italic" data-testid={"polish-q-skipped-" + q.id}>
                Skipped
              </p>
            ) : (
              <Fld label="Your answer (optional)">
                <textarea
                  className="input min-h-[2.75rem] text-sm"
                  rows={2}
                  value={answers[q.id] || ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  placeholder={q.placeholder || "Optional"}
                  data-testid={"polish-q-answer-" + q.id}
                />
              </Fld>
            )}
          </div>
        );
      })}

      {!showAll && questions.length > INITIAL_VISIBLE ? (
        <button
          type="button"
          className="w-full mb-3 !py-2.5 text-sm font-bold text-purple-800 border border-dashed border-purple-200 rounded-2xl bg-white"
          onClick={() => setShowAll(true)}
          data-testid="polish-q-show-more"
        >
          Show more questions ({questions.length - INITIAL_VISIBLE})
        </button>
      ) : null}

      <div className="sticky bottom-0 pt-2 pb-1 bg-white/95 border-t border-slate-100 mt-1">
        <p className="text-xs text-slate-500 text-center mb-2" data-testid="polish-q-status">
          {answeredCount
            ? `Re-polish will use ${answeredCount} answer${answeredCount === 1 ? "" : "s"}`
            : "No answers yet — polish from your rough notes"}
        </p>
        <button
          type="button"
          className="btn w-full !py-3 bg-purple-700 text-white border border-purple-800 font-extrabold"
          onClick={apply}
          data-testid="polish-q-apply"
        >
          Apply answers &amp; re-polish
        </button>
        <button
          type="button"
          className="btn w-full !py-2.5 mt-1.5 text-sm text-slate-600 bg-transparent border-0"
          onClick={polishWithout}
          data-testid="polish-q-without"
        >
          Polish without answers
        </button>
      </div>
    </Sheet>
  );
}
