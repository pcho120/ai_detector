import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, beforeEach, afterEach } from 'vitest';
import HomePage from '@/app/page';

vi.mock('@/components/ReviewPanel', () => ({
  ReviewPanel: (props: { result: unknown; revisedState?: unknown; voiceProfile?: string }) => (
    <div data-testid="mock-review-panel" data-voice-profile={props.voiceProfile ?? ''} />
  ),
}));

vi.mock('@/components/RevisedReviewPanel', () => ({
  RevisedReviewPanel: () => <div data-testid="mock-revised-panel" />,
}));

vi.mock('@/components/VoiceProfilePanel', () => ({
  VoiceProfilePanel: (props: { voiceProfile: string; setVoiceProfile: (v: string) => void }) => {
    const [revealed, setRevealed] = useState(false);
    return (
      <div data-testid="voice-profile-panel">
        {!revealed ? (
          <button
            data-testid="reveal-voice-profile-btn"
            onClick={() => setRevealed(true)}
          >
            I already have a profile!
          </button>
        ) : (
          <textarea
            data-testid="voice-profile-textarea"
            value={props.voiceProfile}
            onChange={(e) => props.setVoiceProfile(e.target.value)}
          />
        )}
      </div>
    );
  },
}));

const MOCK_ANALYSIS_RESULT = {
  score: 0.5,
  text: 'Sample text.',
  sentences: [{ sentence: 'Sample text.', score: 0.5 }],
  highlights: [],
  suggestions: [],
};

function makeMockFile(name = 'essay.docx') {
  return new File(['content'], name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

async function submitFile(file: File, fetchSpy: ReturnType<typeof vi.fn>) {
  const fileInput = screen.getByTestId('file-input') as HTMLInputElement;
  const form = fileInput.closest('form')!;

  const OriginalFormData = global.FormData;
  const MockFormData = vi.fn().mockImplementation((formElement?: HTMLFormElement) => {
    if (formElement === form) {
      const map = new Map<string, FormDataEntryValue>([['essay-file', file]]);
      return {
        get: (key: string) => map.get(key) ?? null,
        append: () => {},
        getAll: () => [],
      };
    }
    return new OriginalFormData(formElement);
  });
  vi.stubGlobal('FormData', MockFormData);

  await act(async () => {
    fireEvent.submit(form);
  });

  await waitFor(() => {
    expect(screen.getByTestId('mock-review-panel')).toBeInTheDocument();
  });

  vi.unstubAllGlobals();
  vi.stubGlobal('fetch', fetchSpy);
}

describe('HomePage', () => {
  it('renders the upload shell', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { name: /ai detect essay review/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/upload essay file/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
  });

  describe('voice-profile state', () => {
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => MOCK_ANALYSIS_RESULT,
      });
      vi.stubGlobal('fetch', fetchSpy);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('voice profile state is not reset when a second document is uploaded', async () => {
      render(<HomePage />);

      await submitFile(makeMockFile('first.docx'), fetchSpy);

      const vpBefore = screen.getByTestId('voice-profile-state').getAttribute('data-value');

      await submitFile(makeMockFile('second.docx'), fetchSpy);

      expect(fetchSpy).toHaveBeenCalledTimes(2);

      const vpAfter = screen.getByTestId('voice-profile-state').getAttribute('data-value');
      expect(vpAfter).toBe(vpBefore);
    });

    it('does not call localStorage or sessionStorage during upload', async () => {
      const localStorageSetSpy = vi.spyOn(window.localStorage, 'setItem');
      const sessionStorageSetSpy = vi.spyOn(window.sessionStorage, 'setItem');

      render(<HomePage />);

      await submitFile(makeMockFile(), fetchSpy);

      expect(localStorageSetSpy).not.toHaveBeenCalled();
      expect(sessionStorageSetSpy).not.toHaveBeenCalled();

      localStorageSetSpy.mockRestore();
      sessionStorageSetSpy.mockRestore();
    });

    it('ReviewPanel receives the current voiceProfile from page state', async () => {
      render(<HomePage />);

      await submitFile(makeMockFile(), fetchSpy);

      const reviewPanel = screen.getByTestId('mock-review-panel');
      expect(reviewPanel).toHaveAttribute('data-voice-profile', '');
    });

    it('reveal-voice-profile-btn is visible and voice-profile-textarea is absent until reveal click', async () => {
      render(<HomePage />);

      await submitFile(makeMockFile(), fetchSpy);

      expect(screen.getByTestId('voice-profile-panel')).toBeInTheDocument();
      expect(screen.getByTestId('reveal-voice-profile-btn')).toBeInTheDocument();
      expect(screen.queryByTestId('voice-profile-textarea')).not.toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByTestId('reveal-voice-profile-btn'));
      });

      expect(screen.getByTestId('voice-profile-textarea')).toBeInTheDocument();
      expect(screen.queryByTestId('reveal-voice-profile-btn')).not.toBeInTheDocument();
    });
  });
});
