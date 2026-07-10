/** Workers-safe base64 helpers (no Node Buffer). */

/**
 * @param {string} b64
 * @returns {Uint8Array}
 */
export function bytesFromBase64(b64) {
  const binary = atob(String(b64));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * @param {Uint8Array|ArrayBuffer} bytes
 * @returns {string}
 */
export function base64FromBytes(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

/**
 * @param {string} id
 * @param {string} secret
 * @returns {string}
 */
export function basicAuthBase64(id, secret) {
  return base64FromBytes(new TextEncoder().encode(`${id}:${secret}`));
}