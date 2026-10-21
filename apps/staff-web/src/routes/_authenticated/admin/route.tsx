import { createFileRoute } from '@tanstack/react-router'
import { AdminShell } from '@staff-web/features/admin-console/AdminShell'

export const Route = createFileRoute('/_authenticated/admin')({
  component: AdminShell,
})
