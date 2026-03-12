import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import test from "node:test";

import { ensureParentDir } from "../src/file-utils.js";

test("ensureParentDir creates nested parent directories and is idempotent", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "influencers-test-"));
  const targetFile = join(tempDir, "nested", "path", "data.json");

  try {
    ensureParentDir(targetFile);
    ensureParentDir(targetFile);

    assert.equal(existsSync(join(tempDir, "nested", "path")), true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
