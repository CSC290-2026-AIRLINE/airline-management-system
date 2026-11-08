import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'
import { Menu, X } from 'lucide-react'
import { useAppAuth } from '../../../auth/AuthProvider'
import type { MemberSummary } from '../api/types'
import { FlythonLogo } from './parts'
import { cx, FLIGHT_SEARCH_PATH, focusRing, MY_TRIPS_PATH } from './ui'

// Customer top bar from the "Customer Nav" component in the F11 Figma file. It lives in the loyalty feature until the
// app has a shared customer layout; Book, My Trips and Help point at "/" until those pages exist.
const LINKS = [
  { label: 'Book', to: FLIGHT_SEARCH_PATH, hint: 'Pay with cash or miles' },
  { label: 'My Trips', to: MY_TRIPS_PATH, hint: 'Bookings, check-in and extras' },
  { label: 'Membership', to: '/loyalty', hint: 'Balance, statement, benefits, redemptions' },
  { label: 'Help', to: '/', hint: 'Complaints and notifications' },
] as const

const MOBILE_LABEL: Record<(typeof LINKS)[number]['label'], string> = {
  Book: 'Book a flight',
  'My Trips': 'My Trips',
  Membership: 'My FlySmiles',
  Help: 'Help',
}

export function CustomerNav({ member }: { member?: MemberSummary | null }) {
  const { user } = useUser()
  const { logout } = useAppAuth()
  const [open, setOpen] = useState(false)
  const name = user?.fullName || member?.name || ''
  const initials =
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0])
      .join('')
      .toUpperCase() || '?'

  // Close the phone menu with Escape, and keep the page behind it from scrolling.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open])

  return (
    <div className="bg-canvas px-3 pt-3 sm:px-6 sm:pt-5 lg:bg-white">
      <nav
        aria-label="Main"
        className={cx(
          'mx-auto flex min-h-[60px] max-w-[1350px] items-center gap-4 rounded-2xl py-2 pr-2 pl-4',
          'border border-[#e4e8f0] bg-white shadow-[0_4px_14px_rgba(16,37,68,0.08)]',
          'lg:min-h-[67px] lg:border-0 lg:bg-[#f3f4f6] lg:pr-7 lg:pl-12 lg:shadow-none',
        )}
      >
        <Link to="/" className={cx('rounded no-underline', focusRing)}>
          <FlythonLogo />
        </Link>
        <div className="flex-1" />

        <ul className="m-0 hidden list-none items-center gap-12 p-0 lg:flex">
          {LINKS.map((l) => (
            <li key={l.label}>
              <Link
                to={l.to}
                activeOptions={{ exact: l.to === '/', includeSearch: false }}
                className={cx(
                  'rounded px-1 py-1 text-sm font-medium text-ink no-underline underline-offset-4 hover:text-link',
                  l.label === 'Membership' && 'data-[status=active]:underline',
                  focusRing,
                )}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <Link
          to="/dashboard"
          className={cx(
            'hidden flex-none items-center gap-2 rounded-full bg-navy py-1.5 pr-4 pl-1.5 text-sm font-bold text-white no-underline lg:flex',
            focusRing,
          )}
        >
          <span className="grid size-7 place-items-center rounded-full bg-white text-[11px] font-bold text-[#1d4ed8]" aria-hidden="true">
            {initials}
          </span>
          Profile
        </Link>

        <button
          type="button"
          className={cx(
            'grid size-11 flex-none cursor-pointer place-items-center rounded-xl border-0 bg-navy text-white lg:hidden',
            focusRing,
          )}
          aria-expanded={open}
          aria-controls="customer-menu"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
        >
          <Menu size={22} aria-hidden="true" />
        </button>
      </nav>

      {open && (
        <div
          id="customer-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-navy px-5 pt-6 pb-8 text-white lg:hidden"
        >
          <div className="flex items-center justify-between">
            <FlythonLogo tone="light" />
            <button
              type="button"
              className={cx('grid size-11 cursor-pointer place-items-center rounded-xl border-0 bg-white/15 text-white', focusRing)}
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              autoFocus
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <ul className="m-0 mt-8 flex list-none flex-col gap-3 p-0">
            {/* The phone menu leads with My FlySmiles, as in the Figma menu. */}
            {[LINKS[2], LINKS[0], LINKS[1], LINKS[3]].map((l) => (
              <li key={l.label}>
                <Link
                  to={l.to}
                  activeOptions={{ exact: l.to === '/', includeSearch: false }}
                  onClick={() => setOpen(false)}
                  className={cx(
                    'flex flex-col gap-1 rounded-xl border border-transparent bg-white/8 px-4 py-4 text-white no-underline hover:bg-white/12',
                    l.label === 'Membership' && 'data-[status=active]:border-[#f5a524] data-[status=active]:bg-white/12',
                    focusRing,
                  )}
                >
                  <span className="text-base font-semibold">{MOBILE_LABEL[l.label]}</span>
                  <span className="text-[13px] text-white/70">{l.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex flex-col gap-1 pt-10">
            <strong className="text-lg">{name}</strong>
            {member && (
              <span className="text-[13px] text-white/70">
                FlySmiles {member.tier?.name ?? 'member'} · {member.memberNumber}
              </span>
            )}
            <button
              type="button"
              className={cx('mt-3 w-fit cursor-pointer rounded border-0 bg-transparent p-0 text-left text-[15px] text-white', focusRing)}
              onClick={() => void logout()}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
