# F3 Manual QA Summary

**Date**: 2026-03-30  
**Verdict**: ✅ APPROVE

## Test Suite Results

| Suite | Tests | Result |
|-------|-------|--------|
| Vitest unit + integration | 163 | ✅ All pass |
| Playwright E2E (6 scenarios) | 6 | ✅ All pass |

## Screenshot Evidence

| Flow | Screenshot | Result |
|------|-----------|--------|
| Home page (initial) | `f3-qa-home.png` | ✅ Heading, file input, submit button visible |
| Happy path .docx | `f3-manual-qa.png` | ✅ Review panel, score 85.0% AI (red), highlighted span, Review Suggestions |
| Happy path .doc | `f3-qa-doc-success.png` | ✅ Review panel, score 10.0% AI (green), no suggestions (correct) |
| Unsupported format (.pdf) | `f3-manual-qa-error.png` | ✅ Error banner, no review panel, form interactive |
| Extraction failure (corrupt) | `f3-qa-extraction-error.png` | ✅ Error banner, no review panel |
| Language error (non-English) | `f3-qa-language-error.png` | ✅ Error banner, no review panel |
| Text too short | `f3-qa-tooshort-error.png` | ✅ Error banner with char count, no review panel |
| Detection provider failure | `f3-qa-detection-failure.png` | ✅ Error banner, no provider internals leaked |

## Coverage Verification

### Happy Paths
- ✅ Valid `.docx` upload → analysis with score, highlights, suggestions
- ✅ Valid `.doc` upload → analysis with score (no suggestions when no high-risk sentences)
- ✅ Review panel appears only on success

### Failure Paths  
- ✅ Unsupported file type (PDF) → friendly error, form stays interactive
- ✅ Extraction failure (corrupt DOCX) → friendly error, no review panel
- ✅ Text too short → error with char count, no review panel
- ✅ Unsupported language → friendly error
- ✅ Detection provider failure → error without leaking internal provider message

### UX Checks
- ✅ No disallowed wording: no "cheat", "plagiarism", "definitive", "guarantee", "proves", "caught"
- ✅ Error framing uses "risk" language consistently ("AI-like phrasing risk")
- ✅ UI remains interactive after all error flows (file input + submit not disabled)
- ✅ Review panel hidden on all error states
- ✅ Score color coding: red ≥70%, orange 40-70%, green <40%

## Error Message Mapping

| Error Code | Displayed Message |
|-----------|------------------|
| UNSUPPORTED_FORMAT | "Unsupported file format. Please upload a .doc or .docx file." (client override) |
| UNSUPPORTED_LANGUAGE | "Only English-language documents are supported. Please upload an English document." (client override) |
| EXTRACTION_FAILED | "Could not extract text from the document." (API message pass-through) |
| TEXT_TOO_SHORT | "Extracted text is too short (N chars). Minimum is 300 characters." (API message) |
| DETECTION_FAILED | "Detection service returned an error (status 500)." (no provider internals) |
