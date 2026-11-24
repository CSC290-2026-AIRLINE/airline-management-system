import { useEffect, useEffectEvent, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { CheckCircle2 } from 'lucide-react'
import type { AppUser } from '@customer-web/auth/AuthProvider'
import { Alert, AlertDescription } from '@customer-web/components/ui/alert'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardFooter } from '@customer-web/components/ui/card'
import { Separator } from '@customer-web/components/ui/separator'
import { errorMessage, useComplaintsApi } from './api'
import { FLIGHT_ISSUES, FOOD_ISSUES, LOCATIONS, optionLabel, type Complaint } from './types'
import { formatDateTime } from './format'
import { StatusTracker, WhatHappensNext } from './parts'
import { AccountGate, ComplaintPage } from './ui'

export function ComplaintSentPage() {
  const { caseNumber } = useSearch({ from: '/complaints/sent' })
  return (
    <ComplaintPage title="Complaint sent" subtitle="A supervisor reads every case.">
      <AccountGate
        signInTitle="Sign in to see your case"
        redirect={caseNumber ? `/complaints/sent?caseNumber=${encodeURIComponent(caseNumber)}` : '/complaints/check'}
      >
        {(user) =>
          caseNumber ? (
            <SentCase key={caseNumber} caseNumber={caseNumber} user={user} />
          ) : (
            <Alert variant="destructive">
              <AlertDescription>
                <p>
                  No case number was given.{' '}
                  <Link to="/complaints/check" search={{ caseNumber: undefined }} className="font-medium underline underline-offset-4">
                    See your complaints
                  </Link>
                </p>
              </AlertDescription>
            </Alert>
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
      <Alert variant="destructive">
        <AlertDescription className="gap-2">
          <p>
            We couldn't load case {caseNumber}. {error}
          </p>
          <Link to="/complaints/check" search={{ caseNumber: undefined }} className="font-medium underline underline-offset-4">
            See your complaints
          </Link>
        </AlertDescription>
      </Alert>
    )
  }
  if (!complaint) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading your case…
      </p>
    )
  }

  const rows: { label: string; value: string }[] = [
    { label: 'Type', value: complaint.type.charAt(0).toUpperCase() + complaint.type.slice(1) },
    { label: 'From', value: `${complaint.passengerName || '—'} · Customer` },
    ...(complaint.flightNumber
      ? [{ label: 'Flight', value: complaint.flightRoute || [complaint.flightNumber, complaint.serviceDate].filter(Boolean).join(' · ') }]
      : []),
    ...(complaint.issue
      ? [{ label: 'Issue', value: optionLabel(complaint.type === 'food' ? FOOD_ISSUES : FLIGHT_ISSUES, complaint.issue) }]
      : []),
    ...(complaint.location ? [{ label: 'Location', value: optionLabel(LOCATIONS, complaint.location) }] : []),
    { label: 'Sent to', value: 'Customer Service supervisor' },
    { label: 'Opened', value: formatDateTime(complaint.openedAt) },
  ]

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <CardContent className="flex flex-col gap-5">
          <Alert>
            <CheckCircle2 className="text-success" />
            <AlertDescription>
              Thank you. Your complaint was sent. We emailed a copy to {complaint.contactEmail || user.email}.
            </AlertDescription>
          </Alert>

          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Case number</span>
            <span className="text-3xl font-semibold tracking-tight">{complaint.caseNumber}</span>
          </div>

          <dl className="m-0 flex flex-col">
            {rows.map((row) => (
              <div key={row.label}>
                <Separator />
                <div className="grid grid-cols-2 gap-4 py-2.5 text-sm">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="m-0 font-medium">{row.value}</dd>
                </div>
              </div>
            ))}
          </dl>

          <div className="flex flex-col gap-3">
            <h2 className="m-0 text-base font-semibold">Status</h2>
            <StatusTracker status={complaint.status} />
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => void navigate({ to: '/complaints' })}>
            Make another complaint
          </Button>
          <Button type="button" onClick={() => void navigate({ to: '/complaints/check', search: { caseNumber: complaint.caseNumber } })}>
            Check this case
          </Button>
        </CardFooter>
      </Card>

      <WhatHappensNext />
    </div>
  )
}
