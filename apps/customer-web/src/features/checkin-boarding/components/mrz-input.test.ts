import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SPECIMEN_LINE1, buildSpecimenLine2 } from '../domain/mrz.ts'
import { inlineMrzChecks, mrzLineReady } from './mrz-input.ts'

test('a line pasted with surrounding whitespace is ready once trimmed', () => {
  assert.equal(mrzLineReady(SPECIMEN_LINE1), true)
  assert.equal(mrzLineReady(` ${SPECIMEN_LINE1}`), true)
  assert.equal(mrzLineReady(` ${SPECIMEN_LINE1} `), true)
  assert.equal(mrzLineReady(SPECIMEN_LINE1.slice(1)), false)
  assert.equal(mrzLineReady(''), false)
})

test('the inline checklist is green on a valid line 2', () => {
  const checks = inlineMrzChecks(buildSpecimenLine2())
  assert.deepEqual(
    checks.map((check) => check.ok),
    [true, true, true, true],
  )
  assert.deepEqual(
    checks.map((check) => check.name),
    ['number', 'date_of_birth', 'expiry', 'composite'],
  )
})

test('the inline checklist is all red on a character the server rejects', () => {
  const line = buildSpecimenLine2()
  const broken = line.slice(0, 5) + '-' + line.slice(6)
  assert.deepEqual(
    inlineMrzChecks(broken).map((check) => check.ok),
    [false, false, false, false],
  )
})

test('the inline checklist is all red on a line that is not 44 characters', () => {
  assert.deepEqual(
    inlineMrzChecks(buildSpecimenLine2().slice(1)).map((check) => check.ok),
    [false, false, false, false],
  )
})
