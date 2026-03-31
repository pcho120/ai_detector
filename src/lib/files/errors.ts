export const FILE_ERROR_CODES = [
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FORMAT',
  'UNSUPPORTED_LANGUAGE',
  'EXTRACTION_FAILED',
  'TEXT_TOO_SHORT',
  'TEXT_TOO_LONG',
  'DETECTION_FAILED',
] as const;

export type FileErrorCode = (typeof FILE_ERROR_CODES)[number];

export class FileProcessingError extends Error {
  public readonly code: FileErrorCode;

  constructor(code: FileErrorCode, message: string) {
    super(message);
    this.name = 'FileProcessingError';
    this.code = code;
  }
}

export interface ErrorResponse {
  error: FileErrorCode;
  message: string;
}

export function toErrorResponse(err: FileProcessingError): ErrorResponse {
  return { error: err.code, message: err.message };
}
