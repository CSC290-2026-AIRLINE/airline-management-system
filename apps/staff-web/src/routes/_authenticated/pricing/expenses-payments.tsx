import { createFileRoute } from '@tanstack/react-router'
import { ExpensesPaymentsPage } from '@staff-web/features/pricing/finance/ExpensesPaymentsPage'

export const Route = createFileRoute('/_authenticated/pricing/expenses-payments')({
  component: ExpensesPaymentsPage,
})
