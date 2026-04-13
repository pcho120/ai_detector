# Decisions — user-paper-few-shot

## [2026-04-10] Initial architectural decisions

- Few-shot examples: inject directly into LLM prompt as numbered list (no fine-tuning, no vector store)
- Sentence selection: heuristics-only diversity algorithm (no NLP deps)
- Storage: session-only React state (no localStorage, no server persistence)
- Tab switching is the mutual-exclusivity mechanism (switching clears the other tab's data)
- fewShotExamples persist across new essay uploads — only tab switch clears them
- buildFewShotContextBlock returns '' for empty array (falls back to voiceProfile)
- twoPassRewrite pass2 also uses voiceProfile so style is preserved through refinement
- End-to-end threading now passes fewShotExamples through page state, suggestion fetches, and bulk rewrite requests
