import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.tsx'
import { AppAuthProvider } from './auth/AuthProvider'

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined
const root = createRoot(document.getElementById('root')!)

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
        <AppAuthProvider>
          <App />
        </AppAuthProvider>
      </ClerkProvider>
    </StrictMode>,
  )
}
