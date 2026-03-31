/**
 * .doc extraction via word-extractor (OLE2/Word97 binary format).
 * Spoofed extension/MIME inputs are rejected upstream by validateFileBuffer.
 *
 * Guarantees:
 *  1. All parser throws → EXTRACTION_FAILED (never unhandled rejections).
 *  2. Garbled output (>= 5% non-printable chars) → EXTRACTION_FAILED.
 *  3. Length policy: TEXT_TOO_SHORT (< 300 chars) / TEXT_TOO_LONG (> 100 000 chars).
 */

import WordExtractor from 'word-extractor';
import { FileProcessingError } from './errors';

export const DOC_MIN_TEXT_LENGTH = 300;
export const DOC_MAX_TEXT_LENGTH = 100_000;

/**
 * Fraction of non-printable/control code-points (TAB/LF/CR excluded) above
 * which extracted text is treated as garbled.
 *
 * 5 % threshold: Word97 body text is essentially all printable Unicode;
 * a higher ratio means binary OLE2 artefacts leaked through the parser.
 */
export const GARBLED_CHAR_RATIO_THRESHOLD = 0.05;

export interface DocExtractionResult {
  text: string;
  warnings: DocExtractionWarning[];
}

export type DocExtractionWarning = 'HEADERS_IGNORED' | 'FOOTNOTES_IGNORED' | 'TEXT_TRUNCATED_AT_MAX';

function normaliseWhitespace(raw: string): string {
  // word-extractor emits bare \r for paragraph breaks in Word97 docs
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

/**
 * Ratio of control/non-printable code-points in text.
 * TAB (0x09), LF (0x0a), CR (0x0d) are excluded — they are legitimate in
 * paragraph-structured documents and must not inflate the ratio.
 */
export function garbledCharRatio(text: string): number {
  if (text.length === 0) return 0;
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    const isWhitespace = cp === 0x09 || cp === 0x0a || cp === 0x0d;
    if (!isWhitespace && (cp < 0x20 || cp === 0x7f)) {
      count++;
    }
  }
  return count / text.length;
}

export function isGarbled(text: string): boolean {
  return garbledCharRatio(text) >= GARBLED_CHAR_RATIO_THRESHOLD;
}

/**
 * Extract plain text from a .doc (Word97/OLE2) buffer.
 *
 * @throws {FileProcessingError} EXTRACTION_FAILED — parser threw, empty output, or garbled text.
 * @throws {FileProcessingError} TEXT_TOO_SHORT — normalised text < 300 chars.
 * @throws {FileProcessingError} TEXT_TOO_LONG — normalised text > 100 000 chars.
 */
export async function extractDoc(buf: Buffer): Promise<DocExtractionResult> {
  let rawBody: string;

  try {
    const extractor = new WordExtractor();
    const doc = await extractor.extract(buf);
    rawBody = doc.getBody();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown extraction error';
    throw new FileProcessingError(
      'EXTRACTION_FAILED',
      `Failed to extract text from .doc file: ${message}`,
    );
  }

  if (!rawBody || rawBody.trim().length === 0) {
    throw new FileProcessingError(
      'EXTRACTION_FAILED',
      '.doc file produced no extractable text. The document may be empty, image-only, or password-protected.',
    );
  }

  if (isGarbled(rawBody)) {
    throw new FileProcessingError(
      'EXTRACTION_FAILED',
      '.doc file produced garbled text. The document may be corrupt or in an unsupported legacy sub-format.',
    );
  }

  const normalised = normaliseWhitespace(rawBody);
  const warnings: DocExtractionWarning[] = [];

  if (normalised.length < DOC_MIN_TEXT_LENGTH) {
    throw new FileProcessingError(
      'TEXT_TOO_SHORT',
      `Extracted text is ${normalised.length} characters, which is below the 300-character minimum required for analysis.`,
    );
  }

  if (normalised.length > DOC_MAX_TEXT_LENGTH) {
    throw new FileProcessingError(
      'TEXT_TOO_LONG',
      `Extracted text is ${normalised.length} characters, which exceeds the 100,000-character maximum. Please submit a shorter document.`,
    );
  }

  return { text: normalised, warnings };
}
