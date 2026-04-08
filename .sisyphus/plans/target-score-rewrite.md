# Target Score 일괄 리라이트 기능

## TL;DR

> **Quick Summary**: Voice Profile 아래에 Target Score 입력박스를 추가하여, 유저가 원하는 목표 AI 점수(%)를 입력하면 높은 점수 문장부터 우선적으로 LLM 리라이트하고, Sapling 재분석을 통해 목표에 도달할 때까지 자동 반복(최대 3회). 결과는 Revised Analysis 패널에 표시되며, 이후 개별 문장 클릭으로 추가 수정 가능.
> 
> **Deliverables**:
> - TargetScorePanel 컴포넌트 (입력 UI + 프로그레스 바)
> - /api/bulk-rewrite API 엔드포인트
> - bulkRewrite 비즈니스 로직 모듈
> - page.tsx 통합
> - 유닛/통합 테스트
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (types) → Task 2 (bulk logic) → Task 4 (API) → Task 5 (UI) → Task 6 (integration) → F1-F4

---

## Context

### Original Request
Voice Profile 밑에 Target Score 입력박스를 만들어서, 유저가 목표 %(예: 40)를 입력하면 overall score가 해당 %가 되도록 모든 문장을 리라이트. 결과는 오른쪽 Revised Analysis 패널에 표시. 리라이트 후 유저가 개별 문장을 클릭해서 추가 수정 가능. 골은 overall AI score를 낮추는 것.

### Interview Summary
**Key Discussions**:
- 리라이트 대상: 높은 AI score 문장부터 우선 (효율적, API 비용 절감)
- 미달성 처리: 자동 재시도 최대 3회 → "Best achieved: XX%" 메시지
- 진행 UI: 프로그레스 바 ("Rewriting 3/15 sentences...")
- Target Score 범위: 10~100% (최소 10% 제한)
- 기존 수동 리라이트: 보존 (벌크는 건드리지 않음)
- LLM 호출: 병렬 5개씩 (concurrency limiter)
- 테스트: 구현 후 추가

**Research Findings**:
- 현재 개별 리라이트: /api/suggestions → GPT-4o-mini → 3개 대안 반환
- 재분석: /api/analyze/revised → Sapling API → 새 overall + per-sentence score
- State: revisedAnalysisReducer.ts가 appliedReplacements 관리
- generateSingleSuggestion (1개 리라이트)이 벌크에 적합
- Voice Profile: sanitize 후 LLM 프롬프트에 포함

### Metis Review
**Identified Gaps** (addressed):
- 벌크에서 generateSingleSuggestion 사용 (3개 대안 아닌 1개) → 비용 절감
- Sapling 호출은 라운드별 1회만 (문장별 X) → API 비용 절감
- appliedReplacements 동일 구조로 저장 → 기존 개별 revert 호환
- applyGuardrails 필수 적용 → 안전성 보장
- COACHING_LLM_API_KEY 없을 시 503 반환 → 에러 핸들링
- 기존 컴포넌트 props 변경 금지 → 격리성 보장
- 동시 실행 방지 (버튼 + 인풋 disabled) → UX 안전

---

## Work Objectives

### Core Objective
유저가 원하는 Target AI Score에 도달하도록 문서의 고위험 문장을 자동으로 일괄 리라이트하고, 결과를 Revised Analysis에 표시하여 추가 편집이 가능하게 한다.

### Concrete Deliverables
- `src/lib/bulk-rewrite/types.ts` — 벌크 리라이트 타입 정의
- `src/lib/bulk-rewrite/bulkRewrite.ts` — 핵심 비즈니스 로직 (우선순위 정렬, 병렬 LLM 호출, 재시도 루프)
- `src/app/api/bulk-rewrite/route.ts` — API 엔드포인트
- `src/components/TargetScorePanel.tsx` — UI 컴포넌트 (입력 + 프로그레스 바 + 결과 메시지)
- `src/app/page.tsx` — 통합 (TargetScorePanel 배치, 상태 연결)
- 테스트 파일들

### Definition of Done
- [ ] Target Score 입력 (10~100) → 벌크 리라이트 실행 → Revised Analysis에 결과 표시
- [ ] 높은 score 문장부터 우선 리라이트, 자동 재시도 최대 3회
- [ ] 벌크 완료 후 개별 문장 클릭 → 기존 suggestion 팝오버로 추가 수정 가능
- [ ] 기존 수동 리라이트 보존됨
- [ ] 프로그레스 바 정상 동작
- [ ] 모든 테스트 pass
- [ ] `npm run typecheck && npm run lint` pass

### Must Have
- Target Score 입력박스 (10~100, 정수)
- 높은 AI score 문장 우선 리라이트
- 병렬 LLM 호출 (concurrency 5)
- 자동 재시도 (최대 3회)
- 프로그레스 바 UI
- Revised Analysis 패널에 결과 표시
- 벌크 후 개별 문장 편집 가능
- 기존 수동 리라이트 보존
- applyGuardrails 적용
- COACHING_LLM_API_KEY 미설정 시 503

### Must NOT Have (Guardrails)
- 기존 ReviewPanel, RevisedReviewPanel, VoiceProfilePanel props 변경 금지
- 새 diff view UI 금지 — RevisedReviewPanel 기존 × 버튼으로 충분
- 벌크 undo 버튼 금지 — 개별 revert(×) 사용
- 벌크 중 per-sentence Sapling 호출 금지 — 라운드별 1회만
- 서드파티 프로그레스 바 라이브러리 금지 — Tailwind 순수 구현
- target score 저장/persist 금지 — 페이지 리로드 시 리셋
- 문장별 explanation UI 금지 — 벌크에서는 숨김
- generateAlternativeSuggestions 사용 금지 — generateSingleSuggestion 사용

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (bun test, vitest config)
- **Automated tests**: Tests-after (구현 후 테스트 추가)
- **Framework**: bun test / vitest

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Playwright — Navigate, interact, assert DOM, screenshot
- **API/Backend**: Bash (curl) — Send requests, assert status + response fields
- **Library/Module**: Bash (bun test) — Import, call functions, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: Bulk rewrite types [quick]
├── Task 2: Bulk rewrite core logic [deep]
└── Task 3: TargetScorePanel UI component [visual-engineering]

Wave 2 (After Wave 1 — API + integration):
├── Task 4: /api/bulk-rewrite API endpoint (depends: 1, 2) [unspecified-high]
├── Task 5: page.tsx integration (depends: 1, 3) [unspecified-high]
└── Task 6: Tests (depends: 1, 2, 3, 4, 5) [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 → Task 4 → Task 5 → Task 6 → F1-F4
Parallel Speedup: Wave 1 runs 3 tasks concurrently
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 (types) | — | 2, 3, 4, 5, 6 |
| 2 (bulk logic) | 1 | 4, 6 |
| 3 (UI component) | 1 | 5, 6 |
| 4 (API route) | 1, 2 | 5, 6 |
| 5 (integration) | 1, 3, 4 | 6 |
| 6 (tests) | 1, 2, 3, 4, 5 | F1-F4 |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `deep`, T3 → `visual-engineering`
- **Wave 2**: **3** — T4 → `unspecified-high`, T5 → `unspecified-high`, T6 → `unspecified-high`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Bulk Rewrite 타입 정의

  **What to do**:
  - `src/lib/bulk-rewrite/types.ts` 생성
  - BulkRewriteRequest 타입: `{ sentences: Array<{sentence: string, score: number, sentenceIndex: number}>, targetScore: number, voiceProfile?: string, text: string }`
  - BulkRewriteResult 타입: `{ rewrites: Record<number, string>, achievedScore: number, iterations: number, totalRewritten: number, targetMet: boolean }`
  - BulkRewriteProgress 콜백 타입: `(current: number, total: number, phase: 'rewriting' | 'analyzing') => void`
  - 기존 타입 import: `SupportedExtension` (from files/validate), `DetectionResult` (from detection/types)는 필요 없음 — 이 모듈은 순수 벌크 리라이트 도메인 타입만 정의

  **Must NOT do**:
  - 기존 detection/types.ts나 suggestions/types.ts 수정 금지
  - 불필요한 generic 타입 금지 — 이 기능에 필요한 것만

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단일 파일 타입 정의, 간단한 작업
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None needed for type definitions

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 2, 3, 4, 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/suggestions/types.ts` — 기존 suggestion 타입 패턴 참고 (SuggestionEntry, SuggestionService 구조)
  - `src/lib/detection/types.ts` — DetectionResult, DetectionSentence 타입 구조 참고 (score가 0-1 float)

  **API/Type References**:
  - `src/lib/review/revisedAnalysisReducer.ts` — appliedReplacements 타입 확인 (Record<number, string> 패턴)

  **WHY Each Reference Matters**:
  - `suggestions/types.ts`: 프로젝트의 타입 네이밍 컨벤션과 export 패턴을 따라야 함
  - `detection/types.ts`: sentence score의 타입(number, 0-1)을 맞춰야 벌크 로직에서 타입 호환됨
  - `revisedAnalysisReducer.ts`: rewrites의 Record<number, string> 구조가 appliedReplacements와 동일해야 기존 UI 호환

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 타입 파일이 정상 컴파일됨
    Tool: Bash
    Preconditions: Task 1 파일 생성 완료
    Steps:
      1. npx tsc --noEmit src/lib/bulk-rewrite/types.ts
      2. 에러 없이 완료 확인
    Expected Result: exit code 0, 에러 메시지 없음
    Failure Indicators: TypeScript compilation error
    Evidence: .sisyphus/evidence/task-1-typecheck.txt

  Scenario: 타입이 올바르게 export됨
    Tool: Bash (bun)
    Preconditions: 타입 파일 존재
    Steps:
      1. bun -e "import { BulkRewriteRequest, BulkRewriteResult, BulkRewriteProgress } from './src/lib/bulk-rewrite/types'; console.log('OK')"
      2. 'OK' 출력 확인
    Expected Result: 'OK' 출력, exit code 0
    Failure Indicators: import error, missing export
    Evidence: .sisyphus/evidence/task-1-import-check.txt
  ```

  **Commit**: YES
  - Message: `feat(bulk-rewrite): add type definitions`
  - Files: `src/lib/bulk-rewrite/types.ts`
  - Pre-commit: `npm run typecheck`

- [x] 2. Bulk Rewrite 핵심 비즈니스 로직

  **What to do**:
  - `src/lib/bulk-rewrite/bulkRewrite.ts` 생성
  - **executeBulkRewrite(request, onProgress?)** 함수:
    1. `request.sentences`를 score 내림차순 정렬
    2. 이미 appliedReplacements에 있는 sentenceIndex는 스킵 (수동 변경 보존)
    3. score >= 0.4 (medium risk 이상)인 문장만 리라이트 대상
    4. score 전부 target 이하면 즉시 반환: `{ rewrites: {}, achievedScore: currentScore, iterations: 0, totalRewritten: 0, targetMet: true }`
    5. 대상 문장을 5개씩 병렬 LLM 호출 (p-limit 또는 수동 concurrency limiter)
    6. `generateSingleSuggestion` (from `src/lib/suggestions/llm.ts`) 호출
    7. 각 결과에 `applyGuardrails` 적용 — 통과한 것만 rewrites에 추가
    8. LLM 실패(null 반환) 시 해당 문장 스킵, 다음 문장 계속
    9. 한 라운드 완료 후: 리라이트된 문장을 원본 텍스트에 적용 → Sapling 재분석 호출 (analyzeText)
    10. achievedScore <= targetScore이면 성공, 아니면 다음 라운드
    11. 최대 3회 반복 — 각 라운드에서 남은 높은 score 문장 재리라이트
    12. 최종 결과 반환
  - **concurrency limiter**: Promise 기반, 동시 실행 5개 제한 (p-limit 패키지 또는 자체 구현)
  - **deriveTextWithRewrites(originalSentences, rewrites)** 헬퍼: 기존 deriveRevisedText 패턴 참고

  **Must NOT do**:
  - generateAlternativeSuggestions 사용 금지 (3개 대안 반환) — generateSingleSuggestion만 사용
  - Sapling을 문장별로 호출 금지 — 라운드별 1회만
  - 기존 llm.ts, sapling.ts 파일 수정 금지
  - 외부 라이브러리 설치 금지 (p-limit 등) — 자체 concurrency limiter 구현

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 재시도 루프, 동시성 제어, 에러 핸들링 등 복잡한 비즈니스 로직
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None — 순수 비즈니스 로직 모듈

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1, types만 의존)
  - **Parallel Group**: Wave 1 (with Tasks 1, 3) — 단, Task 1 완료 후 시작
  - **Blocks**: Tasks 4, 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/lib/suggestions/llm.ts:generateSingleSuggestion` (약 line 200~250) — 단일 문장 리라이트 함수. 시그니처: `(sentence, score, voiceProfile?) => Promise<{rewrite, explanation} | null>`
  - `src/lib/suggestions/llm.ts:generateAlternativeSuggestions` (약 line 260~320) — 참고만 (사용 금지). retry 패턴과 에러 핸들링 참고
  - `src/lib/review/revisedAnalysisReducer.ts:deriveRevisedText` — 문장 교체 → 전체 텍스트 재구성 패턴
  - `src/lib/suggestions/guardrails.ts:applyGuardrails` — 리라이트 안전 필터. 반드시 적용

  **API/Type References**:
  - `src/lib/bulk-rewrite/types.ts` — BulkRewriteRequest, BulkRewriteResult, BulkRewriteProgress (Task 1에서 생성)
  - `src/lib/detection/types.ts:DetectionResult` — Sapling 분석 결과 타입
  - `src/lib/analysis/analyzeText.ts:analyzeText` — 텍스트 재분석 함수 (Sapling 호출)

  **External References**:
  - p-limit concurrency limiter 패턴: https://github.com/sindresorhus/p-limit — 자체 구현 시 참고

  **WHY Each Reference Matters**:
  - `generateSingleSuggestion`: 벌크 리라이트의 핵심 primitive. 이 함수를 문장별로 호출
  - `deriveRevisedText`: 교체된 문장 → 전체 텍스트 재구성 로직을 동일하게 따라야 Sapling 재분석이 올바르게 작동
  - `applyGuardrails`: 안전 필터 — LLM이 "avoid detection" 같은 문구 생성 시 차단
  - `analyzeText`: 라운드별 재분석에 사용 — 현재 score 확인

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 높은 score 문장 우선 리라이트
    Tool: Bash (bun test)
    Preconditions: Mock LLM이 항상 성공 반환, Mock Sapling이 0.3 반환
    Steps:
      1. sentences = [{sentence:"AI text", score:0.95, sentenceIndex:0}, {sentence:"human text", score:0.1, sentenceIndex:1}, {sentence:"AI text 2", score:0.8, sentenceIndex:2}]
      2. executeBulkRewrite({sentences, targetScore:0.4, text:"..."})
      3. rewrites 결과에 index 0, 2만 포함 확인 (score 0.1인 index 1은 스킵)
    Expected Result: rewrites에 key 0, 2만 존재. key 1 없음
    Failure Indicators: index 1이 rewrites에 포함됨
    Evidence: .sisyphus/evidence/task-2-priority-sort.txt

  Scenario: 자동 재시도 동작 확인
    Tool: Bash (bun test)
    Preconditions: Mock Sapling이 1차에 0.6, 2차에 0.35 반환
    Steps:
      1. executeBulkRewrite({sentences, targetScore:0.4, text:"..."})
      2. iterations === 2 확인
      3. targetMet === true 확인
    Expected Result: iterations: 2, targetMet: true
    Failure Indicators: iterations: 1 또는 targetMet: false
    Evidence: .sisyphus/evidence/task-2-retry-loop.txt

  Scenario: 최대 3회 후 중단 + 미달성 메시지
    Tool: Bash (bun test)
    Preconditions: Mock Sapling이 항상 0.7 반환 (target 0.3 불가능)
    Steps:
      1. executeBulkRewrite({sentences, targetScore:0.3, text:"..."})
      2. iterations === 3 확인
      3. targetMet === false 확인
      4. achievedScore === 0.7 확인
    Expected Result: iterations: 3, targetMet: false, achievedScore: 0.7
    Failure Indicators: iterations > 3 또는 무한 루프
    Evidence: .sisyphus/evidence/task-2-max-retry.txt

  Scenario: 병렬 호출 concurrency 5 제한
    Tool: Bash (bun test)
    Preconditions: 10개 문장, Mock LLM에 동시 실행 카운터 추가
    Steps:
      1. 동시 실행 중인 LLM 호출 수 추적
      2. executeBulkRewrite 실행
      3. 최대 동시 실행 수 === 5 확인
    Expected Result: 동시 실행 수가 5를 초과하지 않음
    Failure Indicators: 동시 실행 수 > 5
    Evidence: .sisyphus/evidence/task-2-concurrency.txt

  Scenario: LLM 실패 시 해당 문장 스킵
    Tool: Bash (bun test)
    Preconditions: Mock LLM이 index 0에서 null 반환, index 2에서 성공
    Steps:
      1. executeBulkRewrite 실행
      2. rewrites에 index 0 없음, index 2 있음 확인
    Expected Result: index 0 스킵, index 2 리라이트됨
    Failure Indicators: 에러 throw 또는 index 0이 rewrites에 포함
    Evidence: .sisyphus/evidence/task-2-llm-failure-skip.txt
  ```

  **Commit**: YES
  - Message: `feat(bulk-rewrite): implement core rewrite loop with retry`
  - Files: `src/lib/bulk-rewrite/bulkRewrite.ts`
  - Pre-commit: `npm run typecheck`

- [x] 3. TargetScorePanel UI 컴포넌트

  **What to do**:
  - `src/components/TargetScorePanel.tsx` 생성
  - **구성 요소**:
    1. "Target Score" 라벨
    2. 숫자 입력 (type="number", min=10, max=100, step=1, placeholder="40")
    3. "Rewrite to Target" 버튼
    4. 입력 검증: 10 미만 또는 100 초과 시 인라인 에러 ("Minimum target is 10%" / "Maximum target is 100%")
    5. 프로그레스 바: 벌크 진행 중 표시 — "Rewriting 3/15 sentences..." + Tailwind width 기반 바
    6. 결과 메시지: 성공 시 "Score reduced to XX%!" / 미달성 시 "Best achieved: XX% (target: YY%). Try editing individual sentences."
    7. 진행 중 입력 + 버튼 disabled
  - **Props**: `{ onRewrite: (targetScore: number) => Promise<void>, isLoading: boolean, progress: {current: number, total: number, phase: string} | null, result: {achievedScore: number, targetMet: boolean, targetScore: number} | null, disabled: boolean }`
  - **스타일**: 기존 VoiceProfilePanel의 `<section>` 스타일과 일관성 유지 (Tailwind)
  - `data-testid` 속성: `target-score-input`, `bulk-rewrite-btn`, `bulk-progress-bar`, `bulk-result-message`

  **Must NOT do**:
  - 서드파티 프로그레스 라이브러리 설치 금지
  - 기존 VoiceProfilePanel 컴포넌트 수정 금지
  - 상태 관리 로직 포함 금지 — props로만 제어 (presentational component)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI 컴포넌트 생성, Tailwind 스타일링, 반응형 레이아웃
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: 이 태스크에서는 컴포넌트 생성만, E2E는 Task 6에서

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2) — 단, Task 1 완료 후 시작
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/components/VoiceProfilePanel.tsx` — 전체 파일. `<section>` 구조, Tailwind 클래스, 버튼 스타일, disabled 상태 패턴을 동일하게 따라야 함
  - `src/components/ReviewPanel.tsx` — 프로그레스/로딩 상태 패턴 참고 (animate-pulse 사용 여부)

  **API/Type References**:
  - `src/lib/bulk-rewrite/types.ts` — BulkRewriteProgress, BulkRewriteResult 타입 (Task 1에서 생성)

  **WHY Each Reference Matters**:
  - `VoiceProfilePanel.tsx`: 바로 위에 배치되므로 시각적 일관성이 핵심. 동일한 padding, border, heading 스타일
  - `ReviewPanel.tsx`: 로딩 상태 UI 패턴을 프로젝트 전체에서 일관되게 유지

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 입력 검증 — 10 미만
    Tool: Playwright
    Preconditions: 앱 실행 중, 분석 완료 상태
    Steps:
      1. `[data-testid="target-score-input"]`에 "5" 입력
      2. `[data-testid="bulk-rewrite-btn"]`이 disabled인지 확인
      3. 인라인 에러 텍스트 "Minimum target is 10%" 존재 확인
    Expected Result: 버튼 disabled, 에러 메시지 표시
    Failure Indicators: 버튼 enabled 또는 에러 메시지 없음
    Evidence: .sisyphus/evidence/task-3-validation-min.png

  Scenario: 입력 검증 — 100 초과
    Tool: Playwright
    Preconditions: 앱 실행 중, 분석 완료 상태
    Steps:
      1. `[data-testid="target-score-input"]`에 "101" 입력
      2. `[data-testid="bulk-rewrite-btn"]`이 disabled인지 확인
      3. 인라인 에러 텍스트 "Maximum target is 100%" 존재 확인
    Expected Result: 버튼 disabled, 에러 메시지 표시
    Failure Indicators: 버튼 enabled 또는 에러 메시지 없음
    Evidence: .sisyphus/evidence/task-3-validation-max.png

  Scenario: 프로그레스 바 표시
    Tool: Playwright
    Preconditions: 벌크 리라이트 진행 중 (mocked)
    Steps:
      1. `[data-testid="bulk-progress-bar"]` 존재 확인
      2. 텍스트에 "Rewriting" 포함 확인
      3. 프로그레스 바 width가 0%~100% 사이
    Expected Result: 프로그레스 바 visible, 텍스트 정상
    Failure Indicators: 프로그레스 바 hidden 또는 텍스트 없음
    Evidence: .sisyphus/evidence/task-3-progress-bar.png

  Scenario: 진행 중 입력/버튼 disabled
    Tool: Playwright
    Preconditions: 벌크 리라이트 진행 중
    Steps:
      1. `[data-testid="target-score-input"]`가 disabled 확인
      2. `[data-testid="bulk-rewrite-btn"]`가 disabled 확인
    Expected Result: 둘 다 disabled
    Failure Indicators: 어느 하나라도 enabled
    Evidence: .sisyphus/evidence/task-3-disabled-during-run.png
  ```

  **Commit**: YES
  - Message: `feat(bulk-rewrite): add TargetScorePanel UI component`
  - Files: `src/components/TargetScorePanel.tsx`
  - Pre-commit: `npm run typecheck && npm run lint`

- [x] 4. /api/bulk-rewrite API 엔드포인트

  **What to do**:
  - `src/app/api/bulk-rewrite/route.ts` 생성
  - **POST 핸들러**:
    1. Request body 파싱: `{ sentences, targetScore, voiceProfile?, text }`
    2. 검증: targetScore 10~100 정수, sentences 배열 비어있지 않음, text 비어있지 않음
    3. COACHING_LLM_API_KEY 체크 — 없으면 503 `{ error: 'COACHING_LLM_NOT_CONFIGURED' }`
    4. `executeBulkRewrite()` 호출 (from bulk-rewrite/bulkRewrite.ts)
    5. 성공 응답: `{ rewrites, achievedScore, iterations, totalRewritten, targetMet }`
    6. 에러 핸들링: LLM/Sapling 에러 시 500 + 에러 메시지
  - **Runtime**: `export const runtime = 'nodejs'` (기존 analyze route와 동일)
  - **maxDuration**: 60 (Vercel Pro 타임아웃 고려)

  **Must NOT do**:
  - 기존 /api/suggestions/route.ts 또는 /api/analyze/route.ts 수정 금지
  - Request body에 file upload 지원 금지 — text만 받음
  - 스트리밍 응답 금지 — 단일 JSON 응답

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: API 라우트 + 검증 + 에러 핸들링 — 중간 복잡도
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Task 1, 2 필요)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/app/api/suggestions/route.ts` — 전체 파일. API 라우트 패턴: request 파싱, 검증, COACHING_LLM_API_KEY 체크, 에러 핸들링. 이 패턴을 그대로 따름
  - `src/app/api/analyze/route.ts` — runtime export, maxDuration 설정 패턴
  - `src/app/api/analyze/revised/route.ts` — text-only POST 패턴 (파일 아닌 텍스트 받기)

  **API/Type References**:
  - `src/lib/bulk-rewrite/types.ts` — BulkRewriteRequest, BulkRewriteResult
  - `src/lib/bulk-rewrite/bulkRewrite.ts` — executeBulkRewrite 함수

  **WHY Each Reference Matters**:
  - `suggestions/route.ts`: COACHING_LLM_API_KEY 체크 패턴을 동일하게 사용, 503 응답 포맷 일치
  - `analyze/route.ts`: Next.js runtime + maxDuration 설정 패턴
  - `analyze/revised/route.ts`: text POST body 파싱 패턴

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 정상 벌크 리라이트 API 호출
    Tool: Bash (curl)
    Preconditions: dev 서버 실행 중, COACHING_LLM_API_KEY 설정됨
    Steps:
      1. curl -X POST http://localhost:3000/api/bulk-rewrite -H "Content-Type: application/json" -d '{"sentences":[{"sentence":"This is AI text","score":0.9,"sentenceIndex":0}],"targetScore":40,"text":"This is AI text"}'
      2. HTTP 200 확인
      3. 응답 body에 rewrites, achievedScore, iterations, targetMet 필드 존재 확인
    Expected Result: 200 OK, JSON body with all required fields
    Failure Indicators: 500, 400, 또는 필드 누락
    Evidence: .sisyphus/evidence/task-4-api-success.txt

  Scenario: COACHING_LLM_API_KEY 미설정 시 503
    Tool: Bash (curl)
    Preconditions: COACHING_LLM_API_KEY 환경변수 제거
    Steps:
      1. curl -X POST http://localhost:3000/api/bulk-rewrite -H "Content-Type: application/json" -d '{"sentences":[],"targetScore":40,"text":"test"}'
      2. HTTP 503 확인
      3. 응답 body에 error 필드 확인
    Expected Result: 503, { error: 'COACHING_LLM_NOT_CONFIGURED' }
    Failure Indicators: 200 또는 다른 에러 코드
    Evidence: .sisyphus/evidence/task-4-api-no-key.txt

  Scenario: 잘못된 targetScore (5) → 400
    Tool: Bash (curl)
    Preconditions: dev 서버 실행 중
    Steps:
      1. curl -X POST http://localhost:3000/api/bulk-rewrite -H "Content-Type: application/json" -d '{"sentences":[],"targetScore":5,"text":"test"}'
      2. HTTP 400 확인
    Expected Result: 400 Bad Request
    Failure Indicators: 200 또는 500
    Evidence: .sisyphus/evidence/task-4-api-validation.txt
  ```

  **Commit**: YES
  - Message: `feat(bulk-rewrite): add /api/bulk-rewrite endpoint`
  - Files: `src/app/api/bulk-rewrite/route.ts`
  - Pre-commit: `npm run typecheck`

- [x] 5. page.tsx 통합 — TargetScorePanel 배치 + 상태 연결

  **What to do**:
  - `src/app/page.tsx` 수정
  - **배치**: VoiceProfilePanel `<section>` 바로 아래에 `<TargetScorePanel>` 렌더
  - **상태 관리**:
    1. `const [bulkLoading, setBulkLoading] = useState(false)`
    2. `const [bulkProgress, setBulkProgress] = useState<{current, total, phase} | null>(null)`
    3. `const [bulkResult, setBulkResult] = useState<{achievedScore, targetMet, targetScore} | null>(null)`
  - **onRewrite 핸들러**:
    1. setBulkLoading(true), setBulkResult(null)
    2. fetch('/api/bulk-rewrite', { method: 'POST', body: JSON.stringify({ sentences: result.sentences, targetScore: targetScore / 100, voiceProfile, text: result.text }) })
    3. 프로그레스 업데이트 — 서버가 단일 응답이므로 클라이언트 사이드 예상 진행률 표시 (rewrite 대상 문장 수 기반)
    4. 응답 받으면: rewrites를 하나씩 revisedAnalysisReducer에 APPLY_REPLACEMENT 디스패치
    5. 모든 교체 적용 후 /api/analyze/revised 호출하여 재분석
    6. setBulkResult, setBulkLoading(false)
  - **기존 수동 리라이트 보존**: APPLY_REPLACEMENT 전에 이미 appliedReplacements에 있는 index는 스킵
  - **disabled 조건**: result가 없거나 bulkLoading 중이면 disabled

  **Must NOT do**:
  - ReviewPanel, RevisedReviewPanel, VoiceProfilePanel의 props interface 변경 금지
  - 기존 useRevisedAnalysisState 훅 수정 금지 — dispatch만 사용
  - 새 context/provider 생성 금지 — page 레벨 state로 충분

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 기존 페이지에 새 컴포넌트 통합, 상태 연결, API 호출 조합
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Task 1, 3, 4 필요)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 3, 4

  **References**:

  **Pattern References**:
  - `src/app/page.tsx` — 전체 파일. VoiceProfilePanel 배치 위치, result 조건 렌더링, useRevisedAnalysisState 사용 패턴, fetch 호출 패턴
  - `src/app/useRevisedAnalysisState.ts` — 전체 파일. dispatch 사용법, APPLY_REPLACEMENT 액션 디스패치 패턴

  **API/Type References**:
  - `src/lib/review/revisedAnalysisReducer.ts` — RevisedAnalysisAction 타입, APPLY_REPLACEMENT 액션 구조: `{ type: 'APPLY_REPLACEMENT', sentenceIndex: number, replacement: string }`
  - `src/lib/bulk-rewrite/types.ts` — BulkRewriteResult
  - `src/components/TargetScorePanel.tsx` — TargetScorePanel props (Task 3에서 생성)

  **WHY Each Reference Matters**:
  - `page.tsx`: VoiceProfilePanel 바로 아래에 배치해야 하므로 정확한 JSX 위치 파악 필수
  - `useRevisedAnalysisState.ts`: 벌크 결과를 기존 상태에 통합하는 핵심 — dispatch 함수 사용법
  - `revisedAnalysisReducer.ts`: APPLY_REPLACEMENT 액션의 정확한 구조 — 벌크 결과를 이 액션으로 하나씩 적용

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TargetScorePanel이 VoiceProfile 아래에 렌더됨
    Tool: Playwright
    Preconditions: 문서 업로드 + 분석 완료
    Steps:
      1. page.goto('http://localhost:3000')
      2. 문서 업로드 → 분석 완료 대기
      3. `[data-testid="target-score-input"]` visible 확인
      4. VoiceProfilePanel과 TargetScorePanel의 DOM 순서 확인 (voice가 먼저)
    Expected Result: TargetScorePanel이 VoiceProfilePanel 아래에 표시됨
    Failure Indicators: TargetScorePanel 미표시 또는 순서 역전
    Evidence: .sisyphus/evidence/task-5-layout.png

  Scenario: 벌크 리라이트 → Revised Analysis 표시
    Tool: Playwright
    Preconditions: 분석 완료, COACHING_LLM_API_KEY 설정
    Steps:
      1. `[data-testid="target-score-input"]`에 "40" 입력
      2. `[data-testid="bulk-rewrite-btn"]` 클릭
      3. 프로그레스 바 표시 확인 (로딩 중)
      4. 완료 후 `[data-testid="bulk-result-message"]` 표시 확인
      5. RevisedReviewPanel에 수정된 텍스트와 새 score 표시 확인
    Expected Result: Revised Analysis 패널에 리라이트 결과 표시, score 변경
    Failure Indicators: Revised panel 미업데이트, 에러 표시
    Evidence: .sisyphus/evidence/task-5-bulk-complete.png

  Scenario: 벌크 후 개별 문장 클릭 리라이트 동작
    Tool: Playwright
    Preconditions: 벌크 리라이트 완료 상태
    Steps:
      1. ReviewPanel에서 하이라이트된 문장 하나 클릭
      2. suggestion 팝오버가 정상 표시 확인
      3. 대안 중 하나 선택 ("Apply" 클릭)
      4. RevisedReviewPanel 업데이트 확인
    Expected Result: 기존 개별 리라이트 기능이 벌크 후에도 정상 동작
    Failure Indicators: 팝오버 미표시 또는 적용 실패
    Evidence: .sisyphus/evidence/task-5-individual-after-bulk.png

  Scenario: 기존 수동 리라이트 보존
    Tool: Playwright
    Preconditions: 분석 완료
    Steps:
      1. ReviewPanel에서 문장 1개 수동 리라이트 적용
      2. `[data-testid="target-score-input"]`에 "40" 입력
      3. `[data-testid="bulk-rewrite-btn"]` 클릭
      4. 완료 후 수동 리라이트한 문장이 변경되지 않았는지 확인 (RevisedReviewPanel에서)
    Expected Result: 수동으로 바꾼 문장은 벌크에 의해 덮어쓰이지 않음
    Failure Indicators: 수동 리라이트 문장이 다른 텍스트로 변경됨
    Evidence: .sisyphus/evidence/task-5-manual-preserved.png
  ```

  **Commit**: YES
  - Message: `feat(bulk-rewrite): integrate TargetScorePanel into main page`
  - Files: `src/app/page.tsx`
  - Pre-commit: `npm run typecheck && npm run lint`

- [x] 6. 유닛 및 통합 테스트

  **What to do**:
  - `src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts` 생성:
    1. executeBulkRewrite — 높은 score 우선 리라이트 테스트
    2. executeBulkRewrite — 재시도 루프 (iterations 확인)
    3. executeBulkRewrite — 최대 3회 후 중단
    4. executeBulkRewrite — LLM null 반환 시 스킵
    5. executeBulkRewrite — 이미 target 이하면 즉시 반환
    6. executeBulkRewrite — concurrency 5 제한
    7. executeBulkRewrite — guardrails 적용 (banned phrase 필터)
  - `src/components/__tests__/TargetScorePanel.test.tsx` 생성:
    1. 입력 검증 (min 10, max 100)
    2. disabled 상태 동작
    3. 프로그레스 바 렌더
    4. 결과 메시지 표시 (성공/미달성)
    5. data-testid 존재 확인
  - Mock 전략: LLM 함수와 Sapling 분석 함수를 vi.mock으로 모킹
  - 기존 테스트 패턴 따르기

  **Must NOT do**:
  - 기존 테스트 파일 수정 금지
  - E2E 테스트는 이 태스크에 포함하지 않음 — Final QA(F3)에서 Playwright로 실행
  - 실제 API 호출하는 테스트 금지 — 모두 mock

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 모킹 전략 + 다양한 시나리오 커버 필요
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (모든 구현 태스크 완료 후)
  - **Parallel Group**: Wave 2 (마지막)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1, 2, 3, 4, 5

  **References**:

  **Pattern References**:
  - `src/lib/analysis/__tests__/` — 기존 테스트 디렉토리 구조, vi.mock 사용 패턴
  - `src/components/__tests__/` — 컴포넌트 테스트 패턴 (React Testing Library 사용 여부 확인)

  **API/Type References**:
  - `src/lib/bulk-rewrite/bulkRewrite.ts` — executeBulkRewrite 함수 시그니처
  - `src/lib/bulk-rewrite/types.ts` — 모든 타입
  - `src/components/TargetScorePanel.tsx` — TargetScorePanel props

  **External References**:
  - vitest mock 문서: https://vitest.dev/guide/mocking

  **WHY Each Reference Matters**:
  - 기존 `__tests__/` 디렉토리: 파일 배치, import 패턴, mock 설정 패턴을 동일하게 따라야 기존 test runner config와 호환
  - `bulkRewrite.ts`: 테스트 대상 함수의 정확한 시그니처와 반환 타입 필요
  - `TargetScorePanel.tsx`: 컴포넌트 props를 알아야 정확한 렌더 테스트 가능

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: 모든 유닛 테스트 통과
    Tool: Bash
    Preconditions: Tasks 1-5 구현 완료
    Steps:
      1. bun test src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts
      2. bun test src/components/__tests__/TargetScorePanel.test.tsx
      3. 모든 테스트 PASS 확인
    Expected Result: All tests pass, exit code 0
    Failure Indicators: 1개 이상 FAIL
    Evidence: .sisyphus/evidence/task-6-unit-tests.txt

  Scenario: 전체 테스트 스위트 통과 (기존 + 신규)
    Tool: Bash
    Preconditions: Tasks 1-5 구현 완료
    Steps:
      1. bun test
      2. 기존 테스트 + 신규 테스트 모두 PASS 확인
      3. 기존 테스트 깨지지 않음 확인
    Expected Result: 전체 test suite pass, 0 failures
    Failure Indicators: 기존 테스트 FAIL (regression)
    Evidence: .sisyphus/evidence/task-6-full-suite.txt
  ```

  **Commit**: YES
  - Message: `test(bulk-rewrite): add unit and integration tests`
  - Files: `src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts`, `src/components/__tests__/TargetScorePanel.test.tsx`
  - Pre-commit: `bun test`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npx tsc --noEmit` + `npm run lint` + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: empty state, invalid input. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After Task | Commit Message | Files | Pre-commit |
|-----------|---------------|-------|------------|
| 1 | `feat(bulk-rewrite): add type definitions` | `src/lib/bulk-rewrite/types.ts` | `npm run typecheck` |
| 2 | `feat(bulk-rewrite): implement core rewrite loop with retry` | `src/lib/bulk-rewrite/bulkRewrite.ts` | `npm run typecheck` |
| 3 | `feat(bulk-rewrite): add TargetScorePanel UI component` | `src/components/TargetScorePanel.tsx` | `npm run typecheck && npm run lint` |
| 4 | `feat(bulk-rewrite): add /api/bulk-rewrite endpoint` | `src/app/api/bulk-rewrite/route.ts` | `npm run typecheck` |
| 5 | `feat(bulk-rewrite): integrate TargetScorePanel into main page` | `src/app/page.tsx` | `npm run typecheck && npm run lint` |
| 6 | `test(bulk-rewrite): add unit and integration tests` | `src/lib/bulk-rewrite/__tests__/*`, `src/components/__tests__/*` | `bun test` |

---

## Success Criteria

### Verification Commands
```bash
npm run typecheck  # Expected: no errors
npm run lint       # Expected: no errors
bun test           # Expected: all pass
npm run dev        # Expected: starts without errors
```

### Final Checklist
- [ ] Target Score 입력 → 벌크 리라이트 실행 → Revised Analysis 표시
- [ ] 높은 score 우선, 자동 재시도, 프로그레스 바 동작
- [ ] 벌크 후 개별 문장 편집 가능
- [ ] 기존 수동 리라이트 보존
- [ ] 기존 컴포넌트 props 미변경
- [ ] 모든 테스트 pass
- [ ] typecheck + lint pass
