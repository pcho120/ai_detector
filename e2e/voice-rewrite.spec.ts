import { expect, test } from '@playwright/test';

const MOCK_FILE = {
  name: 'test.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as const,
  buffer: Buffer.from('mock file content'),
};

async function uploadAndAnalyze(page: import('@playwright/test').Page) {
  await page.getByTestId('file-input').setInputFiles(MOCK_FILE);
  await page.getByTestId('submit-button').click();
  await expect(page.getByTestId('review-panel')).toBeVisible();
}

const BASE_ANALYZE_RESPONSE = {
  score: 0.85,
  text: 'This is a test essay. It has some AI generated content.',
  sentences: [
    { sentence: 'This is a test essay.', score: 0.1 },
    { sentence: 'It has some AI generated content.', score: 0.9 },
  ],
  highlights: [{ start: 22, end: 55, score: 0.9, label: 'high', sentenceIndex: 1 }],
  suggestions: [],
};



test.describe('Voice Profile Rewrite Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/api/analyze', async (route) => {
      await route.fulfill({ status: 200, json: BASE_ANALYZE_RESPONSE });
    });
  });

  test('Voice profile panel appears after upload and validates empty inputs', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('voice-profile-panel')).not.toBeVisible();

    await uploadAndAnalyze(page);

    await expect(page.getByTestId('voice-profile-panel')).toBeVisible();

    await expect(page.getByTestId('voice-profile-textarea')).not.toBeVisible();
    await expect(page.getByTestId('reveal-voice-profile-btn')).toBeVisible();

    const generateBtn = page.getByTestId('generate-voice-profile-btn');
    await expect(generateBtn).toBeDisabled();

    const presetBtn = page.getByTestId('voice-preset-academic');
    await presetBtn.click();
    await expect(generateBtn).toBeEnabled();

    await presetBtn.click();
    await expect(generateBtn).toBeDisabled();

    await page.getByTestId('voice-sample-input').fill('Some sample text');
    await expect(generateBtn).toBeEnabled();
  });

  test('Limits preset selection to maximum 2', async ({ page }) => {
    await page.goto('/');

    await uploadAndAnalyze(page);

    await expect(page.getByTestId('voice-profile-panel')).toBeVisible();

    await page.getByTestId('voice-preset-academic').click();
    await page.getByTestId('voice-preset-conversational').click();

    const thirdBtn = page.getByTestId('voice-preset-formal');
    await expect(thirdBtn).toBeDisabled();

    await page.getByTestId('voice-preset-academic').click();
    await expect(thirdBtn).toBeEnabled();
  });

  test('Generate profile flow: presets-only, mixed, edit, and copy', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.route('/api/voice-profile/generate', async (route) => {
      const body = route.request().postDataJSON() as { presets?: string[]; writingSample?: string };
      const profileText =
        body.presets && body.writingSample
          ? 'Generated from mixed input.'
          : 'Generated from presets.';
      await route.fulfill({ status: 200, json: { profile: profileText, language: 'en' } });
    });

    await page.goto('/');
    await uploadAndAnalyze(page);

    await page.getByTestId('voice-preset-formal').click();
    await page.getByTestId('generate-voice-profile-btn').click();

    const textarea = page.getByTestId('voice-profile-textarea');
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue('Generated from presets.');

    await page.getByTestId('voice-sample-input').fill('Sample writing');
    await page.getByTestId('generate-voice-profile-btn').click();
    await expect(textarea).toHaveValue('Generated from mixed input.');

    await textarea.fill('Edited voice profile text.');
    await expect(textarea).toHaveValue('Edited voice profile text.');

    await page.getByTestId('copy-voice-profile-btn').click();
    await expect(page.getByTestId('voice-profile-status')).toBeVisible();
    await expect(page.getByTestId('voice-profile-status')).toHaveText('Copied!');

    const clipboardText = await page.evaluate('navigator.clipboard.readText()');
    expect(clipboardText).toBe('Your voice profile is: Edited voice profile text.');

    await textarea.fill('한국어 목소리 프로필입니다.');
    await page.getByTestId('copy-voice-profile-btn').click();
    const koClipboardText = await page.evaluate('navigator.clipboard.readText()');
    expect(koClipboardText).toBe("당신의 목소리는 '한국어 목소리 프로필입니다.' 입니다.");
  });

  test('Submits generated voice profile along with suggestion request', async ({ page }) => {
    let suggestionRequestBody: Record<string, unknown> = {};

    await page.route('/api/analyze', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          score: 0.85,
          text: 'This is a test essay.',
          sentences: [{ sentence: 'This is a test essay.', score: 0.85 }],
          highlights: [{ start: 0, end: 21, score: 0.85, label: 'high', sentenceIndex: 0 }],
          suggestions: [],
        },
      });
    });

    await page.route('/api/voice-profile/generate', async (route) => {
      await route.fulfill({
        status: 200,
        json: { profile: 'Test voice profile.', language: 'en' },
      });
    });

    await page.route('**/api/suggestions', async (route) => {
      suggestionRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          available: true,
          sentenceIndex: 0,
          rewrite: 'A rewritten version.',
          explanation: 'Better.',
        }),
      });
    });

    await page.goto('/');
    await uploadAndAnalyze(page);

    await page.getByTestId('voice-preset-formal').click();
    await page.getByTestId('generate-voice-profile-btn').click();

    const textarea = page.getByTestId('voice-profile-textarea');
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue('Test voice profile.');

    await page.getByTestId('highlight-score').first().click();
    await expect(page.getByTestId('suggestion-popover')).toBeVisible();
    await expect(page.getByTestId('suggestion-success')).toBeVisible();

    expect(suggestionRequestBody.voiceProfile).toBe('Test voice profile.');
  });

  test('Profile-aware suggestions: voiceProfile in request yields 3 alternatives', async ({ page }) => {
    let capturedRequestBody: Record<string, unknown> = {};

    await page.route('/api/analyze', async (route) => {
      await route.fulfill({ status: 200, json: BASE_ANALYZE_RESPONSE });
    });

    await page.route('/api/voice-profile/generate', async (route) => {
      await route.fulfill({
        status: 200,
        json: { profile: 'Voice profile for 3-alt test.', language: 'en' },
      });
    });

    await page.route('**/api/suggestions', async (route) => {
      capturedRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          available: true,
          sentenceIndex: 1,
          alternatives: [
            { rewrite: 'Alt 0 rewrite.', explanation: 'Explanation 0.' },
            { rewrite: 'Alt 1 rewrite.', explanation: 'Explanation 1.' },
            { rewrite: 'Alt 2 rewrite.', explanation: 'Explanation 2.' },
          ],
        }),
      });
    });

    await page.goto('/');
    await uploadAndAnalyze(page);

    await page.getByTestId('voice-preset-formal').click();
    await page.getByTestId('generate-voice-profile-btn').click();
    await expect(page.getByTestId('voice-profile-textarea')).toHaveValue('Voice profile for 3-alt test.');

    await page.getByTestId('highlight-score').first().click();
    await expect(page.getByTestId('suggestion-popover')).toBeVisible();
    await expect(page.getByTestId('suggestion-success')).toBeVisible();

    expect(capturedRequestBody.voiceProfile).toBe('Voice profile for 3-alt test.');

    await expect(page.getByTestId('suggestion-alternative-0')).toBeVisible();
    await expect(page.getByTestId('suggestion-alternative-1')).toBeVisible();
    await expect(page.getByTestId('suggestion-alternative-2')).toBeVisible();

    await expect(page.getByText('Alt 0 rewrite.')).toBeVisible();
    await expect(page.getByText('Alt 1 rewrite.')).toBeVisible();
    await expect(page.getByText('Alt 2 rewrite.')).toBeVisible();

    await expect(page.getByTestId('apply-suggestion-btn-0')).toBeVisible();
    await expect(page.getByTestId('apply-suggestion-btn-1')).toBeVisible();
    await expect(page.getByTestId('apply-suggestion-btn-2')).toBeVisible();
  });

  test('No-profile fallback: alternatives rendered without voiceProfile in request', async ({ page }) => {
    let capturedRequestBody: Record<string, unknown> = {};

    await page.route('/api/analyze', async (route) => {
      await route.fulfill({ status: 200, json: BASE_ANALYZE_RESPONSE });
    });

    await page.route('**/api/suggestions', async (route) => {
      capturedRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          available: true,
          sentenceIndex: 1,
          alternatives: [
            { rewrite: 'Fallback alt 0.', explanation: 'Explanation A.' },
            { rewrite: 'Fallback alt 1.', explanation: 'Explanation B.' },
            { rewrite: 'Fallback alt 2.', explanation: 'Explanation C.' },
          ],
        }),
      });
    });

    await page.goto('/');
    await uploadAndAnalyze(page);

    await page.getByTestId('highlight-score').first().click();
    await expect(page.getByTestId('suggestion-popover')).toBeVisible();
    await expect(page.getByTestId('suggestion-success')).toBeVisible();

    expect(capturedRequestBody.voiceProfile == null || capturedRequestBody.voiceProfile === '').toBe(true);

    await expect(page.getByTestId('suggestion-alternative-0')).toBeVisible();
    await expect(page.getByTestId('suggestion-alternative-1')).toBeVisible();
    await expect(page.getByTestId('suggestion-alternative-2')).toBeVisible();

    await expect(page.getByText('Fallback alt 0.')).toBeVisible();
    await expect(page.getByText('Fallback alt 1.')).toBeVisible();
    await expect(page.getByText('Fallback alt 2.')).toBeVisible();
  });

  test('Apply index 1 uses alt[1].rewrite in revised API call, not alt[0]', async ({ page }) => {
    let revisedPayload = '';

    await page.route('/api/analyze', async (route) => {
      await route.fulfill({ status: 200, json: BASE_ANALYZE_RESPONSE });
    });

    await page.route('**/api/suggestions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          available: true,
          sentenceIndex: 1,
          alternatives: [
            { rewrite: 'Index zero rewrite — should NOT be applied.', explanation: 'Alt 0.' },
            { rewrite: 'Index one rewrite — should be applied.', explanation: 'Alt 1.' },
            { rewrite: 'Index two rewrite.', explanation: 'Alt 2.' },
          ],
        }),
      });
    });

    await page.route('**/api/analyze/revised', async (route) => {
      const body = route.request().postDataJSON() as { text: string };
      revisedPayload = body.text;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          score: 0.3,
          text: body.text,
          sentences: [
            { sentence: 'This is a test essay.', score: 0.1 },
            { sentence: 'Index one rewrite — should be applied.', score: 0.3 },
          ],
          highlights: [{ start: 22, end: 62, score: 0.3, label: 'low', sentenceIndex: 1 }],
          suggestions: [],
        }),
      });
    });

    await page.goto('/');
    await uploadAndAnalyze(page);

    await page.getByTestId('highlight-score').first().click();
    await expect(page.getByTestId('suggestion-popover')).toBeVisible();
    await expect(page.getByTestId('suggestion-alternative-0')).toBeVisible();
    await expect(page.getByTestId('suggestion-alternative-1')).toBeVisible();

    await page.getByTestId('apply-suggestion-btn-1').click();

    await expect(page.getByTestId('revised-panel-section')).toBeVisible();
    await expect(page.getByTestId('revised-review-panel')).toBeVisible();

    expect(revisedPayload).toContain('Index one rewrite — should be applied.');
    expect(revisedPayload).not.toContain('Index zero rewrite — should NOT be applied.');

    await expect(page.getByTestId('revised-overall-score')).toContainText('30.0% AI');
    const revisedHighlight = page.getByTestId('revised-highlight-score');
    await expect(revisedHighlight).toBeVisible();
    await expect(revisedHighlight).toContainText('Low Risk');
  });

  test('Pasted profile reuse: copied profile text pasted directly into profile textarea restores reuse in suggestion', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.route('/api/analyze', async (route) => {
      await route.fulfill({ status: 200, json: BASE_ANALYZE_RESPONSE });
    });

    await page.route('/api/voice-profile/generate', async (route) => {
      await route.fulfill({ status: 200, json: { profile: 'Profile from session A.', language: 'en' } });
    });

    await page.goto('/');
    await uploadAndAnalyze(page);

    await page.getByTestId('voice-preset-academic').click();
    await page.getByTestId('generate-voice-profile-btn').click();
    await expect(page.getByTestId('voice-profile-textarea')).toHaveValue('Profile from session A.');

    await page.getByTestId('copy-voice-profile-btn').click();
    await expect(page.getByTestId('voice-profile-status')).toHaveText('Copied!');

    const copied = (await page.evaluate('navigator.clipboard.readText()')) as string;
    expect(copied).toBe('Your voice profile is: Profile from session A.');

    let sessionBRequestBody: Record<string, unknown> = {};

    await page.route('**/api/suggestions', async (route) => {
      sessionBRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          available: true,
          sentenceIndex: 1,
          alternatives: [
            { rewrite: 'Session B alt 0.', explanation: 'Session B explanation.' },
            { rewrite: 'Session B alt 1.', explanation: 'Session B explanation 1.' },
          ],
        }),
      });
    });

    await page.goto('/');
    await uploadAndAnalyze(page);

    await page.getByTestId('reveal-voice-profile-btn').click();

    const profileTextarea = page.getByTestId('voice-profile-textarea');
    await expect(profileTextarea).toBeVisible();
    await profileTextarea.fill(copied);
    await expect(profileTextarea).toHaveValue(copied);

    await page.getByTestId('highlight-score').first().click();
    await expect(page.getByTestId('suggestion-popover')).toBeVisible();
    await expect(page.getByTestId('suggestion-success')).toBeVisible();

    expect(sessionBRequestBody.voiceProfile).toBe(copied);

    await expect(page.getByTestId('suggestion-alternative-0')).toBeVisible();
    await expect(page.getByTestId('suggestion-alternative-1')).toBeVisible();
  });
});

