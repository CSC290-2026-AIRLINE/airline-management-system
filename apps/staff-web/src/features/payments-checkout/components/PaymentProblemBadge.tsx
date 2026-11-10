import { Badge } from '@staff-web/components/ui/badge'
import { PROBLEM_TYPE_BADGE_CLASSES } from '../payment-copy'
import type { PaymentProblemType } from '../types'

/** The problem, in the words the frames use, with its own colour so the same problem always looks the same. */
export function PaymentProblemBadge({ type, label }: { type: PaymentProblemType; label: string }) {
  return <Badge className={PROBLEM_TYPE_BADGE_CLASSES[type]}>{label}</Badge>
}
