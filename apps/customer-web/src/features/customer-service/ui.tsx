import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { STATUS_STEPS, type CaseStatus } from './types'
import { cardStyle, errorStyle, headerStyle, pageStyle } from './styles'

/** Header bar plus the white card every complaint page sits in. */
export function ComplaintPage({ children }: { children: ReactNode }) {
  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <span style={{ fontWeight: 700, fontSize: '16px' }}>✈️ Customer Support</span>
        <nav style={{ display: 'flex', gap: '16px', fontSize: '14px' }}>
          <Link to="/complaints">Make a complaint</Link>
          <Link to="/complaints/check" search={{ caseNumber: undefined }}>
            My cases
          </Link>
        </nav>
      </header>
      <main style={cardStyle}>{children}</main>
    </div>
  )
}

export function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
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
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {STATUS_STEPS.map((step, idx) => {
        const done = idx < current
        const active = idx === current
        return (
          <li key={step.status} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', opacity: idx > current ? 0.45 : 1 }}>
            <span
              aria-hidden="true"
              style={{
                flex: '0 0 26px',
                height: '26px',
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                fontSize: '13px',
                fontWeight: 700,
                background: done ? '#16a34a' : active ? '#2563eb' : '#e2e8f0',
                color: done || active ? '#fff' : '#64748b',
              }}
            >
              {done ? '✓' : idx + 1}
            </span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>
                {step.label}
                {active && <span style={{ color: '#2563eb', fontWeight: 500 }}> · current</span>}
              </div>
              <div style={{ fontSize: '13px', color: '#64748b' }}>{step.description}</div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
