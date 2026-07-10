/**
 * @typedef {object} GetOptions
 * @property {"json"|"text"|"arrayBuffer"|"blob"} [type]
 * @property {"strong"|"eventual"} [consistency]
 */

/**
 * @typedef {object} SetOptions
 * @property {Record<string, string|number|boolean>} [metadata]
 */

/**
 * @typedef {object} MetadataRecord
 * @property {unknown} data
 * @property {Record<string, string|number|boolean>} [metadata]
 */

/**
 * @typedef {object} ListResult
 * @property {{ key: string }[]} blobs
 */

/**
 * Portable blob/KV store surface — Netlify Blobs today, Cloudflare KV/R2 later.
 * @typedef {object} BlobStore
 * @property {(key: string, opts?: GetOptions) => Promise<unknown>} get
 * @property {(key: string, obj: unknown) => Promise<void>} setJSON
 * @property {(key: string, data: unknown, opts?: SetOptions) => Promise<void>} set
 * @property {(key: string, opts?: GetOptions) => Promise<MetadataRecord|null>} getWithMetadata
 * @property {(key: string) => Promise<void>} delete
 * @property {() => Promise<ListResult>} list
 */

export {};