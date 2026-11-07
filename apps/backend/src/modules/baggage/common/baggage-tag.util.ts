/**
 * Same rule as the CHECK on checked_bag.tag_number and found_bag.tag_number: 10 digits starting with 0.
 */
export const BAGGAGE_TAG_PATTERN = /^0\d{9}$/

export function isValidBaggageTag(tag: string): boolean {
  return BAGGAGE_TAG_PATTERN.test(tag)
}
