import { FileProcessingError } from './errors';

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const SUPPORTED_EXTENSIONS = new Set(['.docx', '.doc']);

const ALLOWED_MIME_TYPES_BY_EXT: Record<string, Set<string>> = {
  '.docx': new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream',
  ]),
  '.doc': new Set([
    'application/msword',
    'application/octet-stream',
  ]),
};

// .docx magic bytes: PK\x03\x04 (ZIP-based Open XML)
const DOCX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
// .doc magic bytes: D0 CF 11 E0 A1 B1 1A E1 (Compound Document File Format)
const DOC_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export type SupportedExtension = '.docx' | '.doc';

export interface ValidatedFile {
  extension: SupportedExtension;
  sizeBytes: number;
  buffer: Buffer;
}

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}

function bufferStartsWith(buf: Buffer, magic: Buffer): boolean {
  if (buf.length < magic.length) return false;
  return magic.every((byte, i) => buf[i] === byte);
}

function detectMagicExtension(buf: Buffer): SupportedExtension | null {
  if (bufferStartsWith(buf, DOCX_MAGIC)) return '.docx';
  if (bufferStartsWith(buf, DOC_MAGIC)) return '.doc';
  return null;
}

export function validateFileBuffer(
  filename: string,
  mimeType: string,
  buf: Buffer,
): ValidatedFile {
  if (buf.length > MAX_FILE_SIZE_BYTES) {
    throw new FileProcessingError(
      'FILE_TOO_LARGE',
      `File exceeds the 5 MB maximum allowed size.`,
    );
  }

  const ext = getExtension(filename);
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new FileProcessingError(
      'UNSUPPORTED_FORMAT',
      `Only .docx and .doc files are supported.`,
    );
  }

  if (!ALLOWED_MIME_TYPES_BY_EXT[ext]?.has(mimeType)) {
    throw new FileProcessingError(
      'UNSUPPORTED_FORMAT',
      `File MIME type is not accepted.`,
    );
  }

  const magicExt = detectMagicExtension(buf);
  if (magicExt === null) {
    throw new FileProcessingError(
      'UNSUPPORTED_FORMAT',
      `File content does not match a supported Word document format.`,
    );
  }

  if (magicExt !== ext) {
    throw new FileProcessingError(
      'UNSUPPORTED_FORMAT',
      `File extension does not match file content.`,
    );
  }

  return {
    extension: ext as SupportedExtension,
    sizeBytes: buf.length,
    buffer: buf,
  };
}
