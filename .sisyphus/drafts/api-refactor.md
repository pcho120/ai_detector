# Draft: AI Detector API Refactor

## Requirements (confirmed)

- **Sentence-level detection**: Sapling API (기존 유지)
- **Document-level detection**: Copyleaks API (신규 추가)
- **Rewriting**: Claude 또는 OpenAI API (기존 OpenAI에서 확장)
- **유연성**: Sapling 또는 Copyleaks 중 하나만 제공해도 작동
- **둘 다 있을 때**: Sapling → sentence, Copyleaks → document 전체

## Technical Decisions

- [ ] Copyleaks API 인증 방식 파악 필요
- [ ] Copyleaks response 형식 파악 필요
- [ ] 기존 Sapling 통합 코드 구조 파악 필요
- [ ] Claude API 통합 방식 결정 필요 (Anthropic SDK or OpenAI-compatible)

## Open Questions

- Copyleaks API key 방식인지, OAuth인지?
- Claude 통합: @anthropic-ai/sdk 패키지 사용 or OpenAI-compatible endpoint?
- 현재 detection result UI 컴포넌트 구조?

## Scope Boundaries

- INCLUDE: Sapling + Copyleaks 선택적 사용, Claude/OpenAI rewrite, API key 기반 provider 선택 로직
- EXCLUDE: Copyleaks plagiarism detection (AI detection만), 유저 인증 시스템 변경

## Research Pending

- [ ] 현재 코드베이스 구조 (explore agent 결과 대기)
- [ ] 기존 Copyleaks 코드 여부 (explore agent 결과 대기)
