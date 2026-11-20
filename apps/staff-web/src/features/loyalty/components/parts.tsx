import type { ReactNode } from 'react'
import { Badge } from '@staff-web/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { TableCell } from '@staff-web/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@staff-web/components/ui/toggle-group'
import { cn } from '@staff-web/lib/utils'
import type { TierCode, TransactionType } from '../api/types'
import { formatSignedMiles } from '../format'
import { TYPE_LABEL } from '../labels'
import { TIER_TONE } from './tones'

// Small pieces shared by the Feature 11 staff pages, built on the shadcn components.

const TYPE_TONE: Record<TransactionType, string> = {
  earn: 'bg-blue-50 text-blue-700',
  redeem: 'bg-amber-50 text-amber-700',
  redeem_reversal: 'bg-emerald-50 text-emerald-700',
  expire: 'bg-muted text-muted-foreground',
  adjust: 'bg-muted text-muted-foreground',
}

export function TypePill({ type }: { type: TransactionType }) {
  return (
    <Badge variant="secondary" className={TYPE_TONE[type]}>
      {TYPE_LABEL[type]}
    </Badge>
  )
}

export function TierPill({ tier }: { tier: { code: TierCode; name: string } | null }) {
  return tier ? (
    <Badge variant="secondary" className={TIER_TONE[tier.code]}>
      {tier.name}
    </Badge>
  ) : (
    <Badge>No tier</Badge>
  )
}

export function MilesCell({ miles }: { miles: number }) {
  return (
    <TableCell className={cn('text-right font-semibold tabular-nums', miles > 0 ? 'text-emerald-700' : 'text-amber-700')}>
      {formatSignedMiles(miles)}
    </TableCell>
  )
}

// A dialog that is open while it is rendered. Escape, the backdrop and the close button call `onClose`.
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100svh-32px)] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string; disabled?: boolean }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      aria-label={label}
      value={value}
      // Radix sends '' when the pressed item is clicked again; keep the current choice instead.
      onValueChange={(next) => next && onChange(next as T)}
      className="self-start"
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} disabled={o.disabled} className="px-3.5">
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

// A centred empty state for lists and tables.
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-6 text-center">
      <strong>{title}</strong>
      {children && <span className="text-xs text-muted-foreground">{children}</span>}
    </div>
  )
}

// One labelled value in a grid of tiles; `tone` tints it (e.g. a tier colour). Use inside a <dl>.
export function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5 rounded-md bg-muted px-3 py-2.5', tone)}>
      <dt className="text-[10px] font-semibold tracking-wider uppercase opacity-70">{label}</dt>
      <dd className="m-0 text-sm font-semibold [overflow-wrap:anywhere]">{value}</dd>
    </div>
  )
}
