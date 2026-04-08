'use client';

import React, { useState } from 'react';
import { ReviewPanel } from '@/components/ReviewPanel';
import { RevisedReviewPanel } from '@/components/RevisedReviewPanel';
import { VoiceProfilePanel } from '@/components/VoiceProfilePanel';
import { TargetScorePanel } from '@/components/TargetScorePanel';
import { SettingsModal } from '@/components/SettingsModal';
import { useRevisedAnalysisState, deriveRevisedText } from '@/app/useRevisedAnalysisState';
import { useSettings, buildRequestHeaders } from '@/hooks/useSettings';

export default function HomePage() {
  const { settings, saveSettings, isLoaded } = useSettings();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revisedAnalysis = useRevisedAnalysisState(settings);
  const { state: revisedState, setOriginalResult, reset: resetRevised } = revisedAnalysis;

  const [vpSelectedPresets, setVpSelectedPresets] = useState<string[]>([]);
  const [vpWritingSampleDraft, setVpWritingSampleDraft] = useState('');
  const [voiceProfile, setVoiceProfile] = useState('');
  const [vpLoading, setVpLoading] = useState(false);
  const [vpError, setVpError] = useState<string | null>(null);
  const [vpCopied, setVpCopied] = useState(false);

  const [targetScore, setTargetScore] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; phase: string } | null>(null);
  const [bulkResult, setBulkResult] = useState<{ achievedScore: number; targetMet: boolean; targetScore: number } | null>(null);

  const result = revisedState.originalResult;

  const handleRevert = (sentenceIndex: number) => {
    revisedAnalysis.removeSentenceReplacement(sentenceIndex);
    
    const nextReplacements = { ...revisedState.appliedReplacements };
    delete nextReplacements[sentenceIndex];
    
    if (Object.keys(nextReplacements).length > 0 && result) {
      const revisedText = deriveRevisedText(result, nextReplacements);
      void revisedAnalysis.triggerRevisedAnalysis(revisedText);
    }
  };

  const handleBulkRewrite = async (parsedTargetScore: number) => {
    if (!result) return;

    setBulkLoading(true);
    setBulkProgress(null);
    setBulkResult(null);

    const sentences = result.sentences.map((s, idx) => ({
      sentence: s.sentence,
      score: s.score,
      sentenceIndex: idx,
    }));

    const total = sentences.length;
    setBulkProgress({ current: 0, total, phase: 'rewriting' });

    try {
      const response = await fetch('/api/bulk-rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildRequestHeaders(settings) },
        body: JSON.stringify({
          sentences,
          targetScore: parsedTargetScore,
          voiceProfile: voiceProfile || undefined,
          text: result.text,
          manualReplacements: Object.keys(revisedState.appliedReplacements).length > 0
            ? revisedState.appliedReplacements
            : undefined,
        }),
      });

      if (!response.ok) {
        setBulkResult({ achievedScore: result.score * 100, targetMet: false, targetScore: parsedTargetScore });
        return;
      }

      const data = (await response.json()) as {
        rewrites: Record<string, string>;
        achievedScore: number;
        targetMet: boolean;
        iterations: number;
        totalRewritten: number;
      };

      setBulkProgress({ current: total, total, phase: 'analyzing' });

      // Apply bulk rewrites into the reducer, preserving existing manual replacements
      const existingReplacements = revisedState.appliedReplacements;
      const mergedReplacements: Record<number, string> = { ...existingReplacements };

      for (const [keyStr, rewrite] of Object.entries(data.rewrites)) {
        const idx = Number(keyStr);
        // Only apply bulk rewrite if no manual replacement already exists for this index
        if (!(idx in existingReplacements)) {
          revisedAnalysis.applySentenceReplacement(idx, rewrite);
          mergedReplacements[idx] = rewrite;
        }
      }

      setBulkResult({
        achievedScore: data.achievedScore,
        targetMet: data.targetMet,
        targetScore: parsedTargetScore,
      });

      // Trigger revised analysis on the merged text so the right panel updates
      if (Object.keys(mergedReplacements).length > 0) {
        const revisedText = deriveRevisedText(result, mergedReplacements);
        void revisedAnalysis.triggerRevisedAnalysis(revisedText);
      }
    } catch {
      setBulkResult({ achievedScore: result.score * 100, targetMet: false, targetScore: parsedTargetScore });
    } finally {
      setBulkLoading(false);
      setBulkProgress(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    resetRevised();

    const formData = new FormData(e.currentTarget);
    const file = formData.get('essay-file');

    if (!file || (file instanceof File && file.size === 0)) {
      setError('Please select a valid file to upload.');
      setIsSubmitting(false);
      return;
    }

    const apiFormData = new FormData();
    apiFormData.append('file', file);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: buildRequestHeaders(settings),
        body: apiFormData,
      });

      if (!response.ok) {
        const errData = await response.json();
        const msg = errData.message || 'An unknown error occurred.';
        
        if (errData.error === 'UNSUPPORTED_LANGUAGE') {
          setError('Only English-language documents are supported. Please upload an English document.');
        } else if (errData.error === 'UNSUPPORTED_FORMAT') {
          setError('Unsupported file format. Please upload a .doc or .docx file.');
        } else {
          setError(msg);
        }
        return;
      }

      const data = await response.json();
      setOriginalResult(data);
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900 font-sans">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <span data-testid="voice-profile-state" data-value={voiceProfile} style={{ display: 'none' }} aria-hidden="true" />
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">AI Detect Essay Review</h1>
              <p className="text-slate-500">Upload your essay to analyze it for AI-generated phrasing.</p>
            </div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors relative"
              data-testid="settings-trigger"
              title="Settings"
              aria-label="Open settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {!settings.llmApiKey && !settings.detectionApiKey && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-yellow-400 rounded-full" aria-hidden="true" />
              )}
            </button>
          </div>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700" htmlFor="essay-file">
              Upload essay file (.doc or .docx)
              <input
                id="essay-file"
                name="essay-file"
                type="file"
                accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="block w-full rounded-md border border-slate-300 p-2.5 text-sm transition-colors hover:border-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid="file-input"
                disabled={isSubmitting}
                required
              />
            </label>
            <button
              type="submit"
              className="w-fit min-w-[120px] rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="submit-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Analyzing...' : 'Submit for Review'}
            </button>
          </form>
        </section>

        {error && (
          <div 
            className="rounded-md border border-red-200 bg-red-50 p-4 text-red-800 shadow-sm"
            data-testid="error-message"
          >
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-6">
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <VoiceProfilePanel
                vpSelectedPresets={vpSelectedPresets}
                setVpSelectedPresets={setVpSelectedPresets}
                vpWritingSampleDraft={vpWritingSampleDraft}
                setVpWritingSampleDraft={setVpWritingSampleDraft}
                voiceProfile={voiceProfile}
                setVoiceProfile={setVoiceProfile}
                vpLoading={vpLoading}
                setVpLoading={setVpLoading}
                vpError={vpError}
                setVpError={setVpError}
                vpCopied={vpCopied}
                setVpCopied={setVpCopied}
                settings={settings}
              />
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <TargetScorePanel
                targetScore={targetScore}
                onTargetScoreChange={setTargetScore}
                onRewrite={handleBulkRewrite}
                isLoading={bulkLoading}
                disabled={isSubmitting}
                progress={bulkProgress}
                result={bulkResult}
              />
            </section>
            <div className={`flex gap-6 ${revisedState.revisedResult || revisedState.revisedLoading || revisedState.revisedError ? 'flex-col lg:flex-row' : 'flex-col'}`}>
              <section className="flex-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm min-w-0">
                <ReviewPanel result={result} revisedState={revisedAnalysis} voiceProfile={voiceProfile || undefined} settings={settings} />
              </section>
              {(revisedState.revisedResult || revisedState.revisedLoading || revisedState.revisedError) && (
                <section className="flex-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm min-w-0" data-testid="revised-panel-section">
                  <RevisedReviewPanel
                    result={revisedState.revisedResult ?? { score: 0, text: '', sentences: [], highlights: [], suggestions: [] }}
                    isLoading={revisedState.revisedLoading}
                    error={revisedState.revisedError}
                    appliedReplacements={revisedState.appliedReplacements}
                    onRevert={handleRevert}
                  />
                </section>
              )}
            </div>
          </div>
        )}
      </div>
      {isLoaded && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          saveSettings={saveSettings}
        />
      )}
    </main>
  );
}
