import React, { useState, useRef } from 'react';
import type { AppSettings } from '@/lib/settings/types';
import { buildRequestHeaders } from '@/hooks/useSettings';
import type { StyleExtractionResult } from '@/lib/style-extraction/types';

interface MyPaperTabProps {
  fewShotExamples: string[];
  setFewShotExamples: (examples: string[]) => void;
  settings: AppSettings;
}

export function MyPaperTab({
  fewShotExamples,
  setFewShotExamples,
  settings,
}: MyPaperTabProps) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setText(''); // Clear text if file is selected
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (e.target.value) {
      setFile(null); // Clear file if text is entered
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleExtract = async () => {
    if (!file && text.trim().length < 500) {
      setError('Please provide a file or at least 500 characters of text.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let response;
      
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        
        response = await fetch('/api/extract-style', {
          method: 'POST',
          headers: {
            ...buildRequestHeaders(settings),
          },
          body: formData,
        });
      } else {
        response = await fetch('/api/extract-style', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...buildRequestHeaders(settings),
          },
          body: JSON.stringify({ text }),
        });
      }

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || data.error || 'Failed to extract style.');
        setLoading(false);
        return;
      }

      const data: StyleExtractionResult = await response.json();
      setFewShotExamples(data.sentences);
    } catch {
      setError('Network error while extracting style.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setText('');
    setFewShotExamples([]);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const hasExtracted = fewShotExamples.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">My Paper Style</h2>
        <p className="text-sm text-slate-500">
          Upload a previous paper or paste your writing to extract your unique sentence structures.
        </p>
      </header>

      {!hasExtracted ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <label className="text-sm font-semibold text-slate-700" htmlFor="my-paper-file">
              Upload Document (.docx, .doc)
            </label>
            <input
              type="file"
              id="my-paper-file"
              accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
              onChange={handleFileChange}
              disabled={loading}
              ref={fileInputRef}
              data-testid="my-paper-file-input"
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="h-px flex-1 bg-slate-200"></div>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">OR</span>
            <div className="h-px flex-1 bg-slate-200"></div>
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-sm font-semibold text-slate-700" htmlFor="my-paper-text">
              Paste Text
            </label>
            <textarea
              id="my-paper-text"
              value={text}
              onChange={handleTextChange}
              disabled={loading}
              data-testid="my-paper-textarea"
              className="w-full min-h-[100px] rounded-md border border-slate-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
              placeholder="Paste your writing here (min 500 characters)..."
            />
          </div>

          {error && (
            <div data-testid="my-paper-error" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <button
            onClick={handleExtract}
            disabled={loading || (!file && text.trim().length < 500)}
            data-testid="extract-style-btn"
            className="w-fit rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Extracting...' : 'Extract Style'}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4" data-testid="my-paper-success">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <h3 className="text-sm font-semibold text-green-800 mb-2">
              {fewShotExamples.length} style sentences extracted
            </h3>
            <div className="flex flex-col gap-2 mt-3">
              {fewShotExamples.slice(0, 2).map((sentence, idx) => (
                <div key={idx} className="text-sm text-green-700 bg-green-100/50 p-2 rounded border border-green-200/50">
                  {`"${sentence.length > 80 ? sentence.substring(0, 80) + '...' : sentence}"`}
                </div>
              ))}
              {fewShotExamples.length > 2 && (
                <div className="text-xs text-green-600 italic px-1">
                  + {fewShotExamples.length - 2} more sentences
                </div>
              )}
            </div>
          </div>
          
          <button
            onClick={handleClear}
            data-testid="my-paper-clear-btn"
            className="w-fit rounded-md bg-white border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:text-slate-900"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
