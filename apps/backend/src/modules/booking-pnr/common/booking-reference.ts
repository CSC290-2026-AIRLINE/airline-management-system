export const BOOKING_REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const BOOKING_REFERENCE_LENGTH = 6

export type RandomSource = () => number

export function newBookingReference(length = BOOKING_REFERENCE_LENGTH, random: RandomSource = Math.random): string {
  let reference = ''
  for (let index = 0; index < length; index++) {
    reference += BOOKING_REFERENCE_ALPHABET[Math.floor(random() * BOOKING_REFERENCE_ALPHABET.length)]
  }
  return reference
}

export function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002'
}

export async function insertWithBookingReference<T>(
  insert: (reference: string) => Promise<T>,
  isDuplicate: (error: unknown) => boolean = isUniqueConstraintError,
  random: RandomSource = Math.random,
): Promise<T> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await insert(newBookingReference(BOOKING_REFERENCE_LENGTH, random))
    } catch (error) {
      if (!isDuplicate(error) || attempt === 9) {
        throw error
      }
    }
  }
  throw new Error('Could not allocate a unique booking reference')
}
