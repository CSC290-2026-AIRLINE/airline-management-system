import { usePaymentsApi } from '../api'
import { formatDate, formatMoney, voucherStatusLabel } from '../format'
import { useLoad } from '../useLoad'
import { AccountShell, Chip, Empty, Loading, LoadError, Notice } from '../components/Shell'

/** My vouchers: value, status and expiry, with the note that a voucher is used whole. */
export function VouchersPage() {
  const api = usePaymentsApi()
  const vouchers = useLoad(() => api.myVouchers(), 'mine')

  return (
    <AccountShell title="My vouchers" subtitle="Enter a code at checkout to use it.">
      <Notice>
        A voucher is used whole on one booking. If it is worth more than the booking, the rest is lost — we'll warn you before you pay.
      </Notice>
      {vouchers.loading && !vouchers.data && <Loading />}
      {vouchers.error && <LoadError message={vouchers.error} onRetry={vouchers.reload} />}
      {vouchers.data?.length === 0 && <Empty>You have no vouchers.</Empty>}
      {vouchers.data && vouchers.data.length > 0 && (
        <div className="pay-card">
          <ul className="pay-list">
            {vouchers.data.map((v) => {
              const status = voucherStatusLabel(v.status)
              return (
                <li key={v.id}>
                  <div className="pay-item">
                    <span className="pay-item-main">
                      <span className="pay-code">{v.code}</span>
                      <span className="pay-muted">
                        {v.status === 'redeemed' ? `Used ${formatDate(v.redeemed_at)}` : `Valid until ${formatDate(v.expires_at)}`}
                      </span>
                    </span>
                    <span className="pay-item-side">
                      <span>{formatMoney(v.amount, v.currency)}</span>
                      <Chip tone={status.tone}>{status.label}</Chip>
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </AccountShell>
  )
}
