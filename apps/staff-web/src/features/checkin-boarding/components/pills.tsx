import type { ReactNode } from 'react'
import { Badge } from '@staff-web/components/ui/badge'
import { cn } from '@staff-web/lib/utils'
import type { CheckInStatus, IssueCode } from '../api/types.ts'

const ISSUE_LABELS: Record<IssueCode, string> = {
  NAME_MISMATCH: 'Name mismatch',
  EXCESS_UNPAID: 'Excess unpaid',
  ON_HOLD: 'On hold',
  VISA_CHECK: 'Visa to check',
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

/** The design's pill tones: radius 999, padding 3/10, 12px. */
const PILL_TONES = {
  neutral: 'bg-[#eef1f6] text-[#677287]',
  good: 'bg-[#e6f4ec] text-[#1e6e42]',
  bad: 'bg-[#fde4e2] text-[#b8171c]',
  warn: 'bg-[#fff3db] text-[#995c05]',
} as const

export type PillTone = keyof typeof PILL_TONES

/** A small status chip in the design's pill style. */
export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <Badge variant="secondary" className={cn('rounded-full border-0 px-[10px] py-[3px] text-xs font-normal', PILL_TONES[tone])}>
      {children}
    </Badge>
  )
}

/** The design's message box: radius 10, padding 12/16, a 1px border and 16px text. */
const MESSAGE_TONES = {
  success: 'bg-[#e6f4ec] border-[#b7dfc7] text-[#1e6e42]',
  info: 'bg-[#eaf0fb] border-[#c9d8f2] text-[#1f408c]',
  warn: 'bg-[#fff3db] border-[#f5dfa8] text-[#995c05]',
  error: 'bg-[#fde4e2] border-[#f0b2b2] text-[#b8171c]',
} as const

export type MessageTone = keyof typeof MESSAGE_TONES

export function Message({ tone, children, role }: { tone: MessageTone; children: ReactNode; role?: string }) {
  return (
    <div role={role} className={cn('rounded-[10px] border px-4 py-3 text-[16px] leading-[1.5]', MESSAGE_TONES[tone])}>
      {children}
    </div>
  )
}

export function IssuePills({ issues }: { issues: IssueCode[] }) {
  if (issues.length === 0) return null
  return (
    <>
      {issues.map((issue) => (
        <Pill key={issue} tone={issue === 'EXCESS_UNPAID' || issue === 'ON_HOLD' ? 'bad' : 'warn'}>
          {ISSUE_LABELS[issue]}
        </Pill>
      ))}
    </>
  )
}

export function StatusPill({ status }: { status: CheckInStatus }) {
  const tone: PillTone =
    status === 'boarded' ? 'good' : status === 'no_show' || status === 'on_hold' || status === 'denied' ? 'bad' : 'neutral'
  return <Pill tone={tone}>{STATUS_LABELS[status]}</Pill>
}
