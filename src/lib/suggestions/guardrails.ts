/**
 * Post-processing guardrails for suggestion output.
 *
 * These rules ensure suggestion text never frames coaching as "avoiding
 * detection", "bypassing" tools, or making text "undetectable".
 *
 * Any suggestion whose rewrite or explanation matches a banned pattern
 * is silently dropped rather than surfaced to the caller.
 */

/**
 * Banned phrase patterns (case-insensitive).
 * Matches evasion language that would frame suggestions as detection-avoidance.
 */
const BANNED_PATTERNS: RegExp[] = [
  /avoid\s+detection/i,
  /bypass\s+(the\s+)?(ai|detection|checker|tool)/i,
  /undetect(able|ed)/i,
  /fool\s+(the|an?)?\s*(ai|detector|checker)/i,
  /make\s+it\s+(look|seem)\s+(human|natural|less\s+ai)/i,
  /lower\s+(your|the)\s+(ai\s+)?score/i,
  /cheat\s+(the|an?)?\s*(detector|checker|tool)/i,
  /evade\s+(detection|ai|checker)/i,
  /defeat\s+(the|an?)?\s*(detector|checker|ai)/i,
  /trick\s+(the|an?)?\s*(detector|checker|ai)/i,
];

/**
 * Returns true if the given text contains any banned evasion phrase.
 */
export function containsBannedPhrase(text: string): boolean {
  return BANNED_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Filters out suggestions whose rewrite or explanation contains banned phrases.
 *
 * This is the final safety gate before suggestions reach the route response.
 */
export function applyGuardrails<T extends { rewrite: string; explanation: string }>(
  suggestions: T[],
): T[] {
  return suggestions.filter(
    (s) => !containsBannedPhrase(s.rewrite) && !containsBannedPhrase(s.explanation),
  );
}
