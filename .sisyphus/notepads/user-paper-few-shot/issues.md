# Issues — user-paper-few-shot

(empty — no issues discovered yet)
## [2026-04-10] F1 plan compliance audit
- REJECT: `src/components/VoiceProfilePanel.tsx` has 18 props, exceeding the plan limit of 17 total props.
- REJECT: `src/app/page.tsx` sends both `voiceProfile` and `fewShotExamples` in API payload construction, so mutual exclusivity is not enforced at the request layer.
- REJECT: `e2e/my-paper-flow.spec.ts` mocks `/api/extract-style`, which conflicts with the plan requirement to test the real endpoint in E2E.
## [2026-04-10] F1 audit correction
- Correction: `src/components/VoiceProfilePanel.tsx` currently exposes 16 props total, which is within the plan ceiling of 17 total props.
- Correction: `src/app/page.tsx` uses `undefined` for inactive style inputs, so JSON requests do not send both `voiceProfile` and `fewShotExamples` together in normal flow.
- Note: `e2e/my-paper-flow.spec.ts` mocks `/api/extract-style`, but that is outside the explicit F1 Must Have / Must NOT Have checklist used for this audit output.
