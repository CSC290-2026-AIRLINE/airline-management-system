// Run inside apps/staff-web: node --test "src/features/checkin-boarding/**/*.test.ts"
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseGateCodes } from './gate-codes.ts'

const LETTERS_MISMATCH = 'A range keeps the same letters on both sides, like D1-D6.'
const NOT_UP = 'The range must go up, like D1-D6.'
const TOO_MANY = 'Add up to 30 gates at once.'
const TOO_LONG = 'Each gate code can be at most 4 letters or digits.'
const UNKNOWN = 'Use 1 to 4 letters or digits (D1, 12, VIP), or a range like D1-D6.'

function codesOf(input: string): string[] {
  const result = parseGateCodes(input)
  if ('error' in result) assert.fail(`expected codes for "${input}", got the error: ${result.error}`)
  return result.codes
}

function errorOf(input: string): string {
  const result = parseGateCodes(input)
  if ('codes' in result) assert.fail(`expected an error for "${input}", got the codes: ${result.codes.join(', ')}`)
  return result.error
}

test('one gate code is taken as it is, in upper case', () => {
  assert.deepEqual(codesOf('d1'), ['D1'])
})

test('a range counts up and keeps the letters of the left side', () => {
  assert.deepEqual(codesOf(' D1 - D3 '), ['D1', 'D2', 'D3'])
  assert.deepEqual(codesOf('D1-6'), ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'])
  assert.deepEqual(codesOf('1-4'), ['1', '2', '3', '4'])
  assert.deepEqual(codesOf('A9-A12'), ['A9', 'A10', 'A11', 'A12'])
})

test('a range of one gate is one gate', () => {
  assert.deepEqual(codesOf('D1-D1'), ['D1'])
})

test('a range with other letters on the right is refused', () => {
  assert.equal(errorOf('D1-E6'), LETTERS_MISMATCH)
})

test('a range that goes down is refused', () => {
  assert.equal(errorOf('D6-D1'), NOT_UP)
})

test('a range of 31 gates or more is refused', () => {
  assert.equal(errorOf('A1-A31'), TOO_MANY)
})

test('a code over 4 characters is refused', () => {
  assert.equal(errorOf('VIP9-VIP10'), TOO_LONG)
})

test('anything else is refused with the how-to text', () => {
  assert.equal(errorOf('D#1'), UNKNOWN)
  assert.equal(errorOf(''), UNKNOWN)
  assert.equal(errorOf('TOOLONG'), UNKNOWN)
})
