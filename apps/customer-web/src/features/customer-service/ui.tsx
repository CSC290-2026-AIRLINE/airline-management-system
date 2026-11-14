import type { ReactNode } from 'react'
import { CustomerNavbar } from './CustomerNavbar'
import { STATUS_STEPS, type CaseStatus } from './types'
import { errorStyle } from './styles'

/** Layout wrapper with Figma-style Customer Navbar and background */
export function ComplaintPage({
  children,
  isGuest = false,
  onSignInClick,
}: {
  children: ReactNode
  isGuest?: boolean
  onSignInClick?: () => void
}) {
  return (
    <div
      className="customer-shell"
      style={{
        minHeight: '100vh',
        width: '100%',
        backgroundColor: '#F7F9FC',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        color: '#0A1424',
        textAlign: 'left',
      }}
    >
      <CustomerNavbar isGuest={isGuest} onSignInClick={onSignInClick} />
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px 80px' }}>
        {children}
      </main>
    </div>
  )
}

export function Field({ label, htmlFor, error, children }: { label: string; htmlFor?: string; error?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
      <label htmlFor={htmlFor} style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#0A1424' }}>
        {label}
      </label>
      {children}
      {error && (
        <div role="alert" style={errorStyle}>
          {error}
        </div>
      )}
    </div>
  )
}

/** The four status steps, with the case's current one highlighted. */
export function StatusSteps({ status }: { status: CaseStatus }) {
  const current = STATUS_STEPS.findIndex((s) => s.status === status)
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {STATUS_STEPS.map((step, idx) => {
        const done = idx < current
        const active = idx === current
        return (
          <li key={step.status} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', opacity: idx > current ? 0.4 : 1 }}>
            <span
              aria-hidden="true"
              style={{
                flex: '0 0 26px',
                height: '26px',
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                fontSize: '12px',
                fontWeight: 700,
                background: done ? '#16A34A' : active ? '#2563EB' : '#E2E8F0',
                color: done || active ? '#FFF' : '#64748B',
              }}
            >
              {done ? '✓' : idx + 1}
            </span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px', color: '#0A1424' }}>
                {step.label}
                {active && <span style={{ color: '#2563EB', fontWeight: 600, fontSize: '12px', marginLeft: '6px' }}>· Active</span>}
              </div>
              <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>{step.description}</div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
