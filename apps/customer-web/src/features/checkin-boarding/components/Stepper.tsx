import { Stepper as FlowStepper } from '@customer-web/components/ui/stepper'

const STEPS = ['Find booking', 'Passport', 'Seat', 'Bags', 'Boarding pass'] as const

/** The check-in progress, on the shared stepper. `step` counts from 1. */
export function Stepper({ step }: { step: number }) {
  return <FlowStepper steps={STEPS} current={step - 1} aria-label="Check-in progress" />
}
