import { createFileRoute, redirect } from '@tanstack/react-router'
import { SignIn } from '@clerk/clerk-react'

interface LoginSearch {
  redirect?: string
}

const AFTER_LOGIN = '/complaints'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  beforeLoad: ({ context, search }) => {
    if (context.auth.isSignedIn) {
      throw redirect({ to: search.redirect ?? AFTER_LOGIN })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const { redirect: redirectTo } = Route.useSearch()
  const dest = redirectTo ?? AFTER_LOGIN
  return (
    <section id="center">
      <SignIn forceRedirectUrl={dest} signUpForceRedirectUrl={dest} />
    </section>
  )
}
