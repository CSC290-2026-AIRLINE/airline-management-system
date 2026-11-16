/**
 * Turns what the agent typed into gate codes: one code (D1) or a range (D1-D6).
 * The wording of the errors is the one of the prototype, the backend refuses the same codes.
 */
const ONE_CODE = /^[A-Z0-9]{1,4}$/
const RANGE = /^([A-Z]*)(\d+)-([A-Z]*)(\d+)$/

const LETTERS_MISMATCH = 'A range keeps the same letters on both sides, like D1-D6.'
const NOT_UP = 'The range must go up, like D1-D6.'
const TOO_MANY = 'Add up to 30 gates at once.'
const TOO_LONG = 'Each gate code can be at most 4 letters or digits.'
const UNKNOWN = 'Use 1 to 4 letters or digits (D1, 12, VIP), or a range like D1-D6.'

export function parseGateCodes(input: string): { codes: string[] } | { error: string } {
  const raw = input.toUpperCase().replace(/\s+/g, '')
  if (ONE_CODE.test(raw)) return { codes: [raw] }

  const range = raw.match(RANGE)
  if (!range) return { error: UNKNOWN }
  const [, leftLetters, leftNumber, rightLetters, rightNumber] = range
  // The right side may leave the letters out, but it may not change them.
  if (rightLetters !== '' && rightLetters !== leftLetters) return { error: LETTERS_MISMATCH }
  const from = Number(leftNumber)
  const to = Number(rightNumber)
  if (to < from) return { error: NOT_UP }
  if (to - from >= 30) return { error: TOO_MANY }
  const codes = Array.from({ length: to - from + 1 }, (_, index) => `${leftLetters}${from + index}`)
  if (codes.some((code) => code.length > 4)) return { error: TOO_LONG }
  return { codes }
}
