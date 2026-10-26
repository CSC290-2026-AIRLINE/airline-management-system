import type { CheckInStatus, IssueCode } from '../api/types.ts'
import ui from './ui.module.css'

const ISSUE_LABELS: Record<IssueCode, string> = {
  NAME_MISMATCH: 'Name mismatch',
  EXCESS_UNPAID: 'Excess unpaid',
  ON_HOLD: 'On hold',
  VISA_CHECK: 'Visa check',
  PROFILE_DIFFERS: 'Profile differs',
}

const STATUS_LABELS: Record<CheckInStatus, string> = {
  started: 'Started',
  on_hold: 'On hold',
  denied: 'Denied',
  checked_in: 'Checked in',
  boarded: 'Boarded',
  no_show: 'No-show',
  cancelled: 'Cancelled',
}

export function IssuePills({ issues }: { issues: IssueCode[] }) {
  if (issues.length === 0) return null
  return (
    <>
      {issues.map((issue) => (
        <span key={issue} className={`${ui.pill} ${issue === 'EXCESS_UNPAID' || issue === 'ON_HOLD' ? ui.pillBad : ui.pillWarn}`}>
          {ISSUE_LABELS[issue]}
        </span>
      ))}
    </>
  )
}

export function StatusPill({ status }: { status: CheckInStatus }) {
  const tone =
    status === 'boarded' ? ui.pillGood : status === 'no_show' || status === 'on_hold' || status === 'denied' ? ui.pillBad : ui.pill
  return <span className={`${ui.pill} ${tone}`}>{STATUS_LABELS[status]}</span>
}
