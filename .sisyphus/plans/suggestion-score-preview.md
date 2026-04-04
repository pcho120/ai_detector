# Suggestion Score Preview

## TL;DR

> **Quick Summary**: Suggestion 팝오버의 각 Alternative에서 "Why" 레이블 옆 `()` 안에, 해당 rewrite로 교체했을 때 전체 문서 overall score가 얼마가 될지 미리 표시한다.
>
> **Deliverables**:
> - `SuggestionAlternative` 타입에 `previewScore?: number` 필드 추가
> - `/api/suggestions` 라우트에서 각 alternative마다 revised text로 Sapling 호출 → overall score 계산 후 attach
> - `ReviewPanel.tsx` 팝오버의 "Why" 레이블에 `(XX.X% AI if replaced)` 표시
> - 기존 integration 테스트 fetch mock을 URL-기반 라우팅으로 업데이트 + 새 테스트 추가
>
> **Estimated Effort**: Short
> **Parallel Execution**: NO — 4개 task, 순차 의존성 있음
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4

---

## Context

### Original Request
Suggestion Sentence 창에서 why 옆에 ()안에 해당 문장으로 바꾸면 overall score가 몇인지 알려줘

### Interview Summary

**Key Discussions**:
- **Score 계산 방식**: suggestions API 서버에서 미리 포함 (클라이언트에서 별도 API 호출 X)
- **로딩 표시**: score 로딩 중 `...` 표시 (실제로는 suggestions fetch가 완료될 때 score도 함께 오므로 별도 로딩 없음)
- **Overall Score 정의**: 전체 문서 overall score — 해당 sentence를 rewrite로 교체한 후 전체 문서를 Sapling에 돌렸을 때 나오는 `DetectionResult.score` (sentence-level score가 아님)

**Research Findings**:
- `createAnalysisDetectionAdapter()` 는 `SAPLING_API_KEY` 없을 시 `FileProcessingError` throw — route에서 반드시 try/catch 필요
- `SaplingDetectionAdapter.detect(text)` 는 단일 문자열, 각 alternative마다 독립 호출 필요
- 기존 `mockLlmSuccess` / `mockLlmMultiSuccess` 는 fetch를 단일 응답으로 mock — Sapling 호출이 추가되면 URL 기반 라우팅으로 교체 필요

### Metis Review

**Identified Gaps** (addressed):
- "Overall Score" 의미 불명확 → 사용자 확인: **전체 문서 overall score** (`DetectionResult.score`)
- `createAnalysisDetectionAdapter()` throw 시 graceful degradation 필요 → `previewScore: undefined` 반환
- 기존 integration 테스트 fetch mock 깨짐 → URL-routing mock helper 로 업데이트 필수

---

## Work Objectives

### Core Objective
Suggestion 팝오버에서 각 alternative의 rewrite를 적용했을 때 전체 문서 overall score를 미리 보여줌으로써, 사용자가 Apply 전에 어떤 rewrite가 AI score를 가장 많이 낮추는지 비교할 수 있게 한다.

### Concrete Deliverables
- `src/lib/suggestions/llm.ts` — `SuggestionAlternative` 에 `previewScore?: number` 추가
- `src/app/api/suggestions/route.ts` — alternatives 생성 후 각 rewrite에 대해 full-text Sapling 감지 실행
- `src/components/ReviewPanel.tsx` — "Why" 레이블 옆에 `(XX.X% AI if replaced)` 표시
- `tests/integration/suggestions-route.test.ts` — fetch mock을 URL-routing 방식으로 업데이트 + previewScore 테스트 추가

### Definition of Done
- [x] `npm run typecheck` — 0 errors
- [x] `npm run test` — 전체 통과
- [x] Suggestion 팝오버에서 "Why (72.3% AI if replaced)" 형식으로 표시됨
- [x] `SAPLING_API_KEY` 없을 때 alternatives 여전히 반환, `previewScore` 없음 (UI에서 아무것도 표시 안 함)

### Must Have
- `previewScore` 는 `[0, 1]` 범위의 float, UI에서 `(score * 100).toFixed(1)% AI if replaced` 형식
- Sapling 실패 시 (키 없음, 네트워크 오류, timeout) → alternatives는 정상 반환, 해당 alternative의 `previewScore` 만 `undefined`
- 각 alternative에 대해 full revised text로 독립적인 Sapling 감지 실행

### Must NOT Have (Guardrails)
- `SuggestionUnavailableResponse` 에 `previewScore` 추가 금지
- 상단 레벨 `SuggestionAvailableResponse.rewrite` / `.explanation` 에 previewScore 추가 금지
- `generateAlternativeSuggestions` 함수 시그니처 변경 금지 (detection 로직 llm.ts 에 넣지 말 것)
- `SaplingDetectionAdapter` 수정 금지
- `revisedAnalysisReducer.ts` 수정 금지 (타입 업데이트만으로 자동 전파됨)
- 클라이언트에서 새 fetch 호출 추가 금지 (서버에서 미리 계산)
- `handleApply` 로직 변경 금지

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: Tests-after
- **Framework**: vitest

### QA Policy
Every task has agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API**: Bash (curl) — 요청 전송, status + response fields 검증
- **TypeScript**: Bash (`npm run typecheck`) — 타입 오류 없음 확인
- **Tests**: Bash (`npm run test`) — 전체 통과 확인

---

## Execution Strategy

### Sequential Execution (의존성 때문에 순차)

```
Task 1: Type Update — llm.ts에 previewScore 필드 추가
  ↓
Task 2: Route Enrichment — suggestions route에서 per-alternative Sapling 호출
  ↓
Task 3: UI Update — ReviewPanel.tsx Why 레이블에 previewScore 표시
  ↓
Task 4: Test Updates — integration test fetch mock 업데이트 + 새 테스트
  ↓
Task F1: Final Verification
```

### Agent Dispatch Summary
- **Task 1**: `quick`
- **Task 2**: `unspecified-high`
- **Task 3**: `quick`
- **Task 4**: `unspecified-high`
- **F1**: `unspecified-high`

---

## TODOs

- [x] 1. `SuggestionAlternative` 타입에 `previewScore` 필드 추가

  **What to do**:
  - `src/lib/suggestions/llm.ts` 의 `SuggestionAlternative` 인터페이스에 `previewScore?: number` 필드 추가
  - 다른 함수 시그니처, LLM 프롬프트, 반환 로직은 일체 변경 금지

  **Must NOT do**:
  - `generateAlternativeSuggestions` 함수 내부 로직 변경
  - detection 관련 import 추가
  - 타입 파일 외 다른 파일 변경 (이 task에서는 llm.ts 만)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단일 파일, 1줄 변경
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 1)
  - **Blocks**: Task 2, 3, 4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/suggestions/llm.ts:17-20` — 현재 `SuggestionAlternative` 인터페이스 위치

  **Acceptance Criteria**:

  - [ ] `SuggestionAlternative` 인터페이스에 `previewScore?: number` 필드 존재
  - [ ] `npm run typecheck` — exit 0

  **QA Scenarios**:

  ```
  Scenario: TypeScript 컴파일 성공
    Tool: Bash
    Steps:
      1. npm run typecheck 실행
      2. exit code 0 확인
    Expected Result: 0 errors
    Evidence: .sisyphus/evidence/task-1-typecheck.txt
  ```

  **Commit**: YES (commit 1)
  - Message: `types: add previewScore optional field to SuggestionAlternative`
  - Files: `src/lib/suggestions/llm.ts`
  - Pre-commit: `npm run typecheck`

- [x] 2. `/api/suggestions` route에서 per-alternative Sapling 호출로 previewScore 계산

  **What to do**:
  - `src/app/api/suggestions/route.ts` 에서 `generateAlternativeSuggestions` 반환 후, 각 alternative에 대해:
    1. `body.text` (전체 문서 텍스트)에서 sentenceIndex의 원문 sentence를 `alt.rewrite` 로 교체한 `revisedText` 생성
    2. `createAnalysisDetectionAdapter()` 로 detection adapter 생성 (try/catch로 감싸기)
    3. `adapter.detect(revisedText)` 호출 → `detectionResult.score` 를 `alt.previewScore` 에 attach
    4. 각 alternative별 Sapling 호출을 try/catch로 독립적으로 감싸기 — 실패 시 `previewScore: undefined` 유지, 다른 alternatives 영향 없음
  - `SuggestionAvailableResponse` 타입의 `alternatives` 필드 타입 변경 필요 없음 (`SuggestionAlternative[]` 이고 이미 `previewScore?` 포함)

  **Revised text 생성 방법**:
  - `body.text` 를 Sapling 기준 문장 경계로 split할 필요 없음
  - 간단한 string replace: `body.text.replace(body.sentence, alt.rewrite)` 사용
  - 단, `body.sentence` 가 text에 정확히 1회 등장한다는 보장이 있음 (분석 결과에서 추출된 sentence이므로)

  **import 추가 필요**:
  - `import { createAnalysisDetectionAdapter } from '@/lib/analysis/analyzeText'`
  - `import { FileProcessingError } from '@/lib/files/errors'`

  **Must NOT do**:
  - `analyzeText()` 전체 호출 금지 (suggestions, highlights 계산 불필요 — `detect()` 만 필요)
  - `generateAlternativeSuggestions` 함수 수정 금지
  - unavailable 분기에 previewScore 추가 금지
  - 상단 `SuggestionAvailableResponse.rewrite` / `.explanation` 에 previewScore 추가 금지

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: async 에러 핸들링 패턴, 기존 route 패턴 준수 필요
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 2, after Task 1)
  - **Blocks**: Task 3, 4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/app/api/analyze/revised/route.ts:35-46` — `createAnalysisDetectionAdapter()` 사용 및 try/catch 패턴
  - `src/app/api/suggestions/route.ts:78-98` — 현재 route 구조 (alternatives 생성 후 response 반환)
  - `src/lib/analysis/analyzeText.ts:9-18` — `createAnalysisDetectionAdapter` 함수

  **API/Type References**:
  - `src/lib/detection/types.ts:24-32` — `DetectionResult.score` 가 overall score임 확인
  - `src/lib/suggestions/llm.ts:17-20` — `SuggestionAlternative` (Task 1 후 `previewScore?` 포함)

  **Acceptance Criteria**:

  - [ ] `SAPLING_API_KEY` 설정 시: `alternatives[i].previewScore` 가 `[0, 1]` 범위 number
  - [ ] `SAPLING_API_KEY` 미설정 시: alternatives 정상 반환, `previewScore` undefined
  - [ ] Sapling 호출 실패 시: 해당 alternative의 `previewScore` undefined, 나머지 alternatives 영향 없음
  - [ ] `npm run typecheck` — exit 0

  **QA Scenarios**:

  ```
  Scenario: SAPLING_API_KEY 설정 시 previewScore 반환
    Tool: Bash (curl)
    Preconditions: SAPLING_API_KEY 환경변수 설정, dev server 실행
    Steps:
      1. curl -X POST http://localhost:3000/api/suggestions \
         -H "Content-Type: application/json" \
         -d '{"text":"In conclusion, the experiment shows results. More data follows.","sentenceIndex":0,"sentence":"In conclusion, the experiment shows results.","score":0.9}'
      2. 응답 JSON 파싱
      3. alternatives[0].previewScore 가 number 타입이며 0~1 범위인지 확인
    Expected Result: alternatives[0].previewScore === typeof 'number' && >= 0 && <= 1
    Evidence: .sisyphus/evidence/task-2-preview-score-present.json

  Scenario: SAPLING_API_KEY 미설정 시 graceful degradation
    Tool: Bash (curl)
    Preconditions: SAPLING_API_KEY 없음, COACHING_LLM_API_KEY 설정됨
    Steps:
      1. SAPLING_API_KEY 없이 동일 요청 전송
      2. 응답 확인: available === true 이고 alternatives 배열 존재
      3. alternatives[0].previewScore === undefined 확인
    Expected Result: available: true, alternatives 있음, previewScore 없음
    Evidence: .sisyphus/evidence/task-2-preview-score-absent.json
  ```

  **Commit**: YES (commit 2)
  - Message: `feat(api): compute previewScore per alternative in suggestions route`
  - Files: `src/app/api/suggestions/route.ts`
  - Pre-commit: `npm run typecheck`

- [x] 3. ReviewPanel.tsx "Why" 레이블에 previewScore 표시

  **What to do**:
  - `src/components/ReviewPanel.tsx` 의 라인 198 근처, `alt.explanation &&` 블록 내 "Why" `<span>` 을 수정
  - 현재: `<span className="...">Why</span>`
  - 변경 후: `alt.previewScore !== undefined` 이면 `Why (XX.X% AI if replaced)` 표시, 아니면 `Why` 만 표시
  - 정확한 format: `` `Why (${(alt.previewScore * 100).toFixed(1)}% AI if replaced)` ``
  - `previewScore` 가 `undefined` 일 때는 기존 `Why` 그대로 렌더링 (빈 `()` 표시 금지)

  **Must NOT do**:
  - `handleApply` 로직 변경 금지
  - 새 fetch 호출 추가 금지
  - "Alternative X" 헤더나 Apply 버튼 변경 금지
  - 별도 로딩 state 추가 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단일 파일, 단일 조건부 렌더링 변경
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 3, after Task 2)
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/components/ReviewPanel.tsx:188-213` — 현재 alternative 카드 렌더링 구조 (Why 레이블은 198번째 줄)
  - `src/components/ReviewPanel.tsx:302-304` — 기존 score 포맷 패턴 `(score * 100).toFixed(1)%`

  **Acceptance Criteria**:

  - [ ] `previewScore` 가 `0.723` 일 때 "Why (72.3% AI if replaced)" 렌더링
  - [ ] `previewScore` 가 `undefined` 일 때 "Why" 만 렌더링 (괄호 없음)
  - [ ] `npm run typecheck` — exit 0

  **QA Scenarios**:

  ```
  Scenario: previewScore 있을 때 레이블 표시
    Tool: Bash (node REPL 또는 vitest 단위 검증)
    Steps:
      1. previewScore: 0.723 인 mock alternative로 컴포넌트 렌더링 (또는 DOM 확인)
      2. "Why (72.3% AI if replaced)" 텍스트 존재 확인
    Expected Result: "Why (72.3% AI if replaced)" 표시됨
    Evidence: .sisyphus/evidence/task-3-label-with-score.txt

  Scenario: previewScore 없을 때 레이블 표시
    Steps:
      1. previewScore: undefined 인 alternative로 렌더링
      2. "Why" 텍스트만 있고 괄호 없음 확인
    Expected Result: "Why" 만 표시, "(undefined% AI if replaced)" 같은 텍스트 없음
    Evidence: .sisyphus/evidence/task-3-label-without-score.txt
  ```

  **Commit**: YES (commit 3)
  - Message: `feat(ui): show previewScore on Why label in suggestion drawer`
  - Files: `src/components/ReviewPanel.tsx`
  - Pre-commit: `npm run typecheck`

- [x] 4. Integration 테스트 fetch mock 업데이트 + previewScore 테스트 추가

  **What to do**:

  **A. 기존 mock helper 업데이트**:
  - `tests/integration/suggestions-route.test.ts` 에서 `mockLlmSuccess` / `mockLlmMultiSuccess` 를 URL-routing 방식으로 교체
  - LLM 호출 (`api.openai.com`): 기존과 동일한 응답 반환
  - Sapling 호출 (`api.sapling.ai`): `{ score: 0.45, sentence_scores: [], text: '', tokens: [], token_probs: [] }` 반환
  - 새 helper 이름 예시: `mockFetchWithUrlRouting(llmAlts, saplingScore?)`
  - `fetchMock` 이 URL로 분기: `url.includes('openai.com')` → LLM 응답, `url.includes('sapling.ai')` → Sapling 응답

  **B. 기존 테스트 업데이트**:
  - `mockLlmSuccess` / `mockLlmMultiSuccess` 직접 사용하는 모든 테스트를 새 URL-routing mock으로 교체
  - `sanitizeVoiceProfile` 테스트 (line ~169)처럼 inline fetchMock 사용 테스트도 Sapling 호출 추가 반영

  **C. 새 테스트 추가**:
  ```
  describe('previewScore enrichment') {
    it('각 alternative에 previewScore number 포함 (SAPLING_API_KEY 설정 시)')
    it('SAPLING_API_KEY 미설정 시 previewScore undefined, alternatives 정상 반환')
    it('Sapling 호출 실패 시 previewScore undefined, alternatives 정상 반환')
    it('previewScore 는 0~1 범위')
  }
  ```

  **Must NOT do**:
  - unavailable 분기 테스트 변경 금지 (Sapling까지 도달하지 않음)
  - `tests/unit/suggestions.test.ts` 변경 금지 (llm.ts 단위 테스트, Sapling 없음)
  - 기존 contract 테스트 assertion 변경 금지 (available/unavailable shape)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 복잡한 fetch mock 리팩토링 + 새 테스트 케이스
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 4, after Task 3)
  - **Blocks**: Final verification
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `tests/integration/suggestions-route.test.ts:18-58` — 현재 `mockLlmSuccess` / `mockLlmMultiSuccess` 구현 (교체 대상)
  - `tests/integration/suggestions-route.test.ts:169-207` — inline fetchMock 사용 패턴 (URL 분기 참고)
  - `tests/integration/analyze-revised-route.test.ts` — Sapling mock 패턴 참고 (있다면)
  - `src/lib/detection/sapling.ts:4` — `SAPLING_API_URL = 'https://api.sapling.ai/api/v1/aidetect'`

  **Acceptance Criteria**:

  - [ ] `npm run test tests/integration/suggestions-route.test.ts` — 모든 테스트 통과
  - [ ] `npm run test` — 전체 테스트 통과
  - [ ] previewScore 성공 케이스 테스트 존재
  - [ ] Sapling 미설정 graceful degradation 테스트 존재
  - [ ] 기존 unavailable 분기 테스트 여전히 통과

  **QA Scenarios**:

  ```
  Scenario: 전체 테스트 통과
    Tool: Bash
    Steps:
      1. npm run test 실행
      2. exit code 0 확인
      3. test count 확인 (기존보다 늘어야 함)
    Expected Result: 0 failed, 모든 테스트 통과
    Evidence: .sisyphus/evidence/task-4-test-results.txt

  Scenario: previewScore 테스트 존재 확인
    Tool: Bash
    Steps:
      1. grep -n "previewScore" tests/integration/suggestions-route.test.ts
      2. 4개 이상 테스트 케이스 확인
    Expected Result: previewScore 관련 describe/it 블록 존재
    Evidence: .sisyphus/evidence/task-4-preview-score-tests.txt
  ```

  **Commit**: YES (commit 4)
  - Message: `test: update suggestions integration tests for Sapling fetch routing`
  - Files: `tests/integration/suggestions-route.test.ts`
  - Pre-commit: `npm run test`

---

## Final Verification Wave

- [x] F1. **Full QA + Type + Test Check** — `unspecified-high`

  1. `npm run typecheck` 실행 → exit code 0 확인
  2. `npm run test` 실행 → 전체 통과 확인
  3. Dev server 시작 후 curl로 `/api/suggestions` 직접 호출하여 `alternatives[i].previewScore` 가 number임을 확인
  4. Sapling key 제거 후 재호출 → alternatives 반환되나 `previewScore` undefined 확인

  Output: `typecheck [PASS/FAIL] | tests [N pass/N fail] | previewScore [present/absent] | VERDICT`

---

## Commit Strategy

- **1**: `types: add previewScore optional field to SuggestionAlternative` — `src/lib/suggestions/llm.ts`
- **2**: `feat(api): compute previewScore per alternative in suggestions route` — `src/app/api/suggestions/route.ts`
- **3**: `feat(ui): show previewScore on Why label in suggestion drawer` — `src/components/ReviewPanel.tsx`
- **4**: `test: update suggestions integration tests for Sapling fetch routing` — `tests/integration/suggestions-route.test.ts`

---

## Success Criteria

### Verification Commands
```bash
npm run typecheck   # Expected: exit 0, no errors
npm run test        # Expected: all tests pass
```

### Final Checklist
- [x] `SuggestionAlternative` 에 `previewScore?: number` 있음
- [x] `/api/suggestions` 응답 `alternatives[i].previewScore` 가 `[0,1]` 범위 number
- [x] Sapling 미구성 시 alternatives 정상 반환, `previewScore` absent
- [x] ReviewPanel "Why" 레이블에 `(XX.X% AI if replaced)` 표시
- [x] `previewScore` undefined 일 때 `()` 표시 없음
- [x] 기존 테스트 모두 통과
