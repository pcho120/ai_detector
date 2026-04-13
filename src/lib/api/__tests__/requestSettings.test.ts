import { describe, it, expect, vi } from 'vitest';
import { getRequestSettings } from '../requestSettings';

describe('getRequestSettings', () => {
  describe('LLM Provider Resolution', () => {
    it('should return non-empty header value over env var', () => {
      const req = new Request('http://localhost', {
        headers: { 'x-llm-provider': 'openai' },
      });
      const settings = getRequestSettings(req);
      expect(settings.llmProvider).toBe('openai');
    });

    it('should fall back to default when header and env var are absent', () => {
      const req = new Request('http://localhost');
      const settings = getRequestSettings(req);
      expect(settings.llmProvider).toBe('openai');
    });

    it('should trim whitespace from header', () => {
      const req = new Request('http://localhost', {
        headers: { 'x-llm-provider': '  anthropic  ' },
      });
      const settings = getRequestSettings(req);
      expect(settings.llmProvider).toBe('anthropic');
    });
  });

  describe('LLM API Key Resolution', () => {
    it('should return non-empty header value over env var', () => {
      const req = new Request('http://localhost', {
        headers: { 'x-llm-api-key': 'header-key-456' },
      });
      const settings = getRequestSettings(req);
      expect(settings.llmApiKey).toBe('header-key-456');
    });

    it('should return undefined when header and env var are absent', () => {
      const req = new Request('http://localhost');
      const settings = getRequestSettings(req);
      expect(settings.llmApiKey).toBeUndefined();
    });

    it('should trim whitespace from header', () => {
      const req = new Request('http://localhost', {
        headers: { 'x-llm-api-key': '  sk-test-123  ' },
      });
      const settings = getRequestSettings(req);
      expect(settings.llmApiKey).toBe('sk-test-123');
    });
  });

  describe('Detection Provider Resolution', () => {
    it('should return non-empty header value over env var', () => {
      const req = new Request('http://localhost', {
        headers: { 'x-detection-provider': 'gptzero' },
      });
      const settings = getRequestSettings(req);
      expect(settings.detectionProvider).toBe('gptzero');
    });

    it('should fall back to default when header and env var are absent', () => {
      const req = new Request('http://localhost');
      const settings = getRequestSettings(req);
      expect(settings.detectionProvider).toBe('sapling');
    });

    it('should trim whitespace from header', () => {
      const req = new Request('http://localhost', {
        headers: { 'x-detection-provider': '  winston  ' },
      });
      const settings = getRequestSettings(req);
      expect(settings.detectionProvider).toBe('winston');
    });
  });

  describe('Detection API Key Resolution', () => {
    it('should return non-empty header value over env var', () => {
      const req = new Request('http://localhost', {
        headers: { 'x-detection-api-key': 'header-sapling-key' },
      });
      const settings = getRequestSettings(req);
      expect(settings.detectionApiKey).toBe('header-sapling-key');
    });

    it('should return undefined when header and all env vars are absent', () => {
      const req = new Request('http://localhost');
      const settings = getRequestSettings(req);
      expect(settings.detectionApiKey).toBeUndefined();
    });

    it('should trim whitespace from header', () => {
      const req = new Request('http://localhost', {
        headers: { 'x-detection-api-key': '  sk-detection-123  ' },
      });
      const settings = getRequestSettings(req);
      expect(settings.detectionApiKey).toBe('sk-detection-123');
    });
  });

  describe('Integration: Complete Request Flow', () => {
    it('should resolve all settings from headers', () => {
      const req = new Request('http://localhost', {
        headers: {
          'x-llm-provider': 'anthropic',
          'x-llm-api-key': 'sk-llm-123',
          'x-detection-provider': 'gptzero',
          'x-detection-api-key': 'sk-detection-456',
        },
      });
      const settings = getRequestSettings(req);
      expect(settings.llmProvider).toBe('anthropic');
      expect(settings.llmApiKey).toBe('sk-llm-123');
      expect(settings.detectionProvider).toBe('gptzero');
      expect(settings.detectionApiKey).toBe('sk-detection-456');
    });

  });

  describe('No Header Defaults', () => {
    it('should use hardcoded defaults and return undefined keys when no headers provided', () => {
      vi.stubEnv('LLM_PROVIDER', 'anthropic');
      vi.stubEnv('COACHING_LLM_API_KEY', 'env-llm-key');
      vi.stubEnv('DETECTION_PROVIDER', 'winston');
      vi.stubEnv('SAPLING_API_KEY', 'env-sapling-key');
      vi.stubEnv('GPTZERO_API_KEY', 'env-gptzero-key');
      vi.stubEnv('ORIGINALITY_API_KEY', 'env-originality-key');
      vi.stubEnv('WINSTON_API_KEY', 'env-winston-key');
      vi.stubEnv('COPYLEAKS_EMAIL', 'env-email');
      vi.stubEnv('COPYLEAKS_API_KEY', 'env-copyleaks-key');

      const req = new Request('http://localhost');
      const settings = getRequestSettings(req);
      expect(settings.llmProvider).toBe('openai');
      expect(settings.llmApiKey).toBeUndefined();
      expect(settings.detectionProvider).toBe('sapling');
      expect(settings.detectionApiKey).toBeUndefined();
      expect(settings.copyleaksEmail).toBeUndefined();
      expect(settings.copyleaksApiKey).toBeUndefined();

      vi.unstubAllEnvs();
    });
  });

  describe('Security: No Key Leakage', () => {
    it('should handle keys without logging them', () => {
      const logSpy = vi.spyOn(console, 'log');
      const req = new Request('http://localhost', {
        headers: {
          'x-llm-api-key': 'secret-key-123',
          'x-detection-api-key': 'secret-detection-456',
        },
      });
      getRequestSettings(req);
      // Function should not log keys
      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });
});
