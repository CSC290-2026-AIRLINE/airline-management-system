import { createFileRoute, Outlet } from '@tanstack/react-router'

/**
 * The layout for the customer's receipts.
 *
 * `receipts.index.tsx` is the list and `receipts.$receiptId.tsx` is one receipt; this file only draws the frame they
 * share, so the route files stay thin.
 */
export const Route = createFileRoute('/_authenticated/receipts')({
  component: ReceiptsLayout,
})

function ReceiptsLayout() {
  return <Outlet />
}
