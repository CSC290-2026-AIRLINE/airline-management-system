import 'reflect-metadata'
import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common'
import { CreateSavedPassengerDto, ProfileUpdateDto, SavedPassengerQueryDto, UpdateSavedPassengerDto } from './passenger-profiles.dto'
import { IdentitySetupDto } from './identity-setup.dto'

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true })
const valid = {
  firstName: ' SOMCHAI ',
  lastName: ' SARANPAT ',
  relationship: 'spouse',
  dateOfBirth: '1992-08-12',
  gender: 'M',
  nationality: 'TH',
  passportNumber: 'ab 12-345',
}
const metadata = (metatype: ArgumentMetadata['metatype']): ArgumentMetadata => ({ type: 'body', metatype })

describe('Passenger profile DTO validation', () => {
  it.each([
    { firstName: undefined },
    { lastName: undefined },
    { firstName: 'owner@example.com' },
    { dateOfBirth: undefined },
    { gender: undefined },
    { nationality: undefined },
    { dateOfBirth: '2001-02-29' },
    { nationality: 'Thai' },
  ])('rejects incomplete or invalid first sign-in setup: %p', async (changes) => {
    await expect(
      pipe.transform(
        { firstName: 'Anya', lastName: 'Saranpat', dateOfBirth: '1995-04-14', gender: 'F', nationality: 'th', ...changes },
        metadata(IdentitySetupDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
  it('normalizes passport spelling, country code and passport number', async () => {
    const result = (await pipe.transform(valid, metadata(CreateSavedPassengerDto))) as CreateSavedPassengerDto
    expect(result.firstName).toBe('SOMCHAI')
    expect(result.nationality).toBe('th')
    expect(result.passportNumber).toBe('AB12345')
  })

  it.each([
    { firstName: '   ' },
    { firstName: null },
    { firstName: 123 },
    { lastName: '' },
    { gender: 'Female' },
    { gender: null },
    { nationality: 'zz' },
    { nationality: 'Thai' },
    { relationship: 'self' },
    { relationship: 'friend' },
    { dateOfBirth: '1992-02-31' },
    { dateOfBirth: '1993-02-29' },
    { dateOfBirth: '2999-01-01' },
    { dateOfBirth: '1899-01-01' },
    { dateOfBirth: '12/08/1992' },
    { passportNumber: 'abc<script>' },
    { customerId: 'another-user' },
    { userId: 'another-user' },
  ])('rejects invalid or unauthorized create fields: %p', async (changes) => {
    await expect(pipe.transform({ ...valid, ...changes }, metadata(CreateSavedPassengerDto))).rejects.toBeInstanceOf(BadRequestException)
  })

  it('accepts a real leap-day birth date and optional local names', async () => {
    const result = (await pipe.transform(
      { ...valid, dateOfBirth: '2000-02-29', localFirstName: ' สมชาย ' },
      metadata(CreateSavedPassengerDto),
    )) as CreateSavedPassengerDto
    expect(result.localFirstName).toBe('สมชาย')
  })

  it.each(['dateOfBirth', 'gender', 'nationality'])('does not accept locked field %s in a saved-passenger patch', async (key) => {
    await expect(pipe.transform({ [key]: valid[key as keyof typeof valid] }, metadata(UpdateSavedPassengerDto))).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it.each([
    { email: 'changed@example.com' },
    { userId: 'foreign' },
    { firstName: null },
    { relationship: 'self' },
    { profilePhotoUrl: 'data:image/png;base64,abc' },
  ])('rejects prohibited profile updates: %p', async (body) => {
    await expect(pipe.transform(body, metadata(ProfileUpdateDto))).rejects.toBeInstanceOf(BadRequestException)
  })

  it('allows optional values to be cleared explicitly', async () => {
    const result = (await pipe.transform({ phone: '', profilePhotoUrl: null }, metadata(ProfileUpdateDto))) as ProfileUpdateDto
    expect(result.phone).toBeNull()
    expect(result.profilePhotoUrl).toBeNull()
  })

  it('normalizes the account holder’s passport and preserves their local name', async () => {
    const result = (await pipe.transform(
      { firstName: ' José ', lastName: ' Muñoz ', localFirstName: ' สมชาย ', passportNumber: 'ab 12-345' },
      metadata(ProfileUpdateDto),
    )) as ProfileUpdateDto
    expect(result).toEqual(
      expect.objectContaining({ firstName: 'Jose', lastName: 'Munoz', localFirstName: 'สมชาย', passportNumber: 'AB12345' }),
    )
  })

  it.each([CreateSavedPassengerDto, UpdateSavedPassengerDto, ProfileUpdateDto])(
    'normalizes Latin accents consistently in every identity write DTO',
    async (metatype) => {
      const body =
        metatype === CreateSavedPassengerDto
          ? { ...valid, firstName: 'Élodie', lastName: 'D’Angelo' }
          : { firstName: 'Élodie', lastName: 'D’Angelo' }
      const result = (await pipe.transform(body, metadata(metatype))) as ProfileUpdateDto
      expect(result.firstName).toBe('Elodie')
      expect(result.lastName).toBe("D'Angelo")
    },
  )

  it('rejects non-Latin passport names instead of guessing an official Thai transliteration', async () => {
    await expect(pipe.transform({ firstName: 'สมชาย' }, metadata(ProfileUpdateDto))).rejects.toBeInstanceOf(BadRequestException)
  })

  it.each([{ passportNumber: 'AB<script>' }, { passportNumber: 'กข123' }])('rejects malformed owner passport numbers', async (body) => {
    await expect(pipe.transform(body, metadata(ProfileUpdateDto))).rejects.toBeInstanceOf(BadRequestException)
  })

  it.each([{ limit: '0' }, { limit: '101' }, { limit: 'abc' }, { cursor: 'not-a-uuid' }])(
    'rejects invalid pagination: %p',
    async (query) => {
      await expect(pipe.transform(query, { ...metadata(SavedPassengerQueryDto), type: 'query' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
    },
  )

  it('converts a validated pagination limit from query text', async () => {
    const result = (await pipe.transform({ limit: '10' }, { ...metadata(SavedPassengerQueryDto), type: 'query' })) as SavedPassengerQueryDto
    expect(result.limit).toBe(10)
  })
})
