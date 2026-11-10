import { useEffect, useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { usePricingApi } from '../api'
import { useAddOnChargesApi, type TaxFee } from '../add-on-charges/api'
import { calcTypeShortLabel, taxKindLabel, taxValueLabel } from '../add-on-charges/labels'
import { useLoad } from '../hooks/useLoad'
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { CARD_BODY, CARD_TITLE, OUTLINE_BUTTON, TABLE_HEAD, TABLE_HEAD_ROW, TABLE_WRAP } from './charge-styles'
import { Notice } from '../components/Notice'
import { TaxFeeDialog } from './TaxFeeDialog'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Badge } from '@staff-web/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'

const NOTICE_MS = 2000

// Widths from the design; the last column takes what is left.
const COLUMNS = [
  { label: 'Code', className: 'w-[120px] pl-4' },
  { label: 'Name', className: 'w-[240px]' },
  { label: 'Kind', className: 'w-[150px]' },
  { label: 'Calc', className: 'w-[130px]' },
  { label: 'Value', className: 'w-[160px]' },
  { label: 'Active' },
]

type Selection = { taxFee: TaxFee | null } | null // taxFee null = adding a new one

export function TaxFeesCard() {
  const api = useAddOnChargesApi()
  const pricingApi = usePricingApi()
  const isPhone = useMediaQuery(PHONE_QUERY)
  const list = useLoad(() => api.listTaxFees(), 'tax-fees')
  const currency = useLoad(() => pricingApi.getBaseCurrency(), 'currency')
  const [selection, setSelection] = useState<Selection>(null)
  const [notice, setNotice] = useState<{ text: string } | null>(null)
  const loadError = list.error ?? currency.error

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  function done(text: string) {
    setNotice({ text })
    setSelection(null)
    list.reload()
  }

  const rows = list.data ?? []
  const unit = currency.data ?? ''

  return (
    <Card aria-labelledby="tax-fees-title">
      <CardHeader>
        <CardTitle id="tax-fees-title" role="heading" aria-level={2} className={CARD_TITLE}>
          Taxes, surcharges and fees
        </CardTitle>
        <CardDescription>
          Added after the fare and any promo, each as its own line on the quote. {isPhone ? 'Tap' : 'Click'} a row to edit it.
        </CardDescription>
      </CardHeader>
      <CardContent className={CARD_BODY}>
        <Notice text={notice?.text} />

        {loadError ? (
          <Alert variant="destructive">
            <AlertDescription className="block">
              Could not load taxes and fees: {loadError}{' '}
              <Button
                variant="link"
                className="h-auto p-0"
                type="button"

                onClick={() => {
                  list.reload()
                  currency.reload()
                }}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : !list.data || !currency.data ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading taxes and fees…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No taxes or fees yet.</p>
        ) : isPhone ? (
          <ul className="flex flex-col gap-2.5">
            {rows.map((taxFee) => (
              <li key={taxFee.id}>
                <TaxFeeRowCard taxFee={taxFee} unit={unit} onSelect={() => setSelection({ taxFee })} />
              </li>
            ))}
          </ul>
        ) : (
          <div className={TABLE_WRAP}>
            <Table className="table-fixed text-[13px] text-(--pr-primary)">
              <TableHeader className="[&_tr]:border-0">
                <TableRow className={TABLE_HEAD_ROW}>
                  {COLUMNS.map((column) => (
                    <TableHead key={column.label} className={`${TABLE_HEAD} ${column.className ?? ''}`}>
                      {column.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((taxFee) => (
                  <TableRow key={taxFee.id} className="relative h-14 border-(--pr-divider) hover:bg-(--pr-selected)">
                    <TableCell className="py-0 pr-3 pl-4">
                      {/* The whole row is the click target; the ::after stretches this button over it for mouse and keyboard. */}
                      <Button
                        variant="link"
                        type="button"
                        className="h-auto p-0 font-bold text-foreground after:absolute after:inset-0 focus-visible:ring-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                        aria-label={`Edit ${taxFee.code}, ${taxFee.name}`}
                        onClick={() => setSelection({ taxFee })}
                      >
                        {taxFee.code}
                      </Button>
                    </TableCell>
                    <TableCell className="truncate px-3 py-0">{taxFee.name}</TableCell>
                    <TableCell className="px-3 py-0">{taxKindLabel(taxFee.kind)}</TableCell>
                    <TableCell className="px-3 py-0">{calcTypeShortLabel(taxFee.calc_type)}</TableCell>
                    <TableCell className="px-3 py-0">{taxValueLabel(taxFee.calc_type, taxFee.value, unit)}</TableCell>
                    <TableCell className="px-3 py-0">{taxFee.is_active ? 'Yes' : 'No'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          className={`self-start max-[800px]:self-stretch ${OUTLINE_BUTTON}`}
          onClick={() => setSelection({ taxFee: null })}
        >
          +&nbsp;&nbsp;Add tax or fee
        </Button>

        {selection && (
          <TaxFeeDialog
            taxFee={selection.taxFee}
            currency={unit}
            onSaved={(saved) => done(`${saved.name} ${selection.taxFee ? 'saved' : 'added'}`)}
            onRemoved={(removed) => done(`${removed.name} removed`)}
            onClose={() => setSelection(null)}
          />
        )}
      </CardContent>
    </Card>
  )
}

interface TaxFeeRowCardProps {
  taxFee: TaxFee
  unit: string
  onSelect: () => void
}

// Phone: one tappable card per tax, in place of the table.
function TaxFeeRowCard({ taxFee, unit, onSelect }: TaxFeeRowCardProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto w-full flex-col items-start gap-1.5 p-3 text-left whitespace-normal"
      onClick={onSelect}
    >
      <span className="flex w-full items-center gap-2.5">
        <Badge variant="outline">{taxFee.code}</Badge>
        <span className="flex min-w-0 flex-1 flex-col gap-px leading-[normal]">
          <span className="truncate text-sm font-semibold">{taxFee.name}</span>
          <span className="text-xs text-(--pr-muted)">
            {taxKindLabel(taxFee.kind)} · {calcTypeShortLabel(taxFee.calc_type)}
          </span>
        </span>
        <span className="text-[15px] leading-[normal] font-bold whitespace-nowrap">
          {taxValueLabel(taxFee.calc_type, taxFee.value, unit)}
        </span>
      </span>
      <Badge variant={taxFee.is_active ? 'default' : 'secondary'}>{taxFee.is_active ? 'Active' : 'Inactive'}</Badge>
    </Button>
  )
}
