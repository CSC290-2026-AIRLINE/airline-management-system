import { SignedIn, SignedOut, SignIn, useUser } from '@clerk/clerk-react'
import { useAppAuth } from './auth/AuthProvider'
import './App.css'

function App() {
  return (
    <section id="center">
      <SignedOut>
        <SignIn />
      </SignedOut>
      <SignedIn>
        <Dashboard />
      </SignedIn>
    </section>
  )
}

function Dashboard() {
  const { user: clerkUser } = useUser()
  const { user, isLoading, logout } = useAppAuth()

  return (
    <div>
      <h1>Staff dashboard{user ? ` — ${user.name}` : ''}</h1>
      <p>{clerkUser?.primaryEmailAddress?.emailAddress}</p>
      <button type="button" className="counter" onClick={() => void logout()} disabled={isLoading}>
        Log out
      </button>
    </div>
  )
}

export default App
