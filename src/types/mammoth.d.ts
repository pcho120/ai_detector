/**
 * Minimal hand-written type declarations for the `mammoth` package.
 * The package ships no TypeScript types and there is no @types/mammoth on DefinitelyTyped.
 */

declare module 'mammoth' {
  export interface MammothMessage {
    type: 'error' | 'warning';
    message: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error?: any;
  }

  export interface MammothResult {
    value: string;
    messages: MammothMessage[];
  }

  export interface MammothOptions {
    /** Path to a `.docx` file on disk */
    path?: string;
    /** Raw buffer of the `.docx` file */
    buffer?: Buffer | ArrayBuffer;
  }

  /** Extract all text from a .docx without any HTML conversion */
  export function extractRawText(input: MammothOptions): Promise<MammothResult>;

  /** Convert a .docx to HTML */
  export function convertToHtml(
    input: MammothOptions,
    options?: Record<string, unknown>,
  ): Promise<MammothResult>;
}
