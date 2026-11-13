import type { ReviewDraft, ReviewSubmission, ScreeningRecord } from '../types'
import { decisionLabel, latestReview, reviewStatus } from '../screening-model'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { Badge } from './Badge'
import { DecisionForm } from './DecisionForm'

export function ReviewDialog({
  record,
  onClose,
  onSave,
  submission,
}: {
  record: ScreeningRecord
  onClose: () => void
  onSave: (draft: ReviewDraft) => void
  submission: ReviewSubmission
}) {
  const decision = latestReview(record)!
  return (
    <Dialog open onOpenChange={(open) => !open && !submission.saving && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto text-foreground sm:max-w-xl" showCloseButton={!submission.saving}>
        <DialogHeader>
          <DialogTitle className="text-foreground">Add a new review</DialogTitle>
          <DialogDescription>{record.displayName}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3">
          <h3 className="m-0 font-sans text-xs font-semibold tracking-wide text-muted-foreground uppercase">Current decision</h3>
          <div>
            <Badge tone={reviewStatus(decision)}>{decisionLabel(record, decision)}</Badge>
          </div>
          <p className="text-sm">“{decision.note}”</p>
        </div>
        <DecisionForm outcome={record.outcome} onSave={onSave} submission={submission} modal />
      </DialogContent>
    </Dialog>
  )
}
