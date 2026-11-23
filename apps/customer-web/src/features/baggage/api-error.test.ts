import assert from 'node:assert/strict'
import test from 'node:test'
import { readBaggageApiError } from './api-error.ts'

test('reads the code and message from the { error: { code, message } } body', () => {
  assert.deepEqual(
    readBaggageApiError({
      error: {
        code: 'REPORT_EXISTS',
        message: 'This bag already has an open case: LB-2026-000001',
        details: { caseNumber: 'LB-2026-000001' },
      },
    }),
    { code: 'REPORT_EXISTS', message: 'This bag already has an open case: LB-2026-000001' },
  )
})

test('gives nulls for the old flat body, malformed bodies and no body', () => {
  for (const body of [{ code: 'REPORT_EXISTS', message: 'flat' }, { error: 'x' }, { error: { code: 1, message: '' } }, null, 'text']) {
    assert.deepEqual(readBaggageApiError(body), { code: null, message: null })
  }
})
