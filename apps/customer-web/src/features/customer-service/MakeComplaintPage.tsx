import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { errorMessage, useComplaintsApi } from './api'
import { alertStyle, btnPrimary, btnSecondary, errorStyle, inputStyle, mutedStyle } from './styles'
import { FLIGHT_ISSUES, FOOD_ISSUES, LOCATIONS, TYPES, type ComplaintType, type NewComplaint } from './types'
import { ComplaintPage, Field } from './ui'

const STEP_TITLES = ['Select complaint type', 'Tell us where it happened', 'Describe what happened'] as const
const MIN_DESCRIPTION = 20

export function MakeComplaintPage() {
  const navigate = useNavigate()
  const api = useComplaintsApi()

  const [type, setType] = useState<ComplaintType | null>(null)
  const [location, setLocation] = useState('')
  const [staffName, setStaffName] = useState('')
  const [flightNumber, setFlightNumber] = useState('')
  const [serviceDate, setServiceDate] = useState('')
  const [issue, setIssue] = useState('')
  const [description, setDescription] = useState('')

  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const issues = type === 'food' ? FOOD_ISSUES : FLIGHT_ISSUES

  function chooseType(value: ComplaintType) {
    if (value !== type) setIssue('') // flight and food have different issue lists
    setType(value)
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (step === 0 && !type) e.type = 'Please choose what your complaint is about.'
    if (step === 1 && type === 'employee' && !location) e.location = 'Please choose where it happened.'
    if (step === 1 && type !== 'employee') {
      if (!/^[A-Za-z0-9]{2,8}$/.test(flightNumber.replace(/\s+/g, ''))) e.flightNumber = 'Enter the flight number, e.g. TG101.'
      if (!serviceDate) e.serviceDate = 'Enter the date of the flight.'
      if (!issue) e.issue = 'Please choose what went wrong.'
    }
    if (step === 2 && description.trim().length < MIN_DESCRIPTION) {
      e.description = `Please describe what happened (at least ${MIN_DESCRIPTION} characters).`
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function next() {
    if (validate()) setStep((s) => Math.min(s + 1, STEP_TITLES.length - 1))
  }

  async function submit() {
    if (!validate() || !type) return
    const body: NewComplaint =
      type === 'employee'
        ? { type, location, staff_name: staffName.trim() || undefined, description: description.trim() }
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
      void navigate({ to: '/complaints/sent', search: { caseNumber: created.caseNumber } })
    } catch (e) {
      setSubmitError(errorMessage(e))
      setSubmitting(false)
    }
  }

  return (
    <ComplaintPage>
      <h1 style={{ margin: '0 0 6px', fontSize: '24px', fontWeight: 700 }}>Make a complaint</h1>
      <p style={{ ...mutedStyle, margin: 0 }}>
        Step {step + 1} of {STEP_TITLES.length} · {STEP_TITLES[step]}
      </p>
      <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', margin: '20px 0 24px' }} aria-hidden="true">
        <div style={{ height: '100%', width: `${((step + 1) / STEP_TITLES.length) * 100}%`, background: '#2563eb', borderRadius: '2px' }} />
      </div>

      {step === 0 && (
        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>What is your complaint about?</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {TYPES.map(({ value, icon, label, desc }) => {
              const selected = type === value
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => chooseType(value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: `2px solid ${selected ? '#2563eb' : '#e2e8f0'}`,
                    background: selected ? '#eff6ff' : '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'inherit',
                  }}
                >
                  <span style={{ fontSize: '26px' }} aria-hidden="true">
                    {icon}
                  </span>
                  <span>
                    <span style={{ display: 'block', fontWeight: 700, fontSize: '15px' }}>{label}</span>
                    <span style={{ display: 'block', ...mutedStyle }}>{desc}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {errors.type && (
            <div role="alert" style={errorStyle}>
              {errors.type}
            </div>
          )}
        </fieldset>
      )}

      {step === 1 && type === 'employee' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Field label="Where did it happen? *" htmlFor="cs-location" error={errors.location}>
            <select id="cs-location" value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle}>
              <option value="">Choose a place</option>
              {LOCATIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Staff member's name (if you know it)" htmlFor="cs-staff">
            <input id="cs-staff" maxLength={100} value={staffName} onChange={(e) => setStaffName(e.target.value)} style={inputStyle} />
          </Field>
        </div>
      )}

      {step === 1 && type !== 'employee' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <Field label="Flight number *" htmlFor="cs-flight" error={errors.flightNumber}>
              <input
                id="cs-flight"
                placeholder="e.g. TG101"
                value={flightNumber}
                onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                style={inputStyle}
              />
            </Field>
            <Field label="Flight date *" htmlFor="cs-date" error={errors.serviceDate}>
              <input id="cs-date" type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} style={inputStyle} />
            </Field>
          </div>
          <Field label="What went wrong? *" htmlFor="cs-issue" error={errors.issue}>
            <select id="cs-issue" value={issue} onChange={(e) => setIssue(e.target.value)} style={inputStyle}>
              <option value="">Choose an issue</option>
              {issues.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {step === 2 && (
        <Field label="Description *" htmlFor="cs-description" error={errors.description}>
          <textarea
            id="cs-description"
            rows={6}
            maxLength={4000}
            placeholder="Please describe what happened, including the time and anyone involved."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
          <div style={{ ...mutedStyle, fontSize: '12px', marginTop: '4px' }}>
            {description.trim().length} characters
            {description.trim().length < MIN_DESCRIPTION && ` (${MIN_DESCRIPTION - description.trim().length} more needed)`}
          </div>
        </Field>
      )}

      {submitError && (
        <div role="alert" style={{ ...alertStyle, marginTop: '20px' }}>
          {submitError}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '28px', gap: '12px' }}>
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(s - 1, 0))}
          disabled={step === 0 || submitting}
          style={{ ...btnSecondary, opacity: step === 0 ? 0.4 : 1, cursor: step === 0 ? 'not-allowed' : 'pointer' }}
        >
          ← Back
        </button>
        {step < STEP_TITLES.length - 1 ? (
          <button type="button" onClick={next} style={btnPrimary}>
            Continue →
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            style={{ ...btnPrimary, opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? 'Submitting…' : 'Submit complaint'}
          </button>
        )}
      </div>

      <p style={{ ...mutedStyle, marginTop: '20px', marginBottom: 0 }}>We'll use the name and email on your account to follow up.</p>
    </ComplaintPage>
  )
}
