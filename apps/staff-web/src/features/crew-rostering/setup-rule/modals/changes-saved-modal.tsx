import { BaseModalOverlay, Button } from '../../shared/ui'

/**
 * Confirmation raised after `Save rules`, once the working copy has been
 * committed. It states what the save did rather than repeating the edits, so the
 * operator knows the re-check is already scheduled.
 */
export function ChangesSavedModal({ onDone }: { onDone: () => void }) {
  return (
    <BaseModalOverlay
      width="max-w-sm"
      onClose={onDone}
      title={
        <span className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold tracking-widest text-primary-text/45 uppercase">Feature 8 · Rules</span>
          <span>Changes saved</span>
        </span>
      }
      footer={
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      }
    >
      <p className="text-sm text-primary-text/70">
        Affected pairings are re-checked on the next roster run. The change is written to the audit log.
      </p>
    </BaseModalOverlay>
  )
}
