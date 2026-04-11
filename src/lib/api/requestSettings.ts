// TODO(security): encrypt API keys before storing

/**
 * Settings extracted from request headers only.
 * No environment variable fallback.
 */
export interface RequestSettings {
  llmProvider: string;
  llmApiKey: string | undefined;
  detectionProvider: string;
  detectionApiKey: string | undefined;
  copyleaksEmail: string | undefined;
  copyleaksApiKey: string | undefined;
}

/**
 * Extract request settings from request headers only.
 * Treats empty string headers as absent (falls back to default values only).
 * Never logs API key values.
 *
 * @param req - The NextRequest or standard Web Request object
 * @returns RequestSettings with resolved provider and API key values
 */
export function getRequestSettings(req: Request): RequestSettings {
  // Read headers; treat empty strings as absent
  const headerLlmProvider = req.headers.get('x-llm-provider')?.trim() || '';
  const headerLlmApiKey = req.headers.get('x-llm-api-key')?.trim() || '';
  const headerDetectionProvider = req.headers.get('x-detection-provider')?.trim() || '';
  const headerDetectionApiKey = req.headers.get('x-detection-api-key')?.trim() || '';
  const headerCopyleaksEmail = req.headers.get('x-copyleaks-email')?.trim() || '';
  const headerCopyleaksApiKey = req.headers.get('x-copyleaks-api-key')?.trim() || '';

  // Resolve LLM provider: header → default
  const llmProvider = headerLlmProvider || 'openai';

  // Resolve LLM API key: header → undefined
  const llmApiKey = headerLlmApiKey || undefined;

  // Resolve detection provider: header → default
  const detectionProvider = headerDetectionProvider || 'sapling';

  // Resolve detection API key: header → undefined
  const detectionApiKey: string | undefined = headerDetectionApiKey || undefined;

  // Resolve Copyleaks email: header → undefined
  const copyleaksEmail = headerCopyleaksEmail || undefined;

  // Resolve Copyleaks API key: header → undefined
  const copyleaksApiKey = headerCopyleaksApiKey || undefined;

  return {
    llmProvider,
    llmApiKey,
    detectionProvider,
    detectionApiKey,
    copyleaksEmail,
    copyleaksApiKey,
  };
}
