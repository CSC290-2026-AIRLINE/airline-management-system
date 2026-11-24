import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { SignedIn, SignedOut, useUser } from '@clerk/clerk-react'
import { Menu } from 'lucide-react'
import BrandLogo from '@customer-web/components/BrandLogo'
import { Avatar, AvatarFallback, AvatarImage } from '@customer-web/components/ui/avatar'
import { Button } from '@customer-web/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@customer-web/components/ui/sheet'

const links = ['Book', 'My Trips', 'Cargo', 'Membership', 'Help']

// Labels with a page behind them. The others stay plain text until their pages exist.
const linkTo: Partial<Record<(typeof links)[number], '/search' | '/bookings' | '/loyalty' | '/cargo'>> = {
  Book: '/search',
  'My Trips': '/bookings',
  Cargo: '/cargo',
  Membership: '/loyalty',
}

function NavItem({ label, onClick }: { label: string; onClick?: () => void }) {
  const to = linkTo[label]
  if (!to) return <span className="text-muted-foreground">{label}</span>
  return (
    <Link
      to={to}
      onClick={onClick}
      className="rounded-sm text-muted-foreground no-underline hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
    <header className="sticky top-0 z-40 border-b bg-background/60 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
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
          </nav>
          <div className="flex items-center gap-1 md:hidden">
            <Button asChild variant="ghost" size="icon">
              <Link to="/account/my-profile" aria-label="My Profile">
                <UserAvatar className="size-7" />
              </Link>
            </Button>
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
