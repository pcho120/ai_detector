/**
 * Minimal hand-written type declarations for the `word-extractor` package.
 * The package ships no TypeScript types and there is no @types/word-extractor on DefinitelyTyped.
 *
 * Only the APIs used by src/lib/files/doc.ts are typed here.
 */

declare module 'word-extractor' {
  export interface DocumentOptions {
    /** If false, disables Unicode quote normalisation (default: true = normalise) */
    filterUnicode?: boolean;
  }

  /** Represents an extracted Word document; returned from WordExtractor.extract(). */
  export interface ExtractedDocument {
    /** Returns the main body text of the document. */
    getBody(options?: DocumentOptions): string;
    /** Returns the footnote text of the document. */
    getFootnotes(options?: DocumentOptions): string;
    /** Returns the endnote text of the document. */
    getEndnotes(options?: DocumentOptions): string;
    /** Returns headers (and optionally footers) text. */
    getHeaders(options?: DocumentOptions & { includeFooters?: boolean }): string;
    /** Returns annotation text. */
    getAnnotations(options?: DocumentOptions): string;
    /** Returns textbox text. */
    getTextboxes(options?: DocumentOptions & { includeHeaderTextboxes?: boolean }): string;
  }

  /**
   * Main extractor class. Accepts a Buffer or a file-path string.
   * Returns a Promise resolving to an ExtractedDocument.
   */
  class WordExtractor {
    extract(source: string | Buffer): Promise<ExtractedDocument>;
  }

  export default WordExtractor;
}
