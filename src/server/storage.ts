import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import { DomainError } from "./errors";

const root = path.join(process.cwd(), "storage");

// Vercel's filesystem does not persist, so deployed copies keep files in a private Blob store.
const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

export async function savePrivateBytes(bytes: Buffer, extension: string) {
  const key = `${randomUUID()}${extension}`;
  if (useBlob) {
    await put(`private/${key}`, bytes, { access: "private", addRandomSuffix: false });
  } else {
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, key), bytes);
  }
  return { key, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function readPrivateBytes(key: string) {
  if (!/^[\w.-]+$/.test(key)) throw new DomainError("Document not found.", "NOT_FOUND");
  if (!useBlob) return readFile(path.join(root, key));
  const result = await get(`private/${key}`, { access: "private" });
  if (!result || result.statusCode !== 200) throw new DomainError("Document not found.", "NOT_FOUND");
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

export async function deletePrivateBytes(key: string) {
  if (!/^[\w.-]+$/.test(key)) return;
  if (useBlob) await del(`private/${key}`);
  else await rm(path.join(root, key), { force: true });
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
