import { useEffect, useState } from 'react'
import { errorMessage, usePricingApi, type PromoCode } from '../api'
import { useLoad } from '../hooks/useLoad'
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { NewPromoDialog } from './NewPromoDialog'
import { discountText, kindLabel, promoStatus, statusLabel, usesText, validText, type PromoStatus } from './promo-format'
import { Button } from '@staff-web/components/ui/button'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { Switch } from '@staff-web/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Badge } from '@staff-web/components/ui/badge'
import {
  CARD_BODY,
  CARD_TITLE,
  OUTLINE_BUTTON,
  PHONE_SWITCH,
  SWITCH,
  TABLE_HEAD,
  TABLE_HEAD_ROW,
  TABLE_ROW,
  TABLE_WRAP,
} from './charge-styles'
import { Notice } from '../components/Notice'

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
      <Switch
        className={isPhone ? PHONE_SWITCH : SWITCH}
        checked={promo.is_active}
        aria-label={`${promo.code} active`}
        disabled={busy !== null}
        onClick={() => void setActive(promo)}
      />
    )
  }

  function statusBadge(status: PromoStatus) {
    return (
      <Badge variant={status === 'active' ? 'default' : status === 'not_started' ? 'outline' : 'secondary'}>{statusLabel(status)}</Badge>
    )
  }

  const now = new Date()

  const body = promos.error ? (
    <Alert variant="destructive">
      <AlertDescription className="block">
        Could not load promo codes: {promos.error}{' '}
        <Button variant="link" className="h-auto p-0" type="button" onClick={promos.reload}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  ) : !promos.data ? (
    <p className="py-6 text-center text-sm text-muted-foreground">Loading promo codes…</p>
  ) : list.length === 0 ? (
    <p className="py-6 text-center text-sm text-muted-foreground">No promo or corporate codes yet.</p>
  ) : isPhone ? (
    <ul className="flex flex-col gap-2.5">
      {list.slice(pageStart, pageStart + PROMOS_PER_PAGE).map((promo) => (
        <li key={promo.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 rounded-lg border p-3">
          <Badge variant="outline">{promo.code}</Badge>
          <div className="grid min-w-0 gap-px text-xs text-muted-foreground">
            <strong className="text-sm font-semibold text-foreground">
              {kindLabel(promo.kind)} · {validText(promo)}
            </strong>
            <span>{usesText(promo)} uses</span>
          </div>
          <span className="text-[15px] font-bold">{discountText(promo, unit)}</span>
          <div className="col-span-full flex items-center justify-between">
            {statusBadge(promoStatus(promo, now))}
            {activeSwitch(promo)}
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <div className={TABLE_WRAP}>
      <Table className="text-[13px] text-(--pr-primary)">
        <TableHeader className="[&_tr]:border-0">
          <TableRow className={TABLE_HEAD_ROW}>
            {['Code', 'Kind', 'Discount', 'Valid', 'Uses', 'Status', 'Active'].map((label, index) => (
              <TableHead key={label} scope="col" className={`${TABLE_HEAD}${index === 0 ? ' pl-4' : ''}`}>
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((promo) => (
            <TableRow key={promo.id} className={TABLE_ROW}>
              <TableCell className="py-0 pr-3 pl-4 font-bold">{promo.code}</TableCell>
              <TableCell className="px-3 py-0">{kindLabel(promo.kind)}</TableCell>
              <TableCell className="px-3 py-0">{discountText(promo, unit)}</TableCell>
              <TableCell className="px-3 py-0">{validText(promo)}</TableCell>
              <TableCell className="px-3 py-0">{usesText(promo)}</TableCell>
              <TableCell className="px-3 py-0">{statusBadge(promoStatus(promo, now))}</TableCell>
              <TableCell className="px-3 py-0">{activeSwitch(promo)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )

  return (
    <>
      <Card aria-labelledby="promo-card-title">
        <CardHeader>
          <CardTitle id="promo-card-title" role="heading" aria-level={2} className={CARD_TITLE}>
            Promo and corporate codes
          </CardTitle>
          <CardDescription>Applied after the pricing rules and before taxes.</CardDescription>
        </CardHeader>
        <CardContent className={CARD_BODY}>
          <Notice text={notice?.text} />
          {body}

          {actionError && (
            <Alert variant="destructive">
              <AlertDescription className="block">{actionError}</AlertDescription>
            </Alert>
          )}

          <Button
            variant="outline"
            type="button"
            className={`self-start max-[800px]:self-stretch ${OUTLINE_BUTTON}`}
            disabled={!promos.data}
            onClick={() => setAdding(true)}
          >
            + Add promo or corporate code
          </Button>
        </CardContent>
      </Card>

      {isPhone && promos.data && pageCount > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Promo code pages">
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Page {currentPage + 1} of {pageCount}
          </p>
          <div className="flex gap-2">
            {currentPage > 0 && (
              <Button variant="outline" type="button" onClick={() => setPage(currentPage - 1)}>
                ‹ Previous
              </Button>
            )}
            {currentPage < pageCount - 1 && (
              <Button type="button" onClick={() => setPage(currentPage + 1)}>
                Next page ›
              </Button>
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
