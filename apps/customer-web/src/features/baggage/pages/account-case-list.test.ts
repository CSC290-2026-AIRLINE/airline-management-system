import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ACCOUNT_CASES_PAGE_SIZE,
  accountCaseListReducer,
  createAccountCaseListState,
  hasAccountCaseManagementCapability,
  type AccountCaseListItem,
  visibleAccountCaseSuggestions,
} from './account-case-list.ts'

const oneCase: AccountCaseListItem = {
  caseNumber: 'LB-2026-000001',
  passengerFirstName: 'Lina',
  passengerLastName: 'Haddad',
  bagType: 'suitcase',
  colour: 'black',
  brand: 'Samsonite',
  status: 'open',
  reportedAt: '2026-10-29T10:00:00.000Z',
}

test('account case list exposes loading, empty, and error states', () => {
  assert.equal(createAccountCaseListState().status, 'loading')

  const empty = accountCaseListReducer(createAccountCaseListState(), { type: 'loaded', cases: [] })
  assert.equal(empty.status, 'ready')
  assert.deepEqual(empty.cases, [])

  const failed = accountCaseListReducer(empty, { type: 'failed', error: 'Cases could not be loaded.' })
  assert.equal(failed.status, 'error')
  assert.equal(failed.error, 'Cases could not be loaded.')
  assert.equal(accountCaseListReducer(failed, { type: 'loading' }).status, 'loading')
})

test('account case list selects only a case that was returned for this account', () => {
  const loaded = accountCaseListReducer(createAccountCaseListState(), { type: 'loaded', cases: [oneCase] })
  assert.equal(accountCaseListReducer(loaded, { type: 'selected', caseNumber: oneCase.caseNumber }).selectedCaseNumber, oneCase.caseNumber)
  assert.equal(accountCaseListReducer(loaded, { type: 'selected', caseNumber: 'LB-2026-999999' }).selectedCaseNumber, null)
  assert.equal(accountCaseListReducer(loaded, { type: 'selected', caseNumber: null }).selectedCaseNumber, null)
})

test('account case suggestions show a bounded first page while keeping older cases reachable', () => {
  const cases = Array.from({ length: 11 }, (_, index) => ({
    ...oneCase,
    caseNumber: `LB-2026-${String(index + 1).padStart(6, '0')}`,
  }))

  assert.equal(visibleAccountCaseSuggestions(cases, ACCOUNT_CASES_PAGE_SIZE).length, 4)
  assert.deepEqual(
    visibleAccountCaseSuggestions(cases, ACCOUNT_CASES_PAGE_SIZE),
    cases.slice(0, ACCOUNT_CASES_PAGE_SIZE).map(({ caseNumber }) => ({ caseNumber })),
  )
  assert.equal(visibleAccountCaseSuggestions(cases, ACCOUNT_CASES_PAGE_SIZE * 2).length, 8)
  assert.equal(visibleAccountCaseSuggestions(cases, 100).length, cases.length)
})

test('account delivery controls require the server response to contain literal canManage true', () => {
  assert.equal(hasAccountCaseManagementCapability(true), true)
  assert.equal(hasAccountCaseManagementCapability(false), false)
  assert.equal(hasAccountCaseManagementCapability(undefined), false)
  assert.equal(hasAccountCaseManagementCapability('true'), false)
})
