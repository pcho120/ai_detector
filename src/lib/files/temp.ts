import { randomUUID } from "node:crypto";
import { writeFile, unlink, access } from "node:fs/promises";
import { join } from "node:path";
import type { SupportedExtension } from "./validate";

import { tmpdir } from "node:os";
const TEMP_DIR = tmpdir();

export interface TempFileHandle {
  path: string;
  extension: SupportedExtension;
}

export async function writeTempFile(
  buf: Buffer,
  extension: SupportedExtension,
): Promise<TempFileHandle> {
  const filename = `ai-detector-${randomUUID()}${extension}`;
  const path = join(TEMP_DIR, filename);
  await writeFile(path, buf);
  return { path, extension };
}

export async function deleteTempFile(handle: TempFileHandle): Promise<void> {
  try {
    await unlink(handle.path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
    // Silently ignore ENOENT — file already gone is acceptable
  }
}

export async function tempFileExists(handle: TempFileHandle): Promise<boolean> {
  try {
    await access(handle.path);
    return true;
  } catch {
    return false;
  }
}

export async function withTempFile<T>(
  buf: Buffer,
  extension: SupportedExtension,
  fn: (handle: TempFileHandle) => Promise<T>,
): Promise<T> {
  const handle = await writeTempFile(buf, extension);
  try {
    return await fn(handle);
  } finally {
    await deleteTempFile(handle);
  }
}
