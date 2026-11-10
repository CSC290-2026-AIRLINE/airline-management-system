import { Link } from '@tanstack/react-router'
import { Button } from '@staff-web/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { formatRelativeTime } from '../payment-copy'
import { PaymentProblemBadge } from './PaymentProblemBadge'
import type { PaymentProblemDto } from '../types'

interface PaymentProblemTableProps {
  problems: PaymentProblemDto[]
  /** Runs the problem's action. The row's button is disabled while it runs. */
  onAction?: (problem: PaymentProblemDto) => void
  /** The problem whose action is running right now. */
  workingId?: string | null
}

/**
 * The exception list, as the frames show it: a list of problems.
 *
 * Each row says what went wrong, which reference it belongs to, what a staff member should do about it and how long it
 * has been standing. The payment list is one click away, on the reference.
 */
export function PaymentProblemTable({ problems, onAction, workingId }: PaymentProblemTableProps) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-200">
        <TableHeader>
          <TableRow>
            <TableHead>Problem</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>What happened</TableHead>
            <TableHead>What to do</TableHead>
            <TableHead>Since</TableHead>
            <TableHead>
              <span className="sr-only">Action</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {problems.map((problem) => (
            <TableRow key={problem.id}>
              <TableCell>
                <PaymentProblemBadge type={problem.type} label={problem.title} />
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  {problem.payment_id ? (
                    <Link
                      to="/payments/lookup/$paymentId"
                      params={{ paymentId: problem.payment_id }}
                      className="font-mono text-xs underline underline-offset-4"
                    >
                      {problem.reference}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs">{problem.reference}</span>
                  )}
                  {problem.booking_reference && (
                    <span className="font-mono text-xs text-muted-foreground">{problem.booking_reference}</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="max-w-80 text-sm text-muted-foreground">{problem.what_happened}</TableCell>
              <TableCell className="max-w-80 text-sm text-foreground">{problem.what_to_do}</TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground" title={problem.since}>
                {formatRelativeTime(problem.since)}
              </TableCell>
              <TableCell className="text-right">
                {problem.action !== 'none' && problem.action_label && onAction && (
                  <Button
                    type="button"
                    size="sm"
                    variant={problem.action === 'retry_capture' ? 'default' : 'outline'}
                    disabled={workingId !== null && workingId !== undefined}
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
    </div>
  )
}
