# Issues

## Task 1: Allow re-fetch after cached unavailable suggestions (2026-04-01)

No blocking issues encountered. The fix was minimal and surgical.

Note: The `unavailable` flag uses `status: 'success'` rather than a dedicated `status: 'unavailable'`. This is a semantic overload — `success` means the fetch succeeded, not that a suggestion was found. Future maintainers reading the cache-gating condition must understand this distinction. The comment added to `ReviewPanel.tsx` guards against regression.

## Task 2: No issues (2026-04-01)

No client-side fix required. The success branch in `ReviewPanel.tsx` `renderPopover` was already correct. All 18 new+existing e2e tests passed on first run.

## Task 3: No issues (2026-04-01)

No blocking issues encountered. Updated the `suggestion-empty` branch copy in `ReviewPanel.tsx` and added `role="status"` and `aria-live="polite"`. Updated e2e assertions to match. All tests passed.
