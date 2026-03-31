import { expect, test } from '@playwright/test';
import path from 'path';

const EVIDENCE = path.resolve(
  __dirname,
  '../.sisyphus/evidence'
);

test('F3-1: success path — docx upload shows highlighted review panel', async ({ page }) => {
  await page.route('**/api/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        score: 0.85,
        text: 'This is a test essay. It has some AI generated content.',
        sentences: [
          { sentence: 'This is a test essay.', score: 0.1 },
          { sentence: 'It has some AI generated content.', score: 0.9 }
        ],
        highlights: [{ start: 22, end: 55, score: 0.9, label: 'high', sentenceIndex: 1 }],
        suggestions: [
          {
            sentence: 'It has some AI generated content.',
            rewrite: 'The text contains material produced by an AI.',
            explanation: 'Consider rephrasing this section to reduce AI-like phrasing.'
          }
        ]
      })
    });
  });

  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'essay.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('mock docx content')
  });
  await page.getByTestId('submit-button').click();

  const reviewPanel = page.getByTestId('review-panel');
  await expect(reviewPanel).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('85.0% AI')).toBeVisible();
  await expect(page.getByTestId('highlight-score')).toHaveAttribute('data-ai-score', '0.9');
  
  // Mock the new suggestion endpoint
  await page.route('**/api/suggestions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available: true,
        sentenceIndex: 1,
        rewrite: 'The text contains material produced by an AI.',
        explanation: 'Consider rephrasing this section to reduce AI-like phrasing.'
      })
    });
  });

  // Click the highlight to open suggestion
  await page.getByTestId('highlight-score').click();

  // Verify inline suggestion popover
  const popover = page.getByTestId('suggestion-popover');
  await expect(popover).toBeVisible();
  await expect(page.getByText('The text contains material produced by an AI.')).toBeVisible();
  await expect(page.getByTestId('apply-suggestion-btn')).toBeVisible();


  await page.screenshot({ path: `${EVIDENCE}/f3-manual-qa.png`, fullPage: true });
});

test('F3-2: success path — doc upload shows review panel', async ({ page }) => {
  await page.route('**/api/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        score: 0.1,
        text: 'This is a legacy .doc file with human-written content.',
        sentences: [{ sentence: 'This is a legacy .doc file with human-written content.', score: 0.1 }],
        highlights: [],
        suggestions: []
      })
    });
  });

  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'legacy.doc',
    mimeType: 'application/msword',
    buffer: Buffer.from('mock doc content')
  });
  await page.getByTestId('submit-button').click();

  const reviewPanel = page.getByTestId('review-panel');
  await expect(reviewPanel).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('10.0% AI')).toBeVisible();

  await page.screenshot({ path: `${EVIDENCE}/f3-qa-doc-success.png`, fullPage: true });
});

test('F3-3: failure path — unsupported file shows error, no review panel', async ({ page }) => {
  await page.route('**/api/analyze', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'UNSUPPORTED_FORMAT',
        message: 'Unsupported file format. Please upload .docx or .doc.'
      })
    });
  });

  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'test.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('pdf content')
  });
  await page.getByTestId('submit-button').click();

  const errorMsg = page.getByTestId('error-message');
  await expect(errorMsg).toBeVisible({ timeout: 10000 });
  await expect(errorMsg).toContainText('Unsupported file format');
  await expect(page.getByTestId('review-panel')).not.toBeVisible();

  await expect(page.getByTestId('file-input')).not.toBeDisabled();
  await expect(page.getByTestId('submit-button')).not.toBeDisabled();

  await page.screenshot({ path: `${EVIDENCE}/f3-manual-qa-error.png`, fullPage: true });
});

test('F3-4: failure path — extraction failure shows friendly error', async ({ page }) => {
  await page.route('**/api/analyze', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'EXTRACTION_FAILED',
        message: 'Could not extract text from the document.'
      })
    });
  });

  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'corrupt.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('corrupt content')
  });
  await page.getByTestId('submit-button').click();

  const errorMsg = page.getByTestId('error-message');
  await expect(errorMsg).toBeVisible({ timeout: 10000 });
  await expect(errorMsg).toContainText('Could not extract text');

  await page.screenshot({ path: `${EVIDENCE}/f3-qa-extraction-error.png`, fullPage: true });
});

test('F3-5: failure path — non-English document shows language error', async ({ page }) => {
  await page.route('**/api/analyze', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'UNSUPPORTED_LANGUAGE',
        message: 'Only English-language documents are supported.'
      })
    });
  });

  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'spanish.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('mock content')
  });
  await page.getByTestId('submit-button').click();

  const errorMsg = page.getByTestId('error-message');
  await expect(errorMsg).toBeVisible({ timeout: 10000 });
  await expect(errorMsg).toContainText('English');

  await page.screenshot({ path: `${EVIDENCE}/f3-qa-language-error.png`, fullPage: true });
});
