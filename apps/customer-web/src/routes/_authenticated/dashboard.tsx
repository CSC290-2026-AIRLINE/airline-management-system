import { createFileRoute, Link } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'
import { useAppAuth } from '../../auth/AuthProvider'

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: Dashboard,
})

function Dashboard() {
  const { user: clerkUser } = useUser()
  const { user, isLoading, logout } = useAppAuth()

  return (
    <div>
      <h1>Welcome{user ? `, ${clerkUser?.firstName ?? user.email}` : ''}</h1>
      <p>{clerkUser?.primaryEmailAddress?.emailAddress}</p>
      {/* Feature 5a: the entry points to the customer's receipts and to the payment result page. */}
      <div className="flex flex-col items-start gap-1">
        <Link to="/receipts" className="text-sm text-primary underline underline-offset-4">
          Your receipts
        </Link>
        <Link to="/payments/result" className="text-sm text-primary underline underline-offset-4">
          Payment result
        </Link>
      </div>
      <button type="button" className="counter" onClick={() => void logout()} disabled={isLoading}>
        Log out
      </button>
    </div>
  )
}
