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
      throw redirect({ to: search.redirect ?? '/dashboard' })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const { redirect: redirectTo } = Route.useSearch()

  return (
    <main className="bg-muted min-h-svh flex items-center justify-center px-6 py-12 font-sans">
      <SignIn fallbackRedirectUrl={redirectTo ?? '/dashboard'} />
    </main>
  )
}
