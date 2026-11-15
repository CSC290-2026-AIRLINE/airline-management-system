import { CheckoutPanel } from '../components/CheckoutPanel'
import { CheckoutShell } from '../components/Shell'

/**
 * Interim host for Feature 5's checkout panel until Feature 3's Review & Pay page exists and mounts <CheckoutPanel />
 * itself. Feature 5 owns no Pay page: only the fee summary, voucher box and Pay button below are ours.
 */
export function CheckoutPage({ bookingReference }: { bookingReference: string }) {
  return (
    <CheckoutShell>
      <h1 className="pay-h1">Review &amp; pay</h1>
      <p className="pay-sub">Check the total, add a voucher if you have one, then pay on our partner's secure page.</p>
      <CheckoutPanel bookingReference={bookingReference} />
    </CheckoutShell>
  )
}
