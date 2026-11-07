/**
 * Case-number format follows the proposed F10 schema.
 * The simulation clock supplies the year; the sequence never resets annually.
 */
export const CASE_NUMBER_PATTERN = /^LB-[0-9]{4}-[0-9]{6}$/

export function formatCaseNumber(simulatedDate: Date, sequence: number): string {
  const year = simulatedDate.getUTCFullYear()

  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999999) {
    throw new RangeError('Case number sequence must be between 1 and 999999')
  }

  return `LB-${year}-${String(sequence).padStart(6, '0')}`
}
