import { createFileRoute } from '@tanstack/react-router'
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
      <button type="button" className="counter" onClick={() => void logout()} disabled={isLoading}>
        Log out
      </button>
    </div>
  )
}
