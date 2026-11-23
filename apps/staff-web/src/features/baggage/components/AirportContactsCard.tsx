import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { useState, type FormEvent } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import type { SaveStationContactBody, StationContact } from '../api/found-bags'
import { errorMessage } from '../hooks/useFoundBags'
import { cn } from '@staff-web/lib/utils'
import { displayPhone, formatPhoneNumber, phoneHref, phoneNumberProblem } from '../phone-number'
import { F10Card, Field, FormError, LIST_CARD, LIST_PAD } from './primitives'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const AIRPORT_PATTERN = /^[A-Za-z]{3}$/

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

/** Edit (or add) one airport's desk. Not drawn in Figma; it reuses the F10 field and button styles. */
function ContactDialog({
  contact,
  open,
  onOpenChange,
  onSave,
}: {
  contact: StationContact | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (airportCode: string, body: SaveStationContactBody) => Promise<void>
}) {
  const [airportCode, setAirportCode] = useState(contact?.airportCode ?? '')
  const [deskName, setDeskName] = useState(contact?.deskName ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [email, setEmail] = useState(contact?.email ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function check(): string | null {
    if (!contact && !AIRPORT_PATTERN.test(airportCode.trim())) return 'Airport must be a 3-letter code, for example BKK.'
    if (!deskName.trim()) return 'Enter the desk name.'
    const phoneProblem = phoneNumberProblem(phone)
    if (phoneProblem) return phoneProblem
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) return 'Enter a valid email, or leave it blank.'
    return null
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const problem = check()
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave((contact?.airportCode ?? airportCode).trim().toUpperCase(), {
        deskName: deskName.trim(),
        phone: formatPhoneNumber(phone) ?? phone.trim(),
        email: email.trim() || undefined,
      })
      onOpenChange(false)
    } catch (err: unknown) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-semibold text-foreground">
              {contact ? `${contact.airportCode} baggage desk` : 'Add an airport desk'}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {contact ? `${contact.airportName}, ${contact.city}` : 'Add the baggage desk of an airport we fly to.'}
            </DialogDescription>
          </DialogHeader>
          {!contact && (
            <Field label="Airport code" htmlFor="contact-airport">
              <Input
                id="contact-airport"
                maxLength={3}
                placeholder="e.g. BKK"
                value={airportCode}
                onChange={(e) => setAirportCode(e.target.value)}
              />
            </Field>
          )}
          <Field label="Desk" htmlFor="contact-desk">
            <Input
              id="contact-desk"
              maxLength={100}
              placeholder="e.g. Flython Baggage Service, Hall 2"
              value={deskName}
              onChange={(e) => setDeskName(e.target.value)}
            />
          </Field>
          <Field label="Phone" htmlFor="contact-phone">
            <Input
              id="contact-phone"
              type="tel"
              maxLength={30}
              placeholder="e.g. +66 2 000 4101"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setPhone((v) => formatPhoneNumber(v) ?? v)}
            />
          </Field>
          <Field label="Email (optional)" htmlFor="contact-email">
            <Input
              id="contact-email"
              type="email"
              maxLength={254}
              placeholder="e.g. bkk.baggage@flython.example"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <FormError message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? 'Saving…' : 'Save contact'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** "Card / Airport contacts" (Figma "F10 / Staff / Desktop / 06 Deliveries"). */
export function AirportContactsCard({
  contacts,
  loading,
  error,
  onSave,
}: {
  contacts: StationContact[]
  loading: boolean
  error: string | null
  onSave: (airportCode: string, body: SaveStationContactBody) => Promise<void>
}) {
  // `undefined` = closed, `null` = adding a new airport. The key remounts the dialog so its fields start fresh.
  const [editing, setEditing] = useState<StationContact | null | undefined>(undefined)

  return (
    <F10Card aria-labelledby="airport-contacts" className={LIST_CARD}>
      <div className={cn('flex items-start gap-3', LIST_PAD)}>
        <div className="flex flex-1 flex-col gap-1">
          <h2 id="airport-contacts" className="m-0 font-sans text-2xl font-semibold tracking-tight text-foreground max-md:text-xl">
            Airport contacts
          </h2>
          <p className="text-base text-muted-foreground">Call the station that holds a bag.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => setEditing(null)}>
          Add airport
        </Button>
      </div>

      {error && (
        <div className={LIST_PAD}>
          <FormError message={error} />
        </div>
      )}

      <div className="overflow-x-auto max-md:hidden">
        <Table className="w-full min-w-[900px] table-fixed border-collapse text-left">
          <TableHeader>
            <TableRow className="border-b border-border text-sm text-muted-foreground">
              <TableHead scope="col" className="h-auto px-0 whitespace-normal w-[182px] py-2.5 pr-3 pl-6 font-medium">
                Airport
              </TableHead>
              <TableHead scope="col" className="h-auto px-0 whitespace-normal py-2.5 pr-3 font-medium">
                Desk
              </TableHead>
              <TableHead scope="col" className="h-auto px-0 whitespace-normal w-[242px] py-2.5 pr-3 font-medium">
                Phone
              </TableHead>
              <TableHead scope="col" className="h-auto px-0 whitespace-normal w-[262px] py-2.5 pr-3 font-medium">
                Email
              </TableHead>
              <TableHead scope="col" className="h-auto px-0 whitespace-normal w-[80px] py-2.5 pr-6">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              [0, 1, 2].map((i) => (
                <TableRow key={i} className="border-b border-border">
                  <TableCell colSpan={5} className="p-0 whitespace-normal px-6 py-3">
                    <Skeleton className="h-9 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!loading && contacts.length === 0 && !error && (
              <TableRow>
                <TableCell colSpan={5} className="p-0 whitespace-normal px-6 py-6 text-center text-sm text-muted-foreground">
                  No airport desk saved yet. Use Add airport to save the first one.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              contacts.map((c) => (
                <TableRow key={c.airportCode} className="border-b border-border hover:bg-accent">
                  <TableCell className="p-0 whitespace-normal py-3 pr-3 pl-6">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-base text-foreground">{c.airportCode}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {c.city && c.city !== c.airportName ? `${c.city} ${c.airportName}` : c.airportName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="p-0 whitespace-normal py-3 pr-3 text-base text-foreground">{c.deskName}</TableCell>
                  <TableCell className="p-0 whitespace-normal py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <a href={phoneHref(c.phone)} className="text-base whitespace-nowrap text-foreground hover:underline">
                        {displayPhone(c.phone)}
                      </a>
                      <CopyButton text={displayPhone(c.phone)} label={`Copy ${c.airportCode} phone number`} />
                    </div>
                  </TableCell>
                  <TableCell className="p-0 whitespace-normal truncate py-3 pr-3 text-base text-foreground">
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="hover:underline">
                        {c.email}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">No email</span>
                    )}
                  </TableCell>
                  <TableCell className="p-0 whitespace-normal py-3 pr-6">
                    <Button type="button" variant="outline" aria-label={`Edit ${c.airportCode} contact`} onClick={() => setEditing(c)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Phones get one card per airport instead of the wide table. */}
      <ul aria-label="Airport contacts" className="flex flex-col gap-3 md:hidden">
        {loading &&
          [0, 1].map((i) => (
            <li key={i}>
              <Skeleton className="h-[120px] w-full rounded-xl" />
            </li>
          ))}
        {!loading && contacts.length === 0 && !error && (
          <li className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            No airport desk saved yet. Use Add airport to save the first one.
          </li>
        )}
        {!loading &&
          contacts.map((c) => (
            <li key={c.airportCode} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-base text-foreground">
                    {c.airportCode} · {c.deskName}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {c.city && c.city !== c.airportName ? `${c.city} ${c.airportName}` : c.airportName}
                  </span>
                </div>
                <Button type="button" variant="outline" aria-label={`Edit ${c.airportCode} contact`} onClick={() => setEditing(c)}>
                  Edit
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <a href={phoneHref(c.phone)} className="flex-1 text-base text-foreground hover:underline">
                  {displayPhone(c.phone)}
                </a>
                <CopyButton text={displayPhone(c.phone)} label={`Copy ${c.airportCode} phone number`} />
              </div>
              {c.email ? (
                <a href={`mailto:${c.email}`} className="truncate text-sm text-foreground hover:underline">
                  {c.email}
                </a>
              ) : (
                <span className="text-sm text-muted-foreground">No email</span>
              )}
            </li>
          ))}
      </ul>

      {editing !== undefined && (
        <ContactDialog
          key={editing?.airportCode ?? 'new'}
          contact={editing}
          open
          onOpenChange={(open) => !open && setEditing(undefined)}
          onSave={onSave}
        />
      )}
    </F10Card>
  )
}
