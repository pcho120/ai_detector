import { describe, it, expect } from 'vitest';
import {
  writeTempFile,
  deleteTempFile,
  tempFileExists,
  withTempFile,
  type TempFileHandle,
} from '@/lib/files/temp';

const DOCX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function makeDocxBuffer(): Buffer {
  return Buffer.concat([DOCX_MAGIC, Buffer.alloc(100)]);
}

describe('writeTempFile', () => {
  it('creates a file in /tmp with the correct extension', async () => {
    const buf = makeDocxBuffer();
    const handle = await writeTempFile(buf, '.docx');
    try {
      expect(handle.path).toMatch(/^\/tmp\/ai-detector-.+\.docx$/);
      expect(handle.extension).toBe('.docx');
      expect(await tempFileExists(handle)).toBe(true);
    } finally {
      await deleteTempFile(handle);
    }
  });

  it('creates distinct paths for concurrent calls', async () => {
    const buf = makeDocxBuffer();
    const [h1, h2] = await Promise.all([
      writeTempFile(buf, '.docx'),
      writeTempFile(buf, '.docx'),
    ]);
    try {
      expect(h1.path).not.toBe(h2.path);
    } finally {
      await Promise.all([deleteTempFile(h1), deleteTempFile(h2)]);
    }
  });
});

describe('deleteTempFile', () => {
  it('removes the temp file from disk', async () => {
    const buf = makeDocxBuffer();
    const handle = await writeTempFile(buf, '.docx');
    await deleteTempFile(handle);
    expect(await tempFileExists(handle)).toBe(false);
  });

  it('does not throw when called on an already-deleted file', async () => {
    const buf = makeDocxBuffer();
    const handle = await writeTempFile(buf, '.docx');
    await deleteTempFile(handle);
    await expect(deleteTempFile(handle)).resolves.toBeUndefined();
  });

  it('rethrows non-ENOENT unlink errors', async () => {
    const { mkdtemp, chmod, rmdir } = await import('node:fs/promises');
    const { join } = await import('node:path');

    const dir = await mkdtemp('/tmp/ai-detector-test-');
    const fakeHandle: TempFileHandle = { path: join(dir, 'file.docx'), extension: '.docx' };

    await chmod(dir, 0o000);
    try {
      await expect(deleteTempFile(fakeHandle)).rejects.toThrow();
    } finally {
      await chmod(dir, 0o700);
      await rmdir(dir);
    }
  });
});

describe('withTempFile - cleanup on success path', () => {
  it('deletes the temp file after the callback resolves', async () => {
    const buf = makeDocxBuffer();
    let capturedHandle: TempFileHandle | null = null;

    await withTempFile(buf, '.docx', async (handle) => {
      capturedHandle = handle;
      expect(await tempFileExists(handle)).toBe(true);
      return 'ok';
    });

    expect(capturedHandle).not.toBeNull();
    expect(await tempFileExists(capturedHandle!)).toBe(false);
  });

  it('returns the value from the callback', async () => {
    const buf = makeDocxBuffer();
    const result = await withTempFile(buf, '.docx', async () => 42);
    expect(result).toBe(42);
  });
});

describe('withTempFile - cleanup on failure path', () => {
  it('deletes the temp file even when the callback throws', async () => {
    const buf = makeDocxBuffer();
    let capturedHandle: TempFileHandle | null = null;
    const boom = new Error('simulated processing failure');

    await expect(
      withTempFile(buf, '.docx', async (handle) => {
        capturedHandle = handle;
        throw boom;
      }),
    ).rejects.toThrow('simulated processing failure');

    expect(capturedHandle).not.toBeNull();
    expect(await tempFileExists(capturedHandle!)).toBe(false);
  });
});

describe('withTempFile - no path leakage', () => {
  it('does not include the temp path in thrown errors', async () => {
    const buf = makeDocxBuffer();
    let capturedPath = '';

    try {
      await withTempFile(buf, '.docx', async (handle) => {
        capturedPath = handle.path;
        throw new Error('inner error');
      });
    } catch (err) {
      const errMsg = (err as Error).message;
      expect(errMsg).not.toContain(capturedPath);
      expect(errMsg).not.toContain('/tmp');
    }
  });
});
