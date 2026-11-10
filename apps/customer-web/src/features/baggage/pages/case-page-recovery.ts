export interface CaseRecoveryAccess {
  bookingReference: string
  surname: string
}

export interface CaseLookupAccess extends CaseRecoveryAccess {
  caseNumber: string
}

export interface CaseRecoveryState {
  status: 'idle' | 'loading' | 'results' | 'empty' | 'error'
  caseNumbers: string[]
  message: string
}

export type CaseRecoveryAction =
  { type: 'reset' } | { type: 'loading' } | { type: 'loaded'; caseNumbers: string[] } | { type: 'failed'; message: string }

const CASE_NUMBER_PATTERN = /^LB-\d{4}-\d{6}$/i
const BOOKING_VERIFICATION_ERROR = 'Booking verification failed'
const BOOKING_VERIFICATION_MESSAGE = "We couldn't verify this booking. Please check your booking reference and surname, then try again."

export function caseRecoveryErrorMessage(message: string): string {
  return message === BOOKING_VERIFICATION_ERROR ? BOOKING_VERIFICATION_MESSAGE : message
}

export function createCaseRecoveryState(): CaseRecoveryState {
  return { status: 'idle', caseNumbers: [], message: '' }
}

export function caseRecoveryReducer(_state: CaseRecoveryState, action: CaseRecoveryAction): CaseRecoveryState {
  switch (action.type) {
    case 'reset':
      return createCaseRecoveryState()
    case 'loading':
      return { status: 'loading', caseNumbers: [], message: '' }
    case 'loaded':
      return action.caseNumbers.length > 0
        ? { status: 'results', caseNumbers: action.caseNumbers, message: '' }
        : { status: 'empty', caseNumbers: [], message: 'No lost-baggage reports were found for this booking.' }
    case 'failed':
      return { status: 'error', caseNumbers: [], message: action.message }
  }
}

export function normalizeCaseRecoveryAccess(bookingReference: string, surname: string): CaseRecoveryAccess {
  return {
    bookingReference: bookingReference.trim().toUpperCase(),
    surname: surname.trim(),
  }
}

export function caseRecoveryDetailsMatchCase(access: CaseRecoveryAccess | null, bookingReference: string, surname: string): boolean {
  if (!access) return false

  const current = normalizeCaseRecoveryAccess(bookingReference, surname)
  return access.bookingReference === current.bookingReference && access.surname.toLowerCase() === current.surname.toLowerCase()
}

export function caseLookupMatchesOpenedCase(opened: CaseLookupAccess | null, requested: CaseLookupAccess): boolean {
  return Boolean(
    opened &&
    opened.caseNumber === requested.caseNumber &&
    caseRecoveryDetailsMatchCase(opened, requested.bookingReference, requested.surname),
  )
}

export function validateCaseRecoveryAccess(access: CaseRecoveryAccess): string | null {
  if (!/^[A-Z0-9]{6}$/.test(access.bookingReference)) return 'Enter the six-character booking reference to find your cases.'
  if (!access.surname) return 'Enter the surname on the booking to find your cases.'
  return null
}

export function extractCaseNumbers(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return [
    ...new Set(
      value.flatMap((item: unknown) => {
        if (typeof item !== 'object' || item === null || !('caseNumber' in item)) return []
        const caseNumber = item.caseNumber
        return typeof caseNumber === 'string' && CASE_NUMBER_PATTERN.test(caseNumber) ? [caseNumber] : []
      }),
    ),
  ]
}
