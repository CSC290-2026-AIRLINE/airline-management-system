import { createFileRoute, redirect } from '@tanstack/react-router'
import { SignIn } from '@clerk/clerk-react'

// Everyone lands here after signing in, whatever page they were trying to reach.
const AFTER_LOGIN = '/admin/staff'

export const Route = createFileRoute('/login')({
  beforeLoad: ({ context }) => {
    if (context.auth.isSignedIn) {
      throw redirect({ to: AFTER_LOGIN })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  // `force` redirects win over the `redirect_url` Clerk may carry, so the destination never changes.
  return (
    <section id="center">
      <SignIn forceRedirectUrl={AFTER_LOGIN} signUpForceRedirectUrl={AFTER_LOGIN} />
    </section>
  )
}
