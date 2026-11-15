import { BaseModalOverlay, Button } from '../../shared/ui'

/**
 * Confirmation raised after `Save rules`, once the working copy has been
 * committed. It states what the save did rather than repeating the edits, so the
 * operator knows the re-check is already scheduled.
 */
export function ChangesSavedModal({ onDone }: { onDone: () => void }) {
  return (
    <BaseModalOverlay
      variant="plain"
      width="max-w-sm"
      onClose={onDone}
      title={
        <span className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold tracking-wider text-label uppercase">Feature 8 · Rules</span>
          <span>Changes saved</span>
        </span>
      }
      footer={
        <Button variant="primary" className="h-11 px-8 max-sm:flex-none" onClick={onDone}>
          Done
        </Button>
      }
    >
      <p className="text-sm leading-relaxed text-primary-text/60">
        Affected pairings are re-checked on the next roster run. The change is written to the audit log.
      </p>
    </BaseModalOverlay>
  )
}
