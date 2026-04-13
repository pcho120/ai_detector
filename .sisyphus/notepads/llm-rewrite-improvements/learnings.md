
Updated the Anthropic adapter to hard-code Claude Sonnet 4.6 (`claude-sonnet-4-6-20260401`) for rewrite completions, keeping the adapter behavior unchanged otherwise.

Switched rewrite prompt wording to a direct human-writing instruction and kept voice-profile injection in the multi-alternative prompt path intact.

Implemented a 2-pass rewrite pattern: `twoPassRewrite` helper runs pass 1 at temperature 0.7 via `adapter.complete`, then feeds the pass 1 rewrite back into the same prompt builder at temperature 0.85 for pass 2. All three single-rewrite paths (`LlmSuggestionService.suggest`, `generateSingleSuggestionWithProvider`, and the per-alternative refinement in `generateAlternativeSuggestions`) share this helper. For alternatives, pass 2 is applied via `Promise.all` after the guardrail/recovery phase resolves `finalSafe`, preserving existing deduplication and recovery semantics entirely.

Kept score-awareness consistent by threading the optional score into both single and multi rewrite prompt builders; the multi prompt now mirrors the single prompt's score context instead of relying on the call site.
