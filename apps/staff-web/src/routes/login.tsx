import { createFileRoute, redirect } from '@tanstack/react-router'
import { SignIn } from '@clerk/clerk-react'

interface LoginSearch {
  redirect?: string
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  beforeLoad: ({ context, search }) => {
    if (context.auth.isSignedIn) {
      throw redirect({ to: search.redirect ?? '/customer-search' })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const { redirect: redirectTo } = Route.useSearch()

  return (
    <section id="center">
      <SignIn fallbackRedirectUrl={redirectTo ?? '/customer-search'} />
    </section>
  )
}
