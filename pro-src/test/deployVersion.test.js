// #64 Rollback on every deploy — pure unit tests (no I/O, no network).
import { describe, expect, it } from "vitest";
import {
  appendDeployRecord,
  formatDeployPost,
  formatRollbackPost,
  latestDeploy,
  makePublicVersion,
  makeVersionRecord,
  normalizeGitSha,
  parseHistoryDoc,
  resolveRollbackTarget,
  rollbackMode,
  serializeHistoryDoc,
  versionId,
} from "../src/lib/deployVersion.js";

describe("normalizeGitSha / makeVersionRecord", () => {
  it("shortens a full SHA and keeps short as-is", () => {
    expect(normalizeGitSha("abcdef0123456789")).toEqual({
      gitSha: "abcdef0123456789",
      gitShaShort: "abcdef0",
    });
    expect(normalizeGitSha("abc1234")).toEqual({
      gitSha: "abc1234",
      gitShaShort: "abc1234",
    });
    expect(normalizeGitSha("")).toEqual({ gitSha: "", gitShaShort: "" });
  });

  it("builds a version record with optional netlify deploy id", () => {
    const v = makeVersionRecord({
      gitSha: "deadbeefcafebabe",
      netlifyDeployId: "dep-99",
      task: "#64",
      ts: "2026-07-07T13:00:00Z",
    });
    expect(v.gitShaShort).toBe("deadbee");
    expect(v.netlifyDeployId).toBe("dep-99");
    expect(v.task).toBe("#64");
    expect(v.ts).toBe("2026-07-07T13:00:00Z");
  });
});

describe("versionId", () => {
  it("prefers netlify deploy id over git", () => {
    expect(
      versionId({ gitShaShort: "abc1234", netlifyDeployId: "xyz" })
    ).toBe("netlify:xyz");
  });

  it("falls back to git short sha", () => {
    expect(versionId({ gitSha: "abcdef012345" })).toBe("git:abcdef0");
  });

  it("unknown when empty", () => {
    expect(versionId({})).toBe("unknown");
    expect(versionId(null)).toBe("unknown");
  });
});

describe("appendDeployRecord + resolveRollbackTarget", () => {
  it("records previous+new so every deploy has a rollback target", () => {
    let hist = [];
    hist = appendDeployRecord(
      hist,
      { gitSha: "1111111111111111" },
      { gitSha: "2222222222222222", task: "#64" },
      { task: "#64" }
    );
    expect(hist).toHaveLength(1);
    expect(hist[0].previous.gitShaShort).toBe("1111111");
    expect(hist[0].next.gitShaShort).toBe("2222222");
    expect(hist[0].mode).toBe("git-sha");
    expect(hist[0].task).toBe("#64");

    const target = resolveRollbackTarget(hist);
    expect(target.gitShaShort).toBe("1111111");
    expect(rollbackMode(target)).toBe("git-sha");
  });

  it("uses netlify-instant mode when previous has a deploy id", () => {
    const hist = appendDeployRecord(
      [],
      { gitSha: "aaa", netlifyDeployId: "old-dep" },
      { gitSha: "bbb", netlifyDeployId: "new-dep" }
    );
    expect(hist[0].mode).toBe("netlify-instant");
    expect(rollbackMode(resolveRollbackTarget(hist))).toBe("netlify-instant");
  });

  it("keeps a capped history and resolves n steps back", () => {
    let hist = [];
    for (let i = 0; i < 5; i++) {
      hist = appendDeployRecord(
        hist,
        { gitSha: `prev${i}0000000` },
        { gitSha: `next${i}0000000` },
        { max: 3 }
      );
    }
    expect(hist).toHaveLength(3);
    expect(resolveRollbackTarget(hist, 1).gitSha).toMatch(/^prev4/);
    expect(resolveRollbackTarget(hist, 2).gitSha).toMatch(/^prev3/);
    expect(resolveRollbackTarget(hist, 99)).toBeNull();
    expect(resolveRollbackTarget([])).toBeNull();
  });

  it("latestDeploy returns the last entry", () => {
    const hist = appendDeployRecord(
      appendDeployRecord([], { gitSha: "a" }, { gitSha: "b" }),
      { gitSha: "b" },
      { gitSha: "c" }
    );
    expect(latestDeploy(hist).next.gitSha).toBe("c");
    expect(latestDeploy(null)).toBeNull();
  });
});

describe("formatDeployPost / formatRollbackPost", () => {
  it("posts previous+new+rollback_target so a target always exists", () => {
    const line = formatDeployPost({
      previous: { gitSha: "aaaaaaaaaaaaaaa" },
      next: { gitSha: "bbbbbbbbbbbbbbb" },
      task: "#64",
    });
    expect(line).toBe(
      "deploy previous=git:aaaaaaa new=git:bbbbbbb rollback_target=git:aaaaaaa mode=git-sha task=#64"
    );
  });

  it("includes netlify ids when present", () => {
    const line = formatDeployPost({
      previous: { netlifyDeployId: "d1", gitSha: "aaa" },
      next: { netlifyDeployId: "d2", gitSha: "bbb" },
    });
    expect(line).toContain("previous=netlify:d1");
    expect(line).toContain("new=netlify:d2");
    expect(line).toContain("rollback_target=netlify:d1");
    expect(line).toContain("mode=netlify-instant");
  });

  it("formats a rollback line", () => {
    expect(
      formatRollbackPost({
        target: { gitSha: "ccccccccccccccc" },
        task: "#64",
      })
    ).toBe("rollback to=git:ccccccc mode=git-sha task=#64");
  });
});

describe("parseHistoryDoc / serializeHistoryDoc / makePublicVersion", () => {
  it("parses array or { deploys } docs", () => {
    expect(parseHistoryDoc([{ a: 1 }])).toEqual([{ a: 1 }]);
    expect(parseHistoryDoc({ deploys: [{ b: 2 }] })).toEqual([{ b: 2 }]);
    expect(parseHistoryDoc(null)).toEqual([]);
    expect(parseHistoryDoc({})).toEqual([]);
  });

  it("serializes with schema + updatedAt", () => {
    const doc = serializeHistoryDoc([{ x: 1 }], { site: "leelectrical.us" });
    expect(doc.schema).toBe("le-pro-deploy-history/v1");
    expect(doc.deploys).toEqual([{ x: 1 }]);
    expect(doc.site).toBe("leelectrical.us");
    expect(doc.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("builds public version.json payload with rollbackAvailable", () => {
    const v = makePublicVersion({
      gitSha: "deadbeefdeadbeef",
      netlifyDeployId: null,
      task: "#64",
      ts: "2026-07-07T12:00:00Z",
    });
    expect(v).toMatchObject({
      schema: "le-pro-version/v1",
      gitShaShort: "deadbee",
      builtAt: "2026-07-07T12:00:00Z",
      task: "#64",
      rollbackAvailable: true,
    });
  });
});