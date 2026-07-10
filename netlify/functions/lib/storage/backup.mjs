/** Rotate up to KEEP JSON snapshots before overwriting live store data. */
const KEEP = 3;

/**
 * @param {import("./types.mjs").BlobStore} store
 * @param {string} baseKey
 * @param {unknown} nextDoc
 */
export async function rotateJsonBackup(store, baseKey, nextDoc) {
  for (let slot = KEEP; slot >= 2; slot--) {
    const prev = await store.get(`${baseKey}-bak-${slot - 1}`, { type: "json" });
    if (prev) await store.setJSON(`${baseKey}-bak-${slot}`, prev);
  }
  const cur = await store.get(baseKey, { type: "json" });
  if (cur) await store.setJSON(`${baseKey}-bak-1`, { ...cur, backedUpAt: Date.now() });
  await store.setJSON(baseKey, nextDoc);
}