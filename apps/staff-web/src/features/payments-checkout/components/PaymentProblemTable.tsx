import { Link } from '@tanstack/react-router'
import { Button } from '@staff-web/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { formatRelativeTime } from '../payment-copy'
import { PaymentProblemBadge } from './PaymentProblemBadge'
import type { PaymentProblemDto } from '../types'

interface PaymentProblemTableProps {
  problems: PaymentProblemDto[]
  /** Runs the problem's action. */
  onAction?: (problem: PaymentProblemDto) => void
  /** The problem whose action is running right now. */
  workingId?: string | null
}

/**
 * The exception list, as the frames show it: a list of problems.
 *
 * Each row says what went wrong, which reference it belongs to, what a staff member should do about it and how long it
 * has been standing. The payment list is one click away, on the reference.
 *
 * Only one action runs at a time, so every button is disabled while one is running; the row that is running says so.
 */
export function PaymentProblemTable({ problems, onAction, workingId }: PaymentProblemTableProps) {
  const working = workingId !== null && workingId !== undefined

  return (
    <Table className="min-w-200">
      <TableHeader>
        <TableRow className="border-b border-line hover:bg-transparent">
          <TableHead className="h-12 px-5 text-xs font-medium text-muted-foreground">Problem</TableHead>
          <TableHead className="h-12 px-5 text-xs font-medium text-muted-foreground">Reference</TableHead>
          <TableHead className="h-12 px-5 text-xs font-medium text-muted-foreground">What happened</TableHead>
          <TableHead className="h-12 px-5 text-xs font-medium text-muted-foreground">What to do</TableHead>
          <TableHead className="h-12 px-5 text-xs font-medium text-muted-foreground">Since</TableHead>
          <TableHead className="h-12 px-5 text-xs font-medium text-muted-foreground">
            <span className="sr-only">Action</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {problems.map((problem) => (
          <TableRow key={problem.id} className="border-b border-line last:border-b-0 hover:bg-transparent">
            <TableCell className="px-5 py-4 align-top">
              <div className="flex flex-col items-start gap-1.5">
                <span className="text-sm font-semibold text-foreground">{problem.title}</span>
                <PaymentProblemBadge state={problem.state} />
              </div>
            </TableCell>
            <TableCell className="px-5 py-4 align-top">
              <div className="flex flex-col gap-0.5">
                {/* The reference is the link, because that is the number staff read out loud. */}
                <Link
                  to="/payments/lookup/$paymentId"
                  params={{ paymentId: problem.reference }}
                  className="text-sm font-medium text-foreground hover:underline"
                >
                  {problem.reference}
                </Link>
                {problem.booking_reference && (
                  <span className="text-xs text-muted-foreground">
                    {/* A booking reference reads "Booking H2VM6P"; a waybill, which has a space in it, reads as it is. */}
                    {/\s/.test(problem.booking_reference) ? problem.booking_reference : `Booking ${problem.booking_reference}`}
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell className="max-w-80 px-5 py-4 align-top text-sm text-foreground whitespace-normal">
              {problem.what_happened}
            </TableCell>
            <TableCell className="max-w-80 px-5 py-4 align-top text-sm text-foreground whitespace-normal">{problem.what_to_do}</TableCell>
            <TableCell className="px-5 py-4 align-top text-sm whitespace-nowrap text-muted-foreground" title={problem.since}>
              {formatRelativeTime(problem.since)}
            </TableCell>
            <TableCell className="px-5 py-4 text-right align-top">
              {problem.action !== 'none' && problem.action_label && onAction && (
                /* The frames draw the retry in navy and "Send now", which is optional, as an outline. */
                <Button
                  type="button"
                  size="sm"
                  variant={problem.action === 'send_posting' ? 'outline' : 'default'}
                  disabled={working}
                  onClick={() => onAction(problem)}
                >
                  {workingId === problem.id ? 'Working…' : problem.action_label}
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
