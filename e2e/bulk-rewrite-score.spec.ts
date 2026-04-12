import path from 'path';
import { expect, test } from '@playwright/test';

const SAPLING_API_KEY = process.env.SAPLING_API_KEY ?? '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';

test.describe('Bulk Rewrite Score Reduction (real API)', () => {
  test.skip(
    !SAPLING_API_KEY || !OPENAI_API_KEY,
    'Skipped: SAPLING_API_KEY and OPENAI_API_KEY env vars are required',
  );

  test('bulk rewrite reduces AI score to ≤70%', async ({ page }) => {
    test.setTimeout(180_000);

    // Inject API keys into localStorage before page loads
    await page.addInitScript(
      (settings) => {
        localStorage.setItem('ai_detector_settings', JSON.stringify(settings));
      },
      {
        llmProvider: 'openai',
        llmApiKey: OPENAI_API_KEY,
        detectionProvider: 'sapling',
        detectionApiKey: SAPLING_API_KEY,
        copyleaksEmail: '',
        copyleaksApiKey: '',
      },
    );

    await page.goto('/');

    // Upload the AI-generated essay fixture
    const fixturePath = path.join(__dirname, 'fixtures', 'ai-generated-essay.docx');
    await page.getByTestId('file-input').setInputFiles(fixturePath);
    await page.getByTestId('submit-button').click();

    // Wait for analysis to complete and review panel to appear
    const reviewPanel = page.getByTestId('review-panel');
    await expect(reviewPanel).toBeVisible({ timeout: 30_000 });

    // Verify initial score is displayed (any score value means analysis succeeded)
    const scoreDisplay = page.locator('[data-testid="review-panel"]').getByText(/% AI/);
    await expect(scoreDisplay).toBeVisible({ timeout: 10_000 });

    // Set target score to 70
    await page.getByTestId('target-score-input').fill('70');

    // Click bulk rewrite
    await page.getByTestId('bulk-rewrite-btn').click();

    // Wait for bulk rewrite result message (SSE streaming, may take a while)
    const resultMessage = page.getByTestId('bulk-result-message');
    await expect(resultMessage).toBeVisible({ timeout: 150_000 });

    // Parse achieved score from result text
    const resultText = await resultMessage.innerText();
    const match = resultText.match(/(\d+)%/);
    const achievedScore = match ? parseInt(match[1], 10) : 999;

    expect(
      achievedScore,
      `Expected score ≤70%, got ${achievedScore}%. Full message: ${resultText}`,
    ).toBeLessThanOrEqual(70);
  });
});
