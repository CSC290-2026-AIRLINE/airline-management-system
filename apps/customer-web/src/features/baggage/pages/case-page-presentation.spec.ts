import assert from 'node:assert/strict'
import test from 'node:test'
import { canReportBagFoundByPassenger, caseProgressPresentation, caseStatusLabel, shouldShowNoOpenCase } from './case-page-presentation.ts'

test('open cases stay Open and use the searching progress stages', () => {
  assert.equal(caseStatusLabel('open', null), 'Open')
  assert.deepEqual(caseProgressPresentation('open', null), {
    steps: ['Searching', 'Bag found', 'On its way', 'Back with you'],
    activeStep: 0,
  })
  assert.equal(canReportBagFoundByPassenger('open'), true)
})

test('lost cases are distinct and show only confirmed timeout progress', () => {
  assert.equal(caseStatusLabel('lost', null), 'Lost')
  assert.deepEqual(caseProgressPresentation('lost', null), {
    steps: ['Reported', 'Not found in 21 days'],
    activeStep: 1,
  })
  assert.equal(canReportBagFoundByPassenger('lost'), false)
  assert.equal(canReportBagFoundByPassenger('matched'), false)
  assert.equal(canReportBagFoundByPassenger('delivering'), false)
})

test('delivery lifecycle states take precedence if an older lost report later progresses', () => {
  assert.equal(caseStatusLabel('lost', 'in_transit'), 'Being delivered')
  assert.deepEqual(caseProgressPresentation('lost', 'in_transit'), {
    steps: ['Searching', 'Bag found', 'On its way', 'Back with you'],
    activeStep: 2,
  })
  assert.equal(caseStatusLabel('lost', 'delivered'), 'Back with you')
})

test('the no-case presentation appears only when no case is open and lookup is idle without an error', () => {
  assert.equal(shouldShowNoOpenCase(false, false, false), true)
  assert.equal(shouldShowNoOpenCase(false, true, false), false)
  assert.equal(shouldShowNoOpenCase(false, false, true), false)
  assert.equal(shouldShowNoOpenCase(true, false, false), false)
})
