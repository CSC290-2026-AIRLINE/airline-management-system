import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'
import { useAppAuth } from '@customer-web/auth/AuthProvider'
import { errorMessage, useComplaintsApi } from './api'
import { alertStyle, btnPrimary, btnSecondary, inputStyle } from './styles'
import { FLIGHT_ISSUES, FOOD_ISSUES, LOCATIONS, type ComplaintType, type NewComplaint } from './types'
import { ComplaintPage, Field } from './ui'

const MIN_DESCRIPTION = 20

function EmployeeIcon({ selected }: { selected: boolean }) {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" style={{ display: 'block' }}>
      <rect
        width="44"
        height="44"
        rx="10"
        fill={selected ? '#2563EB' : '#FFFFFF'}
        stroke={selected ? '#2563EB' : '#DBE2EA'}
        strokeWidth="1"
      />
      <circle cx="22" cy="15.5" r="3.6" strokeWidth="1.8" stroke={selected ? '#FFFFFF' : '#0A1424'} />
      <mask id="stroke_emp_mask" fill="white">
        <path d="M14 32C14 27.5817 17.5817 24 22 24V24C26.4183 24 30 27.5817 30 32V32H14V32Z" />
      </mask>
      <path
        d="M30 32V32C30 27.5817 26.4183 24 22 24V24C17.5817 24 14 27.5817 14 32V32H30Z"
        strokeWidth="3.6"
        stroke={selected ? '#FFFFFF' : '#0A1424'}
        mask="url(#stroke_emp_mask)"
      />
    </svg>
  )
}

function FlightIcon({ selected }: { selected: boolean }) {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" style={{ display: 'block' }}>
      <rect
        width="44"
        height="44"
        rx="10"
        fill={selected ? '#2563EB' : '#FFFFFF'}
        stroke={selected ? '#2563EB' : '#DBE2EA'}
        strokeWidth="1"
      />
      <path d="M11 12L33 22L11 32L15 22L11 12Z" strokeWidth="1.8" strokeLinejoin="round" stroke={selected ? '#FFFFFF' : '#0A1424'} />
      <path d="M15 22H24" strokeWidth="1.8" strokeLinecap="round" stroke={selected ? '#FFFFFF' : '#0A1424'} />
    </svg>
  )
}

function FoodIcon({ selected }: { selected: boolean }) {
  const color = selected ? '#FFFFFF' : '#0A1424'
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" style={{ display: 'block' }}>
      <rect
        width="44"
        height="44"
        rx="10"
        fill={selected ? '#2563EB' : '#FFFFFF'}
        stroke={selected ? '#2563EB' : '#DBE2EA'}
        strokeWidth="1"
      />
      <rect x="14.5" y="11" width="1.6" height="7" fill={color} />
      <rect x="17.7" y="11" width="1.6" height="7" fill={color} />
      <rect x="20.9" y="11" width="1.6" height="7" fill={color} />
      <rect x="14.5" y="17" width="8" height="1.6" fill={color} />
      <rect x="17.7" y="17" width="1.6" height="16" rx="0.8" fill={color} />
      <rect x="26" y="11" width="3.6" height="22" rx="1.8" fill={color} />
    </svg>
  )
}

export function MakeComplaintPage() {
  const navigate = useNavigate()
  const { user } = useAppAuth()
  const { user: clerkUser } = useUser()
  const displayName = clerkUser?.fullName || user?.email || 'your account'
  const api = useComplaintsApi()

  // Type selection
  const [type, setType] = useState<ComplaintType>('employee')

  // Employee details
  const [location, setLocation] = useState('gate')
  const [staffName, setStaffName] = useState('')

  // Flight / Food common fields
  const [flightNumber, setFlightNumber] = useState('')
  const [serviceDate, setServiceDate] = useState('')

  // Issue & description
  const [issue, setIssue] = useState('delay')
  const [description, setDescription] = useState('')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function chooseType(newType: ComplaintType) {
    setType(newType)
    if (newType === 'food') {
      setIssue('missing')
    } else if (newType === 'flight') {
      setIssue('delay')
    } else {
      setIssue('')
    }
    setDescription('')
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (type === 'employee') {
      if (!location) e.location = 'Please choose where it happened.'
    } else {
      if (!flightNumber.trim()) e.flightNumber = 'Flight number is required (e.g. FY308).'
      if (!serviceDate) e.serviceDate = 'Flight date is required.'
      if (!issue) e.issue = 'Please choose what went wrong.'
    }
    if (description.trim().length < MIN_DESCRIPTION) {
      e.description = `Please describe what happened (at least ${MIN_DESCRIPTION} characters).`
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit() {
    if (!user) {
      void navigate({ to: '/login', search: { redirect: '/complaints' } })
      return
    }
    if (!validate()) return

    const body: NewComplaint =
      type === 'employee'
        ? {
            type,
            location,
            staff_name: staffName.trim() || undefined,
            flight_number: flightNumber.replace(/\s+/g, '').toUpperCase() || undefined,
            service_date: serviceDate || undefined,
            description: description.trim(),
          }
        : {
            type,
            flight_number: flightNumber.replace(/\s+/g, '').toUpperCase(),
            service_date: serviceDate,
            issue,
            description: description.trim(),
          }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const created = await api.create(body)
      void navigate({
        to: '/complaints/sent',
        search: {
          caseNumber: created.caseNumber,
        },
      })
    } catch (e) {
      setSubmitError(errorMessage(e))
      setSubmitting(false)
    }
  }

  const issuesList = type === 'food' ? FOOD_ISSUES : FLIGHT_ISSUES

  return (
    <ComplaintPage>
      {/* Page Header */}
      <div style={{ marginBottom: '24px', textAlign: 'left' }}>
        <h1 style={{ margin: '0 0 6px', fontSize: '26px', fontWeight: 700, color: '#0A1424', letterSpacing: '-0.02em', textAlign: 'left' }}>
          Make a complaint
        </h1>
        <p style={{ margin: 0, fontSize: '14px', color: '#677287', textAlign: 'left' }}>
          Tell us what went wrong. A supervisor reads every case.
        </p>
      </div>

      {submitError && (
        <div style={{ ...alertStyle, marginBottom: '24px', textAlign: 'left' }} role="alert">
          {submitError}
        </div>
      )}

      {/* Two Column Layout matching Figma */}
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        {/* Left Column: Complaint Form Card */}
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
            gap: '24px',
            textAlign: 'left',
          }}
        >
          {/* Section 1: Who are you */}
          <div>
            <h2 style={{ margin: '0 0 14px', fontSize: '18px', fontWeight: 700, color: '#0A1424', textAlign: 'left' }}>1. Who are you?</h2>
            {user ? (
              <div
                style={{
                  padding: '16px 18px',
                  borderRadius: '12px',
                  backgroundColor: '#EEF4FF',
                  border: '1.5px solid #2563EB',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '15px', color: '#0A1424', textAlign: 'left' }}>Signed in</div>
                <div style={{ fontSize: '13px', color: '#677287', marginTop: '2px', textAlign: 'left' }}>
                  Signed in as <strong>{displayName}</strong>
                  {user.email ? ` (${user.email})` : ''}.
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: '16px 18px',
                  borderRadius: '12px',
                  backgroundColor: '#FFFBEB',
                  border: '1.5px solid #F59E0B',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '15px', color: '#B45309', textAlign: 'left' }}>Sign in required</div>
                <div style={{ fontSize: '13px', color: '#78350F', marginTop: '4px', textAlign: 'left' }}>
                  Complaints require a Flython account so you can track case status and history.
                </div>
                <button
                  type="button"
                  onClick={() => void navigate({ to: '/login', search: { redirect: '/complaints' } })}
                  style={{ ...btnPrimary, marginTop: '12px' }}
                >
                  Sign in to Flython
                </button>
              </div>
            )}
          </div>

          {/* Section 2: What is it about? */}
          <div>
            <h2 style={{ margin: '0 0 14px', fontSize: '18px', fontWeight: 700, color: '#0A1424', textAlign: 'left' }}>
              2. What is it about?
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              {/* Employee */}
              <div
                onClick={() => chooseType('employee')}
                style={{
                  padding: '16px 18px',
                  borderRadius: '12px',
                  backgroundColor: type === 'employee' ? '#EEF4FF' : '#FFFFFF',
                  border: `1.5px solid ${type === 'employee' ? '#2563EB' : '#DBE2EA'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ width: '44px', height: '44px', flexShrink: 0 }}>
                  <EmployeeIcon selected={type === 'employee'} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: '15px', color: '#0A1424', textAlign: 'left' }}>Employee</div>
                  <div style={{ fontSize: '13px', color: '#677287', marginTop: '2px', lineHeight: 1.4, textAlign: 'left' }}>
                    A staff member at check-in, the gate, onboard or by phone
                  </div>
                </div>
              </div>

              {/* Flight */}
              <div
                onClick={() => chooseType('flight')}
                style={{
                  padding: '16px 18px',
                  borderRadius: '12px',
                  backgroundColor: type === 'flight' ? '#EEF4FF' : '#FFFFFF',
                  border: `1.5px solid ${type === 'flight' ? '#2563EB' : '#DBE2EA'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ width: '44px', height: '44px', flexShrink: 0 }}>
                  <FlightIcon selected={type === 'flight'} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: '15px', color: '#0A1424', textAlign: 'left' }}>Flight</div>
                  <div style={{ fontSize: '13px', color: '#677287', marginTop: '2px', lineHeight: 1.4, textAlign: 'left' }}>
                    Delay, cancellation, seat or cleanliness
                  </div>
                </div>
              </div>

              {/* Food */}
              <div
                onClick={() => chooseType('food')}
                style={{
                  padding: '16px 18px',
                  borderRadius: '12px',
                  backgroundColor: type === 'food' ? '#EEF4FF' : '#FFFFFF',
                  border: `1.5px solid ${type === 'food' ? '#2563EB' : '#DBE2EA'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ width: '44px', height: '44px', flexShrink: 0 }}>
                  <FoodIcon selected={type === 'food'} />
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: '15px', color: '#0A1424', textAlign: 'left' }}>Food</div>
                  <div style={{ fontSize: '13px', color: '#677287', marginTop: '2px', lineHeight: 1.4, textAlign: 'left' }}>
                    The meal on board
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Dynamic Category Details */}
          <div>
            <h2 style={{ margin: '0 0 14px', fontSize: '18px', fontWeight: 700, color: '#0A1424', textAlign: 'left' }}>
              3. {type === 'food' ? 'Food details' : type === 'flight' ? 'Flight details' : 'Employee details'}
            </h2>

            {/* FOOD TYPE SPECIFIC UI */}
            {type === 'food' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Field label="Flight number" htmlFor="f-food-flight" error={errors.flightNumber}>
                    <input
                      id="f-food-flight"
                      type="text"
                      value={flightNumber}
                      onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                      placeholder="e.g. FY308"
                      style={{ ...inputStyle, textTransform: 'uppercase', textAlign: 'left' }}
                    />
                  </Field>
                  <Field label="Flight date" htmlFor="f-food-date" error={errors.serviceDate}>
                    <input
                      id="f-food-date"
                      type="date"
                      value={serviceDate}
                      onChange={(e) => setServiceDate(e.target.value)}
                      style={{ ...inputStyle, textAlign: 'left' }}
                    />
                  </Field>
                </div>

                <Field label="Issue" htmlFor="f-food-issue" error={errors.issue}>
                  <select
                    id="f-food-issue"
                    value={issue}
                    onChange={(e) => setIssue(e.target.value)}
                    style={{ ...inputStyle, textAlign: 'left' }}
                  >
                    {issuesList.map((iss) => (
                      <option key={iss.value} value={iss.value}>
                        {iss.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}

            {/* FLIGHT TYPE SPECIFIC UI */}
            {type === 'flight' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Field label="Flight number" htmlFor="f-flight-number" error={errors.flightNumber}>
                    <input
                      id="f-flight-number"
                      type="text"
                      value={flightNumber}
                      onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                      placeholder="e.g. FY102"
                      style={{ ...inputStyle, textTransform: 'uppercase', textAlign: 'left' }}
                    />
                  </Field>
                  <Field label="Flight date" htmlFor="f-flight-date" error={errors.serviceDate}>
                    <input
                      id="f-flight-date"
                      type="date"
                      value={serviceDate}
                      onChange={(e) => setServiceDate(e.target.value)}
                      style={{ ...inputStyle, textAlign: 'left' }}
                    />
                  </Field>
                </div>

                <Field label="Issue" htmlFor="f-flight-issue" error={errors.issue}>
                  <select
                    id="f-flight-issue"
                    value={issue}
                    onChange={(e) => setIssue(e.target.value)}
                    style={{ ...inputStyle, textAlign: 'left' }}
                  >
                    {issuesList.map((iss) => (
                      <option key={iss.value} value={iss.value}>
                        {iss.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}

            {/* EMPLOYEE TYPE SPECIFIC UI */}
            {type === 'employee' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Field label="Where did it happen?" htmlFor="f-emp-loc" error={errors.location}>
                    <select
                      id="f-emp-loc"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      style={{ ...inputStyle, textAlign: 'left' }}
                    >
                      {LOCATIONS.map((loc) => (
                        <option key={loc.value} value={loc.value}>
                          {loc.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Flight number (if applicable)" htmlFor="f-emp-flight">
                    <input
                      id="f-emp-flight"
                      type="text"
                      value={flightNumber}
                      onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                      placeholder="e.g. FY205"
                      style={{ ...inputStyle, textTransform: 'uppercase', textAlign: 'left' }}
                    />
                  </Field>
                </div>

                <Field label="Staff member's name or description" htmlFor="f-emp-name">
                  <input
                    id="f-emp-name"
                    type="text"
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    placeholder="Name tag, desk number, or description"
                    style={{ ...inputStyle, textAlign: 'left' }}
                  />
                </Field>
              </div>
            )}

            {/* Shared What Happened description field */}
            <div style={{ marginTop: '16px', textAlign: 'left' }}>
              <Field label="What happened?" htmlFor="f-description" error={errors.description}>
                <textarea
                  id="f-description"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Give as much detail as you can (at least 20 characters)"
                  style={{
                    ...inputStyle,
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    lineHeight: 1.5,
                    textAlign: 'left',
                  }}
                />
              </Field>
            </div>
          </div>

          {/* Form Actions Footer */}
          <div
            style={{
              borderTop: '1px solid #E8EDF3',
              paddingTop: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
            }}
          >
            <div style={{ fontSize: '13px', color: '#677287', textAlign: 'left' }}>
              We email a copy to <strong>{user?.email || 'your account email'}</strong>.
            </div>
            <button
              type="button"
              disabled={submitting || !user}
              onClick={() => void submit()}
              style={{
                ...btnPrimary,
                opacity: submitting || !user ? 0.7 : 1,
                cursor: submitting || !user ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Sending complaint…' : 'Send complaint'}
            </button>
          </div>
        </div>

        {/* Right Column: Informational Sidebar Cards matching Figma */}
        <div style={{ width: '380px', display: 'flex', flexDirection: 'column', gap: '24px', flexShrink: 0, textAlign: 'left' }}>
          {/* Card: What happens next */}
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
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 700, color: '#0A1424', textAlign: 'left' }}>
              What happens next
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
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
                  <div style={{ fontSize: '14px', color: '#0A1424', textAlign: 'left' }}>{text}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Card: Already sent a complaint? */}
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
            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: '#0A1424', textAlign: 'left' }}>
              Already sent a complaint?
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#677287', lineHeight: 1.4, textAlign: 'left' }}>
              See the status and full history of your cases.
            </p>
            <button
              type="button"
              onClick={() => {
                void navigate({
                  to: '/complaints/check',
                  search: { caseNumber: undefined },
                })
              }}
              style={{
                ...btnSecondary,
                width: '100%',
                justifyContent: 'center',
                boxSizing: 'border-box',
              }}
            >
              Your complaints →
            </button>
          </div>
        </div>
      </div>
    </ComplaintPage>
  )
}
