import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getRequestSettings } from '../requestSettings';

describe('getRequestSettings', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original env after each test
    process.env = originalEnv;
  });

  describe('LLM Provider Resolution', () => {
    it('should return non-empty header value over env var', () => {
      process.env.LLM_PROVIDER = 'anthropic';
      const req = new Request('http://localhost', {
        headers: { 'x-llm-provider': 'openai' },
      });
      const settings = getRequestSettings(req);
      expect(settings.llmProvider).toBe('openai');
    });

    it('should fall back to env var when header is empty', () => {
      process.env.LLM_PROVIDER = 'anthropic';
      const req = new Request('http://localhost', {
        headers: { 'x-llm-provider': '' },
      });
      const settings = getRequestSettings(req);
      expect(settings.llmProvider).toBe('anthropic');
    });

    it('should fall back to default when header and env var are absent', () => {
      delete process.env.LLM_PROVIDER;
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
      process.env.COACHING_LLM_API_KEY = 'env-key-123';
      const req = new Request('http://localhost', {
        headers: { 'x-llm-api-key': 'header-key-456' },
      });
      const settings = getRequestSettings(req);
      expect(settings.llmApiKey).toBe('header-key-456');
    });

    it('should fall back to env var when header is empty string', () => {
      process.env.COACHING_LLM_API_KEY = 'env-key-123';
      const req = new Request('http://localhost', {
        headers: { 'x-llm-api-key': '' },
      });
      const settings = getRequestSettings(req);
      expect(settings.llmApiKey).toBe('env-key-123');
    });

    it('should return undefined when header and env var are absent', () => {
      delete process.env.COACHING_LLM_API_KEY;
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
      process.env.DETECTION_PROVIDER = 'originality';
      const req = new Request('http://localhost', {
        headers: { 'x-detection-provider': 'gptzero' },
      });
      const settings = getRequestSettings(req);
      expect(settings.detectionProvider).toBe('gptzero');
    });

    it('should fall back to env var when header is empty', () => {
      process.env.DETECTION_PROVIDER = 'originality';
      const req = new Request('http://localhost', {
        headers: { 'x-detection-provider': '' },
      });
      const settings = getRequestSettings(req);
      expect(settings.detectionProvider).toBe('originality');
    });

    it('should fall back to default when header and env var are absent', () => {
      delete process.env.DETECTION_PROVIDER;
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
      process.env.SAPLING_API_KEY = 'env-sapling-key';
      const req = new Request('http://localhost', {
        headers: { 'x-detection-api-key': 'header-sapling-key' },
      });
      const settings = getRequestSettings(req);
      expect(settings.detectionApiKey).toBe('header-sapling-key');
    });

    it('should fall back to SAPLING_API_KEY for sapling provider', () => {
      process.env.SAPLING_API_KEY = 'sapling-env-key';
      const req = new Request('http://localhost');
      const settings = getRequestSettings(req);
      expect(settings.detectionApiKey).toBe('sapling-env-key');
    });

    it('should fall back to GPTZERO_API_KEY when provider is gptzero', () => {
      process.env.GPTZERO_API_KEY = 'gptzero-env-key';
      delete process.env.SAPLING_API_KEY;
      const req = new Request('http://localhost', {
        headers: { 'x-detection-provider': 'gptzero' },
      });
      const settings = getRequestSettings(req);
      expect(settings.detectionApiKey).toBe('gptzero-env-key');
    });

    it('should fall back to ORIGINALITY_API_KEY when provider is originality', () => {
      process.env.ORIGINALITY_API_KEY = 'originality-env-key';
      delete process.env.SAPLING_API_KEY;
      const req = new Request('http://localhost', {
        headers: { 'x-detection-provider': 'originality' },
      });
      const settings = getRequestSettings(req);
      expect(settings.detectionApiKey).toBe('originality-env-key');
    });

    it('should fall back to WINSTON_API_KEY when provider is winston', () => {
      process.env.WINSTON_API_KEY = 'winston-env-key';
      delete process.env.SAPLING_API_KEY;
      const req = new Request('http://localhost', {
        headers: { 'x-detection-provider': 'winston' },
      });
      const settings = getRequestSettings(req);
      expect(settings.detectionApiKey).toBe('winston-env-key');
    });

    it('should return undefined when header and all env vars are absent', () => {
      delete process.env.SAPLING_API_KEY;
      delete process.env.GPTZERO_API_KEY;
      delete process.env.ORIGINALITY_API_KEY;
      delete process.env.WINSTON_API_KEY;
      const req = new Request('http://localhost');
      const settings = getRequestSettings(req);
      expect(settings.detectionApiKey).toBeUndefined();
    });

    it('should treat empty string header as absent and fall back to env var', () => {
      process.env.SAPLING_API_KEY = 'sapling-env-key';
      const req = new Request('http://localhost', {
        headers: { 'x-detection-api-key': '' },
      });
      const settings = getRequestSettings(req);
      expect(settings.detectionApiKey).toBe('sapling-env-key');
    });

    it('should trim whitespace from header', () => {
      const req = new Request('http://localhost', {
        headers: { 'x-detection-api-key': '  sk-detection-123  ' },
      });
      const settings = getRequestSettings(req);
      expect(settings.detectionApiKey).toBe('sk-detection-123');
    });

    it('should use case-insensitive provider lookup', () => {
      process.env.GPTZERO_API_KEY = 'gptzero-key';
      delete process.env.SAPLING_API_KEY;
      const req = new Request('http://localhost', {
        headers: { 'x-detection-provider': 'GPTZERO' },
      });
      const settings = getRequestSettings(req);
      expect(settings.detectionApiKey).toBe('gptzero-key');
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

    it('should mix header and env var fallbacks', () => {
      process.env.LLM_PROVIDER = 'openai';
      process.env.COACHING_LLM_API_KEY = 'env-llm-key';
      process.env.DETECTION_PROVIDER = 'winston';
      process.env.WINSTON_API_KEY = 'env-winston-key';

      const req = new Request('http://localhost', {
        headers: {
          'x-llm-provider': 'anthropic',
          // x-llm-api-key omitted - should use env var
          // x-detection-provider omitted - should use env var
          'x-detection-api-key': 'header-detection-key',
        },
      });
      const settings = getRequestSettings(req);
      expect(settings.llmProvider).toBe('anthropic');
      expect(settings.llmApiKey).toBe('env-llm-key');
      expect(settings.detectionProvider).toBe('winston');
      expect(settings.detectionApiKey).toBe('header-detection-key');
    });

    it('should use all defaults when no headers or env vars present', () => {
      delete process.env.LLM_PROVIDER;
      delete process.env.COACHING_LLM_API_KEY;
      delete process.env.DETECTION_PROVIDER;
      delete process.env.SAPLING_API_KEY;
      delete process.env.GPTZERO_API_KEY;
      delete process.env.ORIGINALITY_API_KEY;
      delete process.env.WINSTON_API_KEY;

      const req = new Request('http://localhost');
      const settings = getRequestSettings(req);
      expect(settings.llmProvider).toBe('openai');
      expect(settings.llmApiKey).toBeUndefined();
      expect(settings.detectionProvider).toBe('sapling');
      expect(settings.detectionApiKey).toBeUndefined();
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
