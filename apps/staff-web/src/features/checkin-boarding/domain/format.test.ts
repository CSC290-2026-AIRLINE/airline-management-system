// Run inside apps/staff-web: node --test "src/features/checkin-boarding/**/*.test.ts"
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatBaht, formatDate, formatTime } from './format.ts'

test('baht is shown without decimals for whole amounts', () => {
  assert.equal(formatBaht(2500), '฿2,500')
  assert.equal(formatBaht(1234.5), '฿1,234.5')
})

test('times are shown in Bangkok local time, whatever the browser zone is', () => {
  assert.equal(formatTime('2026-11-11T03:25:00.000Z'), '10:25')
  assert.equal(formatTime('2026-11-11T02:45:00.000Z'), '09:45')
})

test('dates are shown in Bangkok local time', () => {
  assert.equal(formatDate('2026-11-11T01:00:00.000Z'), '11 Nov 2026')
})
