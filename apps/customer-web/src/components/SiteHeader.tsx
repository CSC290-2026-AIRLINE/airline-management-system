import { useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { SignedIn, SignedOut, useUser } from '@clerk/clerk-react'
import { Menu } from 'lucide-react'
import BrandLogo from '@customer-web/components/BrandLogo'
import { pageContainer } from '@customer-web/components/Page'
import { cn } from '@customer-web/lib/utils'
import LogoutButton from '@customer-web/components/LogoutButton'
import { Avatar, AvatarFallback, AvatarImage } from '@customer-web/components/ui/avatar'
import { Button } from '@customer-web/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@customer-web/components/ui/sheet'

const links = ['Book', 'My Trips', 'Payments', 'Cargo', 'Membership', 'Help']

// Labels with a page behind them. The others stay plain text until their pages exist.
const linkTo: Partial<Record<(typeof links)[number], '/search' | '/bookings' | '/receipts' | '/loyalty' | '/cargo' | '/complaints'>> = {
  Book: '/search',
  'My Trips': '/bookings',
  // Receipts, refunds and vouchers (Feature 5): the page has tabs for the other two.
  Payments: '/receipts',
  Cargo: '/cargo',
  Membership: '/loyalty',
  // Customer service (Feature 13): make a complaint, check a case, notification preferences.
  Help: '/complaints',
}

/** Receipts, My refunds and My vouchers are tabs of one area, so the Receipts link stays on for all three. */
const RECEIPTS_AREA = ['/receipts', '/refunds', '/vouchers']

function NavItem({ label, onClick }: { label: string; onClick?: () => void }) {
  const to = linkTo[label]
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  if (!to) return <span className="text-muted-foreground">{label}</span>
  const inReceiptsArea = label === 'Receipts' && RECEIPTS_AREA.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`rounded-sm no-underline hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${inReceiptsArea ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
      activeProps={{ className: 'text-foreground font-medium', 'aria-current': 'page' }}
    >
      {label}
    </Link>
  )
}

function UserAvatar({ className }: { className: string }) {
  const { user } = useUser()
  const name = user?.fullName || 'Profile'
  return (
    <Avatar className={className}>
      {user?.imageUrl && <AvatarImage src={user.imageUrl} alt="" />}
      <AvatarFallback className="text-[10px]">{name.slice(0, 1).toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}

/** Sticky frosted-glass header rendered once by the root route, so every page shares it. */
export default function SiteHeader() {
  const [open, setOpen] = useState(false)
  return (
    <header className="[view-transition-name:site-header] sticky top-0 z-40 border-b bg-background/60 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className={cn(pageContainer, 'flex h-14 items-center justify-between')}>
        <Link to="/" aria-label="Flython Airline home">
          <BrandLogo />
        </Link>
        <SignedOut>
          <Button asChild size="sm">
            <Link to="/login">Sign in</Link>
          </Button>
        </SignedOut>
        <SignedIn>
          <nav aria-label="Main navigation" className="hidden items-center gap-4 text-sm md:flex">
            {links.map((link) => (
              <NavItem key={link} label={link} />
            ))}
            <Button asChild variant="secondary" size="sm">
              <Link to="/account/my-profile">
                <UserAvatar className="size-5" />
                Profile
              </Link>
            </Button>
            <LogoutButton className="-ml-2" />
          </nav>
          <div className="flex items-center gap-1 md:hidden">
            <Button asChild variant="ghost" size="icon">
              <Link to="/account/my-profile" aria-label="My Profile">
                <UserAvatar className="size-7" />
              </Link>
            </Button>
            <LogoutButton />
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open navigation">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent aria-describedby={undefined}>
                <SheetHeader>
                  <SheetTitle>Menu</SheetTitle>
                </SheetHeader>
                <nav aria-label="Main navigation" className="flex flex-col gap-3 px-4 text-sm">
                  {links.map((link) => (
                    <NavItem key={link} label={link} onClick={() => setOpen(false)} />
                  ))}
                  <Button asChild variant="secondary" className="justify-start" onClick={() => setOpen(false)}>
                    <Link to="/account/my-profile">My Profile</Link>
                  </Button>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </SignedIn>
      </div>
    </header>
  )
}
