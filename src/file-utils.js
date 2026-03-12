import { mkdirSync } from "fs";
import { dirname } from "path";

export function ensureParentDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}
