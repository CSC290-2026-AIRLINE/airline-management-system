// Copy of apps/backend/src/modules/checkin-boarding/domain/mrz.ts — keep in sync
import { toAlpha2 } from './countries.ts'

export type MrzCheck = 'format' | 'length' | 'document_type' | 'number' | 'date_of_birth' | 'expiry' | 'composite'

export interface MrzData {
  documentType: 'P'
  issuingCountry3: string
  surname: string
  givenNames: string[]
  /** Full document number: internal use only (duplicate check, profile sync). Never return it from an API. */
  number: string
  numberLast4: string
  nationality3: string
  dateOfBirth: string
  sex: 'M' | 'F' | 'X'
  expiryDate: string
  personalNumber: string
}

export type MrzResult = { ok: true; data: MrzData } | { ok: false; failedCheck: MrzCheck; message: string }

export interface ProfileFields {
  dateOfBirth: string | null
  gender: string | null
  nationality: string | null
  passportNumber: string | null
}

export type ProfileFill = Partial<{ dateOfBirth: string; gender: string; nationality: string; passportNumber: string }>
export type ProfileDifference = 'dateOfBirth' | 'gender' | 'nationality' | 'passportNumber' | 'nationality_unmapped'

const WEIGHTS = [7, 3, 1]
const MRZ_LENGTH = 44

/** ICAO 9303 check digit: weights 7,3,1 cycling, '<' = 0, A = 10 .. Z = 35, mod 10. */
export function checkDigit(s: string): number {
  let total = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    const value = c === '<' ? 0 : c >= '0' && c <= '9' ? Number(c) : c.charCodeAt(0) - 55
    total += value * WEIGHTS[i % 3]
  }
  return total % 10
}

export function normaliseMrzLine(s: string): string {
  return s.trim().toUpperCase()
}

function fail(failedCheck: MrzCheck, message: string): MrzResult {
  return { ok: false, failedCheck, message }
}

export function validateMrz(line1: string, line2: string, opts?: { todayYear?: number }): MrzResult {
  const l1 = normaliseMrzLine(line1)
  const l2 = normaliseMrzLine(line2)

  if (!/^[A-Z0-9<]*$/.test(l1) || !/^[A-Z0-9<]*$/.test(l2)) {
    return fail('format', 'MRZ lines may only contain A-Z, 0-9 and <')
  }
  if (l1.length !== MRZ_LENGTH || l2.length !== MRZ_LENGTH) {
    return fail('length', 'Each MRZ line must be exactly 44 characters')
  }
  if (l1[0] !== 'P') {
    return fail('document_type', 'Only passport documents (P) are supported')
  }

  const number = l2.slice(0, 9)
  if (checkDigit(number) !== Number(l2[9])) {
    return fail('number', 'Passport number check digit does not match')
  }
  const dob = l2.slice(13, 19)
  if (checkDigit(dob) !== Number(l2[19])) {
    return fail('date_of_birth', 'Date of birth check digit does not match')
  }
  const expiry = l2.slice(21, 27)
  if (checkDigit(expiry) !== Number(l2[27])) {
    return fail('expiry', 'Expiry date check digit does not match')
  }
  const composite = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43)
  if (checkDigit(composite) !== Number(l2[43])) {
    return fail('composite', 'Composite check digit does not match')
  }

  const names = l1.slice(5)
  const [surnamePart, ...givenPart] = names.split('<<')
  const surname = surnamePart.replace(/</g, ' ').trim().replace(/\s+/g, ' ')
  const givenNames = givenPart.join(' ').replace(/</g, ' ').trim().split(/\s+/).filter(Boolean)

  const currentYY = (opts?.todayYear ?? 2026) % 100
  const dobYY = Number(dob.slice(0, 2))
  const dobYear = dobYY > currentYY ? 1900 + dobYY : 2000 + dobYY
  const expiryYY = Number(expiry.slice(0, 2))

  const sexChar = l2[20]
  const sex: 'M' | 'F' | 'X' = sexChar === 'M' || sexChar === 'F' ? sexChar : 'X'

  const cleanNumber = number.replace(/<+$/, '')

  return {
    ok: true,
    data: {
      documentType: 'P',
      issuingCountry3: l1.slice(2, 5),
      surname,
      givenNames,
      number: cleanNumber,
      numberLast4: cleanNumber.slice(-4),
      nationality3: l2.slice(10, 13),
      dateOfBirth: `${dobYear}-${dob.slice(2, 4)}-${dob.slice(4, 6)}`,
      sex,
      expiryDate: `20${expiryYY.toString().padStart(2, '0')}-${expiry.slice(2, 4)}-${expiry.slice(4, 6)}`,
      personalNumber: l2.slice(28, 42).replace(/<+$/, ''),
    },
  }
}

/** A passport must still be valid six calendar months after the travel date. */
export function isPassportValidForTravel(expiryDate: string, travelDate: string): boolean {
  const minExpiry = new Date(`${travelDate}T00:00:00.000Z`)
  minExpiry.setUTCMonth(minExpiry.getUTCMonth() + 6)
  return expiryDate >= minExpiry.toISOString().slice(0, 10)
}

const stripNonLetters = (s: string): string => s.toUpperCase().replace(/[^A-Z]/g, '')

/** True when the MRZ name and the booking name disagree (a flag for staff, never a hard block). */
export function compareNames(mrz: { surname: string; givenNames: string[] }, booking: { firstName: string; lastName: string }): boolean {
  if (stripNonLetters(mrz.surname) !== stripNonLetters(booking.lastName)) {
    return true
  }
  return !mrz.givenNames.map(stripNonLetters).includes(stripNonLetters(booking.firstName))
}

/** Fills empty profile fields from the MRZ and names the fields that differ; nothing is ever overwritten. */
export function profileSync(profile: ProfileFields, mrz: MrzData): { fill: ProfileFill; differences: ProfileDifference[] } {
  const fill: ProfileFill = {}
  const differences: ProfileDifference[] = []

  if (profile.dateOfBirth === null) {
    fill.dateOfBirth = mrz.dateOfBirth
  } else if (profile.dateOfBirth !== mrz.dateOfBirth) {
    differences.push('dateOfBirth')
  }

  if (profile.gender === null) {
    fill.gender = mrz.sex
  } else if (profile.gender.toUpperCase() !== mrz.sex) {
    differences.push('gender')
  }

  const nationality = toAlpha2(mrz.nationality3)
  if (nationality === null) {
    differences.push('nationality_unmapped')
  } else if (profile.nationality === null) {
    fill.nationality = nationality
  } else if (profile.nationality.toLowerCase() !== nationality) {
    differences.push('nationality')
  }

  if (profile.passportNumber === null) {
    fill.passportNumber = mrz.number
  } else if (profile.passportNumber !== mrz.number) {
    differences.push('passportNumber')
  }

  return { fill, differences }
}

export const SPECIMEN_LINE1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<'

export interface Line2Fields {
  number: string
  nationality3: string
  dob: string
  sex: string
  expiry: string
  personal?: string
}

/** Builds a valid 44 character line 2 (all four check digits, composite included) from its fields. */
export function buildLine2(fields: Line2Fields): string {
  const number = fields.number.slice(0, 9).padEnd(9, '<')
  const dob = fields.dob
  const expiry = fields.expiry
  const personal = (fields.personal ?? '').slice(0, 14).padEnd(14, '<')
  const head = `${number}${checkDigit(number)}${fields.nationality3}${dob}${checkDigit(dob)}${fields.sex}${expiry}${checkDigit(expiry)}`
  const personalField = `${personal}${checkDigit(personal)}`
  const composite = head.slice(0, 10) + head.slice(13, 20) + head.slice(21) + personalField
  return head + personalField + checkDigit(composite)
}

/** The demo passport from the prototype, with the expiry moved to 2030 so the six month rule passes. */
export function buildSpecimenLine2(): string {
  return buildLine2({
    number: 'L898902C3',
    nationality3: 'UTO',
    dob: '740812',
    sex: 'F',
    expiry: '300415',
    personal: 'ZE184226B<<<<<',
  })
}
