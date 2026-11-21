import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { NoAccessScreen } from '@staff-web/features/admin-console/components/NoAccessScreen'
import { useScreenAccess } from '@staff-web/features/admin-console/hooks/useScreenAccess'
import { PaymentDetailPanel } from '../components/PaymentDetailPanel'
import { PageMessage, StaffPageShell } from '../components/StaffPageShell'
import { useStaffPayment } from '../hooks/useStaffPayment'

interface PaymentDetailPageProps {
  paymentId: string
}

/**
 * One payment in full, on its own page.
 *
 * The frames open a payment in a panel on top of the lookup; this page is the same panel on its own URL, for a link that
 * was sent to a staff member. Everything on it is read only.
 */
export function PaymentDetailPage({ paymentId }: PaymentDetailPageProps) {
  const { loading, canOpen, role } = useScreenAccess()
  const detail = useStaffPayment(paymentId)

  if (loading) {
    return (
      <StaffPageShell title="Payment details">
        <p className="text-sm text-muted-foreground">Checking your access…</p>
      </StaffPageShell>
    )
  }

  if (!canOpen('f5.payment_lookup')) {
    return (
      <StaffPageShell title="Payment details">
        {/* `recorded={false}`: the page is refused before any API call, so no `access_denied` row exists for this
            attempt. The backend guard records the ones that reach it. */}
        <NoAccessScreen screenName="Payment lookup" roleName={role?.name} recorded={false} homeTo="/dashboard" />
      </StaffPageShell>
    )
  }

  return (
    <StaffPageShell title="Payment details" subtitle="Everything this payment was for and every state it went through.">
      <div className="flex flex-col gap-4">
        {/* Back to the list, where the payment was found. */}
        <Link
          to="/payments/lookup"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Payment lookup
        </Link>

        {detail.error && (
          <PageMessage
            tone="danger"
            title={detail.notFound ? 'We could not find that payment' : 'The payment could not be loaded'}
            body={detail.error}
          />
        )}

        {!detail.error && detail.loading && (
          <div className="rounded-2xl border border-line bg-card px-6 py-8">
            <p className="m-0 text-center text-sm text-muted-foreground" role="status">
              Loading the payment…
            </p>
          </div>
        )}

        {!detail.error && !detail.loading && detail.payment && (
          <div className="rounded-2xl border border-line bg-card p-8 max-phone:p-4">
            <PaymentDetailPanel payment={detail.payment} />
          </div>
        )}
      </div>
    </StaffPageShell>
  )
}
