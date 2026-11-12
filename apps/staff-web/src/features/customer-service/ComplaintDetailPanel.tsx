import { useId, useState, type ReactNode } from 'react'
import { Flag, Lock, Send } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Checkbox } from '@staff-web/components/ui/checkbox'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@staff-web/components/ui/sheet'
import { Switch } from '@staff-web/components/ui/switch'
import { cn } from '@staff-web/lib/utils'
import type { Complaint, ComplaintNote, ComplaintStatus } from './types'
import { CategoryLabel, StatusBadge } from './ComplaintBadges'
import { formatDateTime } from './format'

const ALL_STATUSES: ComplaintStatus[] = ['Pending', 'In Review', 'Escalated', 'Resolved', 'Closed']

interface Props {
  complaint: Complaint
  onUpdate: (updated: Complaint) => void
}

/** The case drawer. Rendered inside the dashboard's `Sheet`, which owns opening and closing it. */
export function ComplaintDetailPanel({ complaint, onUpdate }: Props) {
  const [noteText, setNoteText] = useState('')
  const [isInternal, setIsInternal] = useState(true)
  const [staffName, setStaffName] = useState('Staff Admin')
  const ids = { supervisor: useId(), name: useId(), note: useId(), internal: useId() }

  function update(changes: Partial<Complaint>) {
    onUpdate({ ...complaint, ...changes, updatedAt: new Date().toISOString() })
  }

  function addNote() {
    if (!noteText.trim()) return
    const note: ComplaintNote = {
      id: crypto.randomUUID(),
      author: staffName.trim() || 'Staff Admin',
      content: noteText.trim(),
      createdAt: new Date().toISOString(),
      isInternal,
    }
    setNoteText('')
    update({ notes: [...complaint.notes, note] })
  }

  return (
    <SheetContent className="w-full gap-0 sm:max-w-lg">
      <SheetHeader className="border-b pr-12">
        <div className="flex items-center gap-2">
          <SheetTitle className="font-mono text-base">{complaint.id}</SheetTitle>
          <StatusBadge status={complaint.status} />
        </div>
        <SheetDescription>Submitted {formatDateTime(complaint.submittedAt)}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        <Section title="Complaint details">
          <InfoList>
            <InfoRow label="Category">
              <CategoryLabel category={complaint.category} />
            </InfoRow>
            <InfoRow label="Subject">
              <span className="font-semibold">{complaint.subject}</span>
            </InfoRow>
          </InfoList>
          <p className="mt-3 rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed whitespace-pre-wrap">{complaint.description}</p>
        </Section>

        <Section title="Booking & flight">
          <InfoList>
            <InfoRow label="Booking ref">
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">{complaint.bookingRef}</code>
            </InfoRow>
            <InfoRow label="Flight">
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">{complaint.flightNumber}</code>
            </InfoRow>
            <InfoRow label="Flight date">{complaint.flightDate}</InfoRow>
          </InfoList>
        </Section>

        <Section title="Passenger">
          <InfoList>
            <InfoRow label="Name">
              <span className="font-semibold">{complaint.passengerName}</span>
            </InfoRow>
            <InfoRow label="Email">
              <a href={`mailto:${complaint.passengerEmail}`} className="text-primary underline-offset-4 hover:underline">
                {complaint.passengerEmail}
              </a>
            </InfoRow>
          </InfoList>
        </Section>

        <Section title="Case management">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Status</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Set status">
              {ALL_STATUSES.map((s) => {
                const active = complaint.status === s
                return (
                  <Button
                    key={s}
                    size="xs"
                    variant={active ? 'default' : 'outline'}
                    aria-pressed={active}
                    onClick={() => !active && update({ status: s })}
                  >
                    {s}
                  </Button>
                )
              })}
            </div>
          </div>

          <div
            className={cn(
              'mt-4 flex items-center justify-between gap-4 rounded-lg border p-3',
              complaint.supervisorInvolved && 'border-red-200 bg-red-50',
            )}
          >
            <div className="flex flex-col gap-0.5">
              <Label htmlFor={ids.supervisor} className={cn('gap-1.5', complaint.supervisorInvolved && 'text-red-800')}>
                <Flag
                  className={cn('size-4', complaint.supervisorInvolved ? 'text-red-600' : 'text-muted-foreground')}
                  aria-hidden="true"
                />
                Supervisor involved
              </Label>
              <p className="text-xs text-muted-foreground">Flag this case as needing supervisor review.</p>
            </div>
            <Switch
              id={ids.supervisor}
              checked={complaint.supervisorInvolved}
              onCheckedChange={(checked) => update({ supervisorInvolved: checked })}
            />
          </div>
        </Section>

        <Section title={`Notes & activity (${complaint.notes.length})`}>
          {complaint.notes.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {complaint.notes.map((note) => (
                <li
                  key={note.id}
                  className={cn(
                    'rounded-lg border p-3',
                    note.isInternal ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50',
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 font-semibold">
                      {note.isInternal ? (
                        <Lock className="size-3.5" aria-hidden="true" />
                      ) : (
                        <Send className="size-3.5" aria-hidden="true" />
                      )}
                      {note.isInternal ? 'Internal' : 'Customer-facing'} · {note.author}
                    </span>
                    <span className="text-muted-foreground">{formatDateTime(note.createdAt)}</span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.content}</p>
                </li>
              ))}
            </ul>
          )}

          <form
            className="mt-4 flex flex-col gap-3 border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault()
              addNote()
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.name}>Your name</Label>
              <Input id={ids.name} value={staffName} onChange={(e) => setStaffName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.note}>Note</Label>
              <textarea
                id={ids.note}
                rows={3}
                placeholder="Add a note or response…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Checkbox id={ids.internal} checked={isInternal} onCheckedChange={(checked) => setIsInternal(checked === true)} />
                <Label htmlFor={ids.internal} className="font-normal">
                  Internal note only
                </Label>
              </div>
              <Button type="submit" size="sm" disabled={!noteText.trim()}>
                Add note
              </Button>
            </div>
          </form>
        </Section>
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
      <dd className="m-0 min-w-0 break-words">{children}</dd>
    </>
  )
}
