import { useEffect, useState } from 'react'
import type { PageNotice } from '../types/use-build-pairings'
import { CheckIcon, InfoIcon } from '../../shared/ui'

const TOAST_MS = 6000

/**
 * Renders the page's current notice the way the mockups do.
 *
 * - `toast`: a solid green pill, at the top on a wide screen and above the commit bar on a phone.
 * - `banner`: a tinted strip under the wizard. On a phone a banner that carries a `shortMessage`
 *   becomes a toast instead, because a strip that long would push the form off the screen.
 *
 * Banners stay until the next action; toasts clear themselves.
 */
export function PageNoticeView({ notice, onDismiss }: { notice: PageNotice; onDismiss: () => void }) {
  const [hidden, setHidden] = useState<PageNotice | null>(null)
  const toastOnly = notice.variant === 'toast'
  const phoneToast = notice.shortMessage !== undefined

  useEffect(() => {
    if (!toastOnly && !phoneToast) return
    const timer = window.setTimeout(() => {
      if (toastOnly) onDismiss()
      else setHidden(notice)
    }, TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [notice, toastOnly, phoneToast, onDismiss])

  const toast = (
    <div
      role="status"
      className={`fixed inset-x-3 bottom-24 z-50 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] items-center gap-2.5 rounded-lg bg-valid px-4 py-3 text-sm font-semibold text-white shadow-lg ${
        toastOnly ? 'sm:top-5 sm:bottom-auto sm:max-w-[calc(100%-2rem)]' : 'sm:hidden'
      }`}
    >
      <CheckIcon className="h-4 w-4 shrink-0" />
      <span className={toastOnly ? 'sm:hidden' : ''}>{notice.shortMessage ?? notice.message}</span>
      {toastOnly && <span className="hidden sm:inline">{notice.message}</span>}
    </div>
  )

  if (toastOnly) return toast

  const success = notice.tone === 'success'
  const Icon = success ? CheckIcon : InfoIcon
  return (
    <>
      <div
        role="status"
        className={`items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm font-semibold ${phoneToast ? 'hidden sm:flex' : 'flex'} ${
          success ? 'border-green-line bg-green-tint text-valid' : 'border-amber-line bg-amber-tint text-amber-ink'
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">{notice.message}</span>
      </div>
      {phoneToast && hidden !== notice && toast}
    </>
  )
}
