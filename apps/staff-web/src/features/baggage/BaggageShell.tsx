import { Link, Outlet } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { cn } from '@staff-web/lib/utils'

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

/**
 * Layout of the Feature 10 staff screens: the 260px "Sidebar / Staff" from Figma and the page on the right. Below the
 * `md` breakpoint the sidebar turns into a top bar with the same links (the F10 mobile frames come later).
 */
export function BaggageShell() {
  const { user: clerkUser } = useUser()
  const { user, logout } = useAppAuth()
  const name = clerkUser?.fullName || user?.email || 'Staff member'

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
      <aside className="sticky top-0 flex h-svh w-[260px] shrink-0 flex-col gap-3 overflow-y-auto bg-[#14213d] px-[22px] py-8 max-md:hidden">
        <p className="font-heading text-[40px] leading-none font-black text-white uppercase">Flython</p>
        <p className="text-xs text-[#b7c1d1]">STAFF · BAGGAGE SERVICE</p>
        <nav aria-label="Lost and found" className="flex flex-col gap-1 pt-6">
          <p className="text-xs text-[#b7c1d1]">LOST AND FOUND</p>
          {links}
        </nav>
        <div className="flex-1" />
        <SidebarBox label="SIMULATION CLOCK" dot="bg-[#fca311]">
          {CLOCK.format(new Date()).replace(',', '')}
        </SidebarBox>
        <SidebarBox label="SIGNED IN AS" dot="bg-[#2fa568]">
          Staff
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

      <header className="sticky top-0 z-10 flex flex-col gap-2 bg-[#14213d] px-4 py-3 md:hidden">
        <div className="flex items-center justify-between">
          <span className="font-heading text-xl font-black text-white uppercase">Flython</span>
          <button type="button" onClick={() => void logout()} className="text-sm font-medium text-white">
            Sign out
          </button>
        </div>
        <nav aria-label="Lost and found" className="flex gap-1 overflow-x-auto [&>*]:w-auto [&>*]:shrink-0 [&>*]:pr-3.5">
          {links}
        </nav>
      </header>

      <main className="flex min-w-0 flex-1 flex-col gap-6 px-14 pt-12 pb-16 max-lg:px-6 max-lg:pt-8">
        <Outlet />
      </main>
    </div>
  )
}
