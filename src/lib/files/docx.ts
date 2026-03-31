import { extractRawText } from 'mammoth';
import { FileProcessingError } from './errors';

export const MIN_TEXT_LENGTH = 300;
export const MAX_TEXT_LENGTH = 100_000;

export interface DocxExtractionResult {
  text: string;
  charCount: number;
  warnings: string[];
}

function normalizeWhitespace(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \u00a0\u200b\u3000]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isGarbled(text: string): boolean {
  if (text.length === 0) return false;

  // Count printable characters: ASCII alphanumeric + any Unicode letter/number
  const printableMatches = text.match(/[a-zA-Z0-9\p{L}\p{N}]/gu);
  const printableRatio =
    printableMatches !== null ? printableMatches.length / text.length : 0;
  if (printableRatio < 0.3) return true;

  const controlCharMatches = text.match(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g);
  const controlRatio =
    controlCharMatches !== null ? controlCharMatches.length / text.length : 0;
  if (controlRatio > 0.05) return true;

  return false;
}

export async function extractDocx(buffer: Buffer): Promise<DocxExtractionResult> {
  let result: Awaited<ReturnType<typeof extractRawText>>;

  try {
    result = await extractRawText({ buffer });
  } catch (err) {
    throw new FileProcessingError(
      'EXTRACTION_FAILED',
      `Failed to parse .docx file: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
  }

  const errorMessages = result.messages.filter((m) => m.type === 'error');
  if (errorMessages.length > 0) {
    throw new FileProcessingError(
      'EXTRACTION_FAILED',
      `Document extraction reported errors: ${errorMessages.map((m) => m.message).join('; ')}`,
    );
  }

  const normalized = normalizeWhitespace(result.value);

  if (normalized.length === 0) {
    throw new FileProcessingError(
      'EXTRACTION_FAILED',
      'No text could be extracted. The document may be empty or contain only images.',
    );
  }

  if (isGarbled(normalized)) {
    throw new FileProcessingError(
      'EXTRACTION_FAILED',
      'Extracted text appears garbled or corrupted and cannot be analyzed.',
    );
  }

  if (normalized.length < MIN_TEXT_LENGTH) {
    throw new FileProcessingError(
      'TEXT_TOO_SHORT',
      `Extracted text is too short (${normalized.length} chars). Minimum is ${MIN_TEXT_LENGTH} characters.`,
    );
  }

  if (normalized.length > MAX_TEXT_LENGTH) {
    throw new FileProcessingError(
      'TEXT_TOO_LONG',
      `Extracted text is too long (${normalized.length} chars). Maximum is ${MAX_TEXT_LENGTH} characters.`,
    );
  }

  const warnings = result.messages
    .filter((m) => m.type === 'warning')
    .map((m) => m.message);

  return {
    text: normalized,
    charCount: normalized.length,
    warnings,
  };
}
