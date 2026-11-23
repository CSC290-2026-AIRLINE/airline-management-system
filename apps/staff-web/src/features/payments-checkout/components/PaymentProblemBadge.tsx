import { Badge } from '@staff-web/components/ui/badge'
import { PROBLEM_STATE_BADGE_VARIANTS, PROBLEM_STATE_LABELS } from '../payment-copy'
import type { PaymentExceptionState } from '../types'

/** Where a problem sits, in the words the frames use. */
export function PaymentProblemBadge({ state }: { state: PaymentExceptionState }) {
  return <Badge variant={PROBLEM_STATE_BADGE_VARIANTS[state]}>{PROBLEM_STATE_LABELS[state]}</Badge>
}
