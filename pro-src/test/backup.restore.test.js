import { describe, it, expect } from "vitest";
import {
  BACKUP_KEEP,
  createMemoryStore,
  rotateJsonBackup,
  restoreJsonFromBackup,
  snapshotStore,
  restoreStoreFromFile,
  runBackupRestoreDrill,
} from "../src/lib/backup.js";

describe("blob backup rotation", () => {
  it("keeps 3 bak slots and newest is bak-1", async () => {
    const store = createMemoryStore();
    const key = "ov-v1";
    await rotateJsonBackup(store, key, { ov: { a: 1 }, ts: 1 }, 1000);
    await rotateJsonBackup(store, key, { ov: { a: 2 }, ts: 2 }, 2000);
    await rotateJsonBackup(store, key, { ov: { a: 3 }, ts: 3 }, 3000);
    await rotateJsonBackup(store, key, { ov: { a: 4 }, ts: 4 }, 4000);

    const live = await store.get(key);
    expect(live).toEqual({ ov: { a: 4 }, ts: 4 });

    const bak1 = await store.get(`${key}-bak-1`);
    expect(bak1.ov).toEqual({ a: 3 });
    expect(bak1.backedUpAt).toBe(4000);

    expect(await store.get(`${key}-bak-4`)).toBeNull();
    expect(BACKUP_KEEP).toBe(3);
  });

  it("restoreJsonFromBackup pulls bak-1 and makes it live", async () => {
    const store = createMemoryStore();
    const key = "jobsdata-v1";
    await rotateJsonBackup(store, key, { jobs: [{ id: "J-old" }], ts: 1 }, 1);
    await rotateJsonBackup(store, key, { jobs: [{ id: "J-new" }], ts: 2 }, 2);
    await store.setJSON(key, { jobs: [], ts: 99 });

    const restored = await restoreJsonFromBackup(store, key, 1);
    expect(restored.jobs).toEqual([{ id: "J-old" }]);
    const live = await store.get(key);
    expect(live.jobs[0].id).toBe("J-old");
  });
});

describe("#37 backup + restore drill (one store from Drive file)", () => {
  it("snapshots one store, survives clobber, restores from Drive file", async () => {
    const store = createMemoryStore();
    const initial = {
      ov: { "J-1": { phone: "718-555-1111", notes: "drill-marker-37" } },
      ts: 1_700_000_000_000,
    };

    const proof = await runBackupRestoreDrill({
      store,
      baseKey: "ov-v1",
      initialDoc: initial,
      clobberDoc: { ov: {}, ts: 0, wiped: true },
      now: 5_000,
    });

    expect(proof.ok).toBe(true);
    expect(proof.driveFile.doc.ov["J-1"].notes).toBe("drill-marker-37");
    expect(proof.live).toEqual(initial);
  });
});