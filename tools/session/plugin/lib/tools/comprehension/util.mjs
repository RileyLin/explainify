import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const stableStringify = (value) => JSON.stringify(sort(value), null, 2);

function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, sort(value[key])]),
    );
  }
  return value;
}

export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

export async function hashFile(file) {
  return sha256(await readFile(file));
}

export async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${stableStringify(value)}\n`, "utf8");
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
