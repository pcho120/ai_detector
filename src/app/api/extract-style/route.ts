import { NextRequest, NextResponse } from 'next/server';
import { validateFileBuffer } from '@/lib/files/validate';
import { extractDocx } from '@/lib/files/docx';
import { extractDoc } from '@/lib/files/doc';
import { withTempFile } from '@/lib/files/temp';
import { FileProcessingError, toErrorResponse } from '@/lib/files/errors';
import {
  extractStyleSentences,
  MIN_STYLE_TEXT_LENGTH,
  MAX_STYLE_TEXT_LENGTH,
} from '@/lib/style-extraction';

export const runtime = 'nodejs';

function isJsonContentType(request: NextRequest): boolean {
  const ct = request.headers.get('content-type') ?? '';
  return ct.includes('application/json');
}

async function handleFileUpload(request: NextRequest): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: 'Request must be multipart/form-data or application/json.' },
      { status: 400 },
    );
  }

  const fileEntry = formData.get('file');
  if (!(fileEntry instanceof File)) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: 'No file uploaded. Include a "file" field.' },
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
      return NextResponse.json(toErrorResponse(err), { status: 400 });
    }
    throw err;
  }

  let extractedText: string;
  try {
    extractedText = await withTempFile(
      validated.buffer,
      validated.extension,
      async () => {
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
      const status = err.code === 'TEXT_TOO_SHORT' || err.code === 'TEXT_TOO_LONG' ? 400 : 400;
      return NextResponse.json(toErrorResponse(err), { status });
    }
    throw err;
  }

  if (extractedText.length < MIN_STYLE_TEXT_LENGTH) {
    return NextResponse.json(
      { error: 'TEXT_TOO_SHORT', message: `Text must be at least ${MIN_STYLE_TEXT_LENGTH} characters.` },
      { status: 400 },
    );
  }

  if (extractedText.length > MAX_STYLE_TEXT_LENGTH) {
    return NextResponse.json(
      { error: 'TEXT_TOO_LONG', message: `Text must not exceed ${MAX_STYLE_TEXT_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const result = extractStyleSentences(extractedText);
  return NextResponse.json(
    { sentences: result.sentences, count: result.count },
    { status: 200 },
  );
}

async function handleJsonBody(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('text' in body) ||
    typeof (body as Record<string, unknown>).text !== 'string'
  ) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: 'Body must include a "text" field (string).' },
      { status: 400 },
    );
  }

  const text = ((body as Record<string, unknown>).text as string).trim();

  if (text.length < MIN_STYLE_TEXT_LENGTH) {
    return NextResponse.json(
      { error: 'TEXT_TOO_SHORT', message: `Text must be at least ${MIN_STYLE_TEXT_LENGTH} characters.` },
      { status: 400 },
    );
  }

  if (text.length > MAX_STYLE_TEXT_LENGTH) {
    return NextResponse.json(
      { error: 'TEXT_TOO_LONG', message: `Text must not exceed ${MAX_STYLE_TEXT_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const result = extractStyleSentences(text);
  return NextResponse.json(
    { sentences: result.sentences, count: result.count },
    { status: 200 },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const contentType = request.headers.get('content-type') ?? '';

  if (isJsonContentType(request)) {
    return handleJsonBody(request);
  }

  if (contentType.includes('multipart/form-data')) {
    return handleFileUpload(request);
  }

  return NextResponse.json(
    { error: 'UNSUPPORTED_FORMAT', message: 'Request must be multipart/form-data or application/json.' },
    { status: 400 },
  );
}
