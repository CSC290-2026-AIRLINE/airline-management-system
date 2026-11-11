import { createFileRoute } from '@tanstack/react-router'

/**
 * `/admin/audit-log/$auditId` — the spec's deep link to one audit entry. The parent route (`audit-log.tsx`) renders the
 * Audit log page, which reads `auditId` once on arrival and opens that entry (in place, or in a panel when it is not on
 * the page in view). Opening rows afterwards is page state and does not touch the URL. This child has nothing of its own
 * to draw.
 */
export const Route = createFileRoute('/_authenticated/admin/audit-log/$auditId')({
  component: AuditEntryDeepLink,
})

function AuditEntryDeepLink() {
  return null
}
