'use client';

import React, { useState } from 'react';
import { ReviewPanel } from '@/components/ReviewPanel';
import { RevisedReviewPanel } from '@/components/RevisedReviewPanel';
import { useRevisedAnalysisState, deriveRevisedText } from '@/app/useRevisedAnalysisState';

export default function HomePage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revisedAnalysis = useRevisedAnalysisState();
  const { state: revisedState, setOriginalResult, reset: resetRevised } = revisedAnalysis;

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
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">AI Detect Essay Review</h1>
          <p className="text-slate-500">Upload your essay to analyze it for AI-generated phrasing.</p>
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
          <div className={`flex gap-6 ${revisedState.revisedResult || revisedState.revisedLoading || revisedState.revisedError ? 'flex-col lg:flex-row' : 'flex-col'}`}>
            <section className="flex-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm min-w-0">
              <ReviewPanel result={result} revisedState={revisedAnalysis} />
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
        )}
      </div>
    </main>
  );
}
