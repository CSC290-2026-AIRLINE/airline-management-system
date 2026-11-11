import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { LogOut, Menu } from 'lucide-react'
import { useAppAuth } from '@customer-web/auth/AuthProvider'
import flythonMark from '@customer-web/assets/flython-mark.svg'
import { cn } from '@customer-web/lib/utils'

interface NavItem {
  label: string
  /** Why the screen is not there yet — shown as the tooltip. */
  hint: string
  /** The one the frames pick out in the brand colour: the way in to a new booking. */
  primary?: boolean
}

/**
 * The customer app's own screens, in the order the frames put them.
 *
 * None of them is live in this app yet: they belong to the booking, trip, membership and help features. They are drawn
 * the way the frames draw them, but they are not links, because there is no page to go to.
 */
const NAV: NavItem[] = [
  { label: 'Book', hint: 'Coming with the booking feature', primary: true },
  { label: 'My Trips', hint: 'Coming with the booking feature' },
  { label: 'Membership', hint: 'Coming with the loyalty feature' },
  { label: 'Help', hint: 'Coming with the service and compensation feature' },
]

/** The initials in the profile circle, from the signed-in email: `demo.lee@example.com` → `DL`. */
function initials(email: string | undefined): string {
  if (!email) return 'FL'
  const parts = email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
  const letters = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase())
  return letters.join('') || 'FL'
}

/**
 * The bar across the top of every customer page: the Flython mark and wordmark, the app's screens and the profile.
 *
 * This is the frames' header — a white card that floats on the page, with the brand on the left and the profile on the
 * right.
 */
export function CustomerHeader() {
  const { logout, user } = useAppAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const name = initials(user?.email)

  return (
    <header className="px-4 pt-4 max-phone:px-3 max-phone:pt-3">
      {/* The desktop bar is a soft grey strip; the phone's is a white card with an outline, as in the frames. */}
      <div className="mx-auto flex max-w-6xl translate-x-4 items-center justify-between gap-4 rounded-2xl bg-secondary/70 px-4 py-3 max-tablet:border max-tablet:border-line max-tablet:bg-card max-tablet:px-5">
        {/* The brand ---------------------------------------------------- */}
        <Link
          to="/"
          className="flex items-center gap-3 rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <img src={flythonMark} alt="" className="h-8 w-auto shrink-0" />
          <span className="flex flex-col font-heading leading-none text-navy">
            <span className="text-2xl font-bold">Flython</span>
            <span className="mt-0.5 text-[10px] tracking-[0.35em]">AIRLINES</span>
          </span>
        </Link>

        {/* The screens --------------------------------------------------- */}
        {/* `ml-auto` pushes the screens against the profile, on the right, the way the frames set them. */}
        <nav aria-label="Main" className="mr-9 ml-auto flex items-center gap-7 max-tablet:hidden">
          {NAV.map((item) => (
            <span
              key={item.label}
              aria-disabled="true"
              title={item.hint}
              className={cn(
                'cursor-not-allowed text-sm font-medium text-foreground',
                /* The frames underline the way in to a booking instead of colouring it. */
                item.primary && 'underline decoration-1 underline-offset-4',
              )}
            >
              {item.label}
            </span>
          ))}
        </nav>

        {/* The profile --------------------------------------------------- */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void logout()}
            title="Sign out"
            className="inline-flex items-center gap-2 rounded-full bg-navy py-1 pr-4 pl-1 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none max-tablet:hidden"
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-white text-xs font-semibold text-navy">{name}</span>
            Profile
          </button>

          {/* On a phone the profile is just the circle, and the menu button opens the screens. */}
          <span
            aria-hidden="true"
            className="hidden size-8 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 max-tablet:flex"
          >
            {name}
          </span>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label="Menu"
            className="hidden size-11 items-center justify-center rounded-xl bg-navy text-white transition-opacity hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none max-tablet:inline-flex"
          >
            <Menu className="size-6" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* The phone menu --------------------------------------------------- */}
      {menuOpen && (
        /* Only on a phone: the button that opens it is hidden on a desktop, where the screens sit in the bar instead. */
        <div className="mx-auto mt-2 hidden max-w-6xl translate-x-4 rounded-2xl border border-line bg-card px-4 py-2 max-tablet:block">
          <nav aria-label="Main" className="flex flex-col">
            {NAV.map((item) => (
              <span
                key={item.label}
                aria-disabled="true"
                title={item.hint}
                className={cn(
                  'cursor-not-allowed py-2 text-sm font-medium text-muted-foreground',
                  item.primary && 'font-semibold text-navy',
                )}
              >
                {item.label}
              </span>
            ))}
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center gap-2 py-2 text-left text-sm font-medium text-foreground hover:text-primary"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </nav>
        </div>
      )}
    </header>
  )
}
