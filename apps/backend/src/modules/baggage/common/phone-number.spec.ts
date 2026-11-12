import { formatPhoneNumber, phoneNumberProblem } from './phone-number'

describe('formatPhoneNumber', () => {
  it.each([
    ['+66 2 134 0000', '+66 2 134 0000'],
    ['+6621340000', '+66 2 134 0000'],
    ['+66 53 000 001', '+66 53 000 001'],
    ['+66812345678', '+66 81 234 5678'],
    ['+66 081 234 5678', '+66 81 234 5678'],
    ['  +66   81 234 5678 ', '+66 81 234 5678'],
  ])('groups the Thai number %s as %s', (typed, stored) => {
    expect(formatPhoneNumber(typed)).toBe(stored)
  })

  it.each([
    ['+44 20 7946 0000', '+44 20 7946 0000'],
    ['+442079460000', '+44 2079460000'],
    ['+852 2181 8888', '+852 2181 8888'],
    ['+1 202 555 0123', '+1 202 555 0123'],
    ['+ 44 20 7946 0000', '+44 20 7946 0000'],
  ])('keeps the foreign number %s as %s', (typed, stored) => {
    expect(formatPhoneNumber(typed)).toBe(stored)
  })

  it.each([
    ['02 134 0000'],
    ['0812345678'],
    ['66 81 234 5678'],
    ['call me'],
    ['+66-2-134-0000'],
    ['+66 (2) 134 0000'],
    ['+66 1 234 5678'],
    ['+66 2 134 000'],
    ['+999 1234 5678'],
    ['+0 123 4567 89'],
    ['+44 2079'],
    ['+44 2079 4600 0000 0000'],
    ['++66 2 134 0000'],
    [''],
    [null],
    [undefined],
  ])('refuses %p', (typed) => {
    expect(formatPhoneNumber(typed)).toBeNull()
  })
})

describe('numbers that do not fit their country', () => {
  it.each([['+44 20 7946 00000'], ['+1 202 555 012'], ['+81 3 1234 56789 0'], ['+66 2 134 000'], ['+66 1 234 5678'], ['+66 81 234 56789']])(
    'refuses %p',
    (typed) => {
      expect(formatPhoneNumber(typed)).toBeNull()
      expect(phoneNumberProblem(typed)).toMatch(/not a valid phone number for country code \+\d+/)
    },
  )

  it('asks for the international form when there is no + or country code', () => {
    expect(phoneNumberProblem('081 234 5678')).toMatch(/international phone number/)
    expect(phoneNumberProblem('+44 20 7946 0000')).toBeNull()
  })
})
