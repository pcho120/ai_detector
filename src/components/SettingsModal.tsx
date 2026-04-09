'use client';

import React, { useEffect, useState, useRef } from 'react';
import { 
  AppSettings, 
  LLM_PROVIDER_LABELS, 
  DETECTION_PROVIDER_LABELS, 
  STUB_DETECTION_PROVIDERS 
} from '@/lib/settings/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  saveSettings: (settings: AppSettings) => void;
}

export function SettingsModal({ isOpen, onClose, settings, saveSettings }: SettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const modalRef = useRef<HTMLDivElement>(null);

  // Reset local state when modal opens or external settings change
  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings);
    }
  }, [isOpen, settings]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = () => {
    saveSettings(localSettings);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={handleBackdropClick}
      data-testid="settings-modal-backdrop"
    >
      <div 
        ref={modalRef}
        className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="settings-modal-title"
        data-testid="settings-modal"
      >
        <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 id="settings-modal-title" className="text-xl font-bold text-slate-800">Settings</h2>
          <button 
            type="button" 
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Close settings"
            data-testid="settings-modal-close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          {/* Detection Provider */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">AI Detection</h3>
            
            <div className="space-y-2">
              <label htmlFor="detection-provider" className="block text-sm font-medium text-slate-700">Provider</label>
              <select
                id="detection-provider"
                name="detectionProvider"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={localSettings.detectionProvider}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, detectionProvider: e.target.value as AppSettings['detectionProvider'] }))}
                data-testid="detection-provider-select"
              >
                {(Object.entries(DETECTION_PROVIDER_LABELS) as [AppSettings['detectionProvider'], string][]).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}{STUB_DETECTION_PROVIDERS.includes(key) ? ' (Coming Soon)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="detection-key" className="block text-sm font-medium text-slate-700">API Key</label>
              <input
                id="detection-key"
                name="detectionApiKey"
                type="password"
                placeholder="Optional (uses server key if empty)"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={localSettings.detectionApiKey}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, detectionApiKey: e.target.value }))}
                data-testid="detection-key-input"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 my-6"></div>

           {/* Copyleaks (Document Detection) */}
           <div className="space-y-4">
             <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Copyleaks (Document Detection)</h3>
             <p className="text-xs text-slate-500">
               Provide both email and API key to enable document-level detection. If provided alongside Sapling, Copyleaks handles the overall score and Sapling handles sentence analysis.
             </p>
            
            <div className="space-y-2">
              <label htmlFor="copyleaks-email" className="block text-sm font-medium text-slate-700">Email</label>
               <input
                 id="copyleaks-email"
                 name="copyleaksEmail"
                 type="email"
                 placeholder="your@email.com"
                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                 value={localSettings.copyleaksEmail}
                 onChange={(e) => setLocalSettings(prev => ({ ...prev, copyleaksEmail: e.target.value }))}
                 data-testid="copyleaks-email-input"
               />
            </div>

            <div className="space-y-2">
              <label htmlFor="copyleaks-key" className="block text-sm font-medium text-slate-700">API Key</label>
               <input
                 id="copyleaks-key"
                 name="copyleaksApiKey"
                 type="password"
                 placeholder="Copyleaks API Key"
                 className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                 value={localSettings.copyleaksApiKey}
                 onChange={(e) => setLocalSettings(prev => ({ ...prev, copyleaksApiKey: e.target.value }))}
                 data-testid="copyleaks-api-key-input"
               />
            </div>
          </div>

          <div className="border-t border-slate-100 my-6"></div>

          {/* Coaching LLM */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Coaching LLM</h3>
            
            <div className="space-y-2">
              <label htmlFor="llm-provider" className="block text-sm font-medium text-slate-700">Provider</label>
              <select
                id="llm-provider"
                name="llmProvider"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={localSettings.llmProvider}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, llmProvider: e.target.value as AppSettings['llmProvider'] }))}
                data-testid="llm-provider-select"
              >
                {(Object.entries(LLM_PROVIDER_LABELS) as [AppSettings['llmProvider'], string][]).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="llm-key" className="block text-sm font-medium text-slate-700">API Key</label>
              <input
                id="llm-key"
                name="llmApiKey"
                type="password"
                placeholder="Optional (uses server key if empty)"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={localSettings.llmApiKey}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, llmApiKey: e.target.value }))}
                data-testid="llm-key-input"
              />
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4">
          <p className="text-xs text-slate-500 text-center">
            Keys are stored locally in your browser&apos;s localStorage and are not retained by our servers.
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
              data-testid="settings-cancel-btn"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              data-testid="settings-save-btn"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
