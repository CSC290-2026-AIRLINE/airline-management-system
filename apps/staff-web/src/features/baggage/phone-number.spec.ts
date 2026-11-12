import assert from 'node:assert/strict'
import test from 'node:test'
import { displayPhone, formatPhoneNumber, phoneNumberProblem } from './phone-number.ts'

test('Thai numbers after +66 are grouped', () => {
  assert.equal(formatPhoneNumber('+6621340000'), '+66 2 134 0000')
  assert.equal(formatPhoneNumber('+66 53 000 001'), '+66 53 000 001')
  assert.equal(formatPhoneNumber('+66 081 234 5678'), '+66 81 234 5678')
})

test('other countries keep their spacing after the country code', () => {
  assert.equal(formatPhoneNumber('+44 20 7946 0000'), '+44 20 7946 0000')
  assert.equal(formatPhoneNumber('+852  2181 8888'), '+852 2181 8888')
  assert.equal(formatPhoneNumber('+442079460000'), '+44 2079460000')
})

test('numbers without + and a country code are refused', () => {
  for (const bad of ['02 134 0000', '0812345678', '66 81 234 5678', '+66-2-134-0000', '+999 1234 5678', '+44 2079', '']) {
    assert.equal(formatPhoneNumber(bad), null, bad)
  }
})

test('a refused number says what to fix', () => {
  assert.equal(phoneNumberProblem(' '), 'Enter the phone number.')
  assert.match(phoneNumberProblem('123123') ?? '', /Start with \+ and the country code/)
  assert.match(phoneNumberProblem('081 234 5678') ?? '', /Start with \+ and the country code/)
  assert.match(phoneNumberProblem('+66-2-134-0000') ?? '', /only digits and spaces/)
  assert.match(phoneNumberProblem('+999 1234 5678') ?? '', /not a country code/)
  assert.equal(phoneNumberProblem('+66 2 134'), 'This is not a valid phone number for country code +66. Check the digits after it.')
  assert.equal(phoneNumberProblem('+44 2079'), 'This is not a valid phone number for country code +44. Check the digits after it.')
  assert.equal(phoneNumberProblem('+66 81 234 5678'), null)
})

test('older stored values that are not phone numbers are shown as they are', () => {
  assert.equal(displayPhone('+6621340000'), '+66 2 134 0000')
  assert.equal(displayPhone('021340000'), '021340000')
})
