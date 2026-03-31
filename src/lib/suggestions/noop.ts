import type { Suggestion, SentenceEntry, SuggestionService } from './types';

export class NoopSuggestionService implements SuggestionService {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async suggest(_sentences: SentenceEntry[]): Promise<Suggestion[]> {
    return [];
  }
}
