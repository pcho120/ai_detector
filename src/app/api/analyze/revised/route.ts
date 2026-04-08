import { NextRequest, NextResponse } from 'next/server';
import { FileProcessingError, toErrorResponse } from '@/lib/files/errors';
import { getRequestSettings } from '@/lib/api/requestSettings';
import { analyzeText, createAnalysisDetectionAdapter } from '@/lib/analysis/analyzeText';

export const runtime = 'nodejs';

function isValidRequest(body: unknown): body is { text: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'text' in body &&
    typeof (body as Record<string, unknown>).text === 'string' &&
    ((body as Record<string, unknown>).text as string).trim().length > 0
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }

  if (!isValidRequest(body)) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: 'Request body must include a non-empty "text" string.' },
      { status: 400 },
    );
  }

  try {
    const settings = getRequestSettings(request);
    const detectionAdapter = createAnalysisDetectionAdapter({
      provider: settings.detectionProvider,
      apiKey: settings.detectionApiKey,
    });
    const result = await analyzeText(body.text, detectionAdapter);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof FileProcessingError) {
      const isUnconfigured = err.message === 'Detection service is not configured.';
      const status = isUnconfigured ? 503 : 502;
      return NextResponse.json(toErrorResponse(err), { status });
    }
    throw err;
  }
}
