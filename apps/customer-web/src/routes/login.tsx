import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
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
      throw redirect({ to: search.redirect ?? '/complaints' })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const { redirect: redirectTo } = Route.useSearch()
  const navigate = useNavigate()

  return (
    <section
      id="center"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '18px',
        backgroundColor: '#F3F6FA',
        padding: '24px',
      }}
    >
      <SignIn fallbackRedirectUrl={redirectTo ?? '/complaints'} />
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #DBE2EA',
          borderRadius: '12px',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          maxWidth: '400px',
          width: '100%',
          boxShadow: '0 2px 6px rgba(10, 20, 36, 0.04)',
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#0A1424' }}>
            Passenger without an account?
          </div>
          <div style={{ fontSize: '12px', color: '#677287', marginTop: '2px' }}>
            Make or check a complaint using your booking reference
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            sessionStorage.setItem('f13_guest_mode', '1')
            void navigate({ to: '/complaints' })
          }}
          style={{
            backgroundColor: '#EEF4FF',
            color: '#1F408C',
            border: '1px solid #BBD0FF',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '12.5px',
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Continue as guest
        </button>
      </div>
    </section>
  )
}
