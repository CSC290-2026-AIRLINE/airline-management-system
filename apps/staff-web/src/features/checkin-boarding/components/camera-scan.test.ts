import assert from 'node:assert/strict'
import { test } from 'node:test'
import { referenceFromQr } from './camera-scan.ts'

test('referenceFromQr: a pass reference comes back as is', () => {
  assert.equal(referenceFromQr('Q7M4K2XR'), 'Q7M4K2XR')
})

test('referenceFromQr: whitespace and case are normalised', () => {
  assert.equal(referenceFromQr('  q7m4k2xr\n'), 'Q7M4K2XR')
})

test('referenceFromQr: a URL, an empty string and a 7-char code are not references', () => {
  assert.equal(referenceFromQr('https://flython.sit.kmutt.ac.th/check-in'), null)
  assert.equal(referenceFromQr(''), null)
  assert.equal(referenceFromQr('Q7M4K2X'), null)
})
