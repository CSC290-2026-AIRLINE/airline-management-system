import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Plane, User, Utensils, type LucideIcon } from 'lucide-react'
import type { AppUser } from '@customer-web/auth/AuthProvider'
import { Alert, AlertDescription } from '@customer-web/components/ui/alert'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { Field } from '@customer-web/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@customer-web/components/ui/select'
import { Input } from '@customer-web/components/ui/input'
import { Textarea } from '@customer-web/components/ui/textarea'
import { cn } from '@customer-web/lib/utils'
import { errorMessage, useComplaintsApi } from './api'
import { FLIGHT_ISSUES, FOOD_ISSUES, LOCATIONS, type ComplaintType, type NewComplaint } from './types'
import { WhatHappensNext } from './parts'
import { AccountGate, ComplaintPage, ComplaintsNav } from './ui'

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

const TYPE_CARDS: { value: ComplaintType; label: string; desc: string; Icon: LucideIcon }[] = [
  { value: 'employee', label: 'Employee', desc: 'A staff member at check-in, the gate, onboard or by phone', Icon: User },
  { value: 'flight', label: 'Flight', desc: 'Delay, cancellation, seat or cleanliness', Icon: Plane },
  { value: 'food', label: 'Food', desc: 'The meal on board', Icon: Utensils },
]

const LOST_BAG_NOTE = 'Lost bag? Report it to Lost and Found. If the bag is not found, they open a case for you.'

export function MakeComplaintPage() {
  return (
    <ComplaintPage title="Make a complaint" subtitle="Tell us what went wrong. A supervisor reads every case.">
      <ComplaintsNav current="/complaints" />
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
  const [type, setType] = useState<ComplaintType>('employee')
  const [location, setLocation] = useState('gate')
  const [staffName, setStaffName] = useState('')
  const [flightNumber, setFlightNumber] = useState('')
  const [serviceDate, setServiceDate] = useState('')
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
  const detailsTitle = type === 'food' ? 'Food details' : type === 'flight' ? 'Flight details' : 'Employee details'
  const flightFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="f-flight-number" label="Flight number" error={errors.flightNumber}>
        <Input
          id="f-flight-number"
          value={flightNumber}
          onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
          placeholder={type === 'food' ? 'e.g. FY308' : 'e.g. FY102'}
          aria-invalid={Boolean(errors.flightNumber)}
          className="uppercase placeholder:normal-case"
        />
      </Field>
      <Field id="f-flight-date" label="Flight date" error={errors.serviceDate}>
        <Input
          id="f-flight-date"
          type="date"
          value={serviceDate}
          onChange={(e) => setServiceDate(e.target.value)}
          aria-invalid={Boolean(errors.serviceDate)}
        />
      </Field>
    </div>
  )

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <CardHeader>
          <CardTitle>1. What is it about?</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div role="group" aria-label="Complaint type" className="grid gap-3 sm:grid-cols-3">
            {TYPE_CARDS.map(({ value, label, desc, Icon }) => {
              const selected = type === value
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => chooseType(value)}
                  className={cn(
                    'flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    selected ? 'border-primary bg-accent' : 'bg-card hover:bg-accent/50',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-9 items-center justify-center rounded-md border',
                      selected ? 'border-primary bg-primary text-primary-foreground' : 'bg-background',
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground">{desc}</span>
                </button>
              )
            })}
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="m-0 text-base font-semibold">2. {detailsTitle}</h2>

            {type !== 'employee' && (
              <>
                {flightFields}
                <Field id="f-issue" label="Issue" error={errors.issue}>
                  <Select value={issue} onValueChange={setIssue}>
                    <SelectTrigger id="f-issue" aria-invalid={Boolean(errors.issue)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {issuesList.map((iss) => (
                        <SelectItem key={iss.value} value={iss.value}>
                          {iss.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {type === 'flight' && <p className="text-xs text-muted-foreground">{LOST_BAG_NOTE}</p>}
              </>
            )}

            {type === 'employee' && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="f-emp-loc" label="Where did it happen?" error={errors.location}>
                    <Select value={location} onValueChange={setLocation}>
                      <SelectTrigger id="f-emp-loc" aria-invalid={Boolean(errors.location)}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LOCATIONS.map((loc) => (
                          <SelectItem key={loc.value} value={loc.value}>
                            {loc.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field id="f-emp-flight" label="Flight number (if applicable)">
                    <Input
                      id="f-emp-flight"
                      value={flightNumber}
                      onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                      placeholder="e.g. FY205"
                      className="uppercase placeholder:normal-case"
                    />
                  </Field>
                </div>
                <Field id="f-emp-name" label="Staff member's name or description">
                  <Input
                    id="f-emp-name"
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    placeholder="Name tag, desk number, or description"
                  />
                </Field>
              </>
            )}

            <Field id="f-description" label="What happened?" error={errors.description}>
              <Textarea
                id="f-description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Give as much detail as you can (at least 20 characters)"
                aria-invalid={Boolean(errors.description)}
              />
            </Field>
          </div>

          {submitError && (
            <Alert variant="destructive" ref={submitErrorRef}>
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t">
          <p className="text-sm text-muted-foreground">
            We email a copy to <strong className="font-medium text-foreground">{user.email || 'your account email'}</strong>.
          </p>
          <Button type="button" disabled={submitting} onClick={() => void submit()}>
            {submitting ? 'Sending complaint…' : 'Send complaint'}
          </Button>
        </CardFooter>
      </Card>

      <div className="flex flex-col gap-6">
        <WhatHappensNext />

        {/* Check a case (account-only: the backend returns only this account's cases) */}
        <Card>
          <CardHeader>
            <CardTitle>Check a case</CardTitle>
            <CardDescription>You can see only cases made from your account.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <form onSubmit={checkCase} className="flex gap-2">
              <Input
                value={checkNumber}
                onChange={(e) => setCheckNumber(e.target.value)}
                placeholder="CS-2026-000000"
                aria-label="Case number"
                autoComplete="off"
                className="min-w-0 flex-1 uppercase placeholder:normal-case"
              />
              <Button type="submit">Check</Button>
            </form>
            <Button
              type="button"
              variant="outline"
              onClick={() => void navigate({ to: '/complaints/check', search: { caseNumber: undefined } })}
            >
              All your complaints →
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
