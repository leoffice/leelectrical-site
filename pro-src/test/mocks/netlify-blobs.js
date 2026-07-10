export function getStore() {
  return {
    async get() {
      return null;
    },
    async setJSON() {},
    async set() {},
    async getWithMetadata() {
      return null;
    },
    async delete() {},
    async list() {
      return { blobs: [] };
    },
  };
}