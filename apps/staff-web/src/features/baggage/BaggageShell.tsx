import { useState } from 'react'
import { Link, Outlet } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'
import { Menu, X } from 'lucide-react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { cn } from '@staff-web/lib/utils'
import sidebarPattern from './assets/sidebar-pattern.jpg'
import { NotificationsButton } from './components/NotificationsButton'
import { BaggageDeskContext, useBaggageDesk } from './hooks/useBaggageDesk'
import { useStaffNotifications } from './hooks/useStaffNotifications'

/** Pages in the "Lost and found" nav, in Figma order. An item without a route shows as not ready. */
const NAV: { label: string; to?: '/baggage/lost-bag-cases' | '/baggage/found-bags' | '/baggage/match-review' | '/baggage/deliveries' }[] = [
  { label: 'Lost bag cases', to: '/baggage/lost-bag-cases' },
  { label: 'Found bags', to: '/baggage/found-bags' },
  { label: 'Match review', to: '/baggage/match-review' },
  { label: 'Deliveries', to: '/baggage/deliveries' },
]

const CLOCK = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const FIGMA_FONTS = 'https://fonts.googleapis.com/css2?family=Inter:wght@800&family=Merriweather:wght@900&display=swap'

const NAV_ITEM = 'flex h-10 w-full items-center gap-2.5 rounded-lg pl-3.5 text-sm leading-normal font-medium text-white'

/** The "Sidebar / Staff" background from Figma: navy with the pattern image on top (luminosity blend, 60%). */
function SidebarBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-[#14213d]">
      <img alt="" src={sidebarPattern} className="absolute inset-0 size-full max-w-none object-cover opacity-60 mix-blend-luminosity" />
    </div>
  )
}

function SidebarBox({ label, dot, children }: { label: string; dot: string; children: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[10px] border border-white/14 bg-white/6 px-3.5 py-3">
      <div className="flex items-center gap-1.5">
        <span aria-hidden className={cn('size-[7px] rounded-full', dot)} />
        <span className="text-[10.5px] leading-normal font-semibold tracking-[0.63px] text-white/65">{label}</span>
      </div>
      <span className="text-[15px] leading-normal font-semibold text-white">{children}</span>
    </div>
  )
}

function initials(name: string): string {
  const parts = name.split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'S'
}

const PILL_LINK =
  'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

/**
 * Layout of the Feature 10 staff screens: the 260px "Sidebar / Staff" from Figma and the page on the right. Below the
 * `md` breakpoint it follows the mobile frames: a navy top bar, the pages as pills under it, and a full-screen menu.
 */
export function BaggageShell() {
  const { user: clerkUser } = useUser()
  const { user, logout } = useAppAuth()
  const name = clerkUser?.fullName || user?.email || 'Staff member'
  const notifications = useStaffNotifications()
  const desk = useBaggageDesk()
  const [menuOpen, setMenuOpen] = useState(false)

  const links = NAV.map((item) =>
    item.to ? (
      <Link
        key={item.label}
        to={item.to}
        className={cn(NAV_ITEM, 'outline-none hover:bg-white/8 focus-visible:ring-[3px] focus-visible:ring-gold/60')}
        activeProps={{ className: 'bg-[#293d61] hover:bg-[#293d61]', 'aria-current': 'page' }}
      >
        {({ isActive }) => (
          <>
            {isActive && <span aria-hidden className="h-[18px] w-[3px] rounded-[2px] bg-[#fca311]" />}
            {item.label}
          </>
        )}
      </Link>
    ) : (
      <span key={item.label} aria-disabled="true" title="Not built yet" className={cn(NAV_ITEM, 'cursor-not-allowed text-white/55')}>
        {item.label}
      </span>
    ),
  )

  return (
    // `fixed inset-0` takes the page out of the starter `#root` box (1126px, centred) without touching the shared CSS.
    <div className="fixed inset-0 flex overflow-y-auto bg-[#f7f9fc] text-left font-sans leading-normal tracking-normal text-[#14213d] [color-scheme:light] max-md:flex-col">
      {/* The F10 Figma uses Inter 800 and Merriweather 900, which index.html does not load. React hoists this into <head>. */}
      <link rel="stylesheet" href={FIGMA_FONTS} precedence="default" />
      <aside className="sticky top-0 isolate flex h-svh w-[260px] shrink-0 flex-col gap-3 overflow-y-auto px-[22px] py-8 max-md:hidden">
        <SidebarBackground />
        <p className="font-heading text-[40px] leading-none font-black text-white uppercase">Flython</p>
        <p className="text-xs text-[#b7c1d1]">STAFF · BAGGAGE SERVICE</p>
        <NotificationsButton notifications={notifications} className="mt-4 h-10 w-full pr-3 pl-3.5" />
        <nav aria-label="Lost and found" className="flex flex-col gap-1 pt-4">
          <p className="text-xs text-[#b7c1d1]">LOST AND FOUND</p>
          {links}
        </nav>
        <div className="flex-1" />
        <SidebarBox label="SIMULATION CLOCK" dot="bg-[#fca311]">
          {desk.now ? CLOCK.format(desk.now).replace(',', '') : '–'}
        </SidebarBox>
        <SidebarBox label="SIGNED IN AS" dot="bg-[#2fa568]">
          {desk.roleName ?? '–'}
        </SidebarBox>
        <div className="flex flex-col gap-1.5">
          <p className="truncate text-[22px] font-semibold text-white">{name}</p>
          <p className="text-xs text-[#b7c1d1]">Baggage staff. Navigation follows assigned staff permissions.</p>
          <button
            type="button"
            onClick={() => void logout()}
            className="self-start text-sm font-medium text-white outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-gold/60"
          >
            Sign out
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 md:hidden">
        <div className="flex items-center gap-3 bg-[#14213d] px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-heading text-xl leading-tight font-black text-white">Flython</span>
            <span className="text-[10.5px] tracking-[0.63px] text-[#b7c1d1]">STAFF · BAGGAGE SERVICE</span>
          </div>
          <NotificationsButton notifications={notifications} className="p-1" />
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#fca311] text-xs font-bold text-[#14213d]"
          >
            {initials(name)}
          </span>
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="rounded p-1 text-white outline-none focus-visible:ring-[3px] focus-visible:ring-gold/60"
          >
            <Menu aria-hidden className="size-6" />
          </button>
        </div>
        <nav aria-label="Lost and found pages" className="flex gap-2 overflow-x-auto border-b border-[#e6eaf2] bg-white px-4 py-2.5">
          {NAV.map(
            (item) =>
              item.to && (
                <Link
                  key={item.label}
                  to={item.to}
                  className={PILL_LINK}
                  activeProps={{ className: 'border-[#14213d] bg-[#14213d] text-white', 'aria-current': 'page' }}
                  inactiveProps={{ className: 'border-[#d8dce6] bg-white text-[#14213d]' }}
                >
                  {item.label}
                </Link>
              ),
          )}
        </nav>
      </header>

      {menuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-30 isolate flex flex-col gap-3 overflow-y-auto px-[22px] py-6 md:hidden"
        >
          <SidebarBackground />
          <div className="flex items-start justify-between">
            <div>
              <p className="font-heading text-[32px] leading-none font-black text-white uppercase">Flython</p>
              <p className="mt-2 text-xs text-[#b7c1d1]">STAFF · BAGGAGE SERVICE</p>
            </div>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="rounded p-1 text-white outline-none focus-visible:ring-[3px] focus-visible:ring-gold/60"
            >
              <X aria-hidden className="size-6" />
            </button>
          </div>
          {/* Picking a page closes the menu. */}
          <nav aria-label="Lost and found" className="flex flex-col gap-1 pt-4" onClick={() => setMenuOpen(false)}>
            <p className="text-xs text-[#b7c1d1]">LOST AND FOUND</p>
            {links}
          </nav>
          <div className="flex-1" />
          <SidebarBox label="SIMULATION CLOCK" dot="bg-[#fca311]">
            {desk.now ? CLOCK.format(desk.now).replace(',', '') : '–'}
          </SidebarBox>
          <SidebarBox label="SIGNED IN AS" dot="bg-[#2fa568]">
            {desk.roleName ?? '–'}
          </SidebarBox>
          <div className="flex flex-col gap-1.5">
            <p className="truncate text-[22px] font-semibold text-white">{name}</p>
            <button
              type="button"
              onClick={() => void logout()}
              className="self-start text-sm font-medium text-white outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-gold/60"
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col gap-6 px-14 pt-12 pb-16 max-lg:px-6 max-lg:pt-8 max-md:gap-4 max-md:px-4 max-md:pt-5">
        <BaggageDeskContext.Provider value={desk}>
          <Outlet />
        </BaggageDeskContext.Provider>
      </main>
    </div>
  )
}
