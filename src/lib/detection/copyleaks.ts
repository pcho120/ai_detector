import crypto from 'node:crypto';
import { FileProcessingError } from '../files/errors';
import type { DetectionAdapter, DetectionResult } from './types';
import {
  mapCopyleaksResultsToSentences,
  type CopyleaksResult,
} from './copyleaks-sentences';

const LOGIN_URL = 'https://id.copyleaks.com/v3/account/login/api';
const DETECT_URL_TEMPLATE = 'https://api.copyleaks.com/v2/writer-detector/{scanId}/check';
const MAX_TEXT_LENGTH = 25_000;
const REQUEST_TIMEOUT_MS = 30_000;
/** Safety buffer: treat token as expired 60 s before its actual expiry. */
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

// ── Token cache ───────────────────────────────────────────────────────────────

interface CachedToken {
  token: string;
  expiresAt: number; // ms since epoch
}

/** Module-scope token cache keyed by `${email}:${apiKey}`. */
const tokenCache = new Map<string, CachedToken>();

function getCacheKey(email: string, apiKey: string): string {
  return `${email}:${apiKey}`;
}

function getCachedToken(email: string, apiKey: string): string | null {
  const cached = tokenCache.get(getCacheKey(email, apiKey));
  if (!cached) return null;
  if (Date.now() >= cached.expiresAt) {
    tokenCache.delete(getCacheKey(email, apiKey));
    return null;
  }
  return cached.token;
}

function setCachedToken(
  email: string,
  apiKey: string,
  token: string,
  expiresAt: number,
): void {
  tokenCache.set(getCacheKey(email, apiKey), { token, expiresAt });
}

// ── Copyleaks API response shapes ─────────────────────────────────────────────

interface CopyleaksLoginResponse {
  access_token: string;
  /** ISO 8601 datetime string when the token expires (Copyleaks documented field). */
  expires?: string;
  /** Legacy/alternate field name – kept for compatibility. */
  expiry?: string;
  /** Some flavors use expires_in (seconds from now). */
  expires_in?: number;
}

interface CopyleaksSummary {
  ai: number;
}

interface CopyleaksDetectResponse {
  summary: CopyleaksSummary;
  results: CopyleaksResult[];
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export interface CopyleaksAdapterOptions {
  email: string;
  apiKey: string;
  sandbox?: boolean;
}

export class CopyleaksDetectionAdapter implements DetectionAdapter {
  private readonly email: string;
  private readonly apiKey: string;
  private readonly sandbox: boolean;

  constructor({ email, apiKey, sandbox }: CopyleaksAdapterOptions) {
    if (!email || !apiKey) {
      throw new Error('CopyleaksDetectionAdapter requires both email and apiKey');
    }
    this.email = email;
    this.apiKey = apiKey;
    // Honour explicit option; fall back to env var.
    this.sandbox = sandbox ?? process.env.COPYLEAKS_SANDBOX === 'true';
  }

  // ── Private: login ──────────────────────────────────────────────────────────

  private async fetchToken(): Promise<string> {
    let response: Response;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        response = await fetch(LOGIN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: this.email, key: this.apiKey }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      throw new FileProcessingError(
        'DETECTION_FAILED',
        isAbort
          ? 'Copyleaks authentication request timed out. Please try again.'
          : 'Copyleaks authentication request failed due to a network error.',
      );
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new FileProcessingError(
          'DETECTION_FAILED',
          'Copyleaks authentication rate limit exceeded. Please try again in 5 minutes.',
        );
      }
      throw new FileProcessingError(
        'DETECTION_FAILED',
        `Copyleaks authentication failed (HTTP ${response.status}).`,
      );
    }

    let data: CopyleaksLoginResponse;
    try {
      data = (await response.json()) as CopyleaksLoginResponse;
    } catch {
      throw new FileProcessingError(
        'DETECTION_FAILED',
        'Copyleaks authentication service returned an unreadable response.',
      );
    }

    // Compute expiry timestamp from the response.
    // Priority: `expires` (documented Copyleaks field) → `expiry` (compat) → `expires_in` → 1-hour fallback.
    let expiresAt: number;
    if (data.expires) {
      expiresAt = new Date(data.expires).getTime() - TOKEN_EXPIRY_BUFFER_MS;
    } else if (data.expiry) {
      expiresAt = new Date(data.expiry).getTime() - TOKEN_EXPIRY_BUFFER_MS;
    } else if (typeof data.expires_in === 'number') {
      expiresAt = Date.now() + data.expires_in * 1000 - TOKEN_EXPIRY_BUFFER_MS;
    } else {
      // Fallback: treat token as valid for 1 hour with buffer.
      expiresAt = Date.now() + 3600_000 - TOKEN_EXPIRY_BUFFER_MS;
    }

    setCachedToken(this.email, this.apiKey, data.access_token, expiresAt);
    return data.access_token;
  }

  private async getToken(): Promise<string> {
    const cached = getCachedToken(this.email, this.apiKey);
    if (cached) return cached;
    return this.fetchToken();
  }

  // ── Public: detect ──────────────────────────────────────────────────────────

  async detect(text: string): Promise<DetectionResult> {
    if (text.length > MAX_TEXT_LENGTH) {
      throw new FileProcessingError(
        'DETECTION_FAILED',
        `Text exceeds the Copyleaks 25,000-character limit. Please shorten your text and try again.`,
      );
    }

    const token = await this.getToken();
    const scanId = crypto.randomUUID();
    const url = DETECT_URL_TEMPLATE.replace('{scanId}', scanId);

    let response: Response;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            text,
            sandbox: this.sandbox,
            sensitivity: 2,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      throw new FileProcessingError(
        'DETECTION_FAILED',
        isAbort
          ? 'AI detection request timed out. Please try again.'
          : 'AI detection request failed due to a network error.',
      );
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new FileProcessingError(
          'DETECTION_FAILED',
          'Copyleaks AI detection API rate limit exceeded (HTTP 429). Please wait a moment and try again.',
        );
      }
      throw new FileProcessingError(
        'DETECTION_FAILED',
        `Copyleaks AI detection API returned an error (HTTP ${response.status}).`,
      );
    }

    let data: CopyleaksDetectResponse;
    try {
      data = (await response.json()) as CopyleaksDetectResponse;
    } catch {
      throw new FileProcessingError(
        'DETECTION_FAILED',
        'AI detection service returned an unreadable response.',
      );
    }

    return {
      score: data.summary.ai,
      sentences: mapCopyleaksResultsToSentences(text, data.results ?? []),
    };
  }
}
