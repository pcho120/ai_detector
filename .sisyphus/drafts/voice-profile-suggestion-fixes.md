# Draft: Voice Profile + Suggestion Fixes

## Requirements (confirmed)
- "'Your Voice Profile'은 'I already have a profile!'버튼을 누르면 프로파일 입력하는 칸 나오게 해줘."
- "아직 sentence suggesiton이 하나도 안나와"
- Current symptom detail: clicking a sentence reaches the empty/unavailable state rather than showing actual alternatives.

## Technical Decisions
- Treat this as a surgical follow-up fix plan on top of the already-expanded suggestion/voice-profile workflow.
- Preserve existing `/api/suggestions` unavailable contract and current apply/revert/rescore semantics.
- Keep the existing `I already have a profile!` entry point; change visibility behavior around the profile input area rather than introducing a new flow.
- Keep the 2–3 alternatives success contract from the existing voice-profile plan; fix suggestion availability without relaxing success semantics to a single alternative.
- Treat the current "empty/unavailable" symptom as a backend-availability/remediation problem first, not a new product requirement.

## Research Findings
- Original voice-profile plan requires the post-upload voice-profile setup area, editable profile text, copy/reuse flow, and 2–3 sentence-level alternatives.
- Current repo includes `VoiceProfilePanel`, `/api/suggestions`, `/api/voice-profile/generate`, revised-analysis state, and E2E coverage for the expanded flow.
- User reports two current runtime regressions: hidden/reveal UX mismatch and missing sentence suggestions.
- Explore findings: `VoiceProfilePanel` currently renders the profile textarea block unconditionally once the panel is shown; there is no existing `I already have a profile!` reveal button implementation in code.
- Explore findings: the user-visible suggestion symptom is the `available:false` / empty-state path, which currently occurs when `/api/suggestions` cannot produce 2+ safe alternatives or lacks LLM availability.
- The current click/popover path is already wired through `ReviewPanel` -> `/api/suggestions` -> reducer cache -> popover rendering; the missing suggestions issue is most likely in server availability, parsing, or guardrail filtering rather than highlight-click wiring.

## Open Questions
- No blocking product questions remain; implementation should proceed with the existing button label requested by the user.
- Exact runtime cause among the known unavailable branches still needs executor confirmation during implementation, but the remediation surface is bounded to the suggestions route/LLM path plus regression tests.

## Scope Boundaries
- INCLUDE: voice-profile textarea reveal UX, sentence-suggestion rendering/fetch path, regression-safe validation updates.
- EXCLUDE: new product capabilities, persistence, unavailable-contract changes, relaxing success to 1 alternative, wording changes unrelated to the two reported defects.
