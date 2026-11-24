import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { AppUser } from '@customer-web/auth/AuthProvider'
import { errorMessage, useComplaintsApi } from './api'
import { alertStyle, btnPrimary, btnSecondary, cardStyle, focusRing, inputStyle, mutedStyle } from './styles'
import { FLIGHT_ISSUES, FOOD_ISSUES, LOCATIONS, type ComplaintType, type NewComplaint } from './types'
import { AccountGate, ComplaintPage, ComplaintsNav, Field } from './ui'

const MIN_DESCRIPTION = 20

/** What the backend's refusals mean for the customer. "No flight FY9 on ..." is already a sentence, so it is kept. */
const SUBMIT_ERRORS: Record<string, string> = {
  FLIGHT_NOT_ON_BOOKING: 'This flight is not on any of your bookings. Check the flight number and date, or your booking reference.',
  FLIGHT_NOT_DEPARTED: 'This flight has not departed yet. You can complain about a flight once it has flown.',
}

function submitErrorText(message: string): string {
  if (SUBMIT_ERRORS[message]) return SUBMIT_ERRORS[message]
  if (message.startsWith('No flight ')) return `${message}. Check the flight number and date.`
  return message
}

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

const TYPE_CARDS: { value: ComplaintType; label: string; desc: string; Icon: (props: { selected: boolean }) => ReactNode }[] = [
  { value: 'employee', label: 'Employee', desc: 'A staff member at check-in, the gate, onboard or by phone', Icon: EmployeeIcon },
  { value: 'flight', label: 'Flight', desc: 'Delay, cancellation, seat or cleanliness', Icon: FlightIcon },
  { value: 'food', label: 'Food', desc: 'The meal on board', Icon: FoodIcon },
]

const LOST_BAG_NOTE = 'Lost bag? Report it to Lost and Found. If the bag is not found, they open a case for you.'

function PageHeader() {
  return (
    <div style={{ marginBottom: '24px', textAlign: 'left' }}>
      <h1 style={{ margin: '0 0 6px', fontSize: '26px', fontWeight: 700, color: '#0A1424', letterSpacing: '-0.02em', textAlign: 'left' }}>
        Make a complaint
      </h1>
      <p style={{ margin: 0, fontSize: '14px', color: '#677287', textAlign: 'left' }}>
        Tell us what went wrong. A supervisor reads every case.
      </p>
    </div>
  )
}

export function MakeComplaintPage() {
  return (
    <ComplaintPage>
      <ComplaintsNav current="/complaints" />
      <PageHeader />
      <AccountGate signInTitle="Sign in to make a complaint" redirect="/complaints" note={LOST_BAG_NOTE}>
        {(user) => <ComplaintForm user={user} />}
      </AccountGate>
    </ComplaintPage>
  )
}

function ComplaintForm({ user }: { user: AppUser }) {
  const navigate = useNavigate()
  const api = useComplaintsApi()
  const [checkNumber, setCheckNumber] = useState('')

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
  // The error sits next to the Send button and is scrolled into view, so the customer sees why nothing happened.
  const submitErrorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (submitError) submitErrorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [submitError])

  function chooseType(newType: ComplaintType) {
    setType(newType)
    if (newType === 'food') {
      setIssue('missing')
    } else if (newType === 'flight') {
      setIssue('delay')
    } else {
      setIssue('')
    }
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
      setSubmitError(submitErrorText(errorMessage(e)))
      setSubmitting(false)
    }
  }

  function checkCase(e: FormEvent) {
    e.preventDefault()
    const caseNumber = checkNumber.trim().toUpperCase()
    if (!caseNumber) return
    void navigate({ to: '/complaints/check', search: { caseNumber } })
  }

  const issuesList = type === 'food' ? FOOD_ISSUES : FLIGHT_ISSUES

  return (
    <>
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
          {/* Section 1: What is it about? */}
          <div>
            <h2 style={{ margin: '0 0 14px', fontSize: '18px', fontWeight: 700, color: '#0A1424', textAlign: 'left' }}>
              1. What is it about?
            </h2>
            <div role="group" aria-label="Complaint type" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              {TYPE_CARDS.map(({ value, label, desc, Icon }) => {
                const selected = type === value
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => chooseType(value)}
                    className={focusRing}
                    style={{
                      padding: '16px 18px',
                      borderRadius: '12px',
                      backgroundColor: selected ? '#EEF4FF' : '#FFFFFF',
                      border: `1.5px solid ${selected ? '#2563EB' : '#DBE2EA'}`,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: '8px',
                      textAlign: 'left',
                      font: 'inherit',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span aria-hidden="true" style={{ width: '44px', height: '44px', flexShrink: 0 }}>
                      <Icon selected={selected} />
                    </span>
                    <span style={{ display: 'block', textAlign: 'left' }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: '15px', color: '#0A1424' }}>{label}</span>
                      <span style={{ display: 'block', fontSize: '13px', color: '#677287', marginTop: '2px', lineHeight: 1.4 }}>
                        {desc}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Section 2: Dynamic Category Details */}
          <div>
            <h2 style={{ margin: '0 0 14px', fontSize: '18px', fontWeight: 700, color: '#0A1424', textAlign: 'left' }}>
              2. {type === 'food' ? 'Food details' : type === 'flight' ? 'Flight details' : 'Employee details'}
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
                <p style={{ ...mutedStyle, margin: 0, fontSize: '12px' }}>{LOST_BAG_NOTE}</p>
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

          {submitError && (
            <div ref={submitErrorRef} style={{ ...alertStyle, marginBottom: '16px', textAlign: 'left' }} role="alert">
              {submitError}
            </div>
          )}

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
              We email a copy to <strong>{user.email || 'your account email'}</strong>.
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submit()}
              style={{
                ...btnPrimary,
                opacity: submitting ? 0.7 : 1,
                cursor: submitting ? 'not-allowed' : 'pointer',
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

          {/* Card: Check a case (account-only: the backend returns only this account's cases) */}
          <form onSubmit={checkCase} aria-labelledby="check-case-title" style={cardStyle}>
            <h3
              id="check-case-title"
              style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: 700, color: '#0A1424', textAlign: 'left' }}
            >
              Check a case
            </h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={checkNumber}
                onChange={(e) => setCheckNumber(e.target.value)}
                placeholder="CS-2026-000000"
                aria-label="Case number"
                autoComplete="off"
                style={{ ...inputStyle, flex: 1, minWidth: 0, textTransform: 'uppercase' }}
              />
              <button type="submit" style={btnPrimary}>
                Check
              </button>
            </div>
            <p style={{ ...mutedStyle, margin: '10px 0 12px', lineHeight: 1.4 }}>You can see only cases made from your account.</p>
            <button
              type="button"
              onClick={() => void navigate({ to: '/complaints/check', search: { caseNumber: undefined } })}
              style={{ ...btnSecondary, width: '100%', boxSizing: 'border-box' }}
            >
              All your complaints →
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
