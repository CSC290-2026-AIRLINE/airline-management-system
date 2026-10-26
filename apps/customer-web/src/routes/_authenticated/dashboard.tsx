import { createFileRoute } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'
import { useAppAuth } from '../../auth/AuthProvider'
import { Badge } from '../../components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: Dashboard,
})

function Dashboard() {
  const { user: clerkUser } = useUser()
  const { user } = useAppAuth()

  const displayName = clerkUser?.firstName ?? user?.email ?? 'Customer'
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? user?.email ?? ''
  const userId = user?.id ?? '—'

  return (
    <main className="bg-muted min-h-[calc(100svh-57px)] px-6 py-10 font-sans">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-foreground m-0 mb-1">Welcome, {displayName}</h1>
          <p className="text-sm text-muted-foreground m-0">View your bookings and manage upcoming trips.</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Your account</CardTitle>
              <Badge variant="secondary">Customer</Badge>
            </div>
            <CardDescription>Identity information synced from Clerk.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium text-foreground text-right">
                {clerkUser?.firstName ? `${clerkUser.firstName}${clerkUser.lastName ? ` ${clerkUser.lastName}` : ''}` : displayName}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium text-foreground text-right">{email}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">User ID</span>
              <span className="font-mono text-foreground text-right">{userId}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
