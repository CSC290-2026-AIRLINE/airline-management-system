import { createFileRoute, Link } from '@tanstack/react-router'
import { SignedIn, SignedOut } from '@clerk/clerk-react'

export const Route = createFileRoute('/')({
  component: HomePage,
})

// Public/unauthenticated landing page. Add new unauthenticated pages as
// siblings under src/routes/ (e.g. src/routes/flights.tsx maps to /flights).
function HomePage() {
  return (
    <section id="center">
      <h1>Airline Management System</h1>
      <p>Book flights, manage trips, and more.</p>
      <SignedOut>
        <Link to="/login">Sign in</Link>
      </SignedOut>
      <SignedIn>
        <Link to="/dashboard">Go to dashboard</Link>
      </SignedIn>
    </section>
  )
}
