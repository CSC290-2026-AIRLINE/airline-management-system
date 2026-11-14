import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { SignedIn, SignedOut, useUser } from '@clerk/clerk-react'
import { Menu } from 'lucide-react'
import BrandLogo from '@customer-web/components/BrandLogo'
import { Avatar, AvatarFallback, AvatarImage } from '@customer-web/components/ui/avatar'
import { Button } from '@customer-web/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@customer-web/components/ui/sheet'

const links = ['Book', 'My Trips', 'Membership', 'Help']

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
          <nav aria-label="Main navigation" className="hidden items-center gap-4 md:flex">
            {links.map((link) => (
              <span key={link} className="text-sm text-muted-foreground">
                {link}
              </span>
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
                    <span key={link} className="text-muted-foreground">
                      {link}
                    </span>
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
