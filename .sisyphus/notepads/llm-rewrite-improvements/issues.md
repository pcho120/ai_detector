
Prompt wording changes may require updating tests that assert exact user prompt strings, especially any adapter mocks or snapshots tied to rewrite prompts.

2-pass adds extra `adapter.complete` calls after each `completeMulti` call in `generateAlternativeSuggestions`. Tests using chained `.mockResolvedValueOnce()` without a fallback default caused `TypeError: Cannot read properties of undefined (reading 'ok')` in the OpenAI adapter when the mock chain was exhausted. Fix: append `.mockResolvedValue({ ok: false, status: 503 })` as the default response after all `Once` entries in any test that exercises the recovery or happy path. Tests asserting `toHaveBeenCalledTimes(2)` also needed changing to `fetchMock.mock.calls.length >= 2`.
