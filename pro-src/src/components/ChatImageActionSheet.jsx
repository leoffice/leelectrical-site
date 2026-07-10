// Tap-to-confirm actions after reading an image (same skill as Telegram buttons / A B C).
import React from "react";
import Sheet from "./Sheet.jsx";
import ChatReplyButtons from "./ChatReplyButtons.jsx";

export default function ChatImageActionSheet({ draft, onPick, onCancel }) {
  if (!draft) return null;
  const { previewUrl, summary, actions } = draft;
  return (
    <Sheet title="What should I do?" onClose={onCancel} wide>
      <p className="text-sm text-slate-700 mb-3">
        {summary || "I read your photo — pick what you want, or cancel."}
      </p>
      {previewUrl ? (
        <img
          src={previewUrl}
          alt="Attachment"
          className="rounded-xl border border-slate-200 max-h-32 object-contain mb-3 w-full bg-slate-50"
        />
      ) : null}
      <div className="mb-2">
        <ChatReplyButtons
          buttons={(actions || []).map((a, i) => ({
            ...a,
            label: a.label,
            id: a.id || String(i),
            letter: String.fromCharCode(65 + i),
            replyText: String.fromCharCode(65 + i),
          }))}
          onPick={(b) => onPick(b)}
          testIdPrefix="chat-image-action"
          showLetters
        />
      </div>
      <button
        type="button"
        className="btn bg-slate-100 text-slate-800 w-full"
        onClick={onCancel}
        data-testid="chat-image-action-cancel"
      >
        Cancel
      </button>
    </Sheet>
  );
}