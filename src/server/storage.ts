import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DomainError } from "./errors";

const root = path.join(process.cwd(), "storage");

export async function savePrivateBytes(bytes: Buffer, extension: string) {
  const key = `${randomUUID()}${extension}`;
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, key), bytes);
  return { key, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function readPrivateBytes(key: string) {
  if (!/^[\w.-]+$/.test(key)) throw new DomainError("Document not found.", "NOT_FOUND");
  return readFile(path.join(root, key));
}

const ALLOWED = new Map([
  ["application/pdf", ".pdf"],
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
]);

export function assertUpload(file: { type: string; size: number; name: string }) {
  const extension = ALLOWED.get(file.type);
  if (!extension) throw new DomainError("Upload a PDF, PNG, or JPEG file.", "VALIDATION");
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
    throw new DomainError("Files must be 10 MB or smaller.", "VALIDATION");
  }
  return extension;
}
