
## Task 4 retry – scope creep (2026-04-02)

- BLOCKER (resolved): Initial Task 4 changed `SUGGESTION_FETCH_SUCCESS` payload to require `alternatives: SuggestionAlternative[]` only, which broke `ReviewPanel.tsx` (existing consumer) and forced an out-of-scope modification to that component
- ROOT CAUSE: Payload type was narrowed without accounting for existing consumers outside the task's scope boundary
- FIX: Changed payload to a discriminated union accepting either the new `alternatives` shape or the legacy `{ rewrite, explanation }` shape; reducer normalizes at write-time — no consumer changes required
- LESSON: When modifying action payload types in a shared reducer, always check all dispatch sites before narrowing; prefer additive/union changes over breaking replacements when consumers are out of scope
