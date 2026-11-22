/** The boarding-pass QR holds only the random 8-character reference; anything else in frame is not a pass. */
export function referenceFromQr(text: string): string | null {
  const reference = text.trim().toUpperCase()
  return /^[A-Z0-9]{8}$/.test(reference) ? reference : null
}
