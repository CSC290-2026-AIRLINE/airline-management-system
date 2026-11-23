import { useEffect, useEffectEvent, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import type { AppUser } from '@customer-web/auth/AuthProvider'
import { errorMessage, useComplaintsApi } from './api'
import { alertStyle, btnPrimary, btnSecondary, focusRing, mutedStyle, successStyle } from './styles'
import { FLIGHT_ISSUES, FOOD_ISSUES, LOCATIONS, optionLabel, type CaseStatus, type Complaint } from './types'
import { formatDateTime } from './format'
import { AccountGate, ComplaintPage, ComplaintsNav } from './ui'

const TRACKER_STEPS: { status: CaseStatus; label: string }[] = [
  { status: 'with_supervisor', label: 'With supervisor' },
  { status: 'assigned', label: 'Assigned' },
  { status: 'resolved', label: 'Resolved' },
  { status: 'closed', label: 'Closed' },
]

export function ComplaintSentPage() {
  const { caseNumber } = useSearch({ from: '/complaints/sent' })
  return (
    <ComplaintPage>
      <ComplaintsNav />
      {/* Page Header */}
      <div style={{ marginBottom: '24px', textAlign: 'left' }}>
        <h1 style={{ margin: '0 0 6px', fontSize: '26px', fontWeight: 700, color: '#0A1424', letterSpacing: '-0.02em', textAlign: 'left' }}>
          Make a complaint
        </h1>
        <p style={{ margin: 0, fontSize: '14px', color: '#677287', textAlign: 'left' }}>
          Tell us what went wrong. A supervisor reads every case.
        </p>
      </div>
      <AccountGate
        signInTitle="Sign in to see your case"
        redirect={caseNumber ? `/complaints/sent?caseNumber=${encodeURIComponent(caseNumber)}` : '/complaints/check'}
      >
        {(user) =>
          caseNumber ? (
            <SentCase key={caseNumber} caseNumber={caseNumber} user={user} />
          ) : (
            <div role="alert" style={alertStyle}>
              No case number was given.{' '}
              <Link
                to="/complaints/check"
                search={{ caseNumber: undefined }}
                className={focusRing}
                style={{ color: 'inherit', fontWeight: 600 }}
              >
                See your complaints
              </Link>
            </div>
          )
        }
      </AccountGate>
    </ComplaintPage>
  )
}

/** The case just sent. Keyed by case number, so a new one starts from loading. */
function SentCase({ caseNumber, user }: { caseNumber: string; user: AppUser }) {
  const navigate = useNavigate()
  const api = useComplaintsApi()
  const [complaint, setComplaint] = useState<Complaint | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchCase = useEffectEvent((n: string) => api.get(n))

  useEffect(() => {
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

  if (error) {
    return (
      <div role="alert" style={{ ...alertStyle, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span>
          We couldn't load case {caseNumber}. {error}
        </span>
        <Link
          to="/complaints/check"
          search={{ caseNumber: undefined }}
          className={focusRing}
          style={{ color: 'inherit', fontWeight: 600, alignSelf: 'flex-start' }}
        >
          See your complaints
        </Link>
      </div>
    )
  }
  if (!complaint) {
    return (
      <p role="status" style={mutedStyle}>
        Loading your case…
      </p>
    )
  }

  const currentStepIdx = Math.max(
    0,
    TRACKER_STEPS.findIndex((s) => s.status === complaint.status),
  )

  return (
    <>
      {/* Two Column Layout matching Figma 05 */}
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        {/* Left Column: Complaint Sent Card (784px) */}
        <div
          style={{
            flex: '1',
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            border: '1px solid #DBE2EA',
            padding: '28px',
            boxShadow: '0 2px 8px rgba(10, 20, 36, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            textAlign: 'left',
          }}
        >
          {/* Green Success Banner */}
          <div style={successStyle}>
            {`Thank you. Your complaint was sent. We emailed a copy to ${complaint.contactEmail || user.email}.`}
          </div>

          {/* Case Number Display */}
          <div>
            <div style={{ fontSize: '13px', color: '#677287' }}>Case number</div>
            <div style={{ fontSize: '30px', fontWeight: 700, color: '#0A1424', marginTop: '4px', letterSpacing: '-0.02em' }}>
              {complaint.caseNumber}
            </div>
          </div>

          {/* Facts Table */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderTop: '1px solid #E8EDF3',
                fontSize: '14px',
              }}
            >
              <span style={{ color: '#677287', flex: 1 }}>Type</span>
              <span style={{ fontWeight: 500, color: '#0A1424', flex: 1, textTransform: 'capitalize' }}>{complaint.type}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderTop: '1px solid #E8EDF3',
                fontSize: '14px',
              }}
            >
              <span style={{ color: '#677287', flex: 1 }}>From</span>
              <span style={{ fontWeight: 500, color: '#0A1424', flex: 1 }}>{complaint.passengerName || '—'} · Customer</span>
            </div>
            {complaint.flightNumber && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderTop: '1px solid #E8EDF3',
                  fontSize: '14px',
                }}
              >
                <span style={{ color: '#677287', flex: 1 }}>Flight</span>
                <span style={{ fontWeight: 500, color: '#0A1424', flex: 1 }}>
                  {complaint.flightRoute || [complaint.flightNumber, complaint.serviceDate].filter(Boolean).join(' · ')}
                </span>
              </div>
            )}
            {complaint.issue && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderTop: '1px solid #E8EDF3',
                  fontSize: '14px',
                }}
              >
                <span style={{ color: '#677287', flex: 1 }}>Issue</span>
                <span style={{ fontWeight: 500, color: '#0A1424', flex: 1 }}>
                  {optionLabel(complaint.type === 'food' ? FOOD_ISSUES : FLIGHT_ISSUES, complaint.issue)}
                </span>
              </div>
            )}
            {complaint.location && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderTop: '1px solid #E8EDF3',
                  fontSize: '14px',
                }}
              >
                <span style={{ color: '#677287', flex: 1 }}>Location</span>
                <span style={{ fontWeight: 500, color: '#0A1424', flex: 1 }}>{optionLabel(LOCATIONS, complaint.location)}</span>
              </div>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderTop: '1px solid #E8EDF3',
                fontSize: '14px',
              }}
            >
              <span style={{ color: '#677287', flex: 1 }}>Sent to</span>
              <span style={{ fontWeight: 500, color: '#0A1424', flex: 1 }}>Customer Service supervisor</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderTop: '1px solid #E8EDF3',
                fontSize: '14px',
              }}
            >
              <span style={{ color: '#677287', flex: 1 }}>Opened</span>
              <span style={{ fontWeight: 500, color: '#0A1424', flex: 1 }}>{formatDateTime(complaint.openedAt)}</span>
            </div>
          </div>

          {/* Status Tracker matching Figma 05 / 05c */}
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#0A1424', marginBottom: '12px' }}>Status</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {TRACKER_STEPS.map((step, idx) => {
                const isReached = idx <= currentStepIdx
                const isCurrent = idx === currentStepIdx
                return (
                  <div key={step.status} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {idx > 0 && (
                      <div
                        style={{
                          width: '28px',
                          height: '2px',
                          backgroundColor: isReached ? '#102544' : '#E8EDF3',
                        }}
                      />
                    )}
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '999px',
                        backgroundColor: isReached ? '#102544' : '#E8EDF3',
                        color: isReached ? '#FFFFFF' : '#677287',
                        fontSize: '12px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {idx + 1}
                    </div>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: isCurrent ? 600 : 500,
                        color: isCurrent ? '#0A1424' : '#677287',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button type="button" onClick={() => void navigate({ to: '/complaints' })} style={btnSecondary}>
              Make another complaint
            </button>
            <button
              type="button"
              onClick={() =>
                void navigate({
                  to: '/complaints/check',
                  search: {
                    caseNumber: complaint.caseNumber,
                  },
                })
              }
              style={{ ...btnPrimary, backgroundColor: '#102544' }}
            >
              Check this case
            </button>
          </div>
        </div>

        {/* Right Column: What happens next (392px) */}
        <div style={{ width: '392px', display: 'flex', flexDirection: 'column', gap: '24px', flexShrink: 0 }}>
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #DBE2EA',
              padding: '24px',
              boxShadow: '0 2px 8px rgba(10, 20, 36, 0.04)',
              textAlign: 'left',
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: 700, color: '#0A1424' }}>What happens next</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { step: 1, text: 'We give you a case number.' },
                { step: 2, text: 'It goes to the Customer Service supervisor.' },
                { step: 3, text: 'Every step is saved in the case history.' },
                { step: 4, text: 'We email you when the status changes.' },
              ].map(({ step, text }) => (
                <div key={step} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: '#E8EEF7',
                      color: '#1F408C',
                      fontSize: '12px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {step}
                  </div>
                  <div style={{ fontSize: '14px', color: '#0A1424' }}>{text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
