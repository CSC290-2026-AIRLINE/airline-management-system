import type { ReactNode } from 'react'
import { Badge } from '@customer-web/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { cn } from '@customer-web/lib/utils'
import { STATUS_LABEL, type CaseStatus } from './types'

const TRACKER_STEPS: { status: CaseStatus; label: string }[] = [
  { status: 'with_supervisor', label: 'With supervisor' },
  { status: 'assigned', label: 'Assigned' },
  { status: 'resolved', label: 'Resolved' },
  { status: 'closed', label: 'Closed' },
]

const NEXT_STEPS = [
  'We give you a case number.',
  'It goes to the Customer Service supervisor.',
  'Every step is saved in the case history.',
  'We email you when the status changes.',
]

const STATUS_BADGE: Record<CaseStatus, 'pending' | 'secondary' | 'success' | 'cancelled'> = {
  with_supervisor: 'pending',
  assigned: 'secondary',
  resolved: 'success',
  closed: 'cancelled',
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  return <Badge variant={STATUS_BADGE[status] ?? 'pending'}>{STATUS_LABEL[status]}</Badge>
}

/** The four-step "what happens to a complaint" card, shown beside the form and the confirmation. */
export function WhatHappensNext() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What happens next</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {NEXT_STEPS.map((text, i) => (
            <li key={text} className="flex items-center gap-3 text-sm">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
                {i + 1}
              </span>
              {text}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

/** The case's progress through the four statuses. */
export function StatusTracker({ status }: { status: CaseStatus }) {
  const currentIdx = Math.max(
    0,
    TRACKER_STEPS.findIndex((s) => s.status === status),
  )
  return (
    <ol aria-label="Case progress" className="m-0 flex list-none flex-wrap items-center gap-x-2 gap-y-2 p-0">
      {TRACKER_STEPS.map((step, idx) => {
        const reached = idx <= currentIdx
        return (
          <li key={step.status} aria-current={idx === currentIdx ? 'step' : undefined} className="flex items-center gap-2">
            {idx > 0 && <span aria-hidden="true" className={cn('h-0.5 w-6', reached ? 'bg-primary' : 'bg-border')} />}
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                reached ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              {idx + 1}
            </span>
            <span className={cn('text-sm whitespace-nowrap', idx === currentIdx ? 'font-medium' : 'text-muted-foreground')}>
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** A small caption and its value, for the facts of a case. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground uppercase">{label}</dt>
      <dd className="m-0 text-sm font-medium">{children}</dd>
    </div>
  )
}
