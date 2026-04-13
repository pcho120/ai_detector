# Anthropic Response Handling Pattern

## Implementation Notes

- Anthropic SDK (`@anthropic-ai/sdk`) uses a default export: `import Anthropic from '@anthropic-ai/sdk'`
- Response content is a union type array; must check `block.type === 'text'` before accessing `.text` property
- Empty content arrays and non-text blocks return `null` (consistent with OpenAI adapter null-return pattern)
- System prompt is a top-level parameter in Anthropic API, not part of the messages array
- Temperature must be clamped to max 1.0 for Claude compatibility using `Math.min()`
- `completeMulti()` delegates to `complete()` to avoid duplication
- All operational failures wrapped in try/catch, returning `null` instead of throwing
- Private client field initialized in constructor: `new Anthropic({ apiKey: this.apiKey })`

## Vitest Anthropic Mock Pattern

When testing the Anthropic SDK integration with Vitest:

1. **Module-scoped declaration**: Initialize `mockCreate` at module scope with `let mockCreate = vi.fn()` before the mock definition
2. **Default export pattern**: Anthropic is a default export, so mock with `default: vi.fn(() => ({ messages: { create: mockCreate } }))`
3. **Per-test reset**: Use `beforeEach(() => vi.clearAllMocks())` to reset mock state between tests
4. **Call tracking**: The same `mockCreate` reference is accessible throughout all test cases within the describe block, allowing `toHaveBeenCalledTimes()` and argument assertions

This pattern preserves the hoisting behavior of `vi.mock` while maintaining access to the mock function for assertions.

## Constructor Verification with vi.mocked

To assert that a mocked constructor was called with specific arguments:

1. **Import the mocked module**: Add `import Anthropic from '@anthropic-ai/sdk'` after the describe block imports
2. **Use vi.mocked()**: In test assertions, use `vi.mocked(Anthropic)` to get a typed mock reference
3. **Assert constructor calls**: Use `expect(vi.mocked(Anthropic)).toHaveBeenCalledWith(expect.objectContaining({ apiKey: '...' }))`

This approach avoids hoisting conflicts while still allowing constructor argument verification.

## F2 Code Quality Verification Pass (2026-04-09)

- Typecheck: PASS (tsc --noEmit exits clean, no errors)
- Lint: PASS (eslint exits clean, no warnings)
- Tests: PASS (574/574 across 23 test files, including 14 in llm-adapter.test.ts)
- anthropic.ts: No `as any`, no `@ts-ignore`, no `console.log`, no stub throws; bare `catch {}` is intentional null-return-on-error pattern (correct)
- Test coverage verified: factory branch selection (openai default, openai explicit, anthropic, unknown provider error), success path, empty content guard, non-text block guard, SDK throws → null, completeMulti delegation (1 SDK call), temperature clamp 1.5→1.0, constructor apiKey forwarding
## 2026-04-11
- Anthropic messages API rejects requests when both `temperature` and `top_p` are present; the adapter must choose one branch exclusively.
- Keep clamping temperature to `1.0` only on the temperature path; when `topP` is provided, omit `temperature` entirely.
- Adapter tests should assert both presence of the chosen field and absence of the excluded one.
