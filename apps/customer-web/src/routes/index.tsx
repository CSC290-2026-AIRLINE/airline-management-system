import { createFileRoute, Link } from '@tanstack/react-router'
import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

export const Route = createFileRoute('/')({
  component: HomePage,
})

// Public/unauthenticated landing page. Add new unauthenticated pages as
// siblings under src/routes/ (e.g. src/routes/flights.tsx maps to /flights).
function HomePage() {
  return (
    <main className="bg-muted min-h-svh flex items-center justify-center px-6 py-12 font-sans">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Airline Management System</CardTitle>
          <CardDescription>Book flights, manage trips, and more.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <SignedOut>
            <Button render={<Link to="/login" />} className="w-full">
              Sign in
            </Button>
          </SignedOut>
          <SignedIn>
            <Button render={<Link to="/dashboard" />} className="w-full">
              Go to dashboard
            </Button>
          </SignedIn>
        </CardContent>
      </Card>
    </main>
  )
}
