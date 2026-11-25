import { useEffect, useEffectEvent, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@customer-web/components/ui/alert'
import { Badge } from '@customer-web/components/ui/badge'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardFooter } from '@customer-web/components/ui/card'
import { Checkbox } from '@customer-web/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@customer-web/components/ui/table'
import type { NotificationPreferenceRow } from './types'
import { errorMessage, useComplaintsApi } from './api'
import { AccountGate, ComplaintPage } from './ui'

type Channel = 'email' | 'sms' | 'push'
const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'SMS' },
  { key: 'push', label: 'Push' },
]

export function NotificationPreferencesPage() {
  return (
    <ComplaintPage
      current="/complaints/preferences"
      title="Notification preferences"
      subtitle="Choose how you receive flight alerts and customer service notices."
    >
      <p className="m-0 text-sm text-muted-foreground">
        Critical messages (flight delays, cancellations and gate changes) are always sent on at least one channel.
      </p>
      <AccountGate signInTitle="Sign in to manage notifications" redirect="/complaints/preferences">
        {() => <PreferencesForm />}
      </AccountGate>
    </ComplaintPage>
  )
}

function PreferencesForm() {
  const api = useComplaintsApi()
  const [preferences, setPreferences] = useState<NotificationPreferenceRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)

  const fetchPreferences = useEffectEvent(() => api.getNotificationPreferences())

  useEffect(() => {
    let active = true
    fetchPreferences()
      .then((data) => {
        // SMS cannot reach an account with no phone number, so it shows (and is saved) as off.
        if (active) setPreferences(Array.isArray(data) ? data.map((r) => (r.smsAvailable ? r : { ...r, sms: false })) : [])
      })
      .catch((err: unknown) => {
        if (active) setLoadError(errorMessage(err))
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [loadAttempt])

  function retryLoad() {
    setLoadError(null)
    setIsLoading(true)
    setLoadAttempt((n) => n + 1)
  }

  /** SMS needs a phone number on the account; without one the switch is off and cannot be turned on. */
  const smsAvailable = preferences.every((r) => r.smsAvailable)

  function handleToggle(row: NotificationPreferenceRow, channel: Channel) {
    if (channel === 'sms' && !row.smsAvailable) return
    // A mandatory notice must stay on for at least one channel.
    if (row[channel] && row.isMandatory && !CHANNELS.some(({ key }) => key !== channel && row[key])) {
      setNotice(`"${row.typeName}" is a critical flight alert and must stay on for at least one channel.`)
      return
    }
    setNotice(null)
    setPreferences((prev) => prev.map((r) => (r.typeCode === row.typeCode ? { ...r, [channel]: !r[channel] } : r)))
    setIsSaved(false)
  }

  async function handleSave() {
    try {
      setIsSaving(true)
      setError(null)
      // The warning was about a switch that was refused; it no longer applies once the settings are saved.
      setNotice(null)
      const updated = await api.updateNotificationPreferences(preferences)
      if (Array.isArray(updated) && updated.length > 0) {
        setPreferences(updated)
      }
      setIsSaved(true)
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }, 50)
    } catch (err) {
      setError(errorMessage(err))
      // The error banner is at the top of the page, above the table the customer scrolled past.
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setIsSaving(false)
    }
  }

  const canSave = !isSaving && !isLoading && !loadError && preferences.length > 0
  const columns = CHANNELS.length + 2

  return (
    <div className="flex flex-col gap-4">
      {isSaved && (
        <Alert role="status">
          <CheckCircle2 className="text-ok" />
          <AlertTitle>Preferences saved</AlertTitle>
          <AlertDescription>
            <div className="flex items-start justify-between gap-3">
              <p>Your notification settings have been updated across email, SMS and push.</p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="-my-2 size-7"
                aria-label="Dismiss saved message"
                onClick={() => setIsSaved(false)}
              >
                <X />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            <div className="flex items-start justify-between gap-3">
              <p>{error}</p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="-my-2 size-7"
                aria-label="Dismiss error"
                onClick={() => setError(null)}
              >
                <X />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {notice && (
        <Alert variant="destructive">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {!isLoading && !loadError && preferences.length > 0 && !smsAvailable && (
        <p role="note" className="text-sm text-muted-foreground">
          SMS is off because your account has no phone number. Add one to your profile to receive text messages.
        </p>
      )}

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event type</TableHead>
                <TableHead>Service</TableHead>
                {CHANNELS.map(({ key, label }) => (
                  <TableHead key={key} className="w-24 text-center">
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={columns} role="status" className="text-muted-foreground">
                    Loading your preferences…
                  </TableCell>
                </TableRow>
              ) : loadError ? (
                <TableRow>
                  <TableCell colSpan={columns}>
                    <Alert variant="destructive">
                      <AlertDescription>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p>We couldn't load your preferences. {loadError}</p>
                          <Button type="button" variant="outline" size="sm" onClick={retryLoad}>
                            Try again
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  </TableCell>
                </TableRow>
              ) : preferences.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns} className="text-muted-foreground">
                    There are no notifications to set up yet.
                  </TableCell>
                </TableRow>
              ) : (
                preferences.map((row) => (
                  <TableRow key={row.typeCode}>
                    <TableCell className="font-medium whitespace-normal">
                      {row.typeName}
                      {row.isMandatory && (
                        <Badge variant="warning" className="ml-2 align-middle">
                          Always on
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.service}</TableCell>
                    {CHANNELS.map(({ key, label }) => (
                      <TableCell key={key} className="text-center">
                        <Checkbox
                          aria-label={`${label} for ${row.typeName}`}
                          checked={row[key]}
                          disabled={key === 'sms' && !row.smsAvailable}
                          title={key === 'sms' && !row.smsAvailable ? 'Add a phone number to your profile to get SMS' : undefined}
                          onCheckedChange={() => handleToggle(row, key)}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t">
          <p className="text-sm text-muted-foreground">All notifications are delivered via mocked channels in real time.</p>
          <Button type="button" onClick={() => void handleSave()} disabled={!canSave}>
            {isSaving ? 'Saving…' : 'Save preferences'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
