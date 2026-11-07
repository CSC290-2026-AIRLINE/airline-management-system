import { toAlpha2 } from './countries'
import {
  buildLine2,
  buildSpecimenLine2,
  checkDigit,
  compareNames,
  isPassportValidForTravel,
  profileSync,
  SPECIMEN_LINE1,
  validateMrz,
  type MrzData,
} from './mrz'

const specimen = validateMrz(SPECIMEN_LINE1, buildSpecimenLine2())
if (!specimen.ok) throw new Error('specimen passport must validate')
const specimenData: MrzData = specimen.data

const emptyProfile = { dateOfBirth: null, gender: null, nationality: null, passportNumber: null }

describe('MRZ check digits', () => {
  it('checkDigit matches ICAO examples', () => {
    expect(checkDigit('L898902C3')).toBe(6)
    expect(checkDigit('740812')).toBe(2)
    expect(checkDigit('<<<<<<<<<<<<<<')).toBe(0)
  })
})

describe('validateMrz', () => {
  it('validates the specimen passport', () => {
    const r = validateMrz(SPECIMEN_LINE1, buildSpecimenLine2())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data).toMatchObject({
        surname: 'ERIKSSON',
        givenNames: ['ANNA', 'MARIA'],
        number: 'L898902C3',
        numberLast4: '02C3',
        nationality3: 'UTO',
        dateOfBirth: '1974-08-12',
        sex: 'F',
        expiryDate: '2030-04-15',
        issuingCountry3: 'UTO',
      })
    }
  })

  it('validateMrz normalises case and whitespace', () => {
    expect(validateMrz(`  ${SPECIMEN_LINE1.toLowerCase()} `, buildSpecimenLine2().toLowerCase()).ok).toBe(true)
  })

  it('rejects characters outside A-Z 0-9 <', () => {
    expect(validateMrz(SPECIMEN_LINE1.replace('<<', '-<'), buildSpecimenLine2())).toMatchObject({
      ok: false,
      failedCheck: 'format',
    })
  })

  it('rejects a line that is not 44 chars', () => {
    expect(validateMrz(SPECIMEN_LINE1.slice(1), buildSpecimenLine2())).toMatchObject({ ok: false, failedCheck: 'length' })
  })

  it('rejects a non-passport document', () => {
    expect(validateMrz('I' + SPECIMEN_LINE1.slice(1), buildSpecimenLine2())).toMatchObject({
      ok: false,
      failedCheck: 'document_type',
    })
  })

  it('names the number check digit', () => {
    const l2 = buildSpecimenLine2()
    expect(validateMrz(SPECIMEN_LINE1, l2.slice(0, 9) + '7' + l2.slice(10))).toMatchObject({ ok: false, failedCheck: 'number' })
  })

  it('names the date of birth check digit', () => {
    const l2 = buildSpecimenLine2()
    expect(validateMrz(SPECIMEN_LINE1, l2.slice(0, 19) + '0' + l2.slice(20))).toMatchObject({
      ok: false,
      failedCheck: 'date_of_birth',
    })
  })

  it('names the expiry check digit (the prototype typo: 300415 → 310415)', () => {
    const l2 = buildSpecimenLine2()
    expect(validateMrz(SPECIMEN_LINE1, l2.slice(0, 21) + '310415' + l2.slice(27))).toMatchObject({
      ok: false,
      failedCheck: 'expiry',
    })
  })

  it('names the composite check digit', () => {
    const l2 = buildSpecimenLine2()
    expect(validateMrz(SPECIMEN_LINE1, l2.slice(0, 43) + '0')).toMatchObject({ ok: false, failedCheck: 'composite' })
  })

  it('maps sex < to X and 2-digit years by century', () => {
    const l2 = buildLine2({ number: 'SEC000000', nationality3: 'THA', dob: '300101', sex: '<', expiry: '310101' })
    const r = validateMrz(SPECIMEN_LINE1, l2)
    expect(r.ok && r.data.sex).toBe('X')
    expect(r.ok && r.data.dateOfBirth).toBe('1930-01-01')
    expect(r.ok && r.data.expiryDate).toBe('2031-01-01')
  })
})

describe('passport validity and names', () => {
  it('passport must be valid 6 months after travel', () => {
    expect(isPassportValidForTravel('2027-05-11', '2026-11-11')).toBe(true)
    expect(isPassportValidForTravel('2027-05-10', '2026-11-11')).toBe(false)
  })

  it('compareNames flags surname and given-name differences only', () => {
    expect(compareNames({ surname: 'ERIKSSON', givenNames: ['ANNA', 'MARIA'] }, { firstName: 'Anna', lastName: 'Eriksson' })).toBe(false)
    expect(compareNames({ surname: 'ERIKSSON', givenNames: ['ANNA', 'MARIA'] }, { firstName: 'Sara', lastName: 'Lopez' })).toBe(true)
    expect(compareNames({ surname: "O'BRIEN", givenNames: ['ANNA'] }, { firstName: 'Anna', lastName: 'OBrien' })).toBe(false)
  })
})

describe('country codes', () => {
  it('toAlpha2 maps 3-letter codes, D, UTO and unknowns', () => {
    expect(toAlpha2('THA')).toBe('th')
    expect(toAlpha2('D')).toBe('de')
    expect(toAlpha2('UTO')).toBe('ut')
    expect(toAlpha2('XXA')).toBeNull()
    expect(toAlpha2('ZZZ')).toBeNull()
  })
})

describe('profileSync', () => {
  it('profileSync fills empty fields and flags differences without overwriting', () => {
    const r = profileSync({ dateOfBirth: null, gender: 'M', nationality: null, passportNumber: null }, specimenData)
    expect(r.fill).toEqual({ dateOfBirth: '1974-08-12', nationality: 'ut', passportNumber: 'L898902C3' })
    expect(r.differences).toEqual(['gender'])
  })

  it('profileSync reports an unmapped nationality', () => {
    expect(profileSync(emptyProfile, { ...specimenData, nationality3: 'XXA' }).differences).toContain('nationality_unmapped')
  })
})
