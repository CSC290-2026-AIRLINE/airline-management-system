import { createFileRoute } from '@tanstack/react-router'
import { SetupRulePage } from '@staff-web/features/crew-rostering/setup-rule/setup-rule'

/** The rules that bound every auto-assignment, at `/setup-rule`. */
export const Route = createFileRoute('/_authenticated/_crew/setup-rule')({
  component: () => <SetupRulePage />,
})
