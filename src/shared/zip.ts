import { strToU8, zipSync } from "fflate";

export type ZipContent = string | Uint8Array | ArrayBuffer;
export type ZipFile = { name: string; content: ZipContent };
export type ZipTextFile = ZipFile;

export function createZipBlob(files: ZipTextFile[]) {
  const bytes = createZipBytes(files);
  return new Blob([ownedArrayBuffer(bytes)], { type: "application/zip" });
}

export function createZipBytes(files: ZipTextFile[]) {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    const name = normalizeZipPath(file.name);
    if (entries[name]) throw new Error(`Duplicate ZIP entry: ${name}`);
    entries[name] = toBytes(file.content);
  }
  return zipSync(entries, { level: 6 });
}

function toBytes(content: ZipContent) {
  if (typeof content === "string") return strToU8(content);
  if (content instanceof Uint8Array) {
    const copy = new Uint8Array(content.byteLength);
    copy.set(content);
    return copy;
  }
  return new Uint8Array(content.slice(0));
}

function normalizeZipPath(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => part === ".." || !part)) {
    throw new Error(`Invalid ZIP entry path: ${path}`);
  }
  return normalized;
}

function ownedArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
