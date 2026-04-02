import React, { useState } from 'react';
import {
  PRESET_DESCRIPTORS,
  VoicePresetKey,
  detectProfileLanguage,
} from '@/lib/suggestions/voiceProfile';

interface VoiceProfilePanelProps {
  vpSelectedPresets: string[];
  setVpSelectedPresets: (presets: string[]) => void;
  vpWritingSampleDraft: string;
  setVpWritingSampleDraft: (draft: string) => void;
  voiceProfile: string;
  setVoiceProfile: (profile: string) => void;
  vpLoading: boolean;
  setVpLoading: (loading: boolean) => void;
  vpError: string | null;
  setVpError: (error: string | null) => void;
  vpCopied: boolean;
  setVpCopied: (copied: boolean) => void;
}

export function VoiceProfilePanel({
  vpSelectedPresets,
  setVpSelectedPresets,
  vpWritingSampleDraft,
  setVpWritingSampleDraft,
  voiceProfile,
  setVoiceProfile,
  vpLoading,
  setVpLoading,
  vpError,
  setVpError,
  vpCopied,
  setVpCopied,
}: VoiceProfilePanelProps) {
  const [isProfileRevealed, setIsProfileRevealed] = useState(false);

  const handlePresetToggle = (key: string) => {
    if (vpSelectedPresets.includes(key)) {
      setVpSelectedPresets(vpSelectedPresets.filter((p) => p !== key));
    } else {
      if (vpSelectedPresets.length >= 2) return;
      setVpSelectedPresets([...vpSelectedPresets, key]);
    }
  };

  const hasInput = vpSelectedPresets.length > 0 || vpWritingSampleDraft.trim().length > 0;

  const handleGenerate = async () => {
    if (!hasInput) {
      setVpError('At least one of presets or writing sample must be provided.');
      return;
    }

    setVpLoading(true);
    setVpError(null);
    setVpCopied(false);

    try {
      const response = await fetch('/api/voice-profile/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presets: vpSelectedPresets.length > 0 ? vpSelectedPresets : undefined,
          writingSample: vpWritingSampleDraft.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setVpError(data.message || 'Failed to generate voice profile.');
        setVpLoading(false);
        return;
      }

      const data = await response.json();
      setVoiceProfile(data.profile);
      setIsProfileRevealed(true);
    } catch {
      setVpError('Network error while generating voice profile.');
    } finally {
      setVpLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!voiceProfile) return;
    const lang = detectProfileLanguage(voiceProfile);
    const trimmed = voiceProfile.trim();
    const textToCopy = lang === 'ko'
      ? `당신의 목소리는 '${trimmed}' 입니다.`
      : `Your voice profile is: ${trimmed}`;
    await navigator.clipboard.writeText(textToCopy);
    setVpCopied(true);
    setTimeout(() => setVpCopied(false), 2000);
  };

  return (
    <div
      className="flex flex-col gap-6"
      data-testid="voice-profile-panel"
    >
      <header className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Voice Profile Setup</h2>
        <p className="text-sm text-slate-500">
          Define a writing style to use for rewrites. Select up to 2 presets, provide a writing sample, or both.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <span className="text-sm font-semibold text-slate-700">Style Presets (max 2)</span>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(PRESET_DESCRIPTORS) as [VoicePresetKey, string][]).map(([key, desc]) => {
              const isSelected = vpSelectedPresets.includes(key);
              const isDisabled = !isSelected && vpSelectedPresets.length >= 2;
              return (
                <button
                  key={key}
                  onClick={() => handlePresetToggle(key)}
                  disabled={vpLoading || isDisabled}
                  data-testid={`voice-preset-${key}`}
                  title={desc}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors border ${
                    isSelected
                      ? 'bg-blue-100 text-blue-800 border-blue-200'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  } ${isDisabled ? 'opacity-50 cursor-not-allowed hover:bg-white' : ''}`}
                >
                  {key}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-sm font-semibold text-slate-700" htmlFor="voice-sample">
            Writing Sample (Optional)
          </label>
          <textarea
            id="voice-sample"
            value={vpWritingSampleDraft}
            onChange={(e) => setVpWritingSampleDraft(e.target.value)}
            disabled={vpLoading}
            data-testid="voice-sample-input"
            className="w-full min-h-[100px] rounded-md border border-slate-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
            placeholder="Paste a sample of your writing here..."
          />
        </div>

        {vpError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {vpError}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={vpLoading || !hasInput}
          data-testid="generate-voice-profile-btn"
          className="w-fit rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {vpLoading ? 'Generating...' : 'Generate Profile'}
        </button>

        {!isProfileRevealed ? (
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => setIsProfileRevealed(true)}
              data-testid="reveal-voice-profile-btn"
              className="text-sm font-medium text-slate-500 hover:text-slate-800 underline transition-colors"
            >
              I already have a profile!
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <label className="text-sm font-semibold text-slate-700" htmlFor="voice-profile-result">
              Your Voice Profile
            </label>
            <textarea
              id="voice-profile-result"
              value={voiceProfile}
              onChange={(e) => setVoiceProfile(e.target.value)}
              disabled={vpLoading}
              data-testid="voice-profile-textarea"
              placeholder="Paste a previously copied profile here, or generate one above."
              className="w-full min-h-[120px] rounded-md border border-slate-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={handleCopy}
                disabled={!voiceProfile}
                data-testid="copy-voice-profile-btn"
                className="rounded-md bg-white border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Copy for AI Tools
              </button>
              {vpCopied && (
                <span data-testid="voice-profile-status" className="text-sm font-medium text-green-600">
                  Copied!
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              You can edit this profile directly or copy it to use in other AI tools. It will be automatically used when applying rewrite suggestions on this page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
