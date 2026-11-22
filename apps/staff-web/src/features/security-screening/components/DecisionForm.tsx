import { useId, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Checkbox } from '@staff-web/components/ui/checkbox'
import { Label } from '@staff-web/components/ui/label'
import { Textarea } from '@staff-web/components/ui/textarea'
import { cn } from '@staff-web/lib/utils'
import type { ReviewDecision, ReviewDraft, ReviewSubmission, ScreeningOutcome, ScreeningRecord } from '../types'

export function MatchNotice({ record }: { record: ScreeningRecord }) {
  if (record.outcome === 'clear') return null
  const { match, outcome } = record
  const description =
    match === 'Strong'
      ? outcome === 'held'
        ? 'Passport number and nationality equal an active watchlist entry. Only release the hold if the passport in person shows otherwise.'
        : 'Passport number and nationality equal an active watchlist entry. Nothing is held yet. Check the passport in person before you decide.'
      : match === 'Probable'
        ? record.matchReason === 'passport'
          ? 'Passport number matches, but nationality is different or missing. Check the passport in person before you decide.'
          : 'Name and date of birth match, but the passport number is different. Check the passport in person before you decide.'
        : 'Only the name is similar. Choosing “Same person” confirms the match, so check-in will be denied.'
  return (
    <Alert
      role="note"
      className={cn(
        match === 'Strong'
          ? 'border-red-200 bg-red-50 text-red-900'
          : match === 'Probable'
            ? 'border-amber-200 bg-amber-50 text-amber-900'
            : '',
      )}
    >
      <AlertDescription className="text-current">
        <strong>
          {match} match · {outcome === 'held' ? 'check-in is held' : 'check-in is not held'}
        </strong>
        <p>{description}</p>
      </AlertDescription>
    </Alert>
  )
}

export function DecisionForm({
  outcome,
  onSave,
  modal = false,
  submission,
}: {
  outcome: ScreeningOutcome
  onSave: (draft: ReviewDraft) => void
  modal?: boolean
  submission: ReviewSubmission
}) {
  const id = useId()
  const [note, setNote] = useState('')
  const [checked, setChecked] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const noteInvalid = submitted && (!note.trim() || note.trim().length > 2000)
  const checkInvalid = submitted && !checked
  function submit(decision: ReviewDecision) {
    setSubmitted(true)
    if (!note.trim() || note.trim().length > 2000 || !checked || submission.saving || submission.requiresReload) return
    onSave({ decision, note: note.trim(), passportCompared: checked })
  }
  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => event.preventDefault()} noValidate aria-busy={submission.saving}>
      <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" disabled={submission.saving || submission.requiresReload}>
        <legend className="sr-only">Review decision</legend>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-note`}>Note (required)</Label>
          <Textarea
            id={`${id}-note`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={modal ? 'Why the earlier decision was wrong' : 'What you compared, e.g. passport number differs'}
            aria-invalid={noteInvalid}
            aria-describedby={noteInvalid ? `${id}-note-error` : undefined}
            maxLength={2000}
            required
          />
          {noteInvalid && (
            <p className="text-sm text-destructive" id={`${id}-note-error`} role="alert">
              Write what you compared in 1–2000 characters. The note is saved with the review.
            </p>
          )}
        </div>
        <div className="flex items-start gap-2">
          <Checkbox
            id={`${id}-check`}
            checked={checked}
            onCheckedChange={(value) => setChecked(value === true)}
            aria-invalid={checkInvalid}
            aria-describedby={checkInvalid ? `${id}-check-error` : undefined}
            className="mt-0.5"
          />
          <Label htmlFor={`${id}-check`} className="leading-snug font-normal">
            {modal ? 'I compared the passport in person.' : 'I compared the passport in person or with the agent at the counter.'}
          </Label>
        </div>
        {checkInvalid && (
          <p className="text-sm text-destructive" id={`${id}-check-error`} role="alert">
            Confirm that you compared the passport before you decide.
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={() => submit('false_positive')}>
            Not the same person{!modal && ` · ${outcome === 'held' ? 'release hold' : 'clear flag'}`}
          </Button>
          <Button type="button" variant="destructive" onClick={() => submit('confirmed')}>
            Same person{!modal && ' · confirm match'}
          </Button>
        </div>
        {(modal || outcome === 'flagged') && (
          <p
            className="text-xs text-muted-foreground"
            title="A review applies to this check only. Other unresolved checks may still block check-in. Authority notification is simulated."
          >
            {modal
              ? '“Same person” records a denied screening outcome. Authority notification is simulated. Your review is saved in the audit log.'
              : 'Clearing the flag is remembered for this identity, flight and entry, so it isn’t flagged again.'}
          </p>
        )}
      </fieldset>
      {submission.saving && (
        <p role="status" className="text-sm text-muted-foreground">
          Saving decision…
        </p>
      )}
      {submission.error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription className="text-destructive">
            <p>{submission.error}</p>
            {submission.requiresReload && (
              <Button type="button" variant="outline" size="sm" onClick={submission.onReload}>
                Reload latest decision
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
    </form>
  )
}
