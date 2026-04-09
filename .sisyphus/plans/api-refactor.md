# AI Detector: Dual Detection Provider Refactor (Sapling + Copyleaks)

## TL;DR

> **Quick Summary**: Sapling(sentence-level) + Copyleaks(document-level) 이중 감지 구조로 전환. 하나만 제공해도 동작하고, 둘 다 제공 시 각 강점 활용.
>
> **Deliverables**:
> - `CopyleaksDetectionAdapter` (신규) — Copyleaks AI Detection API 통합
> - `CompositeDetectionAdapter` (신규) — Sapling+Copyleaks 조합 또는 단일 폴백 처리
> - `mapCopyleaksResultsToSentences()` 유틸 함수 (신규) — Copyleaks section을 sentence scores로 변환
> - `AppSettings` 타입 확장 — `copyleaksEmail`, `copyleaksApiKey` 추가
> - `SettingsModal` UI 업데이트 — Copyleaks 섹션 추가 (email + API key)
> - `requestSettings.ts` + `buildRequestHeaders()` 업데이트 — Copyleaks 헤더 추가
> - `analyzeText.ts` 팩토리 로직 교체 — 가용 키 기반 어댑터 선택
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (types) → Task 3 (Copyleaks adapter) → Task 5 (composite adapter) → Task 6 (factory 교체) → Task 7 (UI) → Final Verification

---

## Context

### Original Request
sentence 분석은 sapling, document 전체는 copyleaks, rewrite은 claude나 openai를 사용. 유저가 sapling이나 copyleaks 둘 중 하나만 제공해도 작동하고, 둘 다 제공하면 sentence는 sapling, document 전체는 copyleaks가 사용되게 수정.

### Interview Summary
**Key Discussions**:
- Claude 통합 방식: `@anthropic-ai/sdk` 패키지 (Claude adapter가 이미 존재함 — `src/lib/suggestions/adapters/anthropic.ts`)
- API key 입력 방식: UI에서 직접 입력 (세션별), localStorage 저장

**Research Findings**:
- Copyleaks API: `POST https://api.copyleaks.com/v2/writer-detector/{scanId}/check` — Bearer token 필요
- Copyleaks 인증: 2단계 (login with email+apikey → Bearer token → scan)
- 토큰 유효기간: 48시간. 재로그인 rate limit: 12회/15분
- Copyleaks 응답: `summary.ai` (0-1), `results[]` with `classification` (1=human, 2=AI) + `matches[].text.chars` 위치 정보
- Copyleaks 텍스트 제한: 255~25,000자 (앱 현재 최솟값 300자 > 255이므로 하한 guard 불필요, 상한 25,000 guard 필요)
- `results[].probability` DEPRECATED (2026년 7월 삭제 예정) — 사용 금지
- Claude adapter 이미 존재. `@anthropic-ai/sdk` 설치 여부 확인 필요

### Metis Review
**Identified Gaps** (addressed):
- Copyleaks 토큰 캐싱 전략 필요 — module scope 캐싱, `{email+apiKey}` 키로 캐시 (rate limit 12회/15분 대응)
- `sensitivity: 2` 하드코딩 (사용자 노출 불필요)
- `explain: false` 명시 (비용 절감)
- `sandbox` 모드 지원 필요 — `COPYLEAKS_SANDBOX` env var
- `probability` 필드 사용 금지 (deprecated)
- Copyleaks-only 모드의 sentence 매핑 알고리즘 정의
- 25,000자 초과 guard 추가 (Copyleaks 어댑터 내부)

---

## Work Objectives

### Core Objective
감지 제공자를 단일 선택에서 "가용 API키에 따른 자동 조합" 모델로 전환. Sapling이 있으면 sentence-level, Copyleaks가 있으면 document-level, 둘 다 있으면 역할 분담, 하나만 있으면 해당 API가 전부 처리.

### Concrete Deliverables
- `src/lib/detection/copyleaks.ts` — 신규
- `src/lib/detection/copyleaks-sentences.ts` — 신규 (sentence 매핑 유틸)
- `src/lib/detection/composite.ts` — 신규
- `src/lib/detection/index.ts` — 업데이트 (exports)
- `src/lib/settings/types.ts` — 업데이트
- `src/lib/api/requestSettings.ts` — 업데이트
- `src/hooks/useSettings.ts` — 업데이트
- `src/lib/analysis/analyzeText.ts` — 팩토리 로직 교체
- `src/components/SettingsModal.tsx` — Copyleaks 섹션 추가

### Definition of Done
- [ ] Sapling key만 있으면: 기존과 동일하게 sentence + overall score 제공
- [ ] Copyleaks key(email+apikey)만 있으면: document score + sentence score 파생 제공
- [ ] 둘 다 있으면: Sapling → sentences, Copyleaks → document score, 결합
- [ ] 둘 다 없으면: 503 에러 (기존 동작 유지)
- [ ] TypeScript 빌드 오류 없음 (`npm run typecheck` PASS)
- [ ] 기존 테스트 통과 (`npm run test` PASS)

### Must Have
- Copyleaks 25,000자 초과 시 `DETECTION_FAILED` 에러
- Copyleaks 토큰 module-scope 캐싱 (48시간, `{email+apiKey}` 키)
- Copyleaks rate limit(429) 에러 시 명확한 에러 메시지
- `sensitivity: 2` 하드코딩
- `explain: false` (omit)
- `sandbox: boolean` 파라미터 지원, `COPYLEAKS_SANDBOX` env var
- `probability` 필드 미사용

### Must NOT Have (Guardrails)
- detection provider dropdown 제거 (기존 `detectionProvider` select — Copyleaks는 별도 섹션으로 분리)
- GPTZero/Originality/Winston stub 제거 금지 (기존 코드 터치 최소화)
- `explain: true` 사용 금지 (유료)
- `probability` 필드 사용 금지
- Copyleaks 설정을 기존 `detectionProvider` enum에 추가하지 말 것 — 별도 필드로 분리
- UI에서 `sensitivity` 노출 금지

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (npm run test, npm run typecheck)
- **Automated tests**: Tests-after (새로운 adapter/util 함수에 단위 테스트)
- **Framework**: 기존 프레임워크 사용

### QA Policy
모든 태스크에 Agent-Executed QA Scenarios 포함. 증거는 `.sisyphus/evidence/` 저장.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - foundation):
├── Task 1: AppSettings 타입 확장 + requestSettings 업데이트 [quick]
├── Task 2: @anthropic-ai/sdk 설치 확인 + package.json 업데이트 [quick]
└── Task 3: copyleaks-sentences.ts 유틸 함수 (순수 함수, 단위 테스트 포함) [quick]

Wave 2 (After Wave 1 - core adapters):
├── Task 4: CopyleaksDetectionAdapter 구현 [unspecified-high]
└── Task 5: CompositeDetectionAdapter 구현 + analyzeText.ts 팩토리 교체 [unspecified-high]

Wave 3 (After Wave 2 - UI + integration):
├── Task 6: SettingsModal UI + useSettings + buildRequestHeaders 업데이트 [visual-engineering]
└── Task 7: detection/index.ts exports 정리 + 통합 smoke test [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix
- **1**: None → blocks 4, 5
- **2**: None → blocks 4
- **3**: None → blocks 4
- **4**: 1, 2, 3 → blocks 5
- **5**: 1, 4 → blocks 7
- **6**: 1 → blocks 7
- **7**: 5, 6 → blocks FINAL
- **FINAL**: 7 → user okay

### Agent Dispatch Summary
- **Wave 1**: 3 tasks → `quick`, `quick`, `quick`
- **Wave 2**: 2 tasks → `unspecified-high`, `unspecified-high`
- **Wave 3**: 2 tasks → `visual-engineering`, `quick`
- **FINAL**: 4 tasks → `oracle`, `unspecified-high`, `unspecified-high`, `deep`

---

## TODOs

- [x] 1. AppSettings 타입 확장 + requestSettings/buildRequestHeaders 업데이트

  **What to do**:
  - `src/lib/settings/types.ts`: `AppSettings`에 `copyleaksEmail: string`, `copyleaksApiKey: string` 필드 추가
  - `DEFAULT_SETTINGS`에 `copyleaksEmail: ''`, `copyleaksApiKey: ''` 추가
  - `src/lib/api/requestSettings.ts`: `RequestSettings`에 `copyleaksEmail: string | undefined`, `copyleaksApiKey: string | undefined` 추가. `getRequestSettings()`에서 `x-copyleaks-email`, `x-copyleaks-api-key` 헤더 읽기 + `COPYLEAKS_EMAIL`, `COPYLEAKS_API_KEY` env var fallback
  - `src/hooks/useSettings.ts`: `buildRequestHeaders()`에 `x-copyleaks-email`, `x-copyleaks-api-key` 헤더 추가 (빈 문자열이면 omit)
  - `useSettings`의 `saveSettings`에서 `copyleaksEmail`, `copyleaksApiKey` trim 추가

  **Must NOT do**:
  - 기존 `detectionProvider` enum에 `'copyleaks'` 추가 금지 — Copyleaks는 별도 필드로 분리
  - GPTZero/Winston/Originality 관련 코드 터치 금지

  **Recommended Agent Profile**:
  > 타입 확장 + 헤더 파이핑 — 단순하지만 여러 파일을 정확하게 수정해야 함
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/lib/settings/types.ts:8-20` — AppSettings 타입 및 DEFAULT_SETTINGS 구조
  - `src/lib/api/requestSettings.ts:7-65` — RequestSettings + getRequestSettings 전체 패턴
  - `src/hooks/useSettings.ts:60-76` — buildRequestHeaders 헤더 추가 패턴

  **Acceptance Criteria**:
  - [ ] `AppSettings` 타입에 `copyleaksEmail: string`, `copyleaksApiKey: string` 존재
  - [ ] `DEFAULT_SETTINGS`에 두 필드 빈 문자열 기본값
  - [ ] `getRequestSettings()` 반환값에 `copyleaksEmail`, `copyleaksApiKey` 존재
  - [ ] `buildRequestHeaders()`가 `x-copyleaks-email`, `x-copyleaks-api-key` 헤더 포함 (비어있으면 omit)
  - [ ] `npm run typecheck` PASS

  **QA Scenarios**:
  ```
  Scenario: buildRequestHeaders가 Copyleaks 헤더 포함
    Tool: Bash (node/bun REPL or unit test)
    Steps:
      1. settings = { ...DEFAULT_SETTINGS, copyleaksEmail: 'test@example.com', copyleaksApiKey: 'abc123' }
      2. headers = buildRequestHeaders(settings)
      3. assert headers['x-copyleaks-email'] === 'test@example.com'
      4. assert headers['x-copyleaks-api-key'] === 'abc123'
    Expected Result: 두 헤더 모두 존재
    Evidence: .sisyphus/evidence/task-1-headers-included.txt

  Scenario: 빈 Copyleaks 필드면 헤더 omit
    Tool: Bash
    Steps:
      1. settings = { ...DEFAULT_SETTINGS, copyleaksEmail: '', copyleaksApiKey: '' }
      2. headers = buildRequestHeaders(settings)
      3. assert 'x-copyleaks-email' not in headers
      4. assert 'x-copyleaks-api-key' not in headers
    Expected Result: 두 헤더 모두 누락
    Evidence: .sisyphus/evidence/task-1-headers-omitted.txt
  ```

  **Commit**: YES (Wave 1과 함께)
  - Message: `feat(settings): extend AppSettings with Copyleaks credentials`

- [x] 2. @anthropic-ai/sdk 패키지 설치 확인

  **What to do**:
  - `package.json` 확인: `@anthropic-ai/sdk` 이미 설치되어 있는지 확인
  - 없으면: `npm install @anthropic-ai/sdk` 실행
  - `src/lib/suggestions/adapters/anthropic.ts` 파일 확인 — import 에러 없는지 검증
  - `npm run typecheck` 실행하여 anthropic adapter 관련 타입 오류 없는지 확인

  **Must NOT do**:
  - anthropic adapter 로직 수정 금지 (이미 존재함)
  - `package-lock.json` 외의 파일 수정 금지 (패키지 이미 존재 시)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:
  - `src/lib/suggestions/adapters/anthropic.ts` — 기존 Claude adapter (import 확인용)
  - `package.json` — 현재 dependencies

  **Acceptance Criteria**:
  - [ ] `npm run typecheck` 시 `@anthropic-ai/sdk` 관련 에러 없음
  - [ ] `src/lib/suggestions/adapters/anthropic.ts` import 정상

  **QA Scenarios**:
  ```
  Scenario: TypeScript 빌드 성공
    Tool: Bash
    Steps:
      1. npm run typecheck
    Expected Result: 0 errors
    Evidence: .sisyphus/evidence/task-2-typecheck.txt
  ```

  **Commit**: NO (Wave 1 마지막 태스크에 포함)

- [x] 3. copyleaks-sentences.ts 유틸 함수 구현 (순수 함수 + 단위 테스트)

  **What to do**:
  - `src/lib/detection/copyleaks-sentences.ts` 신규 파일 생성
  - `mapCopyleaksResultsToSentences(text: string, results: CopyleaksResult[]): DetectionSentenceResult[]` 함수 구현:
    1. 간단한 sentence splitter로 text를 문장 배열로 분리 (마침표/느낌표/물음표 기준)
    2. 각 문장의 character range를 원본 text에서 계산 (`indexOf` 기반, 순서대로 탐색)
    3. `results[]`에서 `classification === 2` (AI)인 항목의 `matches[].text.chars.starts[] + lengths[]`로 AI character range 추출
    4. 각 문장이 AI character range와 overlap하면 `score: 1.0`, human range overlap이면 `score: 0.0`, 겹치는 match 없으면 `score: 0.5`
  - 관련 타입(`CopyleaksResult` 인터페이스)도 이 파일 또는 `copyleaks.ts`에 정의
  - 단위 테스트 작성: fixture JSON으로 happy path + edge case (all AI, all human, no matches)

  **Must NOT do**:
  - 외부 NLP 라이브러리 추가 금지 — 간단한 regex sentence split으로 충분
  - `probability` 필드 사용 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:
  - `src/lib/detection/types.ts:11-22` — `DetectionSentenceResult` 타입 (반환 타입 기준)
  - Copyleaks API 응답 예시 (플랜 Context 섹션 참조) — `results[].classification`, `results[].matches[].text.chars.starts[]`, `.lengths[]`

  **Acceptance Criteria**:
  - [ ] `mapCopyleaksResultsToSentences` export 존재
  - [ ] all-AI fixture → 모든 문장 `score: 1.0`
  - [ ] all-human fixture → 모든 문장 `score: 0.0`
  - [ ] no-matches fixture → 모든 문장 `score: 0.5`
  - [ ] `npm run test` PASS (새 테스트 포함)

  **QA Scenarios**:
  ```
  Scenario: all-AI 텍스트 매핑
    Tool: Bash (npm run test)
    Steps:
      1. fixture: results = [{ classification: 2, matches: [{ text: { chars: { starts: [0], lengths: [100] } } }] }]
      2. text = 100자 텍스트 (2-3 문장)
      3. mapCopyleaksResultsToSentences(text, results) 호출
      4. 모든 문장 score === 1.0 assert
    Expected Result: 전 문장 score 1.0
    Evidence: .sisyphus/evidence/task-3-all-ai.txt

  Scenario: no-match 텍스트 → score 0.5
    Tool: Bash (npm run test)
    Steps:
      1. fixture: results = [] (빈 배열)
      2. mapCopyleaksResultsToSentences(text, []) 호출
      3. 모든 문장 score === 0.5 assert
    Expected Result: 전 문장 score 0.5
    Evidence: .sisyphus/evidence/task-3-no-match.txt
  ```

  **Commit**: NO (Wave 1 마지막 태스크에 포함)

- [x] 4. CopyleaksDetectionAdapter 구현

  **What to do**:
  - `src/lib/detection/copyleaks.ts` 신규 파일 생성
  - `CopyleaksDetectionAdapter implements DetectionAdapter` 클래스 구현:
    - 생성자: `{ email: string; apiKey: string; sandbox?: boolean }` 파라미터
    - module-scope 토큰 캐시: `Map<string, { token: string; expiresAt: number }>` — key는 `${email}:${apiKey}`
    - `getAuthToken()` private 메서드: 캐시 확인 → 만료 전(expiresAt - 60_000ms) 캐시 반환, 만료/없으면 re-login
    - Login: `POST https://id.copyleaks.com/v3/account/login/api` — `{ email, key: apiKey }` → `{ access_token, expires }` 응답
    - Login 429 → `FileProcessingError('DETECTION_FAILED', 'Copyleaks authentication rate limit exceeded. Please try again in 5 minutes.')`
    - `detect(text: string)` 메서드:
      1. text 길이 > 25,000자 → `FileProcessingError('DETECTION_FAILED', 'Text exceeds Copyleaks 25,000 character limit.')`
      2. `getAuthToken()` 호출
      3. scanId = `crypto.randomUUID()` (Node.js crypto 모듈 사용)
      4. `POST https://api.copyleaks.com/v2/writer-detector/{scanId}/check` — `{ text, sandbox: this.sandbox, sensitivity: 2 }` (explain 생략)
      5. 응답: `summary.ai` → `score`, `results[]` → `mapCopyleaksResultsToSentences(text, results)` → `sentences`
      6. 반환: `{ score: data.summary.ai, sentences }`
    - HTTP 에러 처리: 401 → auth 에러, 429 → rate limit 에러, 기타 → generic DETECTION_FAILED
  - `COPYLEAKS_SANDBOX` env var 지원: `process.env.COPYLEAKS_SANDBOX === 'true'`이면 sandbox 강제 활성화
  - 단위 테스트: login mock + scan mock 사용, 토큰 캐시 동작 검증 (2회 호출 → login 1회만)

  **Must NOT do**:
  - `probability` 필드 사용 금지
  - `explain: true` 전송 금지
  - `sensitivity` 사용자 파라미터화 금지 (2로 하드코딩)
  - `plagiarism-checker` npm 패키지 설치 금지 (fetch 직접 사용)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Task 1, 2, 3 완료 후)
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1, 2, 3

  **References**:
  - `src/lib/detection/sapling.ts` — 기존 adapter 패턴 (에러 처리, fetch 구조, timeout 패턴 참조)
  - `src/lib/detection/types.ts` — `DetectionAdapter`, `DetectionResult` 인터페이스
  - `src/lib/detection/copyleaks-sentences.ts` (Task 3 산출물) — `mapCopyleaksResultsToSentences` import
  - `src/lib/files/errors.ts` — `FileProcessingError` 사용 패턴
  - Copyleaks Login API: `POST https://id.copyleaks.com/v3/account/login/api` body: `{ email, key }`
  - Copyleaks Scan API: `POST https://api.copyleaks.com/v2/writer-detector/{scanId}/check` header: `Authorization: Bearer {token}`

  **Acceptance Criteria**:
  - [ ] `CopyleaksDetectionAdapter` export 존재, `DetectionAdapter` 인터페이스 구현
  - [ ] 25,001자 텍스트 → `DETECTION_FAILED` throw (에러 메시지에 '25,000' 포함)
  - [ ] login 2회 호출 시 토큰 캐시로 인해 실제 HTTP login은 1회만
  - [ ] login 429 → 명확한 rate limit 에러 메시지
  - [ ] `npm run test` PASS

  **QA Scenarios**:
  ```
  Scenario: 25,001자 텍스트 → 길이 초과 에러
    Tool: Bash (unit test)
    Steps:
      1. adapter = new CopyleaksDetectionAdapter({ email: 'x', apiKey: 'y' })
      2. await adapter.detect('a'.repeat(25001))
      3. expect throw FileProcessingError with message containing '25,000'
    Expected Result: 에러 throw
    Evidence: .sisyphus/evidence/task-4-length-guard.txt

  Scenario: 토큰 캐시 — 2회 detect() 호출 시 login 1회만
    Tool: Bash (unit test with fetch mock)
    Steps:
      1. fetch mock: login 응답 고정, scan 응답 고정
      2. adapter.detect(text1) 호출
      3. adapter.detect(text2) 호출
      4. login fetch 호출 횟수 assert === 1
    Expected Result: login 1회, scan 2회
    Evidence: .sisyphus/evidence/task-4-token-cache.txt

  Scenario: login 429 → rate limit 에러 메시지
    Tool: Bash (unit test)
    Steps:
      1. fetch mock: login → 429 응답
      2. adapter.detect(text) 호출
      3. expect throw message containing 'rate limit'
    Expected Result: rate limit 메시지 포함 에러
    Evidence: .sisyphus/evidence/task-4-rate-limit.txt
  ```

  **Commit**: NO (Wave 2 Task 5와 함께)

- [x] 5. CompositeDetectionAdapter 구현 + analyzeText.ts 팩토리 교체

  **What to do**:
  - `src/lib/detection/composite.ts` 신규 파일 생성
  - `CompositeDetectionAdapter implements DetectionAdapter` 구현:
    - 생성자: `{ sapling?: SaplingDetectionAdapter; copyleaks?: CopyleaksDetectionAdapter }`
    - `detect(text)` 로직:
      - **둘 다 있음**: Sapling.detect(text) + Copyleaks.detect(text) 병렬 실행 (`Promise.all`)
        → `score: copyleaksResult.summary.ai`, `sentences: saplingResult.sentences`
      - **Sapling만**: `return saplingAdapter.detect(text)` (기존과 동일)
      - **Copyleaks만**: `return copyleaksAdapter.detect(text)` (score + sentence 파생 포함)
      - **둘 다 없음**: `throw FileProcessingError('DETECTION_FAILED', 'No detection provider configured.')`
  - `src/lib/analysis/analyzeText.ts` 수정:
    - `createAnalysisDetectionAdapter()` 함수를 `createCompositeDetectionAdapter()` 또는 기존 함수 내부 로직 교체
    - `RequestSettings`에서 `saplingKey`, `copyleaksEmail`, `copyleaksApiKey` 읽어서 각 adapter 조건부 생성
    - `CompositeDetectionAdapter` 사용으로 팩토리 반환
    - 기존 GPTZero/Winston/Originality 분기도 유지 (단, 이 플랜에서는 건드리지 않고 기존 코드 옆에 새 composite 로직 추가)
  - `src/lib/detection/index.ts` 업데이트: `copyleaks`, `composite` exports 추가

  **Must NOT do**:
  - 기존 GPTZero/Winston/Originality adapter 코드 삭제 금지
  - `Promise.all` 대신 순차 실행 금지 (병렬로 호출해야 성능 최적)
  - `detectionProvider` enum 확장 금지

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Task 4 완료 후)
  - **Parallel Group**: Wave 2 (Task 4와 순차)
  - **Blocks**: Task 7
  - **Blocked By**: Task 4

  **References**:
  - `src/lib/detection/sapling.ts` — SaplingDetectionAdapter (import용)
  - `src/lib/detection/copyleaks.ts` (Task 4 산출물) — CopyleaksDetectionAdapter
  - `src/lib/analysis/analyzeText.ts:13-84` — 기존 팩토리 함수 전체 (수정 대상)
  - `src/lib/api/requestSettings.ts` — RequestSettings 타입 (Task 1 산출물 포함)
  - `src/lib/files/errors.ts` — FileProcessingError

  **Acceptance Criteria**:
  - [ ] `CompositeDetectionAdapter` export 존재
  - [ ] 둘 다 있을 때: Sapling sentences + Copyleaks score 결합
  - [ ] Sapling만: 기존과 동일한 DetectionResult
  - [ ] Copyleaks만: score + sentence 파생
  - [ ] 둘 다 없음: DETECTION_FAILED throw
  - [ ] `npm run typecheck` PASS

  **QA Scenarios**:
  ```
  Scenario: 둘 다 있을 때 병렬 호출 + 결합
    Tool: Bash (unit test with mocks)
    Steps:
      1. saplingMock.detect → { score: 0.6, sentences: [{ sentence: 'Hello', score: 0.9 }] }
      2. copyleaksMock.detect → { score: 0.8, sentences: [...] }
      3. composite.detect(text) 호출
      4. assert result.score === 0.8 (Copyleaks score)
      5. assert result.sentences[0].sentence === 'Hello' (Sapling sentences)
    Expected Result: score는 Copyleaks, sentences는 Sapling
    Evidence: .sisyphus/evidence/task-5-composite-both.txt

  Scenario: 둘 다 없음 → 에러
    Tool: Bash (unit test)
    Steps:
      1. composite = new CompositeDetectionAdapter({})
      2. await composite.detect(text)
      3. expect throw DETECTION_FAILED
    Expected Result: 에러 throw
    Evidence: .sisyphus/evidence/task-5-no-provider.txt
  ```

  **Commit**: YES (Wave 2 완료)
  - Message: `feat(detection): implement CopyleaksDetectionAdapter and CompositeDetectionAdapter`
  - Files: `src/lib/detection/copyleaks.ts`, `src/lib/detection/copyleaks-sentences.ts`, `src/lib/detection/composite.ts`, `src/lib/detection/index.ts`, `src/lib/analysis/analyzeText.ts`

- [x] 6. SettingsModal UI + useSettings + buildRequestHeaders 업데이트

  **What to do**:
  - `src/components/SettingsModal.tsx` 수정:
    - 기존 "AI Detection" 섹션 아래에 **별도 섹션** "Copyleaks (Document Detection)" 추가
    - `copyleaksEmail` input (type="email", placeholder="your@email.com")
    - `copyleaksApiKey` input (type="password", placeholder="Copyleaks API Key")
    - 기존 detection provider dropdown과 API key 입력은 **그대로 유지** (Sapling 등 기존 단일 provider용)
    - 섹션 설명 추가: "Provide both email and API key to enable document-level detection. If provided alongside Sapling, Copyleaks handles the overall score and Sapling handles sentence analysis."
    - `data-testid`: `copyleaks-email-input`, `copyleaks-api-key-input`
  - `src/hooks/useSettings.ts` 확인: Task 1에서 이미 `copyleaksEmail`, `copyleaksApiKey` trim이 추가되었는지 확인, 누락이면 추가

  **Must NOT do**:
  - 기존 detectionProvider dropdown 제거 금지
  - 기존 detection API key 입력 제거 금지
  - `sensitivity` UI 노출 금지

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Task 5와 병렬 가능, Task 1에만 의존)
  - **Parallel Group**: Wave 3 (with Task 7)
  - **Blocks**: Task 7
  - **Blocked By**: Task 1

  **References**:
  - `src/components/SettingsModal.tsx:88-124` — 기존 AI Detection 섹션 구조 (복사 기준)
  - `src/lib/settings/types.ts` (Task 1 산출물) — AppSettings 타입 (copyleaksEmail, copyleaksApiKey 포함)

  **Acceptance Criteria**:
  - [ ] SettingsModal에 Copyleaks email + API key 입력 필드 존재
  - [ ] 저장 시 `copyleaksEmail`, `copyleaksApiKey` localStorage에 포함
  - [ ] 기존 provider dropdown 및 detection API key 입력 유지
  - [ ] `data-testid="copyleaks-email-input"`, `data-testid="copyleaks-api-key-input"` 존재

  **QA Scenarios**:
  ```
  Scenario: Copyleaks 섹션 렌더링 확인
    Tool: Bash (npm run typecheck)
    Steps:
      1. npm run typecheck — 타입 오류 없는지 확인
      2. SettingsModal 코드에서 'copyleaks-email-input' data-testid 존재 확인 (grep)
      3. 'copyleaks-api-key-input' data-testid 존재 확인 (grep)
    Expected Result: 두 testid 모두 존재, typecheck PASS
    Evidence: .sisyphus/evidence/task-6-settings-modal.txt
  ```

  **Commit**: NO (Task 7과 함께)

- [x] 7. detection/index.ts exports 정리 + 통합 smoke test

  **What to do**:
  - `src/lib/detection/index.ts` 업데이트: `copyleaks`, `copyleaks-sentences`, `composite` exports 추가
    ```ts
    export * from './types';
    export * from './sapling';
    export * from './copyleaks';
    export * from './copyleaks-sentences';
    export * from './composite';
    ```
  - `npm run typecheck` 실행 확인
  - `npm run test` 실행 확인
  - `npm run lint` 실행 확인

  **Must NOT do**:
  - 기존 adapter stubs (gptzero, originality, winston) export 제거 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Tasks 5, 6 완료 후)
  - **Parallel Group**: Wave 3
  - **Blocks**: FINAL verification
  - **Blocked By**: Tasks 5, 6

  **References**:
  - `src/lib/detection/index.ts` — 현재 2줄 파일 (수정 대상)

  **Acceptance Criteria**:
  - [ ] `detection/index.ts`에서 copyleaks, composite exports 존재
  - [ ] `npm run typecheck` PASS
  - [ ] `npm run test` PASS
  - [ ] `npm run lint` PASS

  **QA Scenarios**:
  ```
  Scenario: 전체 빌드 검증
    Tool: Bash
    Steps:
      1. npm run typecheck
      2. npm run lint
      3. npm run test
    Expected Result: 모든 커맨드 exit code 0
    Evidence: .sisyphus/evidence/task-7-build-pass.txt
  ```

  **Commit**: YES (Wave 3 완료)
  - Message: `feat(settings): add Copyleaks configuration UI and finalize exports`
  - Files: `src/lib/detection/index.ts`, `src/components/SettingsModal.tsx`, `src/hooks/useSettings.ts`, `src/lib/settings/types.ts`, `src/lib/api/requestSettings.ts`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run typecheck` + `npm run lint` + `npm run test`. Review changed files for `as any`, empty catches, `console.log`, `probability` field usage.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start dev server. Navigate to Settings modal, enter test keys. Upload a .docx. Verify: (1) Copyleaks-only mode returns score + highlights, (2) Sapling-only mode works as before, (3) no keys → 503 error displayed.
  Output: `Scenarios [N/N pass] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify no scope creep. Confirm existing GPTZero/Winston/Originality stubs are untouched.
  Output: `Tasks [N/N compliant] | Stubs [INTACT/MODIFIED] | VERDICT`

---

## Commit Strategy
- Wave 1: `feat(detection): add Copyleaks types and settings foundation`
- Wave 2: `feat(detection): implement CopyleaksDetectionAdapter and CompositeDetectionAdapter`
- Wave 3: `feat(settings): add Copyleaks configuration UI and request header support`

---

## Success Criteria

### Verification Commands
```bash
npm run typecheck  # Expected: no errors
npm run lint       # Expected: no errors
npm run test       # Expected: all pass
```

### Final Checklist
- [ ] Copyleaks 단독 작동 (email + apiKey)
- [ ] Sapling 단독 작동 (기존과 동일)
- [ ] 둘 다 작동 (Sapling sentences + Copyleaks document score)
- [ ] 둘 다 없으면 503
- [ ] TypeScript 오류 없음
- [ ] `probability` 필드 미사용 확인
