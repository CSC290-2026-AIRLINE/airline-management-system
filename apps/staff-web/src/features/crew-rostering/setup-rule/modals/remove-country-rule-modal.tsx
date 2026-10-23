import { formatLimitPair } from '../types/format'
import type { CountryLimit } from '../types/types'
import { BaseModalOverlay, Button } from '../../shared/ui'

/**
 * Confirmation before dropping a destination's tighter limits.
 *
 * The preview card restates the exact numbers that are about to be lost, because
 * the operator cannot see the row once the modal closes and the change is only
 * undoable by retyping it.
 */
export function RemoveCountryRuleModal({
  limit,
  onCancel,
  onConfirm,
}: {
  limit: CountryLimit
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <BaseModalOverlay
      width="max-w-md"
      onClose={onCancel}
      title="Remove country rule?"
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            <span aria-hidden="true">—</span>
            Remove
          </Button>
        </>
      }
    >
      <p className="text-sm text-primary-text/70">
        {limit.country} goes back to the default limits and its {limit.affectedPairings} pairings are rechecked. This can&rsquo;t be undone.
      </p>

      <p className="mt-5 text-xs font-semibold text-primary-text/55">Rule to remove</p>
      <div className="mt-2 rounded-xl border border-border-desc/40 bg-page-bg px-4 py-3.5">
        <p className="text-xs text-primary-text/55">Stricter limit by destination</p>
        <p className="mt-1 font-display text-lg font-bold text-primary-text">{limit.country}</p>
        <p className="mt-0.5 text-sm text-primary-text/65">{formatLimitPair(limit.minRestHours, limit.maxDutyHours)}</p>
      </div>
    </BaseModalOverlay>
  )
}
