import type { Certification, CertificationErrors, CertificationInput, CrewFormErrors, CrewMember, CrewProfileInput } from './types'
import { SIMULATION_TODAY } from './format'

/** Seed values for the create modal. `role` and `base` have to be real options. */
export const EMPTY_CREW_FORM: CrewProfileInput = {
  firstName: '',
  lastName: '',
  employeeNo: '',
  role: 'Captain',
  base: 'BKK',
  fleet: 'A320',
  languages: [],
  licenceNumber: '',
  licenceExpiresOn: '',
  dateOfBirth: null,
  email: null,
  phone: null,
}

export const EMPTY_CERTIFICATION_FORM: CertificationInput = {
  name: '',
  aircraftType: null,
  expiresOn: '',
}

/** Seeds the edit modal from a stored profile, including the optional fields. */
export function toCrewForm(crew: CrewMember): CrewProfileInput {
  return {
    firstName: crew.firstName,
    lastName: crew.lastName,
    employeeNo: crew.employeeNo,
    role: crew.role,
    base: crew.base,
    fleet: crew.fleet,
    languages: [...crew.languages],
    licenceNumber: crew.licenceNumber,
    licenceExpiresOn: crew.licenceExpiresOn,
    dateOfBirth: crew.dateOfBirth,
    email: crew.email,
    phone: crew.phone,
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Client-side checks for the crew form.
 *
 * These are UX, not security: the backend re-validates everything. `takenNumbers`
 * is the set of employee numbers already in use, so the edit modal can reject a
 * number that has been moved to another profile without the caller diffing.
 */
export function validateCrewForm(form: CrewProfileInput, takenNumbers: readonly string[] = []): CrewFormErrors {
  const errors: CrewFormErrors = {}

  if (!form.firstName.trim()) errors.firstName = 'Required.'
  if (!form.lastName.trim()) errors.lastName = 'Required.'

  const employeeNo = form.employeeNo.trim()
  if (!employeeNo) errors.employeeNo = 'Required.'
  else if (takenNumbers.some((taken) => taken.toLowerCase() === employeeNo.toLowerCase())) errors.employeeNo = 'Already in use.'

  if (!form.licenceNumber.trim()) errors.licenceNumber = 'Required.'
  if (!form.licenceExpiresOn) errors.licenceExpiresOn = 'Required.'
  else if (form.licenceExpiresOn < SIMULATION_TODAY) errors.licenceExpiresOn = 'Already expired.'

  if (form.dateOfBirth && form.dateOfBirth >= SIMULATION_TODAY) errors.dateOfBirth = 'Must be in the past.'
  if (form.email && !EMAIL_PATTERN.test(form.email)) errors.email = 'Enter a valid email address.'

  return errors
}

/** True when nothing is wrong. Kept next to the validator so the two agree. */
export function hasErrors(errors: CrewFormErrors | CertificationErrors): boolean {
  return Object.keys(errors).length > 0
}

/** Checks the compact certification overlay. */
export function validateCertification(form: CertificationInput): CertificationErrors {
  const errors: CertificationErrors = {}
  if (!form.name.trim()) errors.name = 'Required.'
  if (!form.expiresOn) errors.expiresOn = 'Required.'
  else if (form.expiresOn < SIMULATION_TODAY) errors.expiresOn = 'Already expired.'
  return errors
}

/**
 * Turns the form into a `Certification`. The id is derived from the crew member
 * and the name so re-adding a removed rating does not collide in the list.
 */
export function toCertification(crewId: string, input: CertificationInput, existing: readonly Certification[]): Certification {
  const slug = input.name.trim().replace(/\s+/g, '-').toUpperCase()
  return {
    id: `${crewId}-${slug}-${existing.length + 1}`,
    name: input.name.trim(),
    aircraftType: input.aircraftType,
    expiresOn: input.expiresOn,
  }
}
