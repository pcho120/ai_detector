/**
 * Settings foundation types and provider constants.
 *
 * Defines the AppSettings type, default values, localStorage key, and provider labels
 * that form the foundation for user-configurable API keys and provider selection.
 */

export interface AppSettings {
  llmProvider: 'openai' | 'anthropic';
  llmApiKey: string;
  detectionProvider: 'sapling' | 'gptzero' | 'originality' | 'winston';
  detectionApiKey: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  llmProvider: 'openai',
  llmApiKey: '',
  detectionProvider: 'sapling',
  detectionApiKey: '',
};

export const LOCALSTORAGE_KEY = 'ai_detector_settings';

export const LLM_PROVIDER_LABELS: Record<AppSettings['llmProvider'], string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
};

export const DETECTION_PROVIDER_LABELS: Record<
  AppSettings['detectionProvider'],
  string
> = {
  sapling: 'Sapling',
  gptzero: 'GPTZero',
  originality: 'Originality.ai',
  winston: 'Winston AI',
};

export const STUB_DETECTION_PROVIDERS: AppSettings['detectionProvider'][] = [
  'gptzero',
  'originality',
  'winston',
];
