import type { Collector, IdDocumentType, OwnershipMismatch } from './bag-delivery.types'

/** What the case says about the owner. passportNumber is Feature 7's passenger.passport_number, when on file. */
export interface CaseOwner {
  bookingReference: string
  lastName: string
  passportNumber: string | null
}

/** What the person collecting the bag shows at the desk (or to the courier). */
export interface PresentedIdentity {
  bookingReference: string
  lastName: string
  collector: Collector
  documentType: IdDocumentType
  documentNumber: string
}

export interface OwnershipResult {
  passed: boolean
  mismatches: OwnershipMismatch[]
}

/** Upper case, letters and digits only, so "ab 12-34" and "AB1234" are the same document. */
export function normalizeDocument(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Lower case without accents, spaces, hyphens or apostrophes, so "Ó'Brien-Smith" and "obriensmith" agree. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

/** The last 4 characters of a document number, the only part that is stored. */
export function documentLast4(documentNumber: string): string {
  return normalizeDocument(documentNumber).slice(-4)
}

/**
 * Checks the person collecting a bag against its case. The booking reference and the passenger's surname must always
 * agree. A passenger who shows a passport must show the one on their passenger record, when there is one; a
 * representative shows their own document, so only the booking details are compared for them.
 */
export function checkOwnership(owner: CaseOwner, presented: PresentedIdentity): OwnershipResult {
  const mismatches: OwnershipMismatch[] = []

  if (presented.bookingReference.trim().toUpperCase() !== owner.bookingReference.toUpperCase()) {
    mismatches.push('booking_reference')
  }

  if (normalizeName(presented.lastName) !== normalizeName(owner.lastName)) {
    mismatches.push('last_name')
  }

  if (
    presented.collector === 'passenger' &&
    presented.documentType === 'passport' &&
    owner.passportNumber &&
    normalizeDocument(presented.documentNumber) !== normalizeDocument(owner.passportNumber)
  ) {
    mismatches.push('document_number')
  }

  return { passed: mismatches.length === 0, mismatches }
}
