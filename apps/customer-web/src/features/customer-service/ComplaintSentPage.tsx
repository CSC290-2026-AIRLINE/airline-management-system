import { useNavigate, useSearch } from '@tanstack/react-router'
import { findComplaint, STATUS_STEPS } from './types'

interface SearchParams {
  caseId?: string
}

const STATUS_ORDER = ['Pending', 'In Review', 'Escalated', 'Resolved', 'Closed']

export function ComplaintSentPage() {
  const navigate = useNavigate()
  const { caseId } = useSearch({ strict: false }) as SearchParams
  const complaint = caseId ? findComplaint(caseId) : undefined

  const currentStepIdx = complaint ? STATUS_ORDER.indexOf(complaint.status) : 0

  return (
    <div style={pageStyle}>
      {/* Top bar */}
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '22px' }}>✈️</span>
          <span style={{ fontWeight: 700, fontSize: '16px', color: '#1e293b' }}>AMS Airlines</span>
        </div>
        <div style={{ fontSize: '13px', color: '#64748b' }}>Customer Support</div>
      </header>

      <div style={cardContainerStyle}>
        {/* Success Icon */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: '32px',
            boxShadow: '0 4px 16px rgba(34,197,94,0.3)',
          }}>
            ✓
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: '24px', fontWeight: 700, color: '#1e293b' }}>
            Complaint Submitted
          </h1>
          <p style={{ margin: 0, fontSize: '15px', color: '#64748b' }}>
            Thank you for reaching out. We've received your complaint and our team will review it shortly.
          </p>
        </div>

        {/* Case ID Card */}
        {caseId && (
          <div style={{
            background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
            borderRadius: '12px',
            padding: '20px 24px',
            marginBottom: '28px',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}>
            <div>
              <div style={{ fontSize: '12px', opacity: 0.75, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                Your Case Number
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '0.05em', fontFamily: 'monospace' }}>
                {caseId}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '4px' }}>
                Save this number to track your complaint
              </div>
            </div>
            <div style={{ fontSize: '40px', opacity: 0.4 }}>📋</div>
          </div>
        )}

        {/* Complaint Summary */}
        {complaint && (
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '24px',
          }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
              Summary
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                { label: 'Category', value: complaint.category },
                { label: 'Flight', value: `${complaint.flightNumber} · ${complaint.flightDate}` },
                { label: 'Booking Ref', value: complaint.bookingRef },
                { label: 'Submitted', value: new Date(complaint.submittedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status Steps Timeline */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#374151', marginBottom: '14px' }}>
            What happens next?
          </div>
          <div style={{ position: 'relative' }}>
            {/* Vertical line */}
            <div style={{
              position: 'absolute',
              left: '15px',
              top: '10px',
              bottom: '10px',
              width: '2px',
              background: '#e2e8f0',
              zIndex: 0,
            }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {STATUS_STEPS.map((step, idx) => {
                const isDone = idx <= currentStepIdx
                const isCurrent = idx === currentStepIdx
                return (
                  <div key={step.status} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '10px 0', position: 'relative', zIndex: 1 }}>
                    {/* Circle */}
                    <div style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '50%',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '13px',
                      fontWeight: 700,
                      background: isDone ? (isCurrent ? '#3b82f6' : '#22c55e') : '#fff',
                      border: `2px solid ${isDone ? (isCurrent ? '#3b82f6' : '#22c55e') : '#d1d5db'}`,
                      color: isDone ? '#fff' : '#d1d5db',
                      transition: 'all 0.3s',
                    }}>
                      {isDone && !isCurrent ? '✓' : idx + 1}
                    </div>
                    <div style={{ paddingTop: '4px' }}>
                      <div style={{ fontSize: '14px', fontWeight: isCurrent ? 700 : 600, color: isCurrent ? '#1e40af' : (isDone ? '#1e293b' : '#94a3b8') }}>
                        {step.label}
                        {isCurrent && <span style={{ marginLeft: '8px', fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '8px' }}>Current</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{step.description}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Expected response */}
        <div style={{
          background: '#fefce8',
          border: '1px solid #fde047',
          borderRadius: '10px',
          padding: '14px 16px',
          marginBottom: '24px',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: '18px' }}>⏱️</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#854d0e' }}>Expected Response Time</div>
            <div style={{ fontSize: '13px', color: '#92400e', marginTop: '2px' }}>
              We aim to respond within <strong>3–5 business days</strong>. For urgent cases, our team may contact you sooner.
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
          <button
            type="button"
            onClick={() => void navigate({ to: '/complaints/check', search: { caseId: caseId ?? '' } })}
            style={{
              padding: '12px',
              borderRadius: '10px',
              border: 'none',
              background: '#3b82f6',
              color: '#fff',
              fontSize: '15px',
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            🔍 Track My Case
          </button>
          <button
            type="button"
            onClick={() => void navigate({ to: '/complaints' })}
            style={{
              padding: '12px',
              borderRadius: '10px',
              border: '1.5px solid #e2e8f0',
              background: '#fff',
              color: '#374151',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            Submit Another Complaint
          </button>
        </div>
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #f0fdf4 0%, #f8fafc 60%, #eff6ff 100%)',
  fontFamily: 'system-ui, sans-serif',
}

const headerStyle: React.CSSProperties = {
  background: '#fff',
  borderBottom: '1px solid #e2e8f0',
  padding: '14px 28px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const cardContainerStyle: React.CSSProperties = {
  maxWidth: '560px',
  margin: '40px auto',
  background: '#fff',
  borderRadius: '16px',
  border: '1px solid #e2e8f0',
  padding: '36px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
}
