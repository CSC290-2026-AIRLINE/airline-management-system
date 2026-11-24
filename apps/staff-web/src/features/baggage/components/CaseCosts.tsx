import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import type { AddBagCostBody, BagCostSummary } from '../api/lost-reports'
import { BAG_COST_KINDS, BAG_COST_KIND_LABELS, formatBaht, type BagCostKind } from '../constants'
import { errorMessage } from '../hooks/useFoundBags'
import { Field, FormError, SelectBox } from './primitives'

const KIND_OPTIONS = BAG_COST_KINDS.map((k) => ({ value: k, label: BAG_COST_KIND_LABELS[k] }))

/** A positive amount with at most 2 decimals, the same rule as the backend's AddBagCostDto. */
const AMOUNT = /^\d+(\.\d{1,2})?$/

/**
 * "Costs (paid by the airline)" from frame 06. Each cost becomes a Feature 4 expense on the server, so the total is
 * always the server's.
 */
export function CaseCosts({
  cancelled,
  summary,
  loading,
  error,
  onAdd,
  onRemove,
}: {
  cancelled: boolean
  summary: BagCostSummary | null
  loading: boolean
  error: string | null
  onAdd: (body: AddBagCostBody) => Promise<void>
  onRemove: (costId: string) => Promise<void>
}) {
  const [kind, setKind] = useState<BagCostKind>('storage')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  /** The cost waiting for "Remove" to be pressed a second time. */
  const [confirmId, setConfirmId] = useState<string | null>(null)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setFormError(null)
    try {
      await action()
    } catch (e: unknown) {
      setFormError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const value = amount.trim()
    if (!AMOUNT.test(value) || Number(value) <= 0) {
      setFormError('Enter an amount above 0, with at most 2 decimals.')
      return
    }
    void run(async () => {
      await onAdd({ kind, amount: Number(value) })
      setAmount('')
    })
  }

  const costs = summary?.costs ?? []

  return (
    <div className="flex flex-col gap-4">
      <h3 className="m-0 font-sans text-lg font-semibold text-foreground">Costs (paid by the airline)</h3>

      {loading && <Skeleton className="h-12 w-full" />}
      <FormError message={error} />

      {!loading && costs.length === 0 && !error && <p className="text-sm text-muted-foreground">No costs recorded yet.</p>}
      {costs.length > 0 && (
        <>
          <ul className="flex flex-col gap-2.5">
            {costs.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium whitespace-nowrap text-muted-foreground">{BAG_COST_KIND_LABELS[c.kind]}</span>
                <span className="flex min-w-0 flex-1 items-center justify-end gap-1 text-base text-foreground">
                  {formatBaht(c.amount)}
                  {/* Not in Figma: a cost entered by mistake can be taken back, after a second press. */}
                  {confirmId === c.id ? (
                    <span className="flex items-center gap-1 text-sm">
                      <Button
                        variant="ghost"
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => onRemove(c.id)).then(() => setConfirmId(null))}
                        className="h-auto justify-start gap-0 px-0 py-0 font-normal whitespace-normal hover:bg-transparent dark:hover:bg-transparent rounded px-1 font-semibold text-danger outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                      >
                        Remove
                      </Button>
                      <Button
                        variant="ghost"
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmId(null)}
                        className="h-auto justify-start gap-0 px-0 py-0 font-normal whitespace-normal hover:bg-transparent dark:hover:bg-transparent rounded px-1 text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                      >
                        Keep
                      </Button>
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      type="button"
                      aria-label={`Remove ${BAG_COST_KIND_LABELS[c.kind].toLowerCase()} cost of ${formatBaht(c.amount)}`}
                      title="Remove cost"
                      disabled={busy}
                      onClick={() => setConfirmId(c.id)}
                      className="h-auto justify-start gap-0 px-0 py-0 font-normal whitespace-normal hover:bg-transparent dark:hover:bg-transparent rounded p-0.5 text-muted-foreground outline-none hover:text-danger focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                    >
                      <X className="size-3.5" aria-hidden />
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold text-foreground">
            <span>Total</span>
            <span>{formatBaht(summary?.total ?? 0)}</span>
          </div>
        </>
      )}

      {!cancelled && (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="flex gap-3">
            <Field label="Kind of cost" htmlFor="cost-kind">
              <SelectBox id="cost-kind" value={kind} onValueChange={(v) => setKind(v as BagCostKind)} options={KIND_OPTIONS} />
            </Field>
            <Field label="Amount" htmlFor="cost-amount">
              <Input
                id="cost-amount"
                inputMode="decimal"
                placeholder="Amount in ฿"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
          </div>
          <FormError message={formError} />
          <div className="flex justify-end">
            <Button type="submit" variant="outline" disabled={busy} className="shadow-none">
              {busy ? 'Saving…' : 'Record cost'}
            </Button>
          </div>
        </form>
      )}
      {cancelled && <FormError message={formError} />}
    </div>
  )
}
