import { mkdirSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";

export function ensureParentDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function isMainModule(importMetaUrl) {
  return Boolean(process.argv[1]) && fileURLToPath(importMetaUrl) === process.argv[1];
}
