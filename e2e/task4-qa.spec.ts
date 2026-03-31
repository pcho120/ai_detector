import { expect, test } from '@playwright/test';
import path from 'path';

const EVIDENCE = path.resolve(
  __dirname,
  '../.sisyphus/evidence'
);

test('Clicking a low-risk or high-risk label opens suggestion details', async ({ page }) => {
  await page.route('**/api/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        score: 0.6,
        text: 'This is a normal sentence. This one is highly risky and AI generated. But this one is a low risk sentence.',
        sentences: [
          { sentence: 'This is a normal sentence.', score: 0.1 },
          { sentence: 'This one is highly risky and AI generated.', score: 0.9 },
          { sentence: 'But this one is a low risk sentence.', score: 0.2 }
        ],
        highlights: [
          { start: 27, end: 69, score: 0.9, label: 'high', sentenceIndex: 1 },
          { start: 70, end: 106, score: 0.2, label: 'low', sentenceIndex: 2 }
        ]
      })
    });
  });

  await page.route('**/api/suggestions', async (route) => {
    const body = await route.request().postDataJSON();
    if (body.sentenceIndex === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          available: true,
          sentenceIndex: 1,
          rewrite: 'This is a revised highly risky sentence.',
          explanation: 'Reduced AI-like tone.'
        })
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          available: true,
          sentenceIndex: 2,
          rewrite: 'This is a revised low risk sentence.',
          explanation: 'Made it even better.'
        })
      });
    }
  });

  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'essay.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('mock content')
  });
  await page.getByTestId('submit-button').click();

  await page.getByTestId('highlight-score').nth(0).click(); // Click high risk
  await expect(page.getByTestId('suggestion-popover')).toBeVisible();
  await expect(page.getByText('This is a revised highly risky sentence.')).toBeVisible();
  
  await page.screenshot({ path: `${EVIDENCE}/task-4-clickable-suggestions.png`, fullPage: true });
});

test('Sentence with no safe suggestion shows empty-state instead of Apply', async ({ page }) => {
  await page.route('**/api/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        score: 0.8,
        text: 'This sentence is risky but has no suggestion.',
        sentences: [
          { sentence: 'This sentence is risky but has no suggestion.', score: 0.8 }
        ],
        highlights: [
          { start: 0, end: 45, score: 0.8, label: 'high', sentenceIndex: 0 }
        ]
      })
    });
  });

  await page.route('**/api/suggestions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available: false,
        sentenceIndex: 0
      })
    });
  });

  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({
    name: 'essay.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('mock content')
  });
  await page.getByTestId('submit-button').click();

  await page.getByTestId('highlight-score').nth(0).click();
  await expect(page.getByTestId('suggestion-popover')).toBeVisible();
  await expect(page.getByTestId('suggestion-empty')).toBeVisible();
  await expect(page.getByTestId('apply-suggestion-btn')).not.toBeVisible();

  await page.screenshot({ path: `${EVIDENCE}/task-4-clickable-suggestions-error.png`, fullPage: true });
});
