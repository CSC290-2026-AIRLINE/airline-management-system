import { createFileRoute } from '@tanstack/react-router'
import { StatementPage } from '../../../features/loyalty/components/StatementPage'

export const Route = createFileRoute('/_authenticated/loyalty/statement')({
  component: StatementPage,
})
