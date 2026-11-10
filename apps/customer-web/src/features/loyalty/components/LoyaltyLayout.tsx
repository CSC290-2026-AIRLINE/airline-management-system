import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { MemberSummary } from '../api/types'
import { CustomerNav } from './CustomerNav'
import { CONTAINER, cx, focusRing, PAGE } from './ui'

const TABS = [
  { to: '/loyalty', label: 'Overview', short: 'Overview', exact: true },
  { to: '/loyalty/statement', label: 'Statement', short: 'Statement', exact: false },
  { to: '/loyalty/benefits', label: 'My Benefits', short: 'Benefits', exact: false },
  { to: '/loyalty/redemptions', label: 'My Redemptions', short: 'Redemptions', exact: false },
] as const

// Desktop: underlined tabs. Phone: a segmented control with the active tab in mint (M1).
const tab = cx(
  'flex-1 whitespace-nowrap rounded-lg px-2 py-2 text-center text-[13px] font-medium text-muted no-underline',
  'data-[status=active]:bg-mint data-[status=active]:font-semibold data-[status=active]:text-[#0b5563]',
  'sm:flex-none sm:rounded-none sm:border-b-2 sm:border-transparent sm:px-0 sm:pt-0 sm:pb-3 sm:text-sm',
  'sm:data-[status=active]:border-navy sm:data-[status=active]:bg-transparent sm:data-[status=active]:text-ink',
  'hover:text-ink',
  focusRing,
)

// Shell for every Feature 11 customer page: nav, the "My FlySmiles" header with its tabs, then the page body.
export function LoyaltyLayout({ subtitle, member, children }: { subtitle: string; member?: MemberSummary | null; children: ReactNode }) {
  return (
    <div className={PAGE} data-full-bleed>
      <CustomerNav member={member} />
      <header className="bg-canvas pt-6 sm:bg-white sm:pt-12">
        <div className={cx(CONTAINER, 'flex flex-col gap-5 sm:gap-7')}>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[22px] leading-tight font-bold sm:text-[32px]">My FlySmiles</h1>
            <p className="text-[13px] text-muted sm:text-sm">{subtitle}</p>
          </div>
          <nav
            aria-label="FlySmiles"
            className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1 [scrollbar-width:none] sm:gap-7 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0"
          >
            {TABS.map((t) => (
              <Link key={t.to} to={t.to} activeOptions={{ exact: t.exact }} className={tab}>
                <span className="sm:hidden">{t.short}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className={cx(CONTAINER, 'flex flex-1 flex-col gap-5 pt-5 pb-14 sm:gap-6 sm:pt-9 sm:pb-20')}>{children}</main>
    </div>
  )
}

// Shell for the pages without the membership tabs: Join and Welcome, which fill the width with their own bands.
export function LoyaltyBareLayout({ children }: { children: ReactNode }) {
  return (
    <div className={PAGE} data-full-bleed>
      <CustomerNav />
      <main className="flex flex-1 flex-col pt-3 sm:pt-5">{children}</main>
    </div>
  )
}
