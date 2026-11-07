/** Baggage tags are ten digits starting with zero, matching the checked_bag and found_bag constraints. */
export const BAGGAGE_TAG_PATTERN = /^0\d{9}$/

export function isValidBaggageTag(tag: string): boolean {
  return BAGGAGE_TAG_PATTERN.test(tag)
}
