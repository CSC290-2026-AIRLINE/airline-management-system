import type { PaymentSchedule } from './finance-api'

export type BillStatus = { kind: 'overdue' } | { kind: 'scheduled' } | { kind: 'paid'; on: string }

// Overdue = still scheduled and due before today, the same rule as the backend's ?overdue=true.
export function statusOf(bill: PaymentSchedule, today: string): BillStatus {
  if (bill.status === 'paid' && bill.paid_on) {
    return { kind: 'paid', on: bill.paid_on }
  }
  return bill.due_date.slice(0, 10) < today ? { kind: 'overdue' } : { kind: 'scheduled' }
}
