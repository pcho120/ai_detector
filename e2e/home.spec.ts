import { expect, test } from '@playwright/test';

test('home page renders upload shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /ai detect essay review/i })).toBeVisible();
  await expect(page.getByLabel(/upload essay file/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /submit/i })).toBeVisible();
});

test('handles successful file upload and displays review panel', async ({ page }) => {
  await page.route('/api/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        score: 0.85,
        text: 'This is a test essay. It has some AI generated content.',
        sentences: [
          { sentence: 'This is a test essay.', score: 0.1 },
          { sentence: 'It has some AI generated content.', score: 0.9 }
        ],
        highlights: [
          { start: 22, end: 55, score: 0.9, label: 'high', sentenceIndex: 1 }
        ],
        suggestions: [
          {
            sentence: 'It has some AI generated content.',
            rewrite: 'The text contains material produced by an AI.',
            explanation: 'Consider rephrasing.'
          }
        ]
      }
    });
  });

  await page.goto('/');

  const fileInput = page.getByTestId('file-input');
  await fileInput.setInputFiles({
    name: 'test.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('mock file content')
  });

  await page.getByTestId('submit-button').click();

  const reviewPanel = page.getByTestId('review-panel');
  await expect(reviewPanel).toBeVisible();

  await expect(page.getByText('85.0% AI')).toBeVisible();
  
  const highlight = page.getByTestId('highlight-score');
  await expect(highlight).toBeVisible();
  await expect(highlight).toHaveAttribute('data-ai-score', '0.9');
  await expect(highlight).toContainText('High Risk');
  
  
  // Mock the new suggestion endpoint
  await page.route('**/api/suggestions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available: true,
        sentenceIndex: 1,
        alternatives: [
          { rewrite: 'The text contains material produced by an AI.', explanation: 'Consider rephrasing this section to reduce AI-like phrasing.' },
          { rewrite: 'This document includes AI-generated content.', explanation: 'More direct phrasing.' },
          { rewrite: 'Artificial intelligence was used to write this.', explanation: 'Active voice.' }
        ]
      })
    });
  });

  const highlightToClick = page.getByTestId('highlight-score').first();
  await highlightToClick.click();

  const popover = page.getByTestId('suggestion-popover');
  await expect(popover).toBeVisible();

  await expect(highlightToClick.locator('[data-testid="suggestion-popover"]')).toHaveCount(0);

  await highlightToClick.hover();
  await popover.hover();
  await expect(popover).toBeVisible();

  await expect(page.getByTestId('suggestion-success')).toBeVisible();
  await expect(page.getByTestId('suggestion-empty')).not.toBeVisible();
  
  await expect(page.getByTestId('suggestion-alternative-0')).toBeVisible();
  await expect(page.getByTestId('suggestion-alternative-1')).toBeVisible();
  await expect(page.getByTestId('suggestion-alternative-2')).toBeVisible();
  
  await expect(page.getByText('The text contains material produced by an AI.')).toBeVisible();
  await expect(page.getByText('Consider rephrasing this section to reduce AI-like phrasing.')).toBeVisible();
  await expect(page.getByTestId('apply-suggestion-btn-0')).toBeVisible();
  await expect(page.getByTestId('apply-suggestion-btn-1')).toBeVisible();
  await expect(page.getByTestId('apply-suggestion-btn-2')).toBeVisible();

});

test('available:true low-risk click renders suggestion-success without empty state', async ({ page }) => {
  await page.route('/api/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        score: 0.3,
        text: 'Normal opening. This sentence is slightly suspicious.',
        sentences: [
          { sentence: 'Normal opening.', score: 0.05 },
          { sentence: 'This sentence is slightly suspicious.', score: 0.25 }
        ],
        highlights: [
          { start: 16, end: 53, score: 0.25, label: 'low', sentenceIndex: 1 }
        ],
        suggestions: []
      }
    });
  });

  await page.route('**/api/suggestions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available: true,
        sentenceIndex: 1,
        rewrite: 'This sentence reads more naturally now.',
        explanation: 'Lower AI-like tone.'
      })
    });
  });

  await page.goto('/');

  const fileInput = page.getByTestId('file-input');
  await fileInput.setInputFiles({
    name: 'test.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('mock file content')
  });

  await page.getByTestId('submit-button').click();

  const highlight = page.getByTestId('highlight-score');
  await expect(highlight).toBeVisible();
  await expect(highlight).toContainText('Low Risk');

  await highlight.click();

  await expect(page.getByTestId('suggestion-popover')).toBeVisible();
  await expect(page.getByTestId('suggestion-success')).toBeVisible();
  await expect(page.getByTestId('suggestion-empty')).not.toBeVisible();
  await expect(page.getByText('This sentence reads more naturally now.')).toBeVisible();
  await expect(page.getByText('Lower AI-like tone.')).toBeVisible();
  await expect(page.getByTestId('apply-suggestion-btn-0')).toBeVisible();
});

test('handles successful .doc file upload', async ({ page }) => {
  await page.route('/api/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        score: 0.1,
        text: 'This is a legacy .doc file content.',
        sentences: [{ sentence: 'This is a legacy .doc file content.', score: 0.1 }],
        highlights: [],
        suggestions: []
      }
    });
  });

  await page.goto('/');

  const fileInput = page.getByTestId('file-input');
  await fileInput.setInputFiles({
    name: 'legacy.doc',
    mimeType: 'application/msword',
    buffer: Buffer.from('mock .doc content')
  });

  await page.getByTestId('submit-button').click();

  const reviewPanel = page.getByTestId('review-panel');
  await expect(reviewPanel).toBeVisible();
  await expect(page.getByText('This is a legacy .doc file content.')).toBeVisible();
});

test('handles extraction failure gracefully', async ({ page }) => {
  await page.route('/api/analyze', async (route) => {
    await route.fulfill({
      status: 422,
      json: {
        error: 'EXTRACTION_FAILED',
        message: 'Could not extract text from the document.'
      }
    });
  });

  await page.goto('/');

  const fileInput = page.getByTestId('file-input');
  await fileInput.setInputFiles({
    name: 'corrupt.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('corrupt content')
  });

  await page.getByTestId('submit-button').click();

  const errorMsg = page.getByTestId('error-message');
  await expect(errorMsg).toBeVisible();
  await expect(errorMsg).toContainText('Could not extract text from the document');
});

test('handles unsupported file type gracefully', async ({ page }) => {
  await page.route('/api/analyze', async (route) => {
    await route.fulfill({
      status: 422,
      json: {
        error: 'UNSUPPORTED_FORMAT',
        message: 'Unsupported file format. Please upload .docx or .doc.'
      }
    });
  });

  await page.goto('/');

  const fileInput = page.getByTestId('file-input');
  await fileInput.setInputFiles({
    name: 'test.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('pdf content')
  });

  await page.getByTestId('submit-button').click();

  const errorMsg = page.getByTestId('error-message');
  await expect(errorMsg).toBeVisible();
  await expect(errorMsg).toContainText('Unsupported file format');
});

test('handles API errors gracefully', async ({ page }) => {
  await page.route('/api/analyze', async (route) => {
    await route.fulfill({
      status: 422,
      json: {
        error: 'UNSUPPORTED_LANGUAGE',
        message: 'Only English-language documents are supported.'
      }
    });
  });

  await page.goto('/');

  const fileInput = page.getByTestId('file-input');
  await fileInput.setInputFiles({
    name: 'spanish.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('mock file content')
  });

  await page.getByTestId('submit-button').click();

  const errorMsg = page.getByTestId('error-message');
  await expect(errorMsg).toBeVisible();
  await expect(errorMsg).toContainText('Only English-language documents are supported');
});

test('handles clicking highlight with no suggestion available', async ({ page }) => {
  await page.route('/api/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        score: 0.85,
        text: 'This is a test essay. It has some AI generated content.',
        sentences: [
          { sentence: 'This is a test essay.', score: 0.1 },
          { sentence: 'It has some AI generated content.', score: 0.9 }
        ],
        highlights: [
          { start: 22, end: 55, score: 0.9, label: 'high', sentenceIndex: 1 }
        ]
      }
    });
  });

  await page.route('**/api/suggestions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available: false,
        sentenceIndex: 1
      })
    });
  });

  await page.goto('/');

  const fileInput = page.getByTestId('file-input');
  await fileInput.setInputFiles({
    name: 'test.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('mock file content')
  });

  await page.getByTestId('submit-button').click();

  await page.getByTestId('highlight-score').click();

  const popover = page.getByTestId('suggestion-popover');
  await expect(popover).toBeVisible();
  await expect(page.getByTestId('suggestion-empty')).toBeVisible();
  await expect(page.getByText("We couldn't generate a rewrite suggestion for this sentence at this time.")).toBeVisible();
  await expect(page.getByTestId('apply-suggestion-btn-0')).not.toBeVisible();
});

test('Apply creates rescored revised panel on the right', async ({ page }) => {
  await page.route('/api/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        score: 0.85,
        text: 'This is a test essay. It has some AI generated content.',
        sentences: [
          { sentence: 'This is a test essay.', score: 0.1 },
          { sentence: 'It has some AI generated content.', score: 0.9 }
        ],
        highlights: [
          { start: 22, end: 55, score: 0.9, label: 'high', sentenceIndex: 1 }
        ],
        suggestions: []
      }
    });
  });

  await page.route('**/api/suggestions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available: true,
        sentenceIndex: 1,
        rewrite: 'The document includes material generated by artificial intelligence.',
        explanation: 'More natural phrasing.'
      })
    });
  });

  await page.route('**/api/analyze/revised', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        score: 0.25,
        text: 'This is a test essay. The document includes material generated by artificial intelligence.',
        sentences: [
          { sentence: 'This is a test essay.', score: 0.1 },
          { sentence: 'The document includes material generated by artificial intelligence.', score: 0.3 }
        ],
        highlights: [
          { start: 22, end: 90, score: 0.3, label: 'low', sentenceIndex: 1 }
        ],
        suggestions: []
      })
    });
  });

  await page.goto('/');

  const fileInput = page.getByTestId('file-input');
  await fileInput.setInputFiles({
    name: 'test.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('mock file content')
  });
  await page.getByTestId('submit-button').click();

  await expect(page.getByTestId('review-panel')).toBeVisible();
  await expect(page.getByTestId('revised-panel-section')).not.toBeVisible();

  await page.getByTestId('highlight-score').click();
  await expect(page.getByTestId('suggestion-popover')).toBeVisible();
  await page.getByTestId('apply-suggestion-btn-0').click();

  await expect(page.getByTestId('revised-panel-section')).toBeVisible();
  await expect(page.getByTestId('revised-review-panel')).toBeVisible();

  await expect(page.getByTestId('revised-overall-score')).toContainText('25.0% AI');

  const revisedHighlight = page.getByTestId('revised-highlight-score');
  await expect(revisedHighlight).toBeVisible();
  await expect(revisedHighlight).toContainText('Low Risk');

  await expect(page.getByTestId('review-panel')).toBeVisible();
  await expect(page.getByText('85.0% AI')).toBeVisible();
});

test('multiple applies accumulate — both sentences replaced in revised panel', async ({ page }) => {
  await page.route('/api/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        score: 0.8,
        text: 'First AI sentence. Second AI sentence. Third normal sentence.',
        sentences: [
          { sentence: 'First AI sentence.', score: 0.85 },
          { sentence: 'Second AI sentence.', score: 0.9 },
          { sentence: 'Third normal sentence.', score: 0.1 },
        ],
        highlights: [
          { start: 0, end: 18, score: 0.85, label: 'high', sentenceIndex: 0 },
          { start: 19, end: 37, score: 0.9, label: 'high', sentenceIndex: 1 },
        ],
        suggestions: [],
      },
    });
  });

  await page.route('**/api/suggestions', async (route) => {
    const body = route.request().postDataJSON() as { sentenceIndex: number };
    if (body.sentenceIndex === 0) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          available: true,
          sentenceIndex: 0,
          rewrite: 'Rewritten first sentence.',
          explanation: 'Less AI-like.',
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          available: true,
          sentenceIndex: 1,
          rewrite: 'Rewritten second sentence.',
          explanation: 'Less AI-like.',
        }),
      });
    }
  });

  const revisedCallBodies: string[] = [];
  await page.route('**/api/analyze/revised', async (route) => {
    const body = route.request().postDataJSON() as { text: string };
    revisedCallBodies.push(body.text);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        score: 0.2,
        text: body.text,
        sentences: [
          { sentence: 'Rewritten first sentence.', score: 0.15 },
          { sentence: 'Rewritten second sentence.', score: 0.2 },
          { sentence: 'Third normal sentence.', score: 0.1 },
        ],
        highlights: [],
        suggestions: [],
      }),
    });
  });

  await page.goto('/');

  const fileInput = page.getByTestId('file-input');
  await fileInput.setInputFiles({
    name: 'test.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('mock file content'),
  });
  await page.getByTestId('submit-button').click();

  await expect(page.getByTestId('review-panel')).toBeVisible();

  const highlights = page.getByTestId('highlight-score');
  await highlights.first().click();
  await expect(page.getByTestId('suggestion-popover')).toBeVisible();
  await page.getByTestId('apply-suggestion-btn-0').click();

  await expect(page.getByTestId('revised-panel-section')).toBeVisible();

  expect(revisedCallBodies[0]).toContain('Rewritten first sentence.');
  expect(revisedCallBodies[0]).toContain('Second AI sentence.');

  await highlights.nth(1).click();
  await expect(page.getByTestId('suggestion-popover')).toBeVisible();
  await page.getByTestId('apply-suggestion-btn-0').click();

  await expect(page.getByTestId('revised-panel-section')).toBeVisible();

  expect(revisedCallBodies.length).toBeGreaterThanOrEqual(2);
  const lastPayload = revisedCallBodies[revisedCallBodies.length - 1];
  expect(lastPayload).toContain('Rewritten first sentence.');
  expect(lastPayload).toContain('Rewritten second sentence.');
  expect(lastPayload).toContain('Third normal sentence.');
});

test('duplicate sentence text — apply only updates clicked occurrence by sentenceIndex', async ({ page }) => {
  await page.route('/api/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        score: 0.7,
        text: 'Same phrase here. Same phrase here. Different ending.',
        sentences: [
          { sentence: 'Same phrase here.', score: 0.2 },
          { sentence: 'Same phrase here.', score: 0.85 },
          { sentence: 'Different ending.', score: 0.1 },
        ],
        highlights: [
          { start: 18, end: 34, score: 0.85, label: 'high', sentenceIndex: 1 },
        ],
        suggestions: [],
      },
    });
  });

  await page.route('**/api/suggestions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available: true,
        sentenceIndex: 1,
        rewrite: 'Unique rewrite for index one.',
        explanation: 'Only the second occurrence.',
      }),
    });
  });

  let revisedPayload = '';
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
          { sentence: 'Same phrase here.', score: 0.2 },
          { sentence: 'Unique rewrite for index one.', score: 0.25 },
          { sentence: 'Different ending.', score: 0.1 },
        ],
        highlights: [],
        suggestions: [],
      }),
    });
  });

  await page.goto('/');

  const fileInput = page.getByTestId('file-input');
  await fileInput.setInputFiles({
    name: 'test.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('mock file content'),
  });
  await page.getByTestId('submit-button').click();

  await expect(page.getByTestId('review-panel')).toBeVisible();

  await page.getByTestId('highlight-score').click();
  await expect(page.getByTestId('suggestion-popover')).toBeVisible();
  await page.getByTestId('apply-suggestion-btn-0').click();

  await expect(page.getByTestId('revised-panel-section')).toBeVisible();

  expect(revisedPayload).toContain('Same phrase here.');
  expect(revisedPayload).toContain('Unique rewrite for index one.');
  expect(revisedPayload).not.toBe(
    'Unique rewrite for index one. Unique rewrite for index one. Different ending.'
  );
});

test('revised-analysis failure shows error state without breaking original panel', async ({ page }) => {
  await page.route('/api/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        score: 0.85,
        text: 'This is a test essay. It has some AI generated content.',
        sentences: [
          { sentence: 'This is a test essay.', score: 0.1 },
          { sentence: 'It has some AI generated content.', score: 0.9 }
        ],
        highlights: [
          { start: 22, end: 55, score: 0.9, label: 'high', sentenceIndex: 1 }
        ],
        suggestions: []
      }
    });
  });

  await page.route('**/api/suggestions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available: true,
        sentenceIndex: 1,
        rewrite: 'A rewritten version of the sentence.',
        explanation: 'Better phrasing.'
      })
    });
  });

  await page.route('**/api/analyze/revised', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'DETECTION_FAILED',
        message: 'Detection service is not configured.'
      })
    });
  });

  await page.goto('/');

  const fileInput = page.getByTestId('file-input');
  await fileInput.setInputFiles({
    name: 'test.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('mock file content')
  });
  await page.getByTestId('submit-button').click();

  await expect(page.getByTestId('review-panel')).toBeVisible();

  await page.getByTestId('highlight-score').click();
  await expect(page.getByTestId('suggestion-popover')).toBeVisible();
  await page.getByTestId('apply-suggestion-btn-0').click();

  await expect(page.getByTestId('revised-panel-section')).toBeVisible();
  await expect(page.getByTestId('revised-error')).toBeVisible();

  await expect(page.getByTestId('review-panel')).toBeVisible();
  await expect(page.getByText('85.0% AI')).toBeVisible();
});


test('click-to-revert removes applied edit, rescores, and collapses panel when empty', async ({ page }) => {
  await page.route('/api/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        score: 0.85,
        text: 'This is a test essay. It has some AI generated content.',
        sentences: [
          { sentence: 'This is a test essay.', score: 0.1 },
          { sentence: 'It has some AI generated content.', score: 0.9 }
        ],
        highlights: [
          { start: 22, end: 55, score: 0.9, label: 'high', sentenceIndex: 1 }
        ],
        suggestions: []
      }
    });
  });

  await page.route('**/api/suggestions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available: true,
        sentenceIndex: 1,
        rewrite: 'The document includes material generated by artificial intelligence.',
        explanation: 'More natural phrasing.'
      })
    });
  });

  const revisedCallBodies: string[] = [];
  await page.route('**/api/analyze/revised', async (route) => {
    const body = route.request().postDataJSON() as { text: string };
    revisedCallBodies.push(body.text);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        score: 0.25,
        text: body.text,
        sentences: [
          { sentence: 'This is a test essay.', score: 0.1 },
          { sentence: 'The document includes material generated by artificial intelligence.', score: 0.3 }
        ],
        highlights: [
          { start: 22, end: 90, score: 0.3, label: 'low', sentenceIndex: 1 }
        ],
        suggestions: []
      })
    });
  });

  await page.goto('/');

  const fileInput = page.getByTestId('file-input');
  await fileInput.setInputFiles({
    name: 'test.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('mock file content')
  });
  await page.getByTestId('submit-button').click();

  // Apply the suggestion
  await page.getByTestId('highlight-score').click();
  await page.getByTestId('apply-suggestion-btn-0').click();

  // Revised panel appears
  await expect(page.getByTestId('revised-panel-section')).toBeVisible();
  expect(revisedCallBodies.length).toBe(1);

  // Hover over the rewritten sentence to check revert affordance
  const revisedHighlight = page.getByTestId('revised-highlight-score');
  const revertAffordance = revisedHighlight.locator('span[title="Click to revert"]');
  
  // Initially hidden via opacity/visibility classes
  await expect(revertAffordance).toHaveCSS('opacity', '0');
  await expect(revertAffordance).toHaveCSS('visibility', 'hidden');
  
  // Hover makes it visible
  await revisedHighlight.hover();
  await expect(revertAffordance).toHaveCSS('opacity', '1');
  await expect(revertAffordance).toHaveCSS('visibility', 'visible');

  // Click the rewritten sentence to revert
  await revisedHighlight.click();

  // Panel should collapse because there are no more applied edits
  await expect(page.getByTestId('revised-panel-section')).not.toBeVisible();
  
  // Rescore API should not be called since there are no more applied edits (it just clears the state)
  expect(revisedCallBodies.length).toBe(1);
});

test('click-to-revert rescores when other applied edits remain', async ({ page }) => {  await page.route('/api/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        score: 0.8,
        text: 'First AI sentence. Second AI sentence. Third normal sentence.',
        sentences: [
          { sentence: 'First AI sentence.', score: 0.85 },
          { sentence: 'Second AI sentence.', score: 0.9 },
          { sentence: 'Third normal sentence.', score: 0.1 },
        ],
        highlights: [
          { start: 0, end: 18, score: 0.85, label: 'high', sentenceIndex: 0 },
          { start: 19, end: 37, score: 0.9, label: 'high', sentenceIndex: 1 },
        ],
        suggestions: [],
      },
    });
  });

  await page.route('**/api/suggestions', async (route) => {
    const body = route.request().postDataJSON() as { sentenceIndex: number };
    if (body.sentenceIndex === 0) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          available: true,
          sentenceIndex: 0,
          rewrite: 'Rewritten first sentence.',
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          available: true,
          sentenceIndex: 1,
          rewrite: 'Rewritten second sentence.',
        }),
      });
    }
  });

  const revisedCallBodies: string[] = [];
  await page.route('**/api/analyze/revised', async (route) => {
    const body = route.request().postDataJSON() as { text: string };
    revisedCallBodies.push(body.text);
    
    // We mock the highlights so that the rewritten sentences are returned as low risk (so they are rendered and clickable)
    const highlights = [];
    if (body.text.includes('Rewritten first sentence.')) {
      highlights.push({ start: 0, end: 25, score: 0.15, label: 'low', sentenceIndex: 0 });
    }
    if (body.text.includes('Rewritten second sentence.')) {
      highlights.push({ start: 26, end: 52, score: 0.2, label: 'low', sentenceIndex: 1 });
    }
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        score: 0.2,
        text: body.text,
        sentences: [
          { sentence: body.text.includes('Rewritten first sentence.') ? 'Rewritten first sentence.' : 'First AI sentence.', score: 0.15 },
          { sentence: body.text.includes('Rewritten second sentence.') ? 'Rewritten second sentence.' : 'Second AI sentence.', score: 0.2 },
          { sentence: 'Third normal sentence.', score: 0.1 },
        ],
        highlights,
        suggestions: [],
      }),
    });
  });

  await page.goto('/');

  const fileInput = page.getByTestId('file-input');
  await fileInput.setInputFiles({
    name: 'test.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('mock file content'),
  });
  await page.getByTestId('submit-button').click();

  const highlights = page.getByTestId('highlight-score');
  
  // Apply first
  await highlights.first().click();
  await page.getByTestId('apply-suggestion-btn-0').click();

  // Apply second
  await highlights.nth(1).click();
  await page.getByTestId('apply-suggestion-btn-0').click();

  expect(revisedCallBodies.length).toBe(2);
  expect(revisedCallBodies[1]).toContain('Rewritten first sentence.');
  expect(revisedCallBodies[1]).toContain('Rewritten second sentence.');

  const revisedHighlights = page.getByTestId('revised-highlight-score');
  await revisedHighlights.first().click();

  await expect(page.getByTestId('revised-panel-section')).toBeVisible();
  
  expect(revisedCallBodies.length).toBe(3);
  expect(revisedCallBodies[2]).toContain('First AI sentence.');
  expect(revisedCallBodies[2]).toContain('Rewritten second sentence.');
});

test('unavailable refetch gate — second click on unavailable sentence triggers new API request', async ({ page }) => {
  await page.route('/api/analyze', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        score: 0.85,
        text: 'This sentence has no suggestion available.',
        sentences: [
          { sentence: 'This sentence has no suggestion available.', score: 0.85 }
        ],
        highlights: [
          { start: 0, end: 41, score: 0.85, label: 'high', sentenceIndex: 0 }
        ],
        suggestions: []
      }
    });
  });

  let suggestionCallCount = 0;
  await page.route('**/api/suggestions', async (route) => {
    suggestionCallCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: false, sentenceIndex: 0 })
    });
  });

  await page.goto('/');
  const fileInput = page.getByTestId('file-input');
  await fileInput.setInputFiles({
    name: 'test.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('mock file content')
  });
  await page.getByTestId('submit-button').click();

  const highlight = page.getByTestId('highlight-score');
  await expect(highlight).toBeVisible();

  await highlight.click();
  await expect(page.getByTestId('suggestion-popover')).toBeVisible();
  await expect(page.getByTestId('suggestion-empty')).toBeVisible();
  expect(suggestionCallCount).toBe(1);

  const closeBtn = page.getByRole('button', { name: /close suggestion/i });
  await closeBtn.click();

  await highlight.click();
  await expect(page.getByTestId('suggestion-popover')).toBeVisible();
  await expect(page.getByTestId('suggestion-empty')).toBeVisible();
  expect(suggestionCallCount).toBe(2);
});
