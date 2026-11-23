import { createFileRoute } from '@tanstack/react-router'
import { AuditLogPage } from '@staff-web/features/admin-console/pages/AuditLogPage'

export const Route = createFileRoute('/_authenticated/admin/audit-log')({
  component: AuditLogPage,
})
