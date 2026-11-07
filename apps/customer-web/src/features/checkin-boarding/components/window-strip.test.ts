import assert from 'node:assert/strict'
import { test } from 'node:test'
import { windowStrip } from './window-strip.ts'

const DEP = '2026-11-12T10:40:00+07:00'

test('windowStrip: open 2 hours before departure', () => {
  const s = windowStrip(DEP, new Date('2026-11-12T08:40:00+07:00'))
  assert.equal(s.open, true)
  assert.match(s.text, /^Closes 1 hour before departure, /)
})

test('windowStrip: closed 30 minutes before departure', () => {
  const s = windowStrip(DEP, new Date('2026-11-12T10:10:00+07:00'))
  assert.equal(s.open, false)
  assert.match(s.text, /^Check-in closed /)
})

test('windowStrip: not yet open 2 days before', () => {
  const s = windowStrip(DEP, new Date('2026-11-10T10:40:00+07:00'))
  assert.equal(s.open, false)
  assert.match(s.text, /^Opens /)
})
