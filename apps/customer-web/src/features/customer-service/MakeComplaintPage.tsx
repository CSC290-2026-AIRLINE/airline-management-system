import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { ComplaintCategory } from './types'
import { addComplaint, generateCaseId } from './types'

const CATEGORIES: { value: ComplaintCategory; icon: string; label: string; desc: string }[] = [
  { value: 'Employee', icon: '👤', label: 'Employee', desc: 'Conduct, attitude or service of staff' },
  { value: 'Flight', icon: '✈️', label: 'Flight', desc: 'Delay, cancellation or in-flight issues' },
  { value: 'Food', icon: '🍽️', label: 'Food', desc: 'Meal quality, allergies or catering' },
]

export function MakeComplaintPage() {
  const navigate = useNavigate()

  // Step 1 — Category
  const [category, setCategory] = useState<ComplaintCategory | null>(null)
  // Step 2 — Booking & Flight
  const [bookingRef, setBookingRef] = useState('')
  const [flightNumber, setFlightNumber] = useState('')
  const [flightDate, setFlightDate] = useState('')
  // Step 3 — Passenger
  const [passengerName, setPassengerName] = useState('')
  const [passengerEmail, setPassengerEmail] = useState('')
  // Step 4 — Details
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (step === 1 && !category) e.category = 'Please select a complaint type.'
    if (step === 2) {
      if (!bookingRef.trim()) e.bookingRef = 'Booking reference is required.'
      if (!flightNumber.trim()) e.flightNumber = 'Flight number is required.'
      if (!flightDate) e.flightDate = 'Flight date is required.'
    }
    if (step === 3) {
      if (!passengerName.trim()) e.passengerName = 'Full name is required.'
      if (!passengerEmail.trim()) e.passengerEmail = 'Email is required.'
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(passengerEmail)) e.passengerEmail = 'Invalid email address.'
    }
    if (step === 4) {
      if (!subject.trim()) e.subject = 'Subject is required.'
      if (description.trim().length < 20) e.description = 'Please describe the incident (at least 20 characters).'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function next() {
    if (!validate()) return
    setStep((s) => (s < 4 ? (s + 1) as 1 | 2 | 3 | 4 : s))
  }

  async function submit() {
    if (!validate() || !category) return
    setSubmitting(true)
    await new Promise((r) => setTimeout(r, 600)) // simulate network
    const id = generateCaseId()
    addComplaint({
      id,
      category,
      subject,
      description,
      bookingRef,
      flightNumber,
      flightDate,
      passengerName,
      passengerEmail,
      status: 'Pending',
      assignedTo: null,
      supervisorInvolved: false,
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: [],
    })
    setSubmitting(false)
    void navigate({ to: '/complaints/sent', search: { caseId: id } })
  }

  const totalSteps = 4
  const progress = (step / totalSteps) * 100

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
        {/* Title */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ margin: '0 0 6px', fontSize: '24px', fontWeight: 700, color: '#1e293b' }}>
            Make a Complaint
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
            Step {step} of {totalSteps} · {step === 1 ? 'Select complaint type' : step === 2 ? 'Booking & flight details' : step === 3 ? 'Your information' : 'Describe the incident'}
          </p>
        </div>

        {/* Progress */}
        <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', marginBottom: '28px' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: '#3b82f6', borderRadius: '2px', transition: 'width 0.3s' }} />
        </div>

        {/* ── STEP 1: Category ── */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#374151', marginBottom: '14px' }}>
              What is your complaint about?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {CATEGORIES.map(({ value, icon, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCategory(value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '16px 18px',
                    borderRadius: '12px',
                    border: `2px solid ${category === value ? '#3b82f6' : '#e2e8f0'}`,
                    background: category === value ? '#eff6ff' : '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                >
                  <span style={{ fontSize: '28px' }}>{icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: category === value ? '#1e40af' : '#1e293b' }}>
                      {label}
                    </div>
                    <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>{desc}</div>
                  </div>
                  {category === value && (
                    <span style={{ marginLeft: 'auto', color: '#3b82f6', fontSize: '20px' }}>✓</span>
                  )}
                </button>
              ))}
            </div>
            {errors.category && <div style={errorStyle}>{errors.category}</div>}
          </div>
        )}

        {/* ── STEP 2: Booking & Flight ── */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#374151', marginBottom: '16px' }}>
              Booking & Flight Information
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <Field label="Booking Reference *" error={errors.bookingRef}>
                <input
                  type="text"
                  placeholder="e.g. BK-2026-12345"
                  value={bookingRef}
                  onChange={(e) => setBookingRef(e.target.value.toUpperCase())}
                  style={inputStyle}
                />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label="Flight Number *" error={errors.flightNumber}>
                  <input
                    type="text"
                    placeholder="e.g. TG101"
                    value={flightNumber}
                    onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Flight Date *" error={errors.flightDate}>
                  <input
                    type="date"
                    value={flightDate}
                    onChange={(e) => setFlightDate(e.target.value)}
                    style={inputStyle}
                  />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Passenger Info ── */}
        {step === 3 && (
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#374151', marginBottom: '16px' }}>
              Your Information
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <Field label="Full Name *" error={errors.passengerName}>
                <input
                  type="text"
                  placeholder="e.g. John Smith"
                  value={passengerName}
                  onChange={(e) => setPassengerName(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Email Address *" error={errors.passengerEmail}>
                <input
                  type="email"
                  placeholder="e.g. john@email.com"
                  value={passengerEmail}
                  onChange={(e) => setPassengerEmail(e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </div>
          </div>
        )}

        {/* ── STEP 4: Incident Details ── */}
        {step === 4 && (
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#374151', marginBottom: '16px' }}>
              Describe the Incident
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <Field label="Subject *" error={errors.subject}>
                <input
                  type="text"
                  placeholder="Brief title of your complaint"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Description *" error={errors.description}>
                <textarea
                  placeholder="Please describe what happened in detail, including date, time, location and any staff members involved..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
                <div style={{ fontSize: '12px', color: description.length >= 20 ? '#16a34a' : '#94a3b8', marginTop: '4px' }}>
                  {description.length} characters {description.length < 20 ? `(${20 - description.length} more needed)` : '✓'}
                </div>
              </Field>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '28px', gap: '12px' }}>
          <button
            type="button"
            onClick={() => setStep((s) => (s > 1 ? (s - 1) as 1 | 2 | 3 | 4 : s))}
            disabled={step === 1}
            style={{
              ...btnSecondary,
              opacity: step === 1 ? 0.4 : 1,
              cursor: step === 1 ? 'not-allowed' : 'pointer',
            }}
          >
            ← Back
          </button>
          {step < 4 ? (
            <button type="button" onClick={next} style={btnPrimary}>
              Continue →
            </button>
          ) : (
            <button type="button" onClick={submitting ? undefined : () => { void submit() }} style={{ ...btnPrimary, opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Submitting...' : '📤 Submit Complaint'}
            </button>
          )}
        </div>

        {/* Summary pill */}
        {category && (
          <div style={{
            marginTop: '20px',
            padding: '10px 14px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#64748b',
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
          }}>
            <span>Type: <strong>{category}</strong></span>
            {bookingRef && <span>Booking: <code>{bookingRef}</code></span>}
            {flightNumber && <span>Flight: <code>{flightNumber}</code></span>}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
        {label}
      </label>
      {children}
      {error && <div style={errorStyle}>{error}</div>}
    </div>
  )
}

// ─────── Styles ───────
const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 60%, #f0fdf4 100%)',
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
  maxWidth: '580px',
  margin: '40px auto',
  background: '#fff',
  borderRadius: '16px',
  border: '1px solid #e2e8f0',
  padding: '36px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1.5px solid #e2e8f0',
  fontSize: '14px',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
}

const btnPrimary: React.CSSProperties = {
  flex: 1,
  padding: '11px 24px',
  borderRadius: '10px',
  border: 'none',
  background: '#3b82f6',
  color: '#fff',
  fontSize: '15px',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'background 0.15s',
}

const btnSecondary: React.CSSProperties = {
  padding: '11px 20px',
  borderRadius: '10px',
  border: '1.5px solid #e2e8f0',
  background: '#fff',
  color: '#374151',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
}

const errorStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#dc2626',
  marginTop: '5px',
}
