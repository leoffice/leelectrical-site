import { getStore as netlifyGetStore } from "@netlify/blobs";

/** @param {string} name @returns {import("./types.mjs").BlobStore} */
export function createNetlifyStore(name) {
  return netlifyGetStore(name);
}