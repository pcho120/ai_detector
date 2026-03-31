import { NextRequest, NextResponse } from 'next/server';
import { validateFileBuffer } from '@/lib/files/validate';
import { extractDocx } from '@/lib/files/docx';
import { extractDoc } from '@/lib/files/doc';
import { withTempFile } from '@/lib/files/temp';
import { FileProcessingError, toErrorResponse } from '@/lib/files/errors';
import { analyzeText, createAnalysisDetectionAdapter } from '@/lib/analysis/analyzeText';

export const runtime = 'nodejs';

const ENGLISH_CHAR_THRESHOLD = 0.6;

function isEnglish(text: string): boolean {
  const letters = text.match(/[a-zA-Z\u00C0-\u024F]/g);
  if (!letters) return false;
  const latinLetters = text.match(/[a-zA-Z]/g);
  if (!latinLetters) return false;
  return latinLetters.length / letters.length >= ENGLISH_CHAR_THRESHOLD;
}

export interface AnalysisSuccessResponse {
  score: number;
  text: string;
  sentences: Array<{ sentence: string; score: number }>;
  highlights: Array<{ start: number; end: number; score: number; label: string; sentenceIndex: number }>;
  suggestions: Array<{ sentence: string; rewrite: string; explanation: string; sentenceIndex: number }>;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: 'UNSUPPORTED_FORMAT', message: 'Request must be multipart/form-data.' },
      { status: 400 },
    );
  }

  const fileEntry = formData.get('file');
  if (!(fileEntry instanceof File)) {
    return NextResponse.json(
      { error: 'UNSUPPORTED_FORMAT', message: 'No file uploaded. Include a "file" field.' },
      { status: 400 },
    );
  }

  const file = fileEntry;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let validated: ReturnType<typeof validateFileBuffer>;
  try {
    validated = validateFileBuffer(file.name, file.type, buffer);
  } catch (err) {
    if (err instanceof FileProcessingError) {
      return NextResponse.json(toErrorResponse(err), { status: 422 });
    }
    throw err;
  }

  let extractedText: string;
  try {
    extractedText = await withTempFile(
      validated.buffer,
      validated.extension,
      async (_handle) => {
        if (validated.extension === '.docx') {
          const result = await extractDocx(validated.buffer);
          return result.text;
        } else {
          const result = await extractDoc(validated.buffer);
          return result.text;
        }
      },
    );
  } catch (err) {
    if (err instanceof FileProcessingError) {
      return NextResponse.json(toErrorResponse(err), { status: 422 });
    }
    throw err;
  }

  if (!isEnglish(extractedText)) {
    const langError = new FileProcessingError(
      'UNSUPPORTED_LANGUAGE',
      'Only English-language documents are supported.',
    );
    return NextResponse.json(toErrorResponse(langError), { status: 422 });
  }

  try {
    const detectionAdapter = createAnalysisDetectionAdapter();
    const body = await analyzeText(extractedText, detectionAdapter);
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    if (err instanceof FileProcessingError) {
      const isUnconfigured = err.message === 'Detection service is not configured.';
      const status = isUnconfigured ? 503 : 502;
      return NextResponse.json(toErrorResponse(err), { status });
    }
    throw err;
  }
}
