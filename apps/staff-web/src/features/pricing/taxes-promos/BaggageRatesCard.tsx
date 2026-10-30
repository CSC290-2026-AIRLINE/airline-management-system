import { useEffect, useState, type KeyboardEvent } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Switch } from '@staff-web/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import { CABINS, errorMessage, usePricingApi } from '../api'
import { useAddOnChargesApi, type BaggageRate, type BaggageRateInput } from '../add-on-charges/api'
import { routeLabel } from '../add-on-charges/labels'
import { useLoad } from '../hooks/useLoad'
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { BaggageRateDialog, KG, MONEY } from './BaggageRateDialog'
import { OUTLINE_BUTTON } from './charge-styles'
import { TryFee } from './TryFee'

const NOTICE_MS = 2000

// Widths from the design; the last column takes what is left.
const COLUMNS = [
  { label: 'Class', className: 'w-[90px] pl-4' },
  { label: 'Route', className: 'w-[220px]' },
  { label: 'Free (kg)', className: 'w-[140px]' },
  { label: 'Per extra kg', className: 'w-[160px]' },
  { label: 'Max bag (kg)', className: 'w-[140px]' },
  { label: 'Active' },
]

// shadcn's switch resized to the design: 36×20 on desktop, 42×24 on phones. The thumb is its only child.
const SWITCH =
  'data-checked:bg-(--pr-good) data-unchecked:bg-(--pr-border) data-[size=default]:h-5 data-[size=default]:w-9 [&>span]:data-checked:translate-x-[18px]!'
const PHONE_SWITCH =
  'data-checked:bg-(--pr-good) data-unchecked:bg-(--pr-border) data-[size=default]:h-6 data-[size=default]:w-[42px] [&>span]:size-5! [&>span]:data-checked:translate-x-5!'

type Patch = Partial<BaggageRateInput>
type Selection = { rate: BaggageRate | null } | null // rate null = adding a new one

function rateName(rate: BaggageRate): string {
  return `${rate.fare_class.code} · ${routeLabel(rate.route)}`
}

function rateKey(rate: BaggageRate): number {
  return CABINS.indexOf(rate.fare_class.cabin)
}

export function BaggageRatesCard() {
  const api = useAddOnChargesApi()
  const pricingApi = usePricingApi()
  const isPhone = useMediaQuery(PHONE_QUERY)
  const rates = useLoad(() => api.listBaggageRates(), 'baggage-rates')
  const fareClasses = useLoad(() => pricingApi.listFareClasses(true), 'fare-classes:all')
  const routes = useLoad(() => pricingApi.listRouteOptions(), 'routes')
  const currency = useLoad(() => pricingApi.getBaseCurrency(), 'currency')
  const [selection, setSelection] = useState<Selection>(null)
  const [notice, setNotice] = useState<{ text: string } | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const loadError = rates.error ?? fareClasses.error ?? routes.error ?? currency.error
  const ready = rates.data && fareClasses.data && routes.data && currency.data

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  function done(text: string) {
    setNotice({ text })
    setRowError(null)
    setSelection(null)
    rates.reload()
  }

  // Resolves to the error message, or null once saved, so the input can mark itself.
  async function saveRow(rate: BaggageRate, patch: Patch): Promise<string | null> {
    setRowError(null)
    try {
      await api.updateBaggageRate(rate.id, patch)
      done(`${rateName(rate)} saved`)
      return null
    } catch (error) {
      const message = errorMessage(error)
      setRowError(`${rateName(rate)}: ${message}`)
      return message
    }
  }

  async function toggleActive(rate: BaggageRate) {
    setTogglingId(rate.id)
    await saveRow(rate, { is_active: !rate.is_active })
    setTogglingId(null)
  }

  // Same fare class together, default row first: the API already sorts route_id nulls first and sort() keeps that order.
  const rows = [...(rates.data ?? [])].sort((a, b) => rateKey(a) - rateKey(b) || a.fare_class.code.localeCompare(b.fare_class.code))
  const rowProps = (rate: BaggageRate): RowProps => ({
    rate,
    toggling: togglingId === rate.id,
    onSave: (patch) => saveRow(rate, patch),
    onInvalid: (message) => setRowError(message && `${rateName(rate)}: ${message}`),
    onToggle: () => void toggleActive(rate),
    onEdit: () => setSelection({ rate }),
  })

  return (
    <section
      className="flex flex-col gap-3.5 rounded-(--pr-radius-card) border border-(--pr-border) bg-(--pr-surface) p-5"
      aria-labelledby="baggage-rates-title"
    >
      {/* The h2 keeps its pr- class: the bare h2 rule in index.css is unlayered and beats Tailwind utilities. */}
      <div className="pr-card-head">
        <h2 id="baggage-rates-title" className="pr-card-title">
          Overweight baggage rates
        </h2>
        <p className="pr-muted leading-[normal]">
          Free allowance and fee per extra kg, by fare class. A route row overrides the all-routes row. Feature 6 asks for the fee at bag
          drop; it is not taxed.
        </p>
      </div>

      <div role="status" aria-live="polite" className="empty:hidden">
        {notice && (
          <p className="rounded-(--pr-radius-lg) bg-(--pr-good-bg) px-3.5 py-2.5 text-xs leading-[normal] font-semibold text-(--pr-good)">
            {notice.text}
          </p>
        )}
      </div>

      {rowError && (
        <div className="pr-callout is-error" role="alert">
          {rowError}
        </div>
      )}

      {loadError ? (
        <div className="pr-callout is-error" role="alert">
          Could not load baggage rates: {loadError}{' '}
          <button
            type="button"
            className="pr-link-button"
            onClick={() => {
              rates.reload()
              fareClasses.reload()
              routes.reload()
              currency.reload()
            }}
          >
            Retry
          </button>
        </div>
      ) : !ready ? (
        <p className="pr-state">Loading baggage rates…</p>
      ) : fareClasses.data!.length === 0 ? (
        <p className="pr-state">No fare classes yet. Add them on Fare Setup first.</p>
      ) : rows.length === 0 ? (
        <p className="pr-state">No baggage rates yet. Add a default rate for each fare class.</p>
      ) : isPhone ? (
        <ul className="flex flex-col gap-2.5">
          {rows.map((rate) => (
            <li key={rate.id}>
              <RatePhoneCard {...rowProps(rate)} />
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
              {rows.map((rate) => (
                <RateTableRow key={rate.id} {...rowProps(rate)} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Not in the design, which has no way to create a rate; without this the table can only ever be empty. */}
      {ready && fareClasses.data!.length > 0 && (
        <Button
          type="button"
          variant="outline"
          className={`self-start max-[800px]:self-stretch ${OUTLINE_BUTTON}`}
          onClick={() => setSelection({ rate: null })}
        >
          +&nbsp;&nbsp;Add baggage rate
        </Button>
      )}

      {ready && <TryFee rates={rows} currency={currency.data!} />}

      {selection && ready && (
        <BaggageRateDialog
          rate={selection.rate}
          fareClasses={fareClasses.data!}
          routes={routes.data!}
          currency={currency.data!}
          onSaved={(saved) => done(`${rateName(saved)} ${selection.rate ? 'saved' : 'added'}`)}
          onRemoved={(removed) => done(`${rateName(removed)} removed`)}
          onClose={() => setSelection(null)}
        />
      )}
    </section>
  )
}

interface RowProps {
  rate: BaggageRate
  toggling: boolean
  onSave: (patch: Patch) => Promise<string | null>
  onInvalid: (message: string | null) => void
  onToggle: () => void
  onEdit: () => void
}

function RateTableRow({ rate, toggling, onSave, onInvalid, onToggle, onEdit }: RowProps) {
  const name = rateName(rate)
  return (
    <TableRow className="h-[52px] border-(--pr-divider) hover:bg-transparent">
      <TableCell className="py-0 pr-3 pl-4 font-bold">{rate.fare_class.code}</TableCell>
      <TableCell className="truncate px-3 py-0">{routeLabel(rate.route)}</TableCell>
      <TableCell className="px-3 py-0">
        <FreeKgInput key={rate.free_allowance_kg} rate={rate} label={`${name} free kg`} onSave={onSave} onInvalid={onInvalid} />
      </TableCell>
      <TableCell className="px-3 py-0">
        <PerKgInput key={rate.rate_per_kg} rate={rate} label={`${name} per extra kg`} onSave={onSave} onInvalid={onInvalid} />
      </TableCell>
      <TableCell className="px-3 py-0">{rate.max_bag_kg === null ? 'No limit' : Number(rate.max_bag_kg)}</TableCell>
      <TableCell className="px-3 py-0">
        <div className="flex items-center justify-between gap-2">
          <Switch
            className={SWITCH}
            aria-label={`${name} active`}
            checked={rate.is_active}
            disabled={toggling}
            onCheckedChange={onToggle}
          />
          <EditButton name={name} onEdit={onEdit} />
        </div>
      </TableCell>
    </TableRow>
  )
}

// Phone: one card per rate, in place of the table.
function RatePhoneCard({ rate, toggling, onSave, onInvalid, onToggle, onEdit }: RowProps) {
  const name = rateName(rate)
  return (
    <div className="flex flex-col gap-2 rounded-(--pr-radius-field) border border-(--pr-divider) bg-(--pr-surface) p-3 text-(--pr-primary)">
      <div className="flex items-center gap-2">
        <span className="rounded-(--pr-radius-lg) bg-(--pr-tint) px-[9px] py-1.5 text-xs leading-[normal] font-bold">
          {rate.fare_class.code}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm leading-[normal] font-semibold">{routeLabel(rate.route)}</span>
        <span className="text-[11px] leading-[normal] whitespace-nowrap text-(--pr-muted)">
          {rate.max_bag_kg === null ? 'No limit' : `Max ${Number(rate.max_bag_kg)} kg`}
        </span>
        <Switch
          className={PHONE_SWITCH}
          aria-label={`${name} active`}
          checked={rate.is_active}
          disabled={toggling}
          onCheckedChange={onToggle}
        />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <FreeKgInput key={rate.free_allowance_kg} rate={rate} label="Free (kg)" isPhone onSave={onSave} onInvalid={onInvalid} />
        <PerKgInput key={rate.rate_per_kg} rate={rate} label="Per extra kg" isPhone onSave={onSave} onInvalid={onInvalid} />
      </div>
      <div className="flex justify-end">
        <EditButton name={name} onEdit={onEdit} />
      </div>
    </div>
  )
}

// Not in the design: the only way to change the route or max bag, or to remove a rate.
function EditButton({ name, onEdit }: { name: string; onEdit: () => void }) {
  return (
    <button
      type="button"
      className="rounded-(--pr-radius-sm) text-xs font-semibold text-(--pr-primary) underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-(--pr-primary)"
      aria-label={`Edit ${name}`}
      onClick={onEdit}
    >
      Edit
    </button>
  )
}

interface FieldInputProps {
  rate: BaggageRate
  label: string
  isPhone?: boolean
  onSave: (patch: Patch) => Promise<string | null>
  onInvalid: (message: string | null) => void
}

function FreeKgInput({ rate, ...props }: FieldInputProps) {
  const max = rate.max_bag_kg === null ? null : Number(rate.max_bag_kg)
  return (
    <SavedInput
      {...props}
      id={`baggage-free-${rate.id}`}
      saved={String(Number(rate.free_allowance_kg))}
      validate={(text) => {
        if (!KG.test(text)) return '0 or more, up to 1 decimal'
        return max !== null && Number(text) >= max ? `Must be less than the ${max} kg max bag` : null
      }}
      patch={(value) => ({ free_allowance_kg: value })}
    />
  )
}

function PerKgInput({ rate, ...props }: FieldInputProps) {
  return (
    <SavedInput
      {...props}
      id={`baggage-rate-${rate.id}`}
      saved={Number(rate.rate_per_kg).toFixed(2)}
      validate={(text) => (MONEY.test(text) ? null : '0 or more, up to 2 decimals')}
      patch={(value) => ({ rate_per_kg: value })}
    />
  )
}

interface SavedInputProps extends Omit<FieldInputProps, 'rate'> {
  id: string
  saved: string
  validate: (text: string) => string | null
  patch: (value: number) => Patch
}

// The design has no Save button on this card, so a field saves when you leave it or press Enter; Esc puts it back.
// Callers key this on the saved value, so a fresh value from the server remounts it with that text.
function SavedInput({ id, label, isPhone, saved, validate, patch, onSave, onInvalid }: SavedInputProps) {
  const [text, setText] = useState(saved)
  const [invalid, setInvalid] = useState(false)

  async function commit() {
    const value = text.trim()
    if (value === '' || Number(value) === Number(saved)) {
      setText(saved)
      setInvalid(false)
      onInvalid(null)
      return
    }
    const problem = validate(value)
    setInvalid(problem !== null)
    if (problem) {
      onInvalid(problem)
      return
    }
    setInvalid((await onSave(patch(Number(value)))) !== null)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      setText(saved)
      setInvalid(false)
      onInvalid(null)
    }
  }

  // The ! beats .pr-shell input, which is unlayered and sets the width, padding, radius and font.
  const input = (
    <Input
      id={id}
      className={cn(
        'rounded-(--pr-radius-lg)! tabular-nums',
        isPhone ? 'h-[42px] px-3! py-0! text-sm!' : 'h-9 w-24! px-2.5! py-[7px]! text-right font-medium!',
      )}
      inputMode="decimal"
      aria-label={isPhone ? undefined : label}
      aria-invalid={invalid ? true : undefined}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={handleKeyDown}
    />
  )
  if (!isPhone) return input
  return (
    <div className="flex min-w-0 flex-col gap-[5px]">
      <Label htmlFor={id} className="block text-[10px] leading-[normal] font-semibold tracking-[0.4px] text-(--pr-muted) uppercase">
        {label}
      </Label>
      {input}
    </div>
  )
}
