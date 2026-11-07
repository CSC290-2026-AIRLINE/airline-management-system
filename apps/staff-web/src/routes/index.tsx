import { createFileRoute, Link } from '@tanstack/react-router'
import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { Button } from '@staff-web/components/ui/button'
import { Sitemap } from '@staff-web/components/Sitemap'

export const Route = createFileRoute('/')({
  component: HomePage,
})

// Public/unauthenticated landing page. Add new unauthenticated pages as
// siblings under src/routes/ (e.g. src/routes/careers.tsx maps to /careers).
function HomePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-page px-4 py-12 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="h-0.75 w-13 bg-gold" aria-hidden="true" />
        <p className="font-heading text-lg font-bold text-navy">Airlines</p>
      </div>
      <div className="flex max-w-prose flex-col gap-2">
        <h1 className="m-0 text-3xl font-semibold text-foreground">Airline Staff Portal</h1>
        <p className="text-base text-muted-foreground">Manage flights, crews, and operations.</p>
      </div>
      <SignedOut>
        <Button asChild>
          <Link to="/login">Sign in</Link>
        </Button>
      </SignedOut>
      <SignedIn>
        <Button asChild>
          <Link to="/dashboard">Go to dashboard</Link>
        </Button>
        <Sitemap />
      </SignedIn>
    </main>
  )
}
