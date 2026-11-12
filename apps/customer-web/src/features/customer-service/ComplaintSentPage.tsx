import { useEffect, useEffectEvent, useState } from 'react'
import { Link, useSearch } from '@tanstack/react-router'
import { errorMessage, useComplaintsApi } from './api'
import { alertStyle, btnPrimary, btnSecondary, mutedStyle } from './styles'
import type { Complaint } from './types'
import { formatDateTime } from './format'
import { ComplaintPage, StatusSteps } from './ui'

export function ComplaintSentPage() {
  const { caseNumber } = useSearch({ from: '/_authenticated/complaints/sent' })
  const api = useComplaintsApi()
  const [complaint, setComplaint] = useState<Complaint | null>(null)
  const [error, setError] = useState<string | null>(caseNumber ? null : 'No case number was given.')

  const fetchCase = useEffectEvent((n: string) => api.get(n))

  useEffect(() => {
    if (!caseNumber) return
    let cancelled = false
    fetchCase(caseNumber).then(
      (row) => {
        if (!cancelled) setComplaint(row)
      },
      (e: unknown) => {
        if (!cancelled) setError(errorMessage(e))
      },
    )
    return () => {
      cancelled = true
    }
  }, [caseNumber])

  return (
    <ComplaintPage>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ fontSize: '44px' }} aria-hidden="true">
          ✅
        </div>
        <h1 style={{ margin: '8px 0 6px', fontSize: '24px', fontWeight: 700 }}>Complaint sent</h1>
        <p style={{ ...mutedStyle, margin: 0 }}>Thank you. Keep your case number to check on its progress.</p>
      </div>

      {error && (
        <div role="alert" style={alertStyle}>
          {error}
        </div>
      )}

      {caseNumber && (
        <div style={{ textAlign: 'center', padding: '16px', borderRadius: '12px', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
          <div style={mutedStyle}>Your case number</div>
          <div style={{ fontFamily: 'monospace', fontSize: '22px', fontWeight: 700, color: '#1e40af', marginTop: '4px' }}>{caseNumber}</div>
          {complaint && <div style={{ ...mutedStyle, marginTop: '4px' }}>Submitted {formatDateTime(complaint.openedAt)}</div>}
        </div>
      )}

      {complaint && (
        <div style={{ marginTop: '24px' }}>
          <h2 style={{ fontSize: '15px', margin: '0 0 12px' }}>What happens next</h2>
          <StatusSteps status={complaint.status} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', marginTop: '28px', flexWrap: 'wrap' }}>
        <Link to="/complaints/check" search={{ caseNumber }} style={{ ...btnPrimary, textAlign: 'center', textDecoration: 'none' }}>
          Track this case
        </Link>
        <Link to="/complaints" style={{ ...btnSecondary, textDecoration: 'none' }}>
          New complaint
        </Link>
      </div>
    </ComplaintPage>
  )
}
