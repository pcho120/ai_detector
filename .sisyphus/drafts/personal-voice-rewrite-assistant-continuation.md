# Draft: Personal Voice Rewrite Assistant Continuation

## Requirements (confirmed)
- "문장별 제안. tests-after"
- "1- 혼합형인데 유저가 고를 수 있게. 샘플을 넣고 싶으면 샘플 넣고 옵션 선택하고 싶으면 옵션 선택하고. 2-문장당 2~3개. 3-계정을 지금은 도입하진 않을건데 똑같은 유저가 다음에도 같은 목소리 프로필 재사용 가능하게 ' 당신의 목소리는 '###' 입니다.' 이렇게 해줘. 그럼 목소리 기준을 설정할때 그 목소리를 넣을 수 있게. 이 목소리는 디테일하게 주도록 해. 그래야 같은 목소리 프로필을 사용할 수 있으니까. "
- "1-둘다 수정 가능. 2-텍스트 복사. 3-입력언어 따라감 (영어 메인)"
- "do 1 first"
- After plan 1 completes, re-show plan list 1-4 with updated total remaining time and per-task estimates.
- Preserve restart continuity.

## Technical Decisions
- Keep framing strictly as authenticity/voice alignment, never detector evasion.
- Preserve `/api/suggestions` unavailable contract exactly as `{ available:false, sentenceIndex }`.
- Success path for suggestions must return exactly 2 or 3 alternatives; fewer than 2 degrades to unavailable.
- Reusable voice profile must be copy/paste text, not account persistence or browser persistence.
- Fresh-session reuse must work by pasting copied profile text directly into `voice-profile-textarea`.

## Research Findings
- Plan file confirms Tasks 1-9 are complete in implementation status, but final verification wave is still open.
- F1 blocker is compliance-only: wrapper sanitization normalization, 2-alt minimum enforcement, and direct profile-textarea reuse flow.
- Boulder state confirms existing task session continuity for Tasks 1-9 and prior F1 audit context.
- Draft `plan-priority-and-estimates.md` already records the user's post-plan-1 estimation request.

## Open Questions
- None blocking for continuation planning.
- User approval will still be required after F1-F4 all approve.

## Scope Boundaries
- INCLUDE: F1 remediation planning, verification sequencing, restart-safe continuation notes, post-completion estimate reminder.
- EXCLUDE: any source-code implementation, plan-file edits, detector-evasion features, new persistence mechanisms.

## Immediate Next Steps
- Remediate the three F1 deltas in implementation files and corresponding tests.
- Re-run F1 with oracle context preserved.
- Run F2, F3, and F4 after F1 passes.
- Present consolidated verification results and wait for explicit user "okay".
- After completion, re-list plans 1-4 with updated remaining-time estimates.
