'use client';

import { useState, useEffect } from 'react';
import {
  AppSettings,
  DEFAULT_SETTINGS,
  LOCALSTORAGE_KEY,
} from '@/lib/settings';

/**
 * SSR-safe localStorage hook for managing settings.
 *
 * Initializes with defaults and hydrates from localStorage in useEffect,
 * avoiding SSR hydration mismatches. Provides an `isLoaded` flag to gate
 * rendering until hydration completes.
 *
 * @returns { settings, saveSettings, isLoaded }
 */
export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Read from localStorage only in useEffect, never in useState initializer
    const saved = localStorage.getItem(LOCALSTORAGE_KEY);
    if (saved) {
      try {
        setSettingsState(JSON.parse(saved));
      } catch {
        // Silently ignore invalid JSON; fall back to defaults
      }
    }
    setIsLoaded(true);
  }, []);

  const saveSettings = (next: AppSettings) => {
    // Trim whitespace from API key values before saving
    const trimmed = {
      ...next,
      llmApiKey: next.llmApiKey.trim(),
      detectionApiKey: next.detectionApiKey.trim(),
    };
    // TODO(security): encrypt API keys before storing
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(trimmed));
    setSettingsState(trimmed);
  };

  return { settings, saveSettings, isLoaded };
}

/**
 * Helper to build HTTP headers from settings for fetch calls.
 *
 * Returns an object suitable for inclusion in fetch `headers` option.
 * Empty strings are omitted from headers (to trigger server-side env var fallback).
 *
 * @param settings - AppSettings object from useSettings
 * @returns HeadersInit object with settings-based custom headers
 */
export function buildRequestHeaders(settings: AppSettings): HeadersInit {
  const headers: Record<string, string> = {};

  if (settings.llmProvider) {
    headers['x-llm-provider'] = settings.llmProvider;
  }
  if (settings.llmApiKey) {
    headers['x-llm-api-key'] = settings.llmApiKey;
  }
  if (settings.detectionProvider) {
    headers['x-detection-provider'] = settings.detectionProvider;
  }
  if (settings.detectionApiKey) {
    headers['x-detection-api-key'] = settings.detectionApiKey;
  }

  return headers;
}
