import { useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import type { StaffApi } from '../api/index.ts'
import type { CheckedBagView, StaffCheckInView } from '../api/types.ts'
import { ErrorBanner } from './ErrorBanner.tsx'
import { Message, Pill, type PillTone } from './pills.tsx'
import { messageOf, numberOrNull } from './errors.ts'
import { formatBaht, formatCabin } from '../domain/format.ts'
import { INPUT_LABEL, MUTED, PANEL, PANEL_TITLE, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXT_INPUT } from './styles.ts'

interface Props {
  api: StaffApi
  view: StaffCheckInView
  onUpdated: (view: StaffCheckInView) => void
}

/** The design's KPI card: a bold number over a muted label. */
const KPI_NUMBER = 'text-[28px] font-bold leading-none tracking-[-0.05em] text-[#0a1424]'
/** The design's disabled primary button: grey, not a faded navy. */
const DISABLED_BUTTON = 'h-[39px] rounded-[6px] bg-[#eef1f6] px-[18px] text-sm font-semibold text-[#8b93a3]'

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-[#dbe2ea] bg-white px-5 py-4">
      <span className={KPI_NUMBER}>{value}</span>
      <span className={MUTED}>{label}</span>
    </div>
  )
}

/** The status of a bag at the counter: weighed, waiting for its fee, paid or tagged. */
function bagStatus(bag: CheckedBagView): { tone: PillTone; label: string } {
  if (bag.status === 'tagged') return { tone: 'good', label: 'Tagged' }
  if (bag.status === 'offloaded') return { tone: 'bad', label: 'Offloaded' }
  if (bag.excessFee > 0 && !bag.excessPaymentId) return { tone: 'warn', label: 'Fee due' }
  if (bag.excessFee > 0) return { tone: 'good', label: 'Paid' }
  return { tone: 'neutral', label: 'Weighed' }
}

export function BagDrop({ api, view, onUpdated }: Props) {
  const { allowance, bags, totals } = view
  const [weight, setWeight] = useState('')
  const [size, setSize] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** The bag view carries no size, so the size of the bags weighed here is kept in the page. */
  const [sizes, setSizes] = useState<Record<string, number>>({})

  const freeKg = allowance.freeKg + allowance.tierBonusKg
  const cabin = formatCabin(view.checkIn.passenger.cabin)
  /** The first bag whose fee is still due; it carries the excess that is not paid yet. */
  const unpaid = bags.find((bag) => bag.excessFee > 0 && !bag.excessPaymentId) ?? null
  const unpaidIndex = unpaid ? bags.indexOf(unpaid) + 1 : 0
  const unpaidRate = unpaid?.ratePerKg ?? allowance.ratePerKg
  /** Only the bags that still owe a fee count, so the kilos always match the fee shown next to them. */
  const unpaidExcessKg = bags.filter((bag) => bag.excessFee > 0 && !bag.excessPaymentId).reduce((sum, bag) => sum + bag.excessKg, 0)

  const weigh = async () => {
    const weightKg = numberOrNull(weight)
    const sizeCm = numberOrNull(size)
    if (weightKg === null || weightKg <= 0) {
      setError('Enter the weight of the bag in kg.')
      return
    }
    if (sizeCm === null || sizeCm <= 2) {
      setError('Enter the size of the bag in cm: the length, the width and the height added together.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const before = new Set(bags.map((bag) => bag.id))
      // The API takes the three dimensions, so the measured total is split up; the sum is what the 158 cm limit uses.
      const next = await api.weighBag(view.checkIn.id, {
        weightKg,
        lengthCm: sizeCm - 2,
        widthCm: 1,
        heightCm: 1,
      })
      const added = next.bags.find((bag) => !before.has(bag.id))
      setSizes((current) => (added ? { ...current, [added.id]: sizeCm } : current))
      onUpdated(next)
      setWeight('')
      setSize('')
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (bagId: string) => {
    setBusy(true)
    setError(null)
    try {
      onUpdated(await api.removeBag(bagId))
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const tag = async (bagId: string) => {
    setBusy(true)
    setError(null)
    try {
      const result = await api.tagBag(bagId)
      onUpdated(result.view)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className={`${PANEL} print:hidden`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className={PANEL_TITLE}>Bag drop</h2>
        <p className={MUTED}>
          {view.checkIn.declaredBags === null
            ? 'No bags declared online'
            : `Declared online: ${view.checkIn.declaredBags} ${view.checkIn.declaredBags === 1 ? 'bag' : 'bags'}`}
        </p>
      </div>
      <p className={MUTED}>
        Bags are weighed in order: the first bags use up the allowance, so each bag keeps the excess it added. No bag tag until its fee is
        paid.
      </p>
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi value={`${freeKg} kg`} label={`Free allowance · ${cabin}`} />
        <Kpi value={`${totals.weightKg} kg`} label="Weighed so far" />
        <Kpi value={`${totals.excessKg} kg`} label="Excess over allowance" />
        <Kpi value={formatBaht(allowance.ratePerKg)} label="Excess fee per kg (Feature 4)" />
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void weigh()
        }}
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="bag-weight" className={INPUT_LABEL}>
            Weight (kg)
          </Label>
          <Input
            id="bag-weight"
            className={`${TEXT_INPUT} w-[220px]`}
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            placeholder="0.0"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="bag-size" className={INPUT_LABEL}>
            Size, length + width + height (cm)
          </Label>
          <Input
            id="bag-size"
            className={`${TEXT_INPUT} w-[300px]`}
            inputMode="numeric"
            value={size}
            onChange={(event) => setSize(event.target.value)}
            placeholder={`Max ${allowance.maxLinearCm}`}
          />
        </div>
        <Button type="submit" className={PRIMARY_BUTTON} disabled={busy}>
          Weigh bag
        </Button>
        <span className={MUTED}>
          Max {allowance.maxBagKg} kg per bag · {allowance.maxLinearCm} cm
        </span>
      </form>

      {unpaid ? (
        <Message tone="warn">
          Bag {unpaidIndex} adds {unpaid.excessKg} kg over the allowance. Take the fee before printing its tag (EXCESS_UNPAID).
        </Message>
      ) : null}

      {bags.length === 0 ? (
        <p className={MUTED}>No bag weighed yet.</p>
      ) : (
        <Table className="text-sm">
          <TableHeader>
            <TableRow className="border-[#dbe2ea] hover:bg-transparent">
              <TableHead className="h-auto w-[5%] px-3 py-2 text-xs font-normal uppercase tracking-wide text-[#677287]">#</TableHead>
              <TableHead className="h-auto px-3 py-2 text-xs font-normal uppercase tracking-wide text-[#677287]">Weight</TableHead>
              <TableHead className="h-auto px-3 py-2 text-xs font-normal uppercase tracking-wide text-[#677287]">Size</TableHead>
              <TableHead className="h-auto px-3 py-2 text-xs font-normal uppercase tracking-wide text-[#677287]">Excess added</TableHead>
              <TableHead className="h-auto px-3 py-2 text-xs font-normal uppercase tracking-wide text-[#677287]">Fee</TableHead>
              <TableHead className="h-auto px-3 py-2 text-xs font-normal uppercase tracking-wide text-[#677287]">Tag number</TableHead>
              <TableHead className="h-auto px-3 py-2 text-xs font-normal uppercase tracking-wide text-[#677287]">Status</TableHead>
              <TableHead className="h-auto px-3 py-2" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {bags.map((bag, index) => {
              const status = bagStatus(bag)
              const feeDue = bag.excessFee > 0 && !bag.excessPaymentId
              return (
                <TableRow key={bag.id} className="border-[#eef1f6] hover:bg-[#f7f9fc]">
                  <TableCell className="px-3 py-3 text-sm text-[#0a1424]">{index + 1}</TableCell>
                  <TableCell className="px-3 py-3 text-sm text-[#0a1424]">{bag.weightKg} kg</TableCell>
                  <TableCell className="px-3 py-3 text-sm text-[#677287]">{sizes[bag.id] ? `${sizes[bag.id]} cm` : '—'}</TableCell>
                  <TableCell className="px-3 py-3 text-sm text-[#0a1424]">{bag.excessKg} kg</TableCell>
                  <TableCell className={`px-3 py-3 text-sm ${feeDue ? 'font-semibold text-[#d61313]' : 'text-[#0a1424]'}`}>
                    {formatBaht(bag.excessFee)}
                  </TableCell>
                  <TableCell className="px-3 py-3 font-mono text-[13px] tracking-[0.5px] text-[#3b4256]">{bag.tagNumber ?? '—'}</TableCell>
                  <TableCell className="px-3 py-3">
                    <Pill tone={status.tone}>{status.label}</Pill>
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <span className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={SECONDARY_BUTTON}
                        disabled={busy || bag.status !== 'weighed' || Boolean(bag.tagNumber) || Boolean(bag.excessPaymentId)}
                        onClick={() => void remove(bag.id)}
                      >
                        Remove
                      </Button>
                      {feeDue || bag.status !== 'weighed' ? (
                        <Button type="button" size="sm" className={DISABLED_BUTTON} disabled>
                          Print tag
                        </Button>
                      ) : (
                        <Button type="button" size="sm" className={PRIMARY_BUTTON} disabled={busy} onClick={() => void tag(bag.id)}>
                          Print tag
                        </Button>
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      {unpaid ? (
        <Message tone="warn">
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Excess to pay: {formatBaht(totals.unpaidFee)} · {unpaidExcessKg} kg × {formatBaht(unpaidRate)} per kg (Feature 4 rate, copied
              at weighing)
            </span>
            <Button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => void tag(unpaid.id)}>
              Take payment {formatBaht(totals.unpaidFee)}
            </Button>
          </span>
        </Message>
      ) : null}
    </Card>
  )
}
