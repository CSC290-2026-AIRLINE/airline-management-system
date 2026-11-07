import { createFileRoute } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent } from '@staff-web/components/ui/card'
import { useAppAuth } from '../../auth/AuthProvider'

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: Dashboard,
})

function Dashboard() {
  const { user: clerkUser } = useUser()
  const { user, isLoading, logout } = useAppAuth()

  return (
    <main className="min-h-svh bg-page px-4 py-12">
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col gap-3 px-6">
          <h1 className="m-0 text-2xl font-semibold text-foreground">Welcome{user ? `, ${clerkUser?.firstName ?? user.email}` : ''}</h1>
          <p className="text-sm text-muted-foreground">{clerkUser?.primaryEmailAddress?.emailAddress}</p>
          <div>
            <Button type="button" variant="outline" onClick={() => void logout()} disabled={isLoading}>
              Log out
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
