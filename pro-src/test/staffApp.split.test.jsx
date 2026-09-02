// @vitest-environment jsdom
// Perf Batch E — lock shell must not statically import the heavy store/App graph.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("StaffApp lock/body split", () => {
  it("StaffApp only pulls LockGate + lazy StaffAppBody", () => {
    const src = fs.readFileSync(path.join(root, "src/StaffApp.jsx"), "utf8");
    expect(src).toMatch(/React\.lazy\(\(\)\s*=>\s*import\("\.\/StaffAppBody\.jsx"\)\)/);
    expect(src).toMatch(/from "\.\/components\/LockGate\.jsx"/);
    expect(src).toMatch(/jobsBootWarm/);
    expect(src).not.toMatch(/from "\.\/App\.jsx"/);
    expect(src).not.toMatch(/from "\.\/state\/store\.jsx"/);
    expect(src).not.toMatch(/from "\.\/state\/tenant\.jsx"/);
    // Warm must stay dynamic — never a static adapter import in the lock shell.
    expect(src).not.toMatch(/from "\.\/data\/adapter/);
  });

  it("StaffAppBody owns Store + Tenant + App", () => {
    const src = fs.readFileSync(path.join(root, "src/StaffAppBody.jsx"), "utf8");
    expect(src).toMatch(/from "\.\/App\.jsx"/);
    expect(src).toMatch(/from "\.\/state\/store\.jsx"/);
    expect(src).toMatch(/from "\.\/state\/tenant\.jsx"/);
  });
});
