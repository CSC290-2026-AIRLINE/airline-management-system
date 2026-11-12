import { useEffect, useEffectEvent, useId, useState, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Label } from '@staff-web/components/ui/label'
import { SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@staff-web/components/ui/sheet'
import { errorMessage, useComplaintsApi } from './api'
import { StatusBadge, TypeLabel } from './ComplaintBadges'
import { formatDateTime } from './format'
import { STATUS_LABEL, humanize, type CaseEvent, type CaseStatus, type Complaint } from './types'

interface Props {
  complaintId: string
  /** Called after a change, so the list behind the drawer refreshes too. */
  onChanged: () => void
}

/** What a staff member can do next from each status. Mirrors TRANSITIONS in the backend service. */
const ACTIONS: Record<CaseStatus, { to: CaseStatus; label: string; variant?: 'outline' }[]> = {
  with_supervisor: [{ to: 'assigned', label: 'Assign to me' }],
  assigned: [{ to: 'resolved', label: 'Mark resolved' }],
  resolved: [
    { to: 'closed', label: 'Close case' },
    { to: 'with_supervisor', label: 'Reopen', variant: 'outline' },
  ],
  closed: [{ to: 'with_supervisor', label: 'Reopen', variant: 'outline' }],
}

function describeEvent(e: CaseEvent): string {
  const who = e.actor === 'complainant' ? 'Customer' : e.actor === 'system' ? 'System' : (e.actorName ?? 'Staff')
  switch (e.type) {
    case 'created':
      return `${who} submitted the complaint`
    case 'assigned':
      return `${who} took the case`
    case 'status_changed':
      return `${who} changed the status to ${e.toValue ? STATUS_LABEL[e.toValue as CaseStatus] : 'unknown'}`
    case 'closed':
      return `${who} closed the case`
    case 'reopened':
      return `${who} reopened the case`
    case 'note_added':
      return `${who} added a note`
    default:
      return `${who}: ${humanize(e.type)}`
  }
}

/** The case drawer. Rendered inside the dashboard's `Sheet`, which owns opening and closing it. */
export function ComplaintDetailPanel({ complaintId, onChanged }: Props) {
  const api = useComplaintsApi()
  const [complaint, setComplaint] = useState<Complaint | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [noteText, setNoteText] = useState('')
  const noteId = useId()

  const fetchCase = useEffectEvent(() => api.get(complaintId))

  // The dashboard remounts this per case (key), so this runs once per opened case.
  useEffect(() => {
    let cancelled = false
    fetchCase().then(
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
  }, [])

  async function act(work: () => Promise<Complaint>) {
    setBusy(true)
    setError(null)
    try {
      setComplaint(await work())
      onChanged()
      return true
    } catch (e) {
      setError(errorMessage(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function addNote() {
    if (!noteText.trim()) return
    if (await act(() => api.addNote(complaintId, noteText.trim()))) setNoteText('')
  }

  return (
    <SheetContent className="w-full gap-0 sm:max-w-lg">
      <SheetHeader className="border-b pr-12">
        <div className="flex items-center gap-2">
          <SheetTitle className="font-mono text-base">{complaint?.caseNumber ?? 'Loading…'}</SheetTitle>
          {complaint && <StatusBadge status={complaint.status} />}
        </div>
        <SheetDescription>{complaint ? `Opened ${formatDateTime(complaint.openedAt)}` : 'Loading the case.'}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription className="block">{error}</AlertDescription>
          </Alert>
        )}

        {complaint && (
          <>
            <Section title="Complaint">
              <InfoList>
                <InfoRow label="Type">
                  <TypeLabel type={complaint.type} />
                </InfoRow>
                {complaint.location && <InfoRow label="Location">{humanize(complaint.location)}</InfoRow>}
                {complaint.staffName && <InfoRow label="Staff member">{complaint.staffName}</InfoRow>}
                {complaint.issue && <InfoRow label="Issue">{humanize(complaint.issue)}</InfoRow>}
                {complaint.flightNumber && (
                  <InfoRow label="Flight">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">{complaint.flightNumber}</code> on{' '}
                    {complaint.serviceDate}
                  </InfoRow>
                )}
              </InfoList>
              <p className="mt-3 rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed whitespace-pre-wrap">{complaint.description}</p>
            </Section>

            <Section title="Passenger">
              <InfoList>
                <InfoRow label="Name">
                  <span className="font-semibold">{complaint.passengerName}</span>
                </InfoRow>
                {complaint.contactEmail && (
                  <InfoRow label="Email">
                    <a href={`mailto:${complaint.contactEmail}`} className="text-primary underline-offset-4 hover:underline">
                      {complaint.contactEmail}
                    </a>
                  </InfoRow>
                )}
              </InfoList>
            </Section>

            <Section title="Case management">
              <InfoList>
                <InfoRow label="Owner">
                  {complaint.ownerName ?? <span className="text-muted-foreground">Nobody yet (with supervisor)</span>}
                </InfoRow>
              </InfoList>
              <div className="mt-3 flex flex-wrap gap-2">
                {ACTIONS[complaint.status].map((a) => (
                  <Button
                    key={a.to}
                    size="sm"
                    variant={a.variant}
                    disabled={busy}
                    onClick={() => void act(() => api.setStatus(complaintId, a.to))}
                  >
                    {a.label}
                  </Button>
                ))}
              </div>
            </Section>

            <Section title={`History (${complaint.events?.length ?? 0})`}>
              <ol className="flex flex-col gap-2">
                {complaint.events?.map((e) => (
                  <li key={e.id} className={e.note ? 'rounded-lg border border-amber-200 bg-amber-50 p-3' : 'px-1'}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        {e.isInternal && <Lock className="size-3.5" aria-label="Internal" />}
                        {describeEvent(e)}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{formatDateTime(e.occurredAt)}</span>
                    </div>
                    {e.note && <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{e.note}</p>}
                  </li>
                ))}
              </ol>

              <form
                className="mt-4 flex flex-col gap-2 border-t pt-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  void addNote()
                }}
              >
                <Label htmlFor={noteId}>Internal note</Label>
                <textarea
                  id={noteId}
                  rows={3}
                  placeholder="Only staff can see notes."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  className="w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
                <Button type="submit" size="sm" className="self-end" disabled={busy || !noteText.trim()}>
                  Add note
                </Button>
              </form>
            </Section>
          </>
        )}
      </div>
    </SheetContent>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 border-b pb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

function InfoList({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">{children}</dl>
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0 min-w-0 wrap-break-word">{children}</dd>
    </>
  )
}
