import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatBaht, formatDateTime, formatDay, formatTime } from './format.ts'

test('times are shown in Bangkok time', () => {
  // 03:25 UTC is 10:25 in Bangkok (UTC+7).
  assert.equal(formatTime('2026-11-11T03:25:00.000Z'), '10:25')
  assert.equal(formatDay('2026-11-11'), '11 Nov')
  assert.match(formatDateTime('2026-11-11T03:25:00.000Z'), /11 Nov 2026, 10:25/)
})

test('prices are shown in baht', () => {
  assert.match(formatBaht(450), /450/)
  assert.match(formatBaht(1234.5), /1,234\.5/)
})
