import { checkOwnership, documentLast4, normalizeName, type CaseOwner, type PresentedIdentity } from './ownership-check'

const OWNER: CaseOwner = { bookingReference: 'H8LD3Q', lastName: 'Haddad', passportNumber: 'AB1234567' }

function presented(data: Partial<PresentedIdentity> = {}): PresentedIdentity {
  return {
    bookingReference: 'H8LD3Q',
    lastName: 'Haddad',
    collector: 'passenger',
    documentType: 'passport',
    documentNumber: 'AB1234567',
    ...data,
  }
}

describe('checkOwnership', () => {
  it('passes when the booking, surname and passport agree', () => {
    expect(checkOwnership(OWNER, presented())).toEqual({ passed: true, mismatches: [] })
  })

  it('ignores case, spaces, accents and punctuation', () => {
    const result = checkOwnership(
      { ...OWNER, lastName: "Ó'Brien-Smith" },
      presented({ bookingReference: ' h8ld3q ', lastName: 'obrien smith', documentNumber: 'ab 123-4567' }),
    )

    expect(result.passed).toBe(true)
  })

  it('lists every detail that does not agree', () => {
    const result = checkOwnership(OWNER, presented({ bookingReference: 'ZZZZZZ', lastName: 'Becker', documentNumber: 'XY0000000' }))

    expect(result).toEqual({ passed: false, mismatches: ['booking_reference', 'last_name', 'document_number'] })
  })

  it('needs the passport on file, not another document, from the passenger', () => {
    expect(checkOwnership(OWNER, presented({ documentType: 'national_id', documentNumber: '1103700012345' }))).toEqual({
      passed: false,
      mismatches: ['document_type'],
    })
  })

  it('accepts another document from a passenger with no passport on file', () => {
    const owner = { ...OWNER, passportNumber: null }

    expect(checkOwnership(owner, presented({ documentType: 'national_id', documentNumber: '1103700012345' })).passed).toBe(true)
  })

  it('does not compare a document when no passport is on file', () => {
    expect(checkOwnership({ ...OWNER, passportNumber: null }, presented({ documentNumber: 'XY0000000' })).passed).toBe(true)
  })
})

describe('helpers', () => {
  it('keeps only the last 4 characters of a document', () => {
    expect(documentLast4('ab 123-4567')).toBe('4567')
  })

  it('normalizes names', () => {
    expect(normalizeName('  Ñúñez ')).toBe('nunez')
  })
})
