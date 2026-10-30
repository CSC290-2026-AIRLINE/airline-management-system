import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'

// Customer top bar shown on every signed-in page, from the "F7 / Customer Nav" component in the Figma file.
// Book, My Trips and Help point at "/" until those pages exist; change the paths here when they do.
const LINKS = [
  { label: 'Book', to: '/' },
  { label: 'My Trips', to: '/' },
  { label: 'Membership', to: '/loyalty' },
  { label: 'Help', to: '/' },
] as const

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e7490]'
const link = `rounded px-1 py-1 text-sm font-medium text-ink no-underline hover:text-link data-[status=active]:font-semibold ${focus}`

export function CustomerNav() {
  const { user } = useUser()
  const [open, setOpen] = useState(false)
  const initials =
    [user?.firstName, user?.lastName]
      .filter(Boolean)
      .map((n) => n?.[0])
      .join('')
      .toUpperCase() || (user?.primaryEmailAddress?.emailAddress[0] ?? '?').toUpperCase()

  return (
    // Preflight is off app-wide, so sizing, font and alignment are set here rather than inherited from index.css.
    <div className="box-border w-full bg-white px-3 pt-3 text-left font-sans tracking-normal [color-scheme:light] sm:px-6 sm:pt-6 [&_*]:box-border">
      <nav
        className="relative mx-auto flex min-h-[56px] max-w-[1350px] items-center gap-4 rounded-xl bg-[#f3f4f6] py-2 pr-3 pl-5 sm:min-h-[67px] sm:pr-8 sm:pl-12"
        aria-label="Main"
      >
        <Link to="/" className={`text-[15px] font-medium text-ink no-underline ${focus}`}>
          Logo
        </Link>
        <div className="flex-1" />

        <ul className="m-0 hidden list-none items-center gap-8 p-0 md:flex lg:gap-14">
          {LINKS.map((l) => (
            <li key={l.label}>
              <Link to={l.to} className={link} activeOptions={{ exact: l.to === '/', includeSearch: false }}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <Link
          to="/dashboard"
          className={`flex flex-none items-center gap-2.5 rounded-[20px] bg-navy py-1.5 pr-3.5 pl-3 text-sm font-bold text-white no-underline ${focus}`}
        >
          <span className="grid size-7 place-items-center rounded-full bg-white text-[11px] font-bold text-[#1d4ed8]" aria-hidden="true">
            {initials}
          </span>
          Profile
        </Link>

        {/* Below md the links fold into a menu. */}
        <button
          type="button"
          className={`grid size-10 flex-none cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-ink md:hidden ${focus}`}
          aria-expanded={open}
          aria-controls="customer-nav-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen(!open)}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d={open ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} />
          </svg>
        </button>

        {open && (
          <ul
            id="customer-nav-menu"
            className="absolute inset-x-0 top-full z-30 m-0 mt-2 flex list-none flex-col rounded-xl bg-[#f3f4f6] p-2 shadow-lg md:hidden"
          >
            {LINKS.map((l) => (
              <li key={l.label}>
                <Link
                  to={l.to}
                  className={`block rounded-lg px-4 py-3 text-[15px] font-medium text-ink no-underline hover:bg-white ${focus}`}
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </div>
  )
}
