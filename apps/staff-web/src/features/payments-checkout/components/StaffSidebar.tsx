import { Link, useRouterState } from '@tanstack/react-router'
import { CreditCard, LogOut } from 'lucide-react'
import { cn } from '@staff-web/lib/utils'
import flythonMark from '../assets/flython-mark.svg'

interface StaffSidebarProps {
  /** The role the signed-in staff member holds, e.g. "Administrator". */
  roleName: string
  onSignOut: () => void
}

/** The groups the frames show closed: a name with a chevron, and nothing under it. */
const CLOSED_GROUPS = ['Operations', 'Commercial', 'Airport & Onboard'] as const

/**
 * The Payments & Refunds screens, under Customer Management (the same grouping Feature 5b's sidebar uses).
 *
 * The two payment screens are this feature's; the other three belong to Feature 5b, the compensation feature and
 * Feature 5c, so they are drawn dimmed rather than linked to a screen that does not exist. When the branches meet, give
 * each one its `to`.
 */
const CUSTOMER_MANAGEMENT = [
  { to: '/payments/lookup', label: 'Payment Lookup' },
  { to: null, label: 'Refund Queue' },
  { to: null, label: 'Compensation & Vouchers' },
  { to: '/payments/exceptions', label: 'Payment Exceptions' },
  { to: null, label: 'Pay Runs' },
] as const

/** The frames' simulation clock. The prototype runs on a fixed day, so every screen reads the same date. */
const SIMULATION_DAY = '27 Oct 2026'

/**
 * The admin workspace sidebar the payment screens sit in.
 *
 * This is the frames' staff view: the brand on top, the workspace menu with "Customer Management" open on the payment
 * screens, and the clock and the signed-in role at the bottom.
 */
export function StaffSidebar({ roleName, onSignOut }: StaffSidebarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <aside className="hidden w-56 shrink-0 flex-col bg-navy text-white lg:flex">
      {/* The brand ---------------------------------------------------- */}
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-4">
        <img src={flythonMark} alt="" className="h-6 w-auto shrink-0" />
        <span className="flex flex-col font-heading leading-none font-bold">
          <span className="text-xl">Flython</span>
          <span className="mt-0.5 text-[10px] tracking-[0.3em]">AIRLINES</span>
        </span>
      </div>

      <p className="px-5 pb-3 text-xs font-medium tracking-wide text-white/60 uppercase">Admin workspace</p>

      {/* The menu ------------------------------------------------------ */}
      <nav aria-label="Admin workspace" className="flex-1 overflow-y-auto px-3 pb-4">
        <p className="px-2 py-2 text-sm text-white/90">Reports &amp; Analytics</p>

        {CLOSED_GROUPS.map((group) => (
          <p key={group} className="flex items-center gap-2 px-2 py-2 text-sm text-white/80">
            <span className="w-3 text-center" aria-hidden="true">
              +
            </span>
            {group}
          </p>
        ))}

        {/* Customer Management, open: the payment screens live in it. */}
        <p className="flex items-center gap-2 px-2 py-2 text-sm font-medium text-white">
          <span className="w-3 text-center" aria-hidden="true">
            -
          </span>
          Customer Management
        </p>
        <div className="pl-3">
          {/* The same sub-heading Feature 5b's sidebar has: the five payment screens sit one step under it. */}
          <p className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white">
            <CreditCard className="size-4 shrink-0" aria-hidden="true" />
            Payments &amp; Refunds
          </p>
          <ul className="m-0 list-none p-0 pl-5">
            {CUSTOMER_MANAGEMENT.map((item) => {
              const active = item.to !== null && pathname.startsWith(item.to)
              if (item.to === null) {
                return (
                  <li key={item.label}>
                    <span
                      aria-disabled="true"
                      title="Coming with another feature"
                      className="block cursor-not-allowed rounded-lg px-3 py-2 text-sm text-white/55"
                    >
                      {item.label}
                    </span>
                  </li>
                )
              }
              return (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block rounded-lg px-3 py-2 text-sm transition-colors',
                      active ? 'bg-navy-active font-medium text-white' : 'text-white/80 hover:bg-white/5 hover:text-white',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>

        <p className="px-2 py-2 text-sm text-white/80">Administration</p>
      </nav>

      {/* The clock and the role ---------------------------------------- */}
      <div className="px-4 pb-4">
        <div className="mb-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3">
          <p className="m-0 flex items-center gap-2 text-xs font-medium tracking-wide text-white/70 uppercase">
            <span className="size-2 rounded-full bg-gold" aria-hidden="true" />
            Simulation clock
          </p>
          <p className="m-0 mt-1 text-base font-medium">{SIMULATION_DAY}</p>
        </div>

        <div className="mb-4 rounded-xl border border-white/15 bg-white/5 px-4 py-3">
          <p className="m-0 flex items-center gap-2 text-xs font-medium tracking-wide text-white/70 uppercase">
            <span className="size-2 rounded-full bg-success" aria-hidden="true" />
            Signed in as
          </p>
          <p className="m-0 mt-1 text-base font-medium">{roleName}</p>
        </div>

        <p className="m-0 text-xs text-white/60">Navigation follows assigned staff permissions.</p>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-3 inline-flex items-center gap-2 rounded-md px-1 py-1 text-sm font-medium text-white transition-opacity hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-white/40 focus-visible:outline-none"
        >
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
