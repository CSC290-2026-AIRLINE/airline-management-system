import { formatMoney } from '../lib-format'

export interface WaterfallStep {
  label: string
  /** The amount for this step. Totals (revenue, profit) are shown from zero; costs step down from the running total. */
  value: number
  total?: boolean
}

/** Revenue, then each deduction, then profit. Drawn as HTML bars so it prints and needs no chart library. */
export function FinanceWaterfall({ steps }: { steps: WaterfallStep[] }) {
  const top = Math.max(...steps.map((s) => (s.total ? Math.abs(s.value) : 0)), 1)
  // Each step's bar runs from where the previous step left the running total, so the positions are computed up front.
  const bars = steps.reduce<{ step: WaterfallStep; start: number; end: number }[]>((acc, step) => {
    const before = acc.length ? acc[acc.length - 1].end : 0
    const from = step.total ? 0 : before
    const to = step.total ? step.value : before + step.value
    return [...acc, { step, start: Math.min(from, to), end: to }]
  }, [])
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Revenue to profit">
      {bars.map(({ step, start, end }) => {
        const width = (Math.abs(end - start) / top) * 100
        const left = (start / top) * 100
        return (
          <li key={step.label} className="grid grid-cols-[10rem_1fr_7rem] items-center gap-3 text-sm">
            <span className="text-foreground">{step.label}</span>
            <span className="relative h-5 rounded bg-muted">
              <span
                className={`absolute top-0 h-5 rounded ${step.total ? 'bg-primary' : step.value < 0 ? 'bg-destructive/70' : 'bg-success'}`}
                style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(0.5, width)}%` }}
              />
            </span>
            <span className="text-right font-medium">{formatMoney(step.value)}</span>
          </li>
        )
      })}
    </ol>
  )
}
