// Run inside apps/staff-web: node --test "src/features/checkin-boarding/**/*.test.ts"
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pageFromPath } from './shell-nav.ts'

test('pageFromPath maps each route and its children', () => {
  assert.equal(pageFromPath('/check-in/gate'), 'gate')
  assert.equal(pageFromPath('/check-in/issues'), 'issues')
  assert.equal(pageFromPath('/check-in/counter'), 'counter')
  assert.equal(pageFromPath('/check-in/gate/'), 'gate')
})

test('pageFromPath defaults to counter', () => {
  assert.equal(pageFromPath('/check-in'), 'counter')
  assert.equal(pageFromPath('/somewhere'), 'counter')
})
