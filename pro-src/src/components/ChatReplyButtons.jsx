// Parallel equal-size tap buttons for chat replies (max 2 lines, same height).
import React from "react";

export default function ChatReplyButtons({ buttons, onPick, testIdPrefix = "chat-reply-btn", showLetters = false }) {
  if (!buttons?.length) return null;
  const cols = Math.min(buttons.length, 3);
  return (
    <div
      className="grid gap-1.5 mt-2 w-full min-w-0"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      data-testid="chat-reply-buttons"
    >
      {buttons.map((b, i) => (
        <button
          key={b.id || i}
          type="button"
          className="min-w-0 min-h-[2.75rem] h-full px-1.5 py-1.5 rounded-lg text-[10px] font-semibold leading-snug text-center bg-brand text-white break-words [overflow-wrap:anywhere] flex items-center justify-center"
          onClick={() => onPick(b, i)}
          data-testid={`${testIdPrefix}-${i}`}
        >
          <span className="block">
            {showLetters && b.letter ? (
              <>
                <span className="font-extrabold">{b.letter}</span>
                <span className="opacity-90"> — </span>
              </>
            ) : null}
            {b.label}
          </span>
        </button>
      ))}
    </div>
  );
}