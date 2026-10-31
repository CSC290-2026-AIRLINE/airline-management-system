import type { ReactNode } from 'react'
import { CheckIcon, InfoIcon } from '../../shared/ui'

const STYLES = {
  success: 'border-green-line bg-green-tint text-valid',
  warning: 'border-amber-line bg-amber-tint text-amber-ink',
  info: 'border-blue-200 bg-info-bg text-blue-800',
} as const

/**
 * The full-width strip under the wizard: what just happened, and the one action that follows.
 *
 * It is in the page flow at every width. `AlertBanner` floats as a toast on a phone, which is
 * right for a confirmation but wrong here: this strip is the page's status line and has to stay
 * where it was put. The action (`Publish roster`, `Start next roster run`) shows from `lg`; below
 * that the fixed bottom bar carries it.
 */
export function NoticeStrip({ tone, action, children }: { tone: keyof typeof STYLES; action?: ReactNode; children: ReactNode }) {
  return (
    <div role="status" className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${STYLES[tone]}`}>
      <span className="flex w-4 shrink-0 justify-center text-base leading-none font-extrabold">
        {tone === 'success' ? <CheckIcon className="h-4 w-4" /> : tone === 'info' ? <InfoIcon className="h-4 w-4" /> : '!'}
      </span>
      <p className="min-w-0 flex-1 text-sm leading-snug font-semibold">{children}</p>
      {action && <div className="hidden shrink-0 lg:block">{action}</div>}
    </div>
  )
}
