import { useEffect, useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { usePricingApi } from '../api'
import { useAddOnChargesApi, type TaxFee } from '../add-on-charges/api'
import { calcTypeShortLabel, taxKindLabel, taxValueLabel } from '../add-on-charges/labels'
import { useLoad } from '../hooks/useLoad'
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { OUTLINE_BUTTON } from './charge-styles'
import { TaxFeeDialog } from './TaxFeeDialog'

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
    <section
      className="flex flex-col gap-3.5 rounded-(--pr-radius-card) border border-(--pr-border) bg-(--pr-surface) p-5"
      aria-labelledby="tax-fees-title"
    >
      {/* The h2 keeps its pr- class: the bare h2 rule in index.css is unlayered and beats Tailwind utilities. */}
      <div className="pr-card-head">
        <h2 id="tax-fees-title" className="pr-card-title">
          Taxes, surcharges and fees
        </h2>
        <p className="pr-muted leading-[normal]">
          Added after the fare and any promo, each as its own line on the quote. {isPhone ? 'Tap' : 'Click'} a row to edit it.
        </p>
      </div>

      <div role="status" aria-live="polite" className="empty:hidden">
        {notice && (
          <p className="rounded-(--pr-radius-lg) bg-(--pr-good-bg) px-3.5 py-2.5 text-xs leading-[normal] font-semibold text-(--pr-good)">
            {notice.text}
          </p>
        )}
      </div>

      {loadError ? (
        <div className="pr-callout is-error" role="alert">
          Could not load taxes and fees: {loadError}{' '}
          <button
            type="button"
            className="pr-link-button"
            onClick={() => {
              list.reload()
              currency.reload()
            }}
          >
            Retry
          </button>
        </div>
      ) : !list.data || !currency.data ? (
        <p className="pr-state">Loading taxes and fees…</p>
      ) : rows.length === 0 ? (
        <p className="pr-state">No taxes or fees yet.</p>
      ) : isPhone ? (
        <ul className="flex flex-col gap-2.5">
          {rows.map((taxFee) => (
            <li key={taxFee.id}>
              <TaxFeeRowCard taxFee={taxFee} unit={unit} onSelect={() => setSelection({ taxFee })} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="border border-(--pr-border)">
          <Table className="table-fixed text-[13px] text-(--pr-primary)">
            <TableHeader className="[&_tr]:border-0">
              <TableRow className="bg-(--pr-head) hover:bg-(--pr-head)">
                {COLUMNS.map((column) => (
                  <TableHead
                    key={column.label}
                    className={`h-10 px-3 text-[11px] font-semibold text-(--pr-primary) uppercase ${column.className ?? ''}`}
                  >
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
                    <button
                      type="button"
                      className="font-bold outline-none after:absolute after:inset-0 after:ring-(--pr-primary) after:ring-inset focus-visible:after:ring-2"
                      aria-label={`Edit ${taxFee.code}, ${taxFee.name}`}
                      onClick={() => setSelection({ taxFee })}
                    >
                      {taxFee.code}
                    </button>
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
    </section>
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
    <button
      type="button"
      className="flex w-full flex-col items-start gap-1.5 rounded-(--pr-radius-field) border border-(--pr-divider) bg-(--pr-surface) p-3 text-left text-(--pr-primary) outline-none focus-visible:ring-2 focus-visible:ring-(--pr-primary)"
      onClick={onSelect}
    >
      <span className="flex w-full items-center gap-2.5">
        <span className="rounded-(--pr-radius-lg) bg-(--pr-tint) px-2 py-1.5 text-xs leading-[normal] font-bold">{taxFee.code}</span>
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
      <span
        className={`rounded-full px-[9px] py-[3px] text-[11px] leading-[normal] font-semibold ${
          taxFee.is_active ? 'bg-(--pr-good-bg) text-(--pr-good)' : 'bg-(--pr-tint) text-(--pr-muted)'
        }`}
      >
        {taxFee.is_active ? 'Active' : 'Inactive'}
      </span>
    </button>
  )
}
