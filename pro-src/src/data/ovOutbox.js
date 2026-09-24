// Offline replay of overlay patches. Only keys this client tried to save
// are queued — never a cached copy of the full ov blob.
import { deepMerge, isPlainObject } from "./merge.js";

export const OUTBOX_KEY = "lepro_ov_outbox_v1";

let memory = {};

function storage() {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readOutbox() {
  const ls = storage();
  if (!ls) return memory;
  try {
    const raw = ls.getItem(OUTBOX_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return memory;
  }
}

function writeOutbox(box) {
  memory = box;
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(OUTBOX_KEY, JSON.stringify(box));
  } catch {
    /* private mode / quota — memory copy still replays this session */
  }
}

export function combinePatches(prev, next) {
  if (Array.isArray(next) || !isPlainObject(next)) return next;
  if (!isPlainObject(prev)) return next;
  return deepMerge(prev, next);
}

export function peekQueued(id) {
  const entry = readOutbox()[id];
  if (!entry) return null;
  return { patch: entry.patch, gen: entry.gen || 0 };
}

/** Queue `patch`, deep-merged onto any patch already waiting for this key. */
export function queueSavedPatch(id, patch) {
  const box = readOutbox();
  const prev = box[id];
  const gen = ((prev && prev.gen) || 0) + 1;
  box[id] = { patch: combinePatches(prev && prev.patch, patch), gen };
  writeOutbox(box);
  return gen;
}

/** Drop the queued patch only when no newer edit landed while the save was in flight. */
export function dropOutboxIfGen(id, gen) {
  const box = readOutbox();
  const cur = box[id];
  if (!cur || cur.gen !== gen) return;
  delete box[id];
  writeOutbox(box);
}

export function clearOutbox() {
  memory = {};
  const ls = storage();
  if (!ls) return;
  try {
    ls.removeItem(OUTBOX_KEY);
  } catch {
    /* ignore */
  }
}

export async function flushSavedPatches(saveJob) {
  const ids = Object.keys(readOutbox());
  for (const id of ids) {
    const entry = readOutbox()[id];
    if (!entry) continue;
    try {
      await saveJob(id, entry.patch);
    } catch {
      /* stays queued; stale_write removes that generation inside saveJob */
    }
  }
}
