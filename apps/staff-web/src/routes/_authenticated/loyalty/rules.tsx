import { createFileRoute } from '@tanstack/react-router'
import { RulesPage } from '../../../features/loyalty/components/RulesPage'

export const Route = createFileRoute('/_authenticated/loyalty/rules')({
  component: RulesPage,
})
