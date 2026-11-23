import { createFileRoute } from '@tanstack/react-router'

/**
 * `/admin/staff/$staffId` — the spec's deep link to one staff account. The parent route (`staff.tsx`) renders the Staff
 * & roles page, which reads `staffId` and opens the Edit dialog (a full page on phones) for that account. This child
 * has nothing of its own to draw.
 */
export const Route = createFileRoute('/_authenticated/admin/staff/$staffId')({
  component: StaffDeepLink,
})

function StaffDeepLink() {
  return null
}
