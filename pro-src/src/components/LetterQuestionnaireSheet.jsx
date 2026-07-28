// Letter questionnaire — pick letter type, fill fields, photos, preview/approve draft.
import React, { useMemo, useState } from "react";
import Sheet, { Fld } from "./Sheet.jsx";
import {
  LETTER_TYPES,
  createLetterDraft,
  letterDraftReady,
  letterLineDescription,
  refreshLetterDraft,
} from "../lib/letterDraft.js";
import { buildLetterheadPdfBlob, letterPdfFileName } from "../lib/letterheadPdf.js";
import { downloadPdfBlob, openPdfBlob } from "../lib/pdfOpen.js";

export default function LetterQuestionnaireSheet({
  job,
  lineIndex = 0,
  itemName = "",
  initialTypeId = "",
  initialDraft = null,
  onClose,
  onSave,
}) {
  const seedType =
    LETTER_TYPES.find((t) => t.id === (initialDraft?.typeId || initialTypeId)) ||
    LETTER_TYPES.find((t) => t.id === "load_letter") ||
    LETTER_TYPES[0];

  const [typeId, setTypeId] = useState(seedType.id);
  const type = useMemo(() => LETTER_TYPES.find((t) => t.id === typeId) || seedType, [typeId, seedType]);

  const [draft, setDraft] = useState(() => {
    if (initialDraft) return initialDraft;
    return createLetterDraft({ type: seedType, job, lineIndex, itemName });
  });

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ready = letterDraftReady(draft);

  const switchType = (id) => {
    const t = LETTER_TYPES.find((x) => x.id === id);
    if (!t) return;
    setTypeId(id);
    setDraft(
      createLetterDraft({
        type: t,
        job,
        lineIndex,
        itemName: itemName || t.label,
        answers: undefined,
        photos: draft.photos,
      })
    );
  };

  const setAnswer = (key, value) => {
    setDraft((d) =>
      refreshLetterDraft(d, {
        answers: { ...d.answers, [key]: value },
        job,
      })
    );
  };

  const setBody = (value) => {
    setDraft((d) => refreshLetterDraft(d, { bodyText: value, job }));
  };

  const setRe = (value) => {
    setDraft((d) => refreshLetterDraft(d, { reLine: value, job }));
  };

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const { uploadChatAttachment } = await import("../lib/chatAttach.js");
      const url = await uploadChatAttachment(file);
      setDraft((d) =>
        refreshLetterDraft(d, {
          photos: (d.photos || []).concat([
            {
              id: "photo-" + Date.now(),
              name: file.name || "photo",
              url,
              mime: file.type || "image/jpeg",
            },
          ]),
          job,
        })
      );
    } catch (ex) {
      setErr(ex?.message || "Could not attach photo");
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = (id) => {
    setDraft((d) =>
      refreshLetterDraft(d, {
        photos: (d.photos || []).filter((p) => p.id !== id),
        job,
      })
    );
  };

  const preview = () => {
    try {
      const blob = buildLetterheadPdfBlob({ draft });
      try {
        openPdfBlob(blob);
      } catch {
        downloadPdfBlob(blob, letterPdfFileName(draft));
      }
    } catch (ex) {
      setErr(ex?.message || "Preview failed");
    }
  };

  const finish = (status) => {
    if (status === "approved" && !ready) {
      setErr("Fill the required fields first");
      return;
    }
    const next = refreshLetterDraft(draft, {
      status,
      job,
      typeId: type.id,
    });
    // keep type id in sync
    const finalDraft = {
      ...next,
      typeId: type.id,
      typeLabel: type.label,
      itemName: itemName || type.label,
      lineIndex,
      status,
    };
    const description = letterLineDescription(type, finalDraft.answers, finalDraft.siteAddress);
    onSave?.({ draft: finalDraft, description, type });
  };

  return (
    <Sheet title="Letter on letterhead" onClose={onClose} wide>
      <p className="text-sm text-slate-500 mb-3" data-testid="letter-q-hint">
        Pick the letter type, answer the questions, preview, then approve. The letter goes out with
        the invoice when you send.
      </p>

      {/* Type toggles */}
      <div className="flex flex-wrap gap-1.5 mb-4" data-testid="letter-type-toggles">
        {LETTER_TYPES.map((t) => {
          const on = t.id === typeId;
          return (
            <button
              key={t.id}
              type="button"
              className={
                "px-2.5 py-1.5 rounded-full text-xs font-bold border " +
                (on
                  ? "bg-emerald-700 text-white border-emerald-800"
                  : "bg-white text-slate-700 border-slate-200")
              }
              onClick={() => switchType(t.id)}
              data-testid={"letter-type-" + t.id}
            >
              {t.shortLabel}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-slate-500 mb-3">{type.description}</p>

      {draft.siteAddress ? (
        <p className="text-xs font-semibold text-slate-600 mb-2" data-testid="letter-site">
          Site: {draft.siteAddress}
        </p>
      ) : null}

      <Fld label="RE line">
        <input
          className="input"
          value={draft.reLine || ""}
          onChange={(e) => setRe(e.target.value)}
          data-testid="letter-re-line"
        />
      </Fld>

      {type.fields.map((f) => (
        <Fld key={f.key} label={f.label + (f.required ? " *" : "")}>
          {f.type === "textarea" ? (
            <textarea
              className="input min-h-[4.5rem]"
              value={draft.answers?.[f.key] || ""}
              onChange={(e) => setAnswer(f.key, e.target.value)}
              placeholder={f.placeholder || ""}
              data-testid={"letter-field-" + f.key}
            />
          ) : (
            <input
              className="input"
              value={draft.answers?.[f.key] || ""}
              onChange={(e) => setAnswer(f.key, e.target.value)}
              placeholder={f.placeholder || ""}
              data-testid={"letter-field-" + f.key}
            />
          )}
        </Fld>
      ))}

      <Fld label="Letter body (editable)">
        <textarea
          className="input min-h-[8rem] font-mono text-xs"
          value={draft.bodyText || ""}
          onChange={(e) => setBody(e.target.value)}
          data-testid="letter-body"
        />
      </Fld>

      <div className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">Photos</p>
        {(draft.photos || []).map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-2 text-sm py-1 border-b border-dashed border-slate-200"
            data-testid="letter-photo-row"
          >
            <span className="truncate flex-1">{p.name}</span>
            <button type="button" className="text-xs text-red-600 font-bold" onClick={() => removePhoto(p.id)}>
              Remove
            </button>
          </div>
        ))}
        <label className="btn-ghost w-full !py-1.5 mt-1 text-sm inline-flex justify-center cursor-pointer">
          {busy ? "Uploading…" : "＋ Add photo"}
          <input type="file" accept="image/*" className="hidden" onChange={onPhoto} disabled={busy} data-testid="letter-photo-input" />
        </label>
      </div>

      {err ? (
        <p className="text-sm text-red-600 mb-2" data-testid="letter-q-error">
          {err}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 mt-2">
        <button type="button" className="btn-ghost w-full" onClick={preview} data-testid="letter-preview">
          Preview PDF
        </button>
        <button
          type="button"
          className="btn-ghost w-full"
          onClick={() => finish("draft")}
          data-testid="letter-save-draft"
        >
          Save draft
        </button>
        <button
          type="button"
          className="btn-brand w-full"
          onClick={() => finish("approved")}
          data-testid="letter-approve"
        >
          Approve letter
        </button>
      </div>
    </Sheet>
  );
}
