import { Badge } from '@staff-web/components/ui/badge'
import { PROBLEM_STATE_BADGE_CLASSES, PROBLEM_STATE_LABELS } from '../payment-copy'
import type { PaymentExceptionState } from '../types'

/**
 * Where a problem sits, in the words the frames use.
 *
 * The frames put the problem's name in bold and the state under it in a pill, so the two never compete for attention.
 */
export function PaymentProblemBadge({ state }: { state: PaymentExceptionState }) {
  return <Badge className={PROBLEM_STATE_BADGE_CLASSES[state]}>{PROBLEM_STATE_LABELS[state]}</Badge>
}
