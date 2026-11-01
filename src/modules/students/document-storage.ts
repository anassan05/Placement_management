import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

const storageRoot = path.resolve(env.PRIVATE_STORAGE_ROOT);

export async function writePrivateDocument(bytes: Uint8Array, extension: string): Promise<{ storageKey: string; sha256: string }> {
  const storageKey = `documents/${randomUUID()}.${extension}`;
  const absolutePath = resolveStoragePath(storageKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await chmod(path.dirname(absolutePath), 0o700);
  await writeFile(absolutePath, bytes, { flag: "wx", mode: 0o600 });
  await chmod(absolutePath, 0o600);
  return { storageKey, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function readPrivateDocument(storageKey: string): Promise<Buffer> {
  return readFile(resolveStoragePath(storageKey));
}

export async function deletePrivateDocument(storageKey: string): Promise<void> {
  await unlink(resolveStoragePath(storageKey));
}

function resolveStoragePath(storageKey: string): string {
  if (!/^documents\/[0-9a-f-]{36}\.(pdf|png|jpg|jpeg)$/.test(storageKey)) {
    throw new Error("Invalid private storage key.");
  }
  const absolutePath = path.resolve(storageRoot, storageKey);
  if (!absolutePath.startsWith(`${storageRoot}${path.sep}`)) {
    throw new Error("Invalid private storage path.");
  }
  return absolutePath;
}
