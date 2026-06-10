/** Resolve context-os paths relative to repo root */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function repoRoot() {
  return path.resolve(__dirname, "../../..");
}

export function contextOsRoot() {
  return path.resolve(__dirname, "../..");
}

/** Map core id to file path under context-os/ */
export function coreIdToRelativePath(coreId) {
  if (coreId.startsWith("audit/")) {
    return `context-os/${coreId}.md`;
  }
  if (
    coreId.endsWith("-core") &&
    !coreId.includes("/")
  ) {
    const name = coreId;
    if (
      ["business-core", "product-core", "technical-core", "operational-core"].includes(
        name
      )
    ) {
      return `context-os/cores/${name}.md`;
    }
    return `context-os/subcores/${name}.md`;
  }
  return `context-os/${coreId}.md`;
}
