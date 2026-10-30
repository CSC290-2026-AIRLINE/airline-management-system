import { useEffect, useState } from 'react'
import { errorMessage, usePricingApi, type PromoCode } from '../api'
import { useLoad } from '../hooks/useLoad'
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { NewPromoDialog } from './NewPromoDialog'
import { discountText, kindLabel, promoStatus, statusLabel, usesText, validText, type PromoStatus } from './promo-format'

const NOTICE_MS = 2000
const PROMOS_PER_PAGE = 4 // phone only; the desktop table shows every code

interface PromoCodesCardProps {
  refreshKey: number // goes up when a redeem changes a Uses count
}

export function PromoCodesCard({ refreshKey }: PromoCodesCardProps) {
  const api = usePricingApi()
  const isPhone = useMediaQuery(PHONE_QUERY)
  // Inactive codes are included so staff can switch them back on.
  const promos = useLoad(() => api.listPromoCodes(), `promo-codes:${refreshKey}`)
  const currency = useLoad(() => api.getBaseCurrency(), 'currency')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string } | null>(null)
  const [page, setPage] = useState(0)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  const list = promos.data ?? []
  const unit = currency.data ?? ''
  // Clamped so a shorter list after a reload never leaves the phone on an empty page.
  const pageCount = Math.max(1, Math.ceil(list.length / PROMOS_PER_PAGE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageStart = currentPage * PROMOS_PER_PAGE

  async function setActive(promo: PromoCode) {
    setBusy(promo.id)
    setActionError(null)
    try {
      await api.setPromoCodeActive(promo.id, !promo.is_active)
    } catch (e) {
      setActionError(errorMessage(e))
    } finally {
      setBusy(null)
      promos.reload()
    }
  }

  function activeSwitch(promo: PromoCode) {
    return (
      <button
        type="button"
        role="switch"
        className="pr-switch"
        aria-checked={promo.is_active}
        aria-label={`${promo.code} active`}
        disabled={busy !== null}
        onClick={() => void setActive(promo)}
      >
        <span className="pr-switch-thumb" />
      </button>
    )
  }

  function statusBadge(status: PromoStatus) {
    return <span className={`pr-status is-${status}`}>{statusLabel(status)}</span>
  }

  const now = new Date()

  const body = promos.error ? (
    <div className="pr-callout is-error" role="alert">
      Could not load promo codes: {promos.error}{' '}
      <button type="button" className="pr-link-button" onClick={promos.reload}>
        Retry
      </button>
    </div>
  ) : !promos.data ? (
    <p className="pr-state">Loading promo codes…</p>
  ) : list.length === 0 ? (
    <p className="pr-state">No promo or corporate codes yet.</p>
  ) : isPhone ? (
    <ul className="pr-promo-cards">
      {list.slice(pageStart, pageStart + PROMOS_PER_PAGE).map((promo) => (
        <li key={promo.id} className="pr-promo-card">
          <span className="pr-promo-code">{promo.code}</span>
          <div className="pr-promo-name">
            <strong>
              {kindLabel(promo.kind)} · {validText(promo)}
            </strong>
            <span>{usesText(promo)} uses</span>
          </div>
          <span className="pr-promo-discount">{discountText(promo, unit)}</span>
          <div className="pr-promo-bottom">
            {statusBadge(promoStatus(promo, now))}
            {activeSwitch(promo)}
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <div className="pr-table-wrap">
      <table className="pr-table pr-rules-table">
        <thead>
          <tr>
            <th scope="col">Code</th>
            <th scope="col">Kind</th>
            <th scope="col">Discount</th>
            <th scope="col">Valid</th>
            <th scope="col">Uses</th>
            <th scope="col">Status</th>
            <th scope="col">Active</th>
          </tr>
        </thead>
        <tbody>
          {list.map((promo) => (
            <tr key={promo.id}>
              <td className="pr-mono">{promo.code}</td>
              <td>{kindLabel(promo.kind)}</td>
              <td>{discountText(promo, unit)}</td>
              <td>{validText(promo)}</td>
              <td>{usesText(promo)}</td>
              <td>{statusBadge(promoStatus(promo, now))}</td>
              <td>{activeSwitch(promo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      <div role="status" aria-live="polite" className="pr-banner-slot">
        {notice && <p className="pr-banner is-success">{notice.text}</p>}
      </div>

      <section className="pr-card" aria-labelledby="promo-card-title">
        <div className="pr-card-head">
          <h2 id="promo-card-title" className="pr-card-title">
            Promo and corporate codes
          </h2>
          <p className="pr-muted">Applied after the pricing rules and before taxes.</p>
        </div>

        {body}

        {actionError && (
          <div className="pr-callout is-error" role="alert">
            {actionError}
          </div>
        )}

        <button type="button" className="pr-button is-outline pr-add-button" disabled={!promos.data} onClick={() => setAdding(true)}>
          + Add promo or corporate code
        </button>
      </section>

      {isPhone && promos.data && pageCount > 1 && (
        <nav className="pr-pager" aria-label="Promo code pages">
          <p aria-live="polite">
            Page {currentPage + 1} of {pageCount}
          </p>
          <div className="pr-pager-buttons">
            {currentPage > 0 && (
              <button type="button" className="pr-button is-outline" onClick={() => setPage(currentPage - 1)}>
                ‹ Previous
              </button>
            )}
            {currentPage < pageCount - 1 && (
              <button type="button" className="pr-button is-primary" onClick={() => setPage(currentPage + 1)}>
                Next page ›
              </button>
            )}
          </div>
        </nav>
      )}

      {adding && (
        <NewPromoDialog
          currency={unit}
          onClose={() => setAdding(false)}
          onCreated={(promo) => {
            setAdding(false)
            setNotice({ text: `Code ${promo.code} added` })
            promos.reload()
          }}
        />
      )}
    </>
  )
}
