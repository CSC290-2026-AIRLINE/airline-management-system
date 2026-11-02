import assert from 'node:assert/strict'
import test from 'node:test'
import { f7ErrorMessage } from './f7-api-error.ts'

test('reads the F7 error envelope', () => {
  assert.equal(f7ErrorMessage({ error: { code: 'CONFLICT', message: 'Reload the entry' } }, 'fallback'), 'Reload the entry')
})
test('shows validation field details in the existing error area', () => {
  assert.equal(
    f7ErrorMessage(
      {
        error: {
          message: 'Invalid request data',
          details: {
            fields: [
              { field: 'dateOfBirth', message: 'Must not be in the future' },
              { field: 'firstName', message: 'Required' },
            ],
          },
        },
      },
      'fallback',
    ),
    'dateOfBirth: Must not be in the future; firstName: Required',
  )
})
test('supports legacy auth and validation responses', () => {
  assert.equal(f7ErrorMessage({ message: 'Unauthorized', error: 'Unauthorized' }, 'fallback'), 'Unauthorized')
  assert.equal(
    f7ErrorMessage({ message: ['First name required', 'Last name required'] }, 'fallback'),
    'First name required; Last name required',
  )
})
test('handles malformed and empty responses safely', () => {
  for (const value of [null, [], 'proxy error', {}, { error: {} }, { message: [] }])
    assert.equal(f7ErrorMessage(value, 'fallback'), 'fallback')
  assert.equal(
    f7ErrorMessage({ error: { message: 'Invalid input', details: { fields: [null, { field: 12, message: 'bad' }] } } }, 'fallback'),
    'Invalid input',
  )
})
