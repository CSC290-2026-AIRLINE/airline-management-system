export interface AccountCaseListItem {
  caseNumber: string
  passengerFirstName: string
  passengerLastName: string
  bagType: string
  colour: string
  brand: string | null
  status: string
  reportedAt: string
}

export const ACCOUNT_CASES_PAGE_SIZE = 4

export function hasAccountCaseManagementCapability(value: unknown): value is true {
  return value === true
}

export function visibleAccountCaseSuggestions(
  cases: AccountCaseListItem[],
  visibleCount: number,
): Array<Pick<AccountCaseListItem, 'caseNumber'>> {
  return cases.slice(0, Math.max(0, Math.floor(visibleCount))).map(({ caseNumber }) => ({ caseNumber }))
}

export interface AccountCaseListState {
  status: 'loading' | 'ready' | 'error'
  cases: AccountCaseListItem[]
  selectedCaseNumber: string | null
  error: string
}

export type AccountCaseListAction =
  | { type: 'loading' }
  | { type: 'loaded'; cases: AccountCaseListItem[] }
  | { type: 'failed'; error: string }
  | { type: 'selected'; caseNumber: string | null }

export function createAccountCaseListState(): AccountCaseListState {
  return { status: 'loading', cases: [], selectedCaseNumber: null, error: '' }
}

export function accountCaseListReducer(state: AccountCaseListState, action: AccountCaseListAction): AccountCaseListState {
  switch (action.type) {
    case 'loading':
      return { status: 'loading', cases: [], selectedCaseNumber: null, error: '' }
    case 'loaded':
      return { ...state, status: 'ready', cases: action.cases, error: '' }
    case 'failed':
      return { status: 'error', cases: [], selectedCaseNumber: null, error: action.error }
    case 'selected':
      return action.caseNumber === null
        ? { ...state, selectedCaseNumber: null }
        : state.cases.some((item) => item.caseNumber === action.caseNumber)
          ? { ...state, selectedCaseNumber: action.caseNumber }
          : state
  }
}
