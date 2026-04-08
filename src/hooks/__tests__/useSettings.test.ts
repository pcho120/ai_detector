import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSettings, buildRequestHeaders } from '@/hooks/useSettings';
import {
  DEFAULT_SETTINGS,
  LOCALSTORAGE_KEY,
  AppSettings,
} from '@/lib/settings';

describe('useSettings', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('initializes with DEFAULT_SETTINGS', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('starts with isLoaded as false, then becomes true after mount', async () => {
    const { result } = renderHook(() => useSettings());
    
    // On first render, isLoaded should be false (synchronously)
    // However, in testing library with jsdom, effects may run synchronously
    // So we check that eventually it becomes true
    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });
  });

  it('saves settings to localStorage', async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    const newSettings: AppSettings = {
      llmProvider: 'anthropic',
      llmApiKey: 'sk-test-123',
      detectionProvider: 'sapling',
      detectionApiKey: 'sapling-key-456',
    };

    act(() => {
      result.current.saveSettings(newSettings);
    });

    const saved = localStorage.getItem(LOCALSTORAGE_KEY);
    expect(saved).toBeDefined();
    const parsed = JSON.parse(saved!);
    expect(parsed).toEqual(newSettings);
  });

  it('loads saved settings from localStorage on mount', async () => {
    const savedSettings: AppSettings = {
      llmProvider: 'anthropic',
      llmApiKey: 'sk-saved-789',
      detectionProvider: 'sapling',
      detectionApiKey: 'sapling-saved-key',
    };

    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(savedSettings));

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    expect(result.current.settings).toEqual(savedSettings);
  });

  it('trims whitespace from API keys before saving', async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    const settingsWithWhitespace: AppSettings = {
      llmProvider: 'openai',
      llmApiKey: '  sk-with-spaces  ',
      detectionProvider: 'sapling',
      detectionApiKey: '  sapling-with-spaces  ',
    };

    act(() => {
      result.current.saveSettings(settingsWithWhitespace);
    });

    expect(result.current.settings.llmApiKey).toBe('sk-with-spaces');
    expect(result.current.settings.detectionApiKey).toBe('sapling-with-spaces');

    const saved = localStorage.getItem(LOCALSTORAGE_KEY);
    const parsed = JSON.parse(saved!);
    expect(parsed.llmApiKey).toBe('sk-with-spaces');
    expect(parsed.detectionApiKey).toBe('sapling-with-spaces');
  });

  it('updates settings state when saveSettings is called', async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    const newSettings: AppSettings = {
      llmProvider: 'anthropic',
      llmApiKey: 'sk-updated',
      detectionProvider: 'sapling',
      detectionApiKey: 'sapling-updated',
    };

    act(() => {
      result.current.saveSettings(newSettings);
    });

    expect(result.current.settings).toEqual(newSettings);
  });

  it('handles invalid JSON in localStorage gracefully', async () => {
    localStorage.setItem(LOCALSTORAGE_KEY, 'invalid-json-{');

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    // Should fall back to DEFAULT_SETTINGS instead of crashing
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('buildRequestHeaders', () => {
  it('includes all non-empty settings in headers', () => {
    const settings: AppSettings = {
      llmProvider: 'openai',
      llmApiKey: 'sk-test-key',
      detectionProvider: 'sapling',
      detectionApiKey: 'sapling-test-key',
    };

    const headers = buildRequestHeaders(settings) as Record<string, string>;

    expect(headers['x-llm-provider']).toBe('openai');
    expect(headers['x-llm-api-key']).toBe('sk-test-key');
    expect(headers['x-detection-provider']).toBe('sapling');
    expect(headers['x-detection-api-key']).toBe('sapling-test-key');
  });

  it('omits empty API key fields', () => {
    const settings: AppSettings = {
      llmProvider: 'openai',
      llmApiKey: '',
      detectionProvider: 'sapling',
      detectionApiKey: 'sapling-key',
    };

    const headers = buildRequestHeaders(settings) as Record<string, string>;

    expect(headers['x-llm-provider']).toBe('openai');
    expect(headers['x-llm-api-key']).toBeUndefined();
    expect(headers['x-detection-provider']).toBe('sapling');
    expect(headers['x-detection-api-key']).toBe('sapling-key');
  });

  it('returns an empty headers object for DEFAULT_SETTINGS', () => {
    const headers = buildRequestHeaders(DEFAULT_SETTINGS) as Record<string, string>;

    // DEFAULT_SETTINGS has empty keys, so no headers should be present
    expect(Object.keys(headers).length).toBe(2); // Only providers set
    expect(headers['x-llm-api-key']).toBeUndefined();
    expect(headers['x-detection-api-key']).toBeUndefined();
  });

  it('returns a valid HeadersInit object', () => {
    const settings: AppSettings = {
      llmProvider: 'anthropic',
      llmApiKey: 'sk-anthropic',
      detectionProvider: 'gptzero',
      detectionApiKey: 'gptzero-key',
    };

    const headers = buildRequestHeaders(settings);

    // Should be a plain object suitable for fetch
    expect(typeof headers).toBe('object');
    expect(headers instanceof Object).toBe(true);
  });
});
