// TODO(security): encrypt API keys before storing

/**
 * Settings extracted from request headers with fallback to environment variables.
 * Priority: non-empty header string → env var → default value
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
 * Extract request settings from headers, with fallback to environment variables.
 * Treats empty string headers as absent (falls back to env var or default).
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

  // Resolve LLM provider: header → env var → default
  const llmProvider = headerLlmProvider || process.env.LLM_PROVIDER || 'openai';

  // Resolve LLM API key: non-empty header → env var → undefined
  const llmApiKey = headerLlmApiKey || process.env.COACHING_LLM_API_KEY;

  // Resolve detection provider: header → env var → default
  const detectionProvider = headerDetectionProvider || process.env.DETECTION_PROVIDER || 'sapling';

  // Resolve detection API key: non-empty header → provider-specific env var → undefined
  let detectionApiKey: string | undefined = headerDetectionApiKey || undefined;
  if (!detectionApiKey) {
    // Fall back to provider-specific env var
    switch (detectionProvider.toLowerCase()) {
      case 'gptzero':
        detectionApiKey = process.env.GPTZERO_API_KEY;
        break;
      case 'originality':
        detectionApiKey = process.env.ORIGINALITY_API_KEY;
        break;
      case 'winston':
        detectionApiKey = process.env.WINSTON_API_KEY;
        break;
      case 'sapling':
      default:
        detectionApiKey = process.env.SAPLING_API_KEY;
        break;
    }
  }

  // Resolve Copyleaks email: non-empty header → env var → undefined
  const copyleaksEmail = headerCopyleaksEmail || process.env.COPYLEAKS_EMAIL;

  // Resolve Copyleaks API key: non-empty header → env var → undefined
  const copyleaksApiKey = headerCopyleaksApiKey || process.env.COPYLEAKS_API_KEY;

  return {
    llmProvider,
    llmApiKey,
    detectionProvider,
    detectionApiKey,
    copyleaksEmail,
    copyleaksApiKey,
  };
}
