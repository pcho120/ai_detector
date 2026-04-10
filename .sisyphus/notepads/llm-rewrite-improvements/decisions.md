
Chose to hard-code Claude Sonnet 4.6 in the Anthropic adapter with no env fallback so the rewrite path stays deterministic until later prompt/flow updates land.

Removed score/risk wording from user prompts so prompt behavior depends only on the sentence text and optional voice profile, not detector-facing labels.

Pass 2 fallback rationale: if pass 2 fails or returns unparseable JSON, the code silently falls back to the pass 1 rewrite (rather than surfacing an error), because a lightly-refined rewrite is still better than nothing. Pass 1 explanation is always preserved in both fallback and success branches so the user sees a consistent explanation regardless of whether pass 2 succeeded. This means `explanation` is never the product of pass 2 — it always reflects pass 1's rationale for the change.

For `generateAlternativeSuggestions`, pass 2 is intentionally applied after guardrails and recovery so that the safety and deduplication logic only ever runs on pass 1 rewrites, keeping the guardrail surface stable. Pass 2 refinement is a quality enhancement applied on top of already-vetted candidates.
