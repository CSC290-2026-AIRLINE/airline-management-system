import { fullName } from '../types/format'
import type { CrewMember } from '../types/types'
import { BaseModalOverlay, Button, MinusIcon } from '../../shared/ui'

/**
 * Confirms removing a crew member. The row is kept and marked deleted, so it can be brought back from the
 * database, but the person leaves the directory and is no longer offered to auto-assign.
 */
export function DeleteCrewModal({ crew, onCancel, onConfirm }: { crew: CrewMember; onCancel: () => void; onConfirm: () => void }) {
  return (
    <BaseModalOverlay
      title={`Delete ${fullName(crew)}?`}
      onClose={onCancel}
      variant="plain"
      width="max-w-xl"
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            <MinusIcon className="h-4 w-4" />
            Delete crew
          </Button>
        </>
      }
    >
      <p className="text-sm text-primary-text/70">
        {fullName(crew)} ({crew.employeeNo}) will leave the crew list and will not be offered to auto-assign. The record is kept in the
        database, marked as deleted. If they still hold a seat on a roster, the delete is refused: take them off the roster first.
      </p>
    </BaseModalOverlay>
  )
}
