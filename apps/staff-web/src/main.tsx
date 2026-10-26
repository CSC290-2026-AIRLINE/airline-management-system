import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider, useAuth } from '@clerk/clerk-react'
import { RouterProvider } from '@tanstack/react-router'
import './index.css'
import './App.css'
import { router } from './router'

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined
const root = createRoot(document.getElementById('root')!)

function InnerApp() {
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) {
    return null
  }

  return <RouterProvider router={router} context={{ auth: { isLoaded, isSignedIn: !!isSignedIn } }} />
}

if (!clerkPublishableKey) {
  root.render(
    <StrictMode>
      <p style={{ padding: 24, fontFamily: 'sans-serif' }}>
        Missing <code>VITE_CLERK_PUBLISHABLE_KEY</code>. Copy <code>.env.example</code> to <code>.env</code> and set it.
      </p>
    </StrictMode>,
  )
} else {
  root.render(
    <StrictMode>
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <InnerApp />
      </ClerkProvider>
    </StrictMode>,
  )
}
