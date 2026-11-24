import { useState } from 'react'
import { NoAccessScreen } from '@staff-web/features/admin-console/components/NoAccessScreen'
import { useScreenAccess } from '@staff-web/features/admin-console/hooks/useScreenAccess'
import { usePaymentsApi } from '../api/payments'
import { Card } from '@staff-web/components/ui/card'
import { FilterChips } from '../components/FilterChips'
import { PaymentProblemTable } from '../components/PaymentProblemTable'
import { PageMessage, StaffPageShell } from '../components/StaffPageShell'
import { usePaymentProblems } from '../hooks/usePaymentProblems'
import { EXCEPTION_TAB_LABELS } from '../payment-copy'
import { PAYMENT_EXCEPTION_TABS, type PaymentExceptionTab, type PaymentProblemDto } from '../types'

/**
 * The staff payment exception list.
 *
 * The list is a list of *problems*, the way the frames show it: each row says what went wrong, which reference it
 * belongs to, what a staff member should do about it and how long it has been standing. The tabs are the frames' own —
 * needs action, queued, resolved and all — and each one carries the number of problems behind it.
 */
export function PaymentExceptionsPage() {
  const { loading, canOpen, role } = useScreenAccess()
  const [tab, setTab] = useState<PaymentExceptionTab>('needs_action')
  const list = usePaymentProblems(tab)
  const api = usePaymentsApi()
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  /* Runs the action a problem offers, then reloads the list so the row moves to where it belongs. */
  async function runAction(problem: PaymentProblemDto) {
    if (!problem.payment_id) return
    setWorkingId(problem.id)
    setActionError(null)
    try {
      if (problem.action === 'retry_capture') {
        await api.retryCapture(problem.payment_id)
      } else if (problem.action === 'send_posting') {
        await api.sendFinancePosting(problem.payment_id)
      }
      list.reload()
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setWorkingId(null)
    }
  }

  if (loading) {
    return (
      <StaffPageShell title="Payment exceptions">
        <p className="text-sm text-muted-foreground">Checking your access…</p>
      </StaffPageShell>
    )
  }

  if (!canOpen('f5.payment_exceptions')) {
    return (
      <StaffPageShell title="Payment exceptions">
        {/* `recorded={false}`: the page is refused before any API call, so no `access_denied` row exists for this
            attempt. The backend guard records the ones that reach it. */}
        <NoAccessScreen screenName="Payment exceptions" roleName={role?.name} recorded={false} homeTo="/dashboard" />
      </StaffPageShell>
    )
  }

  return (
    <StaffPageShell
      title="Payment Exceptions"
      subtitle="Money movements that did not finish cleanly. Start with Needs action. A retry you request moves to Queued until it finishes."
    >
      <div className="flex flex-col gap-4">
        {/* The tabs ------------------------------------------------------ */}
        <FilterChips
          ariaLabel="Filter problems by state"
          value={tab}
          onChange={setTab}
          options={PAYMENT_EXCEPTION_TABS.map((item) => ({
            value: item,
            label: EXCEPTION_TAB_LABELS[item],
            count: list.counts[item],
          }))}
        />

        {actionError && <PageMessage tone="danger" title="The action could not be completed" body={actionError} />}

        {list.error && <PageMessage tone="danger" title="The exception list could not be loaded" body={list.error} />}

        {!list.error && list.loading && (
          <p className="py-12 text-center text-sm text-muted-foreground" role="status">
            Loading the exceptions…
          </p>
        )}

        {!list.error && !list.loading && list.problems.length === 0 && (
          <PageMessage
            title={`Nothing under ${EXCEPTION_TAB_LABELS[tab].toLowerCase()}`}
            body="There is no problem in this state right now."
          />
        )}

        {!list.error && !list.loading && list.problems.length > 0 && (
          <Card className="overflow-hidden py-0">
            <PaymentProblemTable problems={list.problems} onAction={(problem) => void runAction(problem)} workingId={workingId} />
          </Card>
        )}

        {/* The note the frames put under the list ------------------------ */}
        <p className="text-sm text-muted-foreground">
          Cancelling a confirmed ticket after a permanent capture failure is not automated yet. Staff decide here.
        </p>
      </div>
    </StaffPageShell>
  )
}
