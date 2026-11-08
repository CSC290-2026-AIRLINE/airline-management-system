import { randomInt, randomUUID } from 'node:crypto'

/** No I, O, 0 or 1: the reference is read off a screen and typed on a keyboard. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** The only thing in the QR code: random, unguessable and not a passenger detail. */
export function newReference(): string {
  let reference = ''
  for (let i = 0; i < 8; i++) {
    reference += ALPHABET[randomInt(ALPHABET.length)]
  }
  return reference
}

/** The check-in id, a v4 UUID like the one the database writes. */
export function newCheckInId(): string {
  return randomUUID()
}
