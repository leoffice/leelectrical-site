// Send-time attachment picker — every file that can ride along with an
// invoice / estimate email, gathered in one list so Levi chooses per send.
//
// Levi 2026-08-12: "if there is an attachment — attached through the estimate,
// through the job info, or an invoice — when we send, we can choose which
// attachments to add to the email." All three attach points write to the same
// per-job store (job.attachments), and letterhead letters live as drafts on
// the job; this module merges the builder's session rows with what is already
// persisted on the job and turns them into checkbox options.
//
// Key contract: option.key uses the SAME identity buildEmailAttachmentParts
// dedupes on (letterId || url || id || name), so one checked option maps to
// exactly one emailed part. Letter PHOTO rows carry the letter's letterId and
// are folded into the letter option — the photo pages travel inside the letter
// PDF itself, never as separate files (see emailAttachments.js).

const IMAGE_EXT = /\.(jpe?g|png|heic|heif|webp|gif|bmp|tiff?)\b/i;

/** Image check that ignores letterId (isImageAttachment excludes letter rows). */
function isImageRow(att) {
  if (!att || !att.url) return false;
  const mime = String(att.mime || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  if (mime) return false;
  return IMAGE_EXT.test(String(att.name || "")) || IMAGE_EXT.test(String(att.url || ""));
}

/** Identity used by buildEmailAttachmentParts — keep the two in lockstep. */
export function attachmentOptionKey(att) {
  return String(att?.letterId || att?.url || att?.id || att?.name || "");
}

/**
 * Build the pickable attachment options for a document send.
 *
 * @param {object} opts
 * @param {object} [opts.job] job record (attachments + letterDrafts persisted)
 * @param {Array<object>} [opts.docAttachments] builder-session rows (fresher than the job's)
 * @param {Array<object>} [opts.letterDrafts] session letter drafts; falls back to job.letterDrafts
 * @returns {Array<{ key: string, att: object, source: string, isLetter: boolean, isImage: boolean, name: string, letterStatus: string, photoCount: number, defaultOn: boolean }>}
 */
export function listSendAttachmentOptions({ job, docAttachments = [], letterDrafts = [] } = {}) {
  const drafts =
    Array.isArray(letterDrafts) && letterDrafts.length
      ? letterDrafts
      : Array.isArray(job?.letterDrafts)
        ? job.letterDrafts
        : [];
  const draftById = new Map();
  for (const d of drafts) if (d && d.id) draftById.set(String(d.id), d);

  // Session rows first — a letter just re-approved in the builder must win
  // over the stale row saved on the job.
  const raw = [];
  for (const att of Array.isArray(docAttachments) ? docAttachments : []) {
    if (att) raw.push({ att, source: "doc" });
  }
  for (const att of Array.isArray(job?.attachments) ? job.attachments : []) {
    if (att) raw.push({ att, source: "job" });
  }

  const options = [];
  const byKey = new Map();
  const letterPhotoRows = [];

  const pushOption = (opt) => {
    byKey.set(opt.key, opt);
    options.push(opt);
  };

  for (const { att, source } of raw) {
    // A letter's photo evidence rides inside the letter PDF's photo pages.
    if (att.letterId && isImageRow(att)) {
      letterPhotoRows.push({ att, source });
      continue;
    }
    const key = attachmentOptionKey(att);
    if (!key || byKey.has(key)) continue;
    const draft = att.letterId ? draftById.get(String(att.letterId)) : null;
    const isLetter = !!att.letterId;
    const letterStatus = String(draft?.status || att.letterStatus || "");
    pushOption({
      key,
      att,
      source,
      isLetter,
      isImage: !isLetter && isImageRow(att),
      name: String(att.name || (isLetter ? draft?.typeLabel || "Letter" : "Attachment")),
      letterStatus,
      photoCount: isLetter && Array.isArray(draft?.photos) ? draft.photos.length : 0,
      // Pre-checked unless previously opted out, or the letter is still an
      // unapproved draft (a DRAFT-stamped letter should not go out by default).
      defaultOn: att.attachToEmail !== false && !(isLetter && letterStatus === "draft"),
    });
  }

  // A draft saved on the job whose attachment row never landed (upload failed)
  // is still fully sendable — the email path re-renders letters from the draft.
  for (const d of drafts) {
    if (!d || !d.id || byKey.has(String(d.id))) continue;
    pushOption({
      key: String(d.id),
      att: {
        id: d.id,
        letterId: d.id,
        name: (d.typeLabel || "Letter") + ".pdf",
        mime: "application/pdf",
        attachToEmail: true,
      },
      source: "letter",
      isLetter: true,
      isImage: false,
      name: String(d.typeLabel || "Letter"),
      letterStatus: String(d.status || "draft"),
      photoCount: Array.isArray(d.photos) ? d.photos.length : 0,
      defaultOn: d.status === "approved",
    });
  }

  // Letter photos: normally represented by their letter's option. An orphan
  // (letter row and draft both gone) still attaches as a standalone image.
  for (const { att, source } of letterPhotoRows) {
    const parentKey = String(att.letterId);
    const parent = byKey.get(parentKey);
    if (parent) {
      if (!parent.photoCount) {
        parent.photoCount = letterPhotoRows.filter(
          (r) => String(r.att.letterId) === parentKey
        ).length;
      }
      continue;
    }
    const key = attachmentOptionKey(att);
    if (!key || byKey.has(key)) continue;
    pushOption({
      key,
      att,
      source,
      isLetter: false,
      isImage: true,
      name: String(att.name || "Photo"),
      letterStatus: "",
      photoCount: 0,
      defaultOn: att.attachToEmail !== false,
    });
  }

  return options;
}

/** Keys of the options that start checked. */
export function defaultAttachmentKeys(options = []) {
  return options.filter((o) => o && o.defaultOn).map((o) => o.key);
}

/**
 * Chosen options → attachment rows for buildEmailAttachmentParts.
 * Selection overrides any stored attachToEmail:false — checking the box IS
 * the opt-in, so the row always goes out as attachToEmail:true.
 */
export function selectedAttachmentRows(options = [], keys = []) {
  const set =
    keys instanceof Set
      ? keys
      : new Set((Array.isArray(keys) ? keys : []).map((k) => String(k)));
  return (Array.isArray(options) ? options : [])
    .filter((o) => o && set.has(String(o.key)))
    .map((o) => ({ ...o.att, attachToEmail: true }));
}

/** Short label for an option row ("Load letter · approved · 2 photos"). */
export function attachmentOptionLabel(opt) {
  if (!opt) return "";
  const bits = [];
  if (opt.isLetter) {
    bits.push(opt.letterStatus === "approved" ? "approved letter" : "letter draft");
  } else if (opt.isImage) {
    bits.push("photo");
  }
  if (opt.photoCount > 0) {
    bits.push(opt.photoCount === 1 ? "1 photo inside" : `${opt.photoCount} photos inside`);
  }
  if (opt.source === "job") bits.push("saved on job");
  return bits.join(" · ");
}
