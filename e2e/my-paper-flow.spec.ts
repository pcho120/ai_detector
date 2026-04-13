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

const MOCK_EXTRACT_STYLE_RESPONSE = {
  sentences: [
    'The methodology employed here uses diverse techniques.',
    'Data analysis revealed important patterns.',
    'Results strongly suggest a correlation between variables.',
    'This study contributes new insights to the field.',
    'Previous assumptions proved partially inaccurate.',
    'Further research is needed to confirm these findings.',
  ],
  count: 6,
};

// 600+ character sample text for textarea input
const LONG_SAMPLE_TEXT =
  'The rapid advancement of technology in recent decades has fundamentally transformed the way we communicate, work, and interact with one another across the globe. ' +
  'Digital platforms have created unprecedented opportunities for collaboration and knowledge sharing among diverse communities and institutions. ' +
  'However, these developments also raise important questions about privacy, security, and the ethical implications of increasingly sophisticated artificial intelligence systems. ' +
  'Researchers continue to investigate the long-term societal impacts of these technological shifts, seeking to balance innovation with responsible governance and inclusive design principles. ' +
  'This ongoing dialogue between technologists, policymakers, and the public remains essential for shaping a future that benefits all members of society equally.';

test.describe('My Paper Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/api/analyze', async (route) => {
      await route.fulfill({ status: 200, json: BASE_ANALYZE_RESPONSE });
    });
  });

  test('My Paper tab appears after analysis and textarea/file input is visible', async ({ page }) => {
    await page.goto('/');
    await uploadAndAnalyze(page);

    // Tab buttons should be visible in the voice-profile-panel
    const voicePanel = page.getByTestId('voice-profile-panel');
    await expect(voicePanel).toBeVisible();
    await expect(page.getByTestId('tab-my-paper')).toBeVisible();

    // Click My Paper tab
    await page.getByTestId('tab-my-paper').click();

    // Textarea should be visible
    await expect(page.getByTestId('my-paper-textarea')).toBeVisible();

    // File input should be present in the DOM (may be visually styled but is in the DOM)
    const fileInput = page.getByTestId('my-paper-file-input');
    await expect(fileInput).toBeAttached();

    // Extract Style button should be visible but disabled (no text entered yet)
    const extractBtn = page.getByTestId('extract-style-btn');
    await expect(extractBtn).toBeVisible();
    await expect(extractBtn).toBeDisabled();
  });

  test('Paste text → extract style sentences', async ({ page }) => {
    await page.route('**/api/extract-style', async (route) => {
      await route.fulfill({ status: 200, json: MOCK_EXTRACT_STYLE_RESPONSE });
    });

    await page.goto('/');
    await uploadAndAnalyze(page);

    // Switch to My Paper tab
    await page.getByTestId('tab-my-paper').click();

    // Fill textarea with 600+ chars
    await page.getByTestId('my-paper-textarea').fill(LONG_SAMPLE_TEXT);

    // Extract button should now be enabled
    const extractBtn = page.getByTestId('extract-style-btn');
    await expect(extractBtn).toBeEnabled();

    // Click extract
    await extractBtn.click();

    // Success state should appear
    const successDiv = page.getByTestId('my-paper-success');
    await expect(successDiv).toBeVisible();
    await expect(successDiv).toContainText('6');

    // Clear button should be visible
    await expect(page.getByTestId('my-paper-clear-btn')).toBeVisible();

    // active-style-tab-state should reflect "my-paper"
    const tabState = page.getByTestId('active-style-tab-state');
    await expect(tabState).toHaveAttribute('data-value', 'my-paper');
  });

  test('Tab mutual exclusivity — switching clears the other tab data', async ({ page }) => {
    await page.route('/api/voice-profile/generate', async (route) => {
      await route.fulfill({
        status: 200,
        json: { profile: 'Academic tone profile', language: 'en' },
      });
    });

    await page.route('**/api/extract-style', async (route) => {
      await route.fulfill({ status: 200, json: MOCK_EXTRACT_STYLE_RESPONSE });
    });

    await page.goto('/');
    await uploadAndAnalyze(page);

    // Generate a voice profile: select academic preset, then generate
    await page.getByTestId('voice-preset-academic').click();
    await page.getByTestId('generate-voice-profile-btn').click();

    // Wait for voice profile to be populated
    const voiceTextarea = page.getByTestId('voice-profile-textarea');
    await expect(voiceTextarea).toBeVisible();
    await expect(voiceTextarea).toHaveValue('Academic tone profile');

    // Verify voice-profile-state has the profile value
    const vpState = page.getByTestId('voice-profile-state');
    await expect(vpState).toHaveAttribute('data-value', 'Academic tone profile');

    // Switch to My Paper tab — should clear voice profile
    await page.getByTestId('tab-my-paper').click();
    await expect(vpState).toHaveAttribute('data-value', '');

    // Now extract style sentences in My Paper tab
    await page.getByTestId('my-paper-textarea').fill(LONG_SAMPLE_TEXT);
    await page.getByTestId('extract-style-btn').click();
    await expect(page.getByTestId('my-paper-success')).toBeVisible();

    // Switch back to Voice Profile tab — should clear few-shot examples
    await page.getByTestId('tab-voice-profile').click();
    await expect(page.getByTestId('my-paper-success')).not.toBeVisible();
  });

  test('Error handling — extract button disabled for short text', async ({ page }) => {
    await page.goto('/');
    await uploadAndAnalyze(page);

    // Switch to My Paper tab
    await page.getByTestId('tab-my-paper').click();

    const extractBtn = page.getByTestId('extract-style-btn');

    // Initially disabled (textarea empty)
    await expect(extractBtn).toBeDisabled();

    // Fill with short text (100 chars, well below 500 limit)
    await page.getByTestId('my-paper-textarea').fill('A'.repeat(100));
    await expect(extractBtn).toBeDisabled();

    // Fill with exactly 499 chars — still disabled
    await page.getByTestId('my-paper-textarea').fill('B'.repeat(499));
    await expect(extractBtn).toBeDisabled();

    // Fill with 500 chars — should become enabled
    await page.getByTestId('my-paper-textarea').fill('C'.repeat(500));
    await expect(extractBtn).toBeEnabled();
  });
});
