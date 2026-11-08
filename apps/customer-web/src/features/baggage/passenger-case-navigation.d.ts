import type { CaseAccess } from './pages/lost-report-form'

declare module '@tanstack/history' {
  interface HistoryState {
    passengerCaseAccess?: CaseAccess
  }
}

export {}
