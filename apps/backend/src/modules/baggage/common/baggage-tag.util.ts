/**
 * Inn confirmed baggage tags start with 0 (same as Feature 6).
 * The proposed F10 SQL allows any first digit; align it before integration.
 */
export const BAGGAGE_TAG_PATTERN = /^0\d{9}$/

export function isValidBaggageTag(tag: string): boolean {
  return BAGGAGE_TAG_PATTERN.test(tag)
}
